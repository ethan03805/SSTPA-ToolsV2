// Navigator Tool (SRS §6.5.1): hierarchy visualization with four modes —
// SoI Selection, Association Selection, Search/Locate, and Clone (single
// node / node with Requirements). Default scope is Project + Systems
// (§6.5.1.6); a selected System can disclose its SoI contents (§6.5.1.23).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cytoscape, { type Core } from "cytoscape";
// @ts-expect-error no type declarations
import fcose from "cytoscape-fcose";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../api/client";
import type { HierarchyEntry, SoINode } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { displayName, nodeTypeColor } from "../../components/NodeTypeBadge";
import { useSoI } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { errorText, exportPng, exportSvg, ToolStatus } from "../shared";

cytoscape.use(fcose);

type Mode = "soi" | "associate" | "locate" | "clone";
type LabelMode = "both" | "hid" | "name" | "none";

/** Resolve a CSS custom property to a concrete color for the canvas. */
function token(name: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || "#5f6b78";
}

function resolveColor(cssColor: string): string {
  const m = /^var\((--[a-z-]+)\)$/.exec(cssColor);
  return m ? token(m[1]) : cssColor;
}

/** Per-type shape assignment (§6.5.1.17: unique shape/fill/border per type). */
const TYPE_SHAPES: Record<string, string> = {
  Project: "round-rectangle",
  Sandbox: "round-rectangle",
  System: "round-rectangle",
  Component: "rectangle",
  Interface: "ellipse",
  SystemFunction: "round-hexagon",
  Connection: "diamond",
  Environment: "round-octagon",
  Purpose: "round-tag",
  State: "round-pentagon",
  Asset: "star",
  DerivedAsset: "star",
  Requirement: "tag",
  Constraint: "tag",
  Loss: "vee",
  Hazard: "triangle",
  Attack: "triangle",
  Countermeasure: "heptagon",
  SecurityControl: "heptagon",
};

function shapeFor(typeName: string): string {
  return TYPE_SHAPES[typeName] ?? "ellipse";
}

interface GraphNodeDatum {
  id: string;
  label: string;
  typeName: string;
  name: string;
  uuid?: string;
  shortDescription?: string;
  soiIndex?: string;
}

export default function NavigatorTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const { soiHid, setSoI } = useSoI();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("soi");
  const [selected, setSelected] = useState<GraphNodeDatum | null>(null);
  const [expandedSystems, setExpandedSystems] = useState<string[]>([]);
  const [labelMode, setLabelMode] = useState<LabelMode>("both");
  const [query, setQuery] = useState("");
  const [legendOpen, setLegendOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [confirmSoI, setConfirmSoI] = useState<string | null>(null);

  const hierarchy = useQuery({ queryKey: ["hierarchy"], queryFn: api.hierarchy });
  const relSchema = useQuery({
    queryKey: ["schema-relationships"],
    queryFn: api.schemaRelationships,
    staleTime: Infinity,
  });

  // Expanded SoI contents (§6.5.1.23 "+ SoI contents" scope).
  const expandedQueries = useQuery({
    queryKey: ["navigator-expanded", expandedSystems],
    queryFn: async () => {
      const out: Record<string, SoINode[]> = {};
      for (const sys of expandedSystems) {
        const res = await api.soi(sys);
        out[sys] = res.nodes ?? [];
      }
      return out;
    },
    enabled: expandedSystems.length > 0,
  });

  const entries = useMemo(
    () => hierarchy.data?.entries ?? [],
    [hierarchy.data],
  );

  // ---- Graph element construction (Project + Systems by default, §6.5.1.6;
  // Components are never shown as hierarchy intermediaries) ----
  const elements = useMemo(() => {
    const nodes: { data: GraphNodeDatum }[] = [];
    const edges: { data: { id: string; source: string; target: string; kind: string } }[] = [];
    const present = new Set<string>();

    const bySoI = new Map<string, HierarchyEntry>();
    for (const e of entries) {
      if (e.typeName === "System") {
        const idx = /^SYS_([0-9.]+)_/.exec(e.hid)?.[1];
        if (idx) bySoI.set(idx, e);
      }
    }

    for (const e of entries) {
      nodes.push({
        data: {
          id: e.hid,
          label: e.hid,
          typeName: e.typeName,
          name: e.name ?? e.hid,
          uuid: e.uuid,
          shortDescription: e.shortDescription,
        },
      });
      present.add(e.hid);
    }
    for (const e of entries) {
      if (!e.parentHid) continue;
      // A System's parent may be a Component (not displayed, §6.5.1.6):
      // rewire the edge to the Component's owning System.
      let parent = e.parentHid;
      if (!present.has(parent)) {
        const idx = /^EL_([0-9.]+)_/.exec(parent)?.[1];
        const owner = idx ? bySoI.get(idx) : undefined;
        if (!owner) continue;
        parent = owner.hid;
      }
      edges.push({
        data: { id: `h-${parent}-${e.hid}`, source: parent, target: e.hid, kind: "hierarchy" },
      });
    }

    // Expanded SoI contents.
    for (const [sys, soiNodes] of Object.entries(expandedQueries.data ?? {})) {
      if (!expandedSystems.includes(sys)) continue;
      for (const n of soiNodes) {
        if (n.hid === sys || present.has(n.hid)) continue;
        nodes.push({
          data: {
            id: n.hid,
            label: n.hid,
            typeName: n.typeName,
            name: String(n.properties.Name ?? n.hid),
            uuid: n.uuid,
            shortDescription: String(n.properties.ShortDescription ?? ""),
            soiIndex: n.soi,
          },
        });
        present.add(n.hid);
      }
      for (const n of soiNodes) {
        for (const rel of n.relationships ?? []) {
          if (present.has(n.hid) && present.has(rel.targetHID)) {
            edges.push({
              data: {
                id: `r-${n.hid}-${rel.type}-${rel.targetHID}`,
                source: n.hid,
                target: rel.targetHID,
                kind: "relationship",
              },
            });
          }
        }
      }
      // Anchor the expanded contents to their System when no explicit
      // membership edge landed above.
      for (const n of soiNodes) {
        if (n.hid === sys) continue;
        const hasIncoming = edges.some((e) => e.data.target === n.hid);
        if (!hasIncoming && present.has(n.hid)) {
          edges.push({
            data: { id: `a-${sys}-${n.hid}`, source: sys, target: n.hid, kind: "relationship" },
          });
        }
      }
    }
    return { nodes, edges };
  }, [entries, expandedQueries.data, expandedSystems]);

  // ---- Search (§6.5.1.8): HID, uuid, Name, ShortDescription, Node Type ----
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return elements.nodes
      .filter(({ data: d }) =>
        [d.id, d.uuid ?? "", d.name, d.shortDescription ?? "", d.typeName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .map((n) => n.data)
      .slice(0, 50);
  }, [elements.nodes, query]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

  // ---- Cytoscape lifecycle: create once, diff elements (§6.5.1.26 layout
  // stability: no teardown on state changes) ----
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const selectRef = useRef<(d: GraphNodeDatum | null) => void>(() => {});
  selectRef.current = setSelected;

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: "node",
          style: {
            "background-color": token("--sstpa-node-fill"),
            "border-width": 1.6,
            color: token("--sstpa-text"),
            "font-family": "JetBrains Mono, monospace",
            "font-size": 9,
            "text-wrap": "wrap",
            "text-max-width": "110",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 34,
            height: 30,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.2,
            "line-color": token("--sstpa-edge-stroke"),
            "target-arrow-shape": "triangle",
            "target-arrow-color": token("--sstpa-edge-stroke"),
            "curve-style": "bezier",
            "arrow-scale": 0.7,
          },
        },
        {
          selector: "edge[kind='relationship']",
          style: { "line-style": "dashed", opacity: 0.65 },
        },
        {
          selector: "node.current-soi",
          style: {
            "border-width": 4,
            "border-style": "double",
            "border-color": token("--sstpa-selected"),
          },
        },
        {
          selector: "node.search-match",
          style: {
            "background-color": token("--sstpa-hover"),
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": token("--sstpa-selected"),
            "border-width": 3,
            "overlay-color": token("--sstpa-selected"),
            "overlay-opacity": 0.12,
            "overlay-padding": 6,
          },
        },
        {
          selector: "node.invalid-target",
          style: { opacity: 0.35 },
        },
      ],
      wheelSensitivity: 0.25,
    });
    cy.on("tap", "node", (ev) => {
      selectRef.current(ev.target.data() as GraphNodeDatum);
    });
    cy.on("tap", (ev) => {
      if (ev.target === cy) selectRef.current(null);
    });
    cyRef.current = cy;

    // Cytoscape reads the container size at init; inside a freshly-mounted
    // flex popup that size can be 0. Re-fit whenever the container resizes.
    const ro = new ResizeObserver(() => {
      cy.resize();
      if (cy.elements().length > 0) cy.fit(undefined, 40);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Element diffing: reconcile against the LIVE cytoscape instance (not a
  // separate id set — that desynchronizes when the instance is recreated,
  // e.g. React StrictMode remounts in development).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nextIds = new Set<string>([
      ...elements.nodes.map((n) => n.data.id),
      ...elements.edges.map((e) => e.data.id),
    ]);
    let structural = false;
    cy.batch(() => {
      for (const n of elements.nodes) {
        if (cy.getElementById(n.data.id).length === 0) {
          cy.add({ group: "nodes", data: { ...n.data } });
          structural = true;
        }
      }
      for (const e of elements.edges) {
        if (
          cy.getElementById(e.data.id).length === 0 &&
          cy.getElementById(e.data.source).length > 0 &&
          cy.getElementById(e.data.target).length > 0
        ) {
          cy.add({ group: "edges", data: { ...e.data } });
          structural = true;
        }
      }
      cy.elements().forEach((el) => {
        if (!nextIds.has(el.id())) {
          el.remove();
          structural = true;
        }
      });
    });
    if (structural && cy.elements().length > 0) {
      // A hierarchy view is tree-shaped: a breadthfirst layout is
      // deterministic and robust for small graphs (fcose degenerates on a
      // couple of nodes). Expanded SoI contents use fcose for their denser
      // relationship webs.
      const dense = cy.edges("[kind='relationship']").length > 0;
      const layout = cy.layout(
        (dense
          ? {
              name: "fcose",
              animate: false,
              randomize: true,
              idealEdgeLength: () => 90,
              nodeSeparation: 120,
            }
          : {
              name: "breadthfirst",
              directed: true,
              spacingFactor: 1.3,
              padding: 30,
              animate: false,
            }) as never,
      );
      layout.run();
      cy.fit(undefined, 45);
      // Center on the current SoI on first population (§6.5.1.7).
      if (soiHid && cy.getElementById(soiHid).length > 0) {
        cy.center(cy.getElementById(soiHid));
      }
    }
  }, [elements, soiHid]);

  // Clone flow state.
  const cloneParentPick = useRef(false);
  const [clonePhase, setClonePhase] = useState<{
    source: GraphNodeDatum;
    withRequirements: boolean;
    parent?: GraphNodeDatum;
    relType?: string;
  } | null>(null);

  const validParentPairs = useMemo(() => {
    // parent label → relationship types that can point AT the clone-source label.
    const bySource = new Map<string, string[]>();
    if (!clonePhase) return bySource;
    for (const r of relSchema.data?.relationships ?? []) {
      if (r.target === clonePhase.source.typeName && r.type !== "AT_RELATES_TO") {
        const list = bySource.get(r.source) ?? [];
        if (!list.includes(r.type)) list.push(r.type);
        bySource.set(r.source, list);
      }
    }
    return bySource;
  }, [clonePhase, relSchema.data]);

  // Visual states: current SoI, search matches, per-type encoding, labels,
  // clone-target validity (§6.5.1.17/§6.5.1.18/§6.5.1.19).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const d = n.data() as GraphNodeDatum;
        n.toggleClass("current-soi", d.id === soiHid);
        n.toggleClass("search-match", matchIds.has(d.id) && query.trim().length >= 2);
        n.toggleClass(
          "invalid-target",
          !!clonePhase && cloneParentPick.current && !validParentPairs.has(d.typeName),
        );
        n.style({
          shape: shapeFor(d.typeName),
          "border-color": resolveColor(nodeTypeColor(d.typeName)),
          label:
            labelMode === "none"
              ? ""
              : labelMode === "hid"
                ? d.id
                : labelMode === "name"
                  ? d.name
                  : `${d.id}\n${d.name}`,
        });
      });
    });
  }, [soiHid, matchIds, query, labelMode, clonePhase, validParentPairs, elements]);

  const centerOn = useCallback((hid: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const el = cy.getElementById(hid);
    if (el.length > 0) {
      cy.animate({ center: { eles: el }, zoom: Math.max(cy.zoom(), 1) }, { duration: 220 });
      el.select();
    }
  }, []);

  // Honor cross-tool focus context (§6.4).
  useEffect(() => {
    if (ctx.focusHid) {
      setQuery(ctx.focusHid);
      setMode("locate");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Clone execution (§6.5.1.5d) ----
  const clone = useMutation({
    mutationFn: async () => {
      const cp = clonePhase!;
      const parent = cp.parent!;
      const src = await api.nodeByHid(cp.source.id);
      const strip = (props: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
          if (
            [
              "HID", "uuid", "TypeName", "Owner", "OwnerEmail", "Creator",
              "CreatorEmail", "Created", "LastTouch", "VersionID", "SoIIndex",
              "Sequence", "TraceVersion", "TraceStatus", "TraceSessionID",
              "Orphan", "Barren",
            ].includes(k) || v === null
          ) {
            continue;
          }
          out[k] = v;
        }
        return out;
      };
      const parentSoIIndex =
        parent.soiIndex ?? /^[A-Z]+_([0-9.]+)_/.exec(parent.id)?.[1];
      const destSoI = parentSoIIndex ? `SYS_${parentSoIIndex}_0` : parent.id;
      const ops: Parameters<typeof api.commit>[0]["operations"] = [
        {
          op: "createNode",
          tempId: "clone",
          label: cp.source.typeName,
          properties: strip(src.properties),
        },
        {
          op: "createRelationship",
          type: cp.relType!,
          sourceHid: parent.id,
          targetHid: "$clone",
        },
      ];
      if (cp.withRequirements) {
        // Clone HAS_REQUIREMENT targets; each gets Orphan=true and a
        // Purpose-[:HAS_REQUIREMENT]->Requirement in the destination SoI.
        const srcSoIIndex =
          cp.source.soiIndex ?? /^[A-Z]+_([0-9.]+)_/.exec(cp.source.id)?.[1];
        const srcSoIRoot = srcSoIIndex ? `SYS_${srcSoIIndex}_0` : cp.source.id;
        const soi = await api.soi(srcSoIRoot);
        const me = (soi.nodes ?? []).find((n) => n.hid === cp.source.id);
        const reqHids = (me?.relationships ?? [])
          .filter((r) => r.type === "HAS_REQUIREMENT")
          .map((r) => r.targetHID);
        const byHid = new Map((soi.nodes ?? []).map((n) => [n.hid, n]));
        const destSoIRes = await api.soi(destSoI);
        const destPurpose = (destSoIRes.nodes ?? []).find(
          (n) => n.typeName === "Purpose",
        );
        reqHids.forEach((rh, i) => {
          const req = byHid.get(rh);
          if (!req) return;
          const props = strip(req.properties);
          props.Orphan = true; // cloned Requirements start orphaned (§6.5.1.5d)
          ops.push({
            op: "createNode",
            tempId: `req${i}`,
            label: "Requirement",
            properties: props,
          });
          ops.push({
            op: "createRelationship",
            type: "HAS_REQUIREMENT",
            sourceHid: "$clone",
            targetHid: `$req${i}`,
          });
          if (destPurpose) {
            ops.push({
              op: "createRelationship",
              type: "HAS_REQUIREMENT",
              sourceHid: destPurpose.hid,
              targetHid: `$req${i}`,
            });
          }
        });
      }
      return api.commit({
        soiHid: destSoI,
        toolId: "sstpa.navigator",
        operations: ops,
      });
    },
    onSuccess: (res) => {
      const newHid = res.createdNodes?.clone;
      setNotice({
        kind: "ok",
        text: `Clone committed${newHid ? ` as ${newHid}` : ""} (${res.nodesChanged} node(s), ${res.relationshipsChanged} relationship(s)).`,
      });
      setClonePhase(null);
      cloneParentPick.current = false;
      void qc.invalidateQueries({ queryKey: ["soi"] });
      void qc.invalidateQueries({ queryKey: ["hierarchy"] });
      void qc.invalidateQueries({ queryKey: ["navigator-expanded"] });
    },
    onError: (e) => setNotice({ kind: "warn", text: errorText(e) }),
  });

  // ---- Association Selection Mode (§6.5.1.5b): create an authorized
  // cross-SoI relationship from a current-SoI node to the selected node ----
  const [assocPick, setAssocPick] = useState("");
  const currentSoINodes = useQuery({
    queryKey: ["soi", soiHid],
    queryFn: () => api.soi(soiHid!),
    enabled: !!soiHid && mode === "associate",
  });
  const assocPairs = useMemo(() => {
    if (!selected) return [];
    const rels = relSchema.data?.relationships ?? [];
    const sources = currentSoINodes.data?.nodes ?? [];
    const out: { sourceHid: string; sourceName: string; type: string }[] = [];
    for (const n of sources) {
      for (const r of rels) {
        if (
          r.source === n.typeName &&
          r.target === selected.typeName &&
          r.type !== "AT_RELATES_TO"
        ) {
          out.push({
            sourceHid: n.hid,
            sourceName: String(n.properties.Name ?? ""),
            type: r.type,
          });
        }
      }
    }
    return out;
  }, [selected, relSchema.data, currentSoINodes.data]);

  const associate = useMutation({
    mutationFn: () => {
      const [sourceHid, type] = assocPick.split("|");
      return api.commit({
        soiHid: soiHid ?? undefined,
        toolId: "sstpa.navigator",
        operations: [
          {
            op: "createRelationship",
            type,
            sourceHid,
            targetHid: selected!.id,
          },
        ],
      });
    },
    onSuccess: () => {
      const [sourceHid, type] = assocPick.split("|");
      setNotice({
        kind: "ok",
        text: `Association [:${type}] committed: ${sourceHid} → ${selected?.id}.`,
      });
      setAssocPick("");
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice({ kind: "warn", text: errorText(e) }),
  });

  // ---- Path to root for the detail panel (§6.5.1.21) ----
  const pathToRoot = useMemo(() => {
    if (!selected) return [];
    const byHid = new Map(entries.map((e) => [e.hid, e]));
    const path: string[] = [];
    let cursor = byHid.get(selected.id);
    if (!cursor && selected.soiIndex) {
      cursor = entries.find(
        (e) => e.typeName === "System" && e.hid === `SYS_${selected.soiIndex}_0`,
      );
      if (cursor) path.push(selected.id);
    }
    let guard = 0;
    const bySoI = new Map<string, HierarchyEntry>();
    for (const e of entries) {
      if (e.typeName === "System") {
        const idx = /^SYS_([0-9.]+)_/.exec(e.hid)?.[1];
        if (idx) bySoI.set(idx, e);
      }
    }
    while (cursor && guard++ < 20) {
      path.push(cursor.hid);
      const parentHid: string | null | undefined = cursor.parentHid;
      if (!parentHid) break;
      let parent = byHid.get(parentHid);
      if (!parent) {
        const idx = /^EL_([0-9.]+)_/.exec(parentHid)?.[1];
        parent = idx ? bySoI.get(idx) : undefined;
      }
      cursor = parent;
    }
    return path.reverse();
  }, [selected, entries]);

  const legendTypes = useMemo(
    () => [...new Set(elements.nodes.map((n) => n.data.typeName))].sort(),
    [elements.nodes],
  );

  if (hierarchy.isLoading || hierarchy.isError) {
    return (
      <ToolStatus
        loading={hierarchy.isLoading}
        error={hierarchy.error}
        onRetry={() => void hierarchy.refetch()}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <ToolStatus
        empty="No hierarchy yet."
        emptyHint="Create a Capability and a first System from the Main Panel."
      />
    );
  }

  const modeTab = (m: Mode, label: string, title: string) => (
    <button
      key={m}
      className={`sstpa-button ${mode === m ? "" : "secondary"}`}
      style={{ padding: "3px 10px", fontSize: "0.75rem" }}
      title={title}
      onClick={() => {
        setMode(m);
        setClonePhase(null);
        cloneParentPick.current = false;
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: modes, search, legend */}
      <div
        style={{
          width: 250,
          borderRight: "var(--sstpa-border-soft)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ padding: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {modeTab("soi", "SoI", "SoI Selection Mode (§6.5.1.5a)")}
          {modeTab("associate", "Associate", "Association Selection Mode (§6.5.1.5b)")}
          {modeTab("locate", "Locate", "Search / Locate Mode (§6.5.1.5c)")}
          {modeTab("clone", "Clone", "Clone Mode (§6.5.1.5d)")}
        </div>
        <div style={{ padding: "0 8px 8px" }}>
          <input
            className="sstpa-input"
            placeholder="Search HID, uuid, name, description, type…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
          {query.trim().length >= 2 && (
            <>
              <div className="rel-name" style={{ margin: "4px 0" }}>
                {matches.length} match(es)
              </div>
              {matches.map((m) => (
                <button
                  key={m.id}
                  className="icon-button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    padding: "3px 4px",
                  }}
                  onClick={() => {
                    setSelected(m);
                    centerOn(m.id);
                  }}
                >
                  <span className="mono" style={{ fontSize: "0.68rem" }}>
                    {m.id}
                  </span>{" "}
                  <span style={{ fontSize: "0.75rem" }}>{m.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
        {/* Legend (§6.5.1.24) */}
        <div style={{ borderTop: "var(--sstpa-border-soft)", padding: 8 }}>
          <button
            className="icon-button"
            style={{ border: "none", fontWeight: 700, fontSize: "0.72rem" }}
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
          >
            {legendOpen ? "▾" : "▸"} Legend
          </button>
          {legendOpen && (
            <div style={{ maxHeight: 130, overflow: "auto" }}>
              {legendTypes.map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.72rem",
                    padding: "1px 0",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      border: `2px solid ${resolveColor(nodeTypeColor(t))}`,
                      background: "var(--sstpa-node-fill)",
                    }}
                  />
                  {displayName(t)}
                </div>
              ))}
              <div style={{ fontSize: "0.68rem", color: "var(--sstpa-muted)", marginTop: 4 }}>
                Double accent border = current SoI. Dashed edges = SoI content
                relationships.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: canvas + controls */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {/* Viewport controls (§6.5.1.22) */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 5,
          }}
        >
          {[
            { t: "Zoom in", g: "+", f: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25) },
            { t: "Zoom out", g: "−", f: () => cyRef.current?.zoom(cyRef.current.zoom() / 1.25) },
            { t: "Fit to view", g: "⤢", f: () => cyRef.current?.fit(undefined, 40) },
            {
              t: "Center on selected",
              g: "◎",
              f: () => selected && centerOn(selected.id),
            },
          ].map((b) => (
            <button
              key={b.t}
              className="icon-button"
              style={{ background: "var(--sstpa-surface)" }}
              title={b.t}
              onClick={b.f}
            >
              {b.g}
            </button>
          ))}
        </div>
        {/* Display + export controls */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            gap: 4,
            zIndex: 5,
            background: "var(--sstpa-surface)",
            border: "var(--sstpa-border-soft)",
            borderRadius: 3,
            padding: 4,
          }}
        >
          <select
            className="sstpa-input"
            style={{ width: "auto", fontSize: "0.72rem", padding: "1px 4px" }}
            value={labelMode}
            title="Node label display (§6.5.1.19)"
            onChange={(e) => setLabelMode(e.target.value as LabelMode)}
          >
            <option value="both">HID + Name</option>
            <option value="hid">HID only</option>
            <option value="name">Name only</option>
            <option value="none">No labels</option>
          </select>
          <div style={{ position: "relative" }}>
            <button
              className="icon-button"
              title="Export diagram (§6.5.1.25)"
              onClick={() => setExportOpen((v) => !v)}
            >
              ⬇ Export
            </button>
            {exportOpen && (
              <div
                className="sstpa-frame"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  zIndex: 10,
                  background: "var(--sstpa-surface)",
                  minWidth: 170,
                  padding: 4,
                }}
              >
                {[
                  { label: "PNG — full graph", f: () => exportPng(cyRef.current!, "navigator-hierarchy", true) },
                  { label: "PNG — viewport", f: () => exportPng(cyRef.current!, "navigator-viewport", false) },
                  { label: "SVG — full graph", f: () => exportSvg(cyRef.current!, "navigator-hierarchy", true) },
                  { label: "SVG — viewport", f: () => exportSvg(cyRef.current!, "navigator-viewport", false) },
                ].map((o) => (
                  <button
                    key={o.label}
                    className="icon-button"
                    style={{ display: "block", width: "100%", textAlign: "left", border: "none" }}
                    onClick={() => {
                      o.f();
                      setExportOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {notice && (
          <div
            className={notice.kind === "ok" ? "sstpa-alert-success" : "sstpa-alert-warning"}
            style={{ position: "absolute", bottom: 8, left: 8, right: 8, zIndex: 5 }}
          >
            {notice.text}
            <button
              className="icon-button"
              style={{ float: "right" }}
              onClick={() => setNotice(null)}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Right: detail panel (§6.5.1.21) + mode actions */}
      <div
        style={{
          width: 265,
          borderLeft: "var(--sstpa-border-soft)",
          overflow: "auto",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {!selected && (
          <p style={{ fontSize: "0.8rem", color: "var(--sstpa-muted)" }}>
            Select a node on the canvas or from the search results.
          </p>
        )}
        {selected && (
          <>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="type-badge"
                  style={{ background: nodeTypeColor(selected.typeName) }}
                >
                  {displayName(selected.typeName)}
                </span>
                <strong style={{ fontSize: "0.9rem" }}>{selected.name}</strong>
              </div>
              {[
                { k: "HID", v: selected.id },
                { k: "uuid", v: selected.uuid ?? "—" },
                {
                  k: "Containing SoI",
                  v: selected.soiIndex
                    ? `SYS_${selected.soiIndex}_0`
                    : selected.id,
                },
              ].map((row) => (
                <div
                  key={row.k}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontSize: "0.72rem",
                    marginTop: 3,
                  }}
                >
                  <span style={{ color: "var(--sstpa-muted)", width: 84 }}>
                    {row.k}
                  </span>
                  <span className="mono" style={{ flex: 1, overflowWrap: "anywhere" }}>
                    {row.v}
                  </span>
                  <button
                    className="icon-button"
                    title={`Copy ${row.k}`}
                    onClick={() => void navigator.clipboard.writeText(row.v)}
                  >
                    ⧉
                  </button>
                </div>
              ))}
              {selected.shortDescription && (
                <p style={{ fontSize: "0.75rem", color: "var(--sstpa-muted)" }}>
                  {selected.shortDescription}
                </p>
              )}
              {pathToRoot.length > 1 && (
                <div style={{ fontSize: "0.68rem", marginTop: 4 }}>
                  <span style={{ color: "var(--sstpa-muted)" }}>Path: </span>
                  {pathToRoot.map((h, i) => (
                    <span key={h} className="mono">
                      {i > 0 && " → "}
                      <button
                        className="icon-button"
                        style={{ border: "none", padding: 0, fontSize: "0.68rem" }}
                        onClick={() => centerOn(h)}
                      >
                        {h}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Scope expansion for Systems (§6.5.1.23) */}
            {selected.typeName === "System" && (
              <button
                className="sstpa-button secondary"
                style={{ padding: "3px 10px", fontSize: "0.75rem" }}
                onClick={() =>
                  setExpandedSystems((xs) =>
                    xs.includes(selected.id)
                      ? xs.filter((x) => x !== selected.id)
                      : [...xs, selected.id],
                  )
                }
              >
                {expandedSystems.includes(selected.id)
                  ? "Hide SoI contents"
                  : "Show SoI contents"}
              </button>
            )}

            {/* Mode actions */}
            {mode === "soi" && selected.typeName === "System" && (
              <button className="sstpa-button" onClick={() => setConfirmSoI(selected.id)}>
                Select as current SoI
              </button>
            )}
            {mode === "soi" && selected.typeName !== "System" && (
              <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
                Only (:System) nodes can become the current SoI.
              </p>
            )}

            {mode === "associate" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="rel-name">Associate into current SoI</div>
                {!soiHid && <p style={{ fontSize: "0.72rem" }}>Select a SoI first.</p>}
                {soiHid && currentSoINodes.isLoading && (
                  <p style={{ fontSize: "0.72rem" }}>Loading SoI nodes…</p>
                )}
                {soiHid && !currentSoINodes.isLoading && assocPairs.length === 0 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
                    No authorized relationship from a current-SoI node to this{" "}
                    {selected.typeName}.
                  </p>
                )}
                {assocPairs.length > 0 && (
                  <>
                    <select
                      className="sstpa-input"
                      value={assocPick}
                      onChange={(e) => setAssocPick(e.target.value)}
                    >
                      <option value="" disabled>
                        Choose source and relationship…
                      </option>
                      {assocPairs.map((p) => (
                        <option
                          key={`${p.sourceHid}|${p.type}`}
                          value={`${p.sourceHid}|${p.type}`}
                        >
                          {p.sourceHid} —[:{p.type}]→ this
                        </option>
                      ))}
                    </select>
                    <button
                      className="sstpa-button"
                      disabled={!assocPick || associate.isPending}
                      onClick={() => associate.mutate()}
                    >
                      {associate.isPending ? "Committing…" : "Commit association"}
                    </button>
                  </>
                )}
              </div>
            )}

            {mode === "clone" && !clonePhase && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="rel-name">Clone (§6.5.1.5d)</div>
                <button
                  className="sstpa-button"
                  onClick={() => {
                    setClonePhase({ source: selected, withRequirements: false });
                    cloneParentPick.current = true;
                    setNotice({
                      kind: "warn",
                      text: "Clone: now select the destination parent node on the canvas (invalid parents are dimmed).",
                    });
                  }}
                >
                  Clone Node
                </button>
                <button
                  className="sstpa-button secondary"
                  onClick={() => {
                    setClonePhase({ source: selected, withRequirements: true });
                    cloneParentPick.current = true;
                    setNotice({
                      kind: "warn",
                      text: "Clone with Requirements: select the destination parent node on the canvas.",
                    });
                  }}
                >
                  Clone Node with Requirements
                </button>
              </div>
            )}
            {mode === "clone" && clonePhase && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="rel-name">
                  Cloning {clonePhase.source.id}
                  {clonePhase.withRequirements ? " + Requirements" : ""}
                </div>
                {selected.id !== clonePhase.source.id &&
                  validParentPairs.has(selected.typeName) && (
                    <>
                      <div style={{ fontSize: "0.72rem" }}>
                        Destination parent: <span className="mono">{selected.id}</span>
                      </div>
                      <select
                        className="sstpa-input"
                        value={
                          clonePhase.parent?.id === selected.id
                            ? (clonePhase.relType ?? "")
                            : ""
                        }
                        onChange={(e) =>
                          setClonePhase({
                            ...clonePhase,
                            parent: selected,
                            relType: e.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Relationship type…
                        </option>
                        {(validParentPairs.get(selected.typeName) ?? []).map((t) => (
                          <option key={t} value={t}>
                            [:{t}]
                          </option>
                        ))}
                      </select>
                      <button
                        className="sstpa-button"
                        disabled={
                          !clonePhase.relType ||
                          clonePhase.parent?.id !== selected.id ||
                          clone.isPending
                        }
                        onClick={() => clone.mutate()}
                      >
                        {clone.isPending ? "Cloning…" : "Execute clone"}
                      </button>
                    </>
                  )}
                {(selected.id === clonePhase.source.id ||
                  !validParentPairs.has(selected.typeName)) && (
                  <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
                    Select a valid destination parent on the canvas — nodes
                    that cannot own a {clonePhase.source.typeName} are dimmed.
                  </p>
                )}
                <button
                  className="sstpa-button secondary"
                  onClick={() => {
                    setClonePhase(null);
                    cloneParentPick.current = false;
                  }}
                >
                  Cancel clone
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirmSoI && (
        <ConfirmDialog
          title="Change current System of Interest?"
          confirmLabel="Select SoI"
          onCancel={() => setConfirmSoI(null)}
          onConfirm={() => {
            setSoI(confirmSoI);
            setConfirmSoI(null);
            setNotice({
              kind: "ok",
              text: `${confirmSoI} is now the current SoI. All GUI panels updated.`,
            });
          }}
        >
          <p>
            Make <span className="mono">{confirmSoI}</span> the current SoI?
            All GUI panels will update (SRS §6.5.1.5a).
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
