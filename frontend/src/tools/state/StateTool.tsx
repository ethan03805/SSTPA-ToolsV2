// The State Tool (SRS §6.5.5): SysML 2-aligned state-transition diagrams for
// the current SoI using (:State) nodes and [:TRANSITIONS_TO] relationships.
// Three modes: Diagram View, Context View (filtered to the invoking
// Countermeasure/Hazard/Requirement or the selected State's neighborhood),
// Criteria/Relationship View (Loss/Environment VALID_IN filtering ordered by
// StateSequence plus §6.5.5.13 presence filters). Transition semantics via
// TransitionKind (FUNCTIONAL, COUNTERMEASURE_REQUIRED, BOTH); per-State
// StateSequence, [:VALID_IN], [:HAS_HAZARD], [:APPLIES_TO_STATE] and
// Requirement-via-Countermeasure association management (§6.5.5.12);
// PNG + SVG export (§6.5.5.16).
//
// Parallel-transition integrity: the Backend deleteRelationship op removes
// ALL [:TRANSITIONS_TO] edges between a (source,target) pair (commit.go), so
// every edit/removal of one transition stages a delete followed by the
// recreation of every surviving parallel transition in the same commit.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { SoINode } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { errorText, exportPng, exportSvg, ToolStatus, usePrompt } from "../shared";

const KIND_COLOR: Record<string, string> = {
  FUNCTIONAL: "#33567e",
  COUNTERMEASURE_REQUIRED: "#8c2f2f",
  BOTH: "#9a6b1f",
};

type Mode = "diagram" | "context" | "criteria";

interface Notice {
  kind: "success" | "error" | "info";
  text: string;
}

const NOTICE_CLASS: Record<Notice["kind"], string> = {
  success: "sstpa-alert-success",
  error: "sstpa-alert-error",
  info: "sstpa-alert-warning",
};

interface TransitionSel {
  sourceHid: string;
  targetHid: string;
  /** Position among the parallel [:TRANSITIONS_TO] edges between the pair. */
  index: number;
  props: Record<string, unknown>;
}

/** All parallel [:TRANSITIONS_TO] relationships between a (source,target)
 *  pair, in stable relationship-array order (matches canvas edge indices). */
function parallelTransitions(source: SoINode | undefined, targetHid: string) {
  return (source?.relationships ?? []).filter(
    (r) => r.type === "TRANSITIONS_TO" && r.targetHID === targetHid,
  );
}

export default function StateTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  // Invocation context (§6.5.5.3/§6.5.5.4): center on drawer State; Context
  // view for CM/HAZ/REQ; Criteria view for Loss; Environment highlights its
  // VALID_IN States.
  const drawerPrefix = ctx.drawerNodeHid?.split("_")[0] ?? "";
  const initialMode: Mode =
    drawerPrefix === "LOS"
      ? "criteria"
      : ["CM", "HAZ", "REQ"].includes(drawerPrefix)
        ? "context"
        : "diagram";
  const contextFocusHid = ["CM", "HAZ", "REQ"].includes(drawerPrefix)
    ? ctx.drawerNodeHid
    : null;
  const envFocusHid = drawerPrefix === "ENV" ? ctx.drawerNodeHid : null;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedState, setSelectedState] = useState<string | null>(
    drawerPrefix === "ST" ? ctx.drawerNodeHid : null,
  );
  const [selectedTransition, setSelectedTransition] = useState<TransitionSel | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [cmFilter, setCmFilter] = useState<string>("");
  const [hazFilter, setHazFilter] = useState<string>("");
  const [reqFilter, setReqFilter] = useState<string>("");
  const [envSel, setEnvSel] = useState<string>("");
  const [showCriteria, setShowCriteria] = useState(true);
  const [showOverlays, setShowOverlays] = useState(mode !== "diagram");
  const [creatingTransition, setCreatingTransition] = useState<null | {
    source?: string;
    target?: string;
  }>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const qc = useQueryClient();
  const prompt = usePrompt();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const states = useMemo(() => nodes.filter((n) => n.typeName === "State"), [nodes]);
  const environments = nodes.filter((n) => n.typeName === "Environment");
  const countermeasures = nodes.filter((n) => n.typeName === "Countermeasure");
  const hazards = nodes.filter((n) => n.typeName === "Hazard");
  const requirements = nodes.filter((n) => n.typeName === "Requirement");

  // Loss context resolves to its Environment (§6.5.5.4/§6.5.5.5c).
  const lossEnvHid = useMemo(() => {
    if (drawerPrefix !== "LOS" || !ctx.drawerNodeHid) return null;
    const loss = byHid.get(ctx.drawerNodeHid);
    return (
      (loss?.relationships ?? []).find((r) => r.type === "HAS_ENVIRONMENT")?.targetHID ?? null
    );
  }, [drawerPrefix, ctx.drawerNodeHid, byHid]);
  const contextEnv = envFocusHid ?? lossEnvHid;
  useEffect(() => {
    if (contextEnv) setEnvSel((cur) => cur || contextEnv);
  }, [contextEnv]);
  const envFilter = mode === "criteria" && envSel && envSel !== "ALL" ? envSel : null;

  // States related to a Countermeasure/Hazard/Requirement context node.
  const statesRelatedTo = useMemo(() => {
    return (hid: string): Set<string> => {
      const out = new Set<string>();
      const node = byHid.get(hid);
      if (!node) return out;
      if (node.typeName === "Hazard") {
        for (const s of states) {
          if ((s.relationships ?? []).some((r) => r.type === "HAS_HAZARD" && r.targetHID === hid))
            out.add(s.hid);
        }
      } else if (node.typeName === "Countermeasure") {
        for (const r of node.relationships ?? []) {
          if (r.type === "APPLIES_TO_STATE") out.add(r.targetHID);
        }
        // Transitions governed by this Countermeasure include their endpoints.
        for (const s of states) {
          for (const r of s.relationships ?? []) {
            if (
              r.type === "TRANSITIONS_TO" &&
              String(r.props?.RequiredByCountermeasureHID ?? "") === hid
            ) {
              out.add(s.hid);
              out.add(r.targetHID);
            }
          }
        }
      } else if (node.typeName === "Requirement") {
        // Requirement reaches States through requirement-bearing
        // Countermeasures (§6.5.5.12/§6.5.5.13).
        for (const cm of nodes.filter((n) => n.typeName === "Countermeasure")) {
          const bears = (cm.relationships ?? []).some(
            (r) => r.type === "HAS_REQUIREMENT" && r.targetHID === hid,
          );
          if (!bears) continue;
          for (const r of cm.relationships ?? []) {
            if (r.type === "APPLIES_TO_STATE") out.add(r.targetHID);
          }
        }
      }
      return out;
    };
  }, [byHid, states, nodes]);

  // Visible-state filter per mode (§6.5.5.5, §6.5.5.13). Null → all States.
  const visibleStates = useMemo((): Set<string> | null => {
    if (mode === "diagram") return null;
    if (mode === "context") {
      // Invoking analytical context wins; otherwise the selected State's
      // neighborhood (direct transitions in and out).
      if (contextFocusHid && byHid.has(contextFocusHid)) {
        return statesRelatedTo(contextFocusHid);
      }
      if (selectedState) {
        const set = new Set<string>([selectedState]);
        const sel = byHid.get(selectedState);
        for (const r of sel?.relationships ?? []) {
          if (r.type === "TRANSITIONS_TO") set.add(r.targetHID);
        }
        for (const s of states) {
          if (
            (s.relationships ?? []).some(
              (r) => r.type === "TRANSITIONS_TO" && r.targetHID === selectedState,
            )
          )
            set.add(s.hid);
        }
        return set;
      }
      return null;
    }
    // Criteria / Relationship View filters (§6.5.5.5c, §6.5.5.13).
    let set = new Set(states.map((s) => s.hid));
    const intersect = (other: Set<string>) => {
      set = new Set([...set].filter((h) => other.has(h)));
    };
    if (envFilter) {
      intersect(
        new Set(
          states
            .filter((s) =>
              (s.relationships ?? []).some(
                (r) => r.type === "VALID_IN" && r.targetHID === envFilter,
              ),
            )
            .map((s) => s.hid),
        ),
      );
    }
    if (cmFilter) intersect(statesRelatedTo(cmFilter));
    if (hazFilter) intersect(statesRelatedTo(hazFilter));
    if (reqFilter) intersect(statesRelatedTo(reqFilter));
    return set;
  }, [mode, contextFocusHid, selectedState, byHid, states, statesRelatedTo, envFilter, cmFilter, hazFilter, reqFilter]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["soi"] });

  const createState = useMutation({
    mutationFn: (name: string) =>
      api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.state",
        operations: [
          { op: "createNode", tempId: "st", label: "State", properties: { Name: name } },
          {
            op: "createRelationship",
            type: "EXHIBITS",
            sourceHid: ctx.soiHid!,
            targetHid: "$st",
          },
        ],
      }),
    onSuccess: (res) => {
      setNotice({ kind: "success", text: `State ${res.createdNodes.st} created.` });
      refresh();
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  // Escape deselects / cancels transition creation (§6.5.5.9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCreatingTransition(null);
      setSelectedState(null);
      setSelectedTransition(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // SoI gate (§6.5.5.1: the tool operates on the current SoI) and uniform
  // loading / error surfaces.
  if (!ctx.soiHid) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus needsSoI />
      </div>
    );
  }
  if (soi.isLoading || soi.isError) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus
          loading={soi.isLoading}
          error={soi.isError ? soi.error : undefined}
          onRetry={() => void soi.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
        }}
      >
        {(["diagram", "context", "criteria"] as Mode[]).map((m) => (
          <button
            key={m}
            className={`sstpa-button ${mode === m ? "" : "secondary"}`}
            onClick={() => {
              setMode(m);
              setShowOverlays(m !== "diagram");
            }}
          >
            {m === "diagram" ? "Diagram" : m === "context" ? "Context" : "Criteria / Relationships"}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <button
          className="icon-button"
          onClick={() =>
            prompt.ask(
              "Name for the new (:State)",
              (name) => createState.mutate(name),
              { placeholder: "New State" },
            )
          }
        >
          + State
        </button>
        <button
          className="icon-button"
          title="Create a transition: pick source, then target"
          disabled={states.length < 2}
          onClick={() => {
            setCreatingTransition({});
            setNotice({ kind: "info", text: "Transition: click the source State on the canvas…" });
          }}
        >
          + Transition
        </button>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: "0.74rem" }}>
          Kind{" "}
          <select
            className="sstpa-input"
            style={{ width: "auto", display: "inline-block" }}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="">All</option>
            <option>FUNCTIONAL</option>
            <option>COUNTERMEASURE_REQUIRED</option>
            <option>BOTH</option>
          </select>
        </label>
        <label style={{ fontSize: "0.74rem" }}>
          <input
            type="checkbox"
            checked={showCriteria}
            onChange={(e) => setShowCriteria(e.target.checked)}
          />{" "}
          Criteria labels
        </label>
        <label style={{ fontSize: "0.74rem" }}>
          <input
            type="checkbox"
            checked={showOverlays}
            onChange={(e) => setShowOverlays(e.target.checked)}
          />{" "}
          Related overlays
        </label>
      </div>

      {mode === "criteria" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "4px var(--sstpa-sp-3)",
            borderBottom: "var(--sstpa-border-soft)",
            fontSize: "0.74rem",
          }}
        >
          <label>
            Environment{" "}
            <select
              className="sstpa-input"
              style={{ width: "auto", display: "inline-block" }}
              value={envSel || "ALL"}
              onChange={(e) => setEnvSel(e.target.value)}
            >
              <option value="ALL">All</option>
              {environments.map((e) => (
                <option key={e.hid} value={e.hid}>
                  {String(e.properties.Name ?? e.hid)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Countermeasure{" "}
            <select
              className="sstpa-input"
              style={{ width: "auto", display: "inline-block" }}
              value={cmFilter}
              onChange={(e) => setCmFilter(e.target.value)}
            >
              <option value="">All</option>
              {countermeasures.map((n) => (
                <option key={n.hid} value={n.hid}>
                  {String(n.properties.Name ?? n.hid)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hazard{" "}
            <select
              className="sstpa-input"
              style={{ width: "auto", display: "inline-block" }}
              value={hazFilter}
              onChange={(e) => setHazFilter(e.target.value)}
            >
              <option value="">All</option>
              {hazards.map((n) => (
                <option key={n.hid} value={n.hid}>
                  {String(n.properties.Name ?? n.hid)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Requirement{" "}
            <select
              className="sstpa-input"
              style={{ width: "auto", display: "inline-block" }}
              value={reqFilter}
              onChange={(e) => setReqFilter(e.target.value)}
            >
              <option value="">All</option>
              {requirements.map((n) => (
                <option key={n.hid} value={n.hid}>
                  {String(n.properties.Name ?? n.hid)}
                </option>
              ))}
            </select>
          </label>
          {envFilter && (
            <span style={{ color: "var(--sstpa-navy-muted)" }}>
              States valid in {String(byHid.get(envFilter)?.properties.Name ?? envFilter)}, ordered
              by StateSequence.
            </span>
          )}
        </div>
      )}
      {mode === "context" && contextFocusHid && (
        <div
          style={{
            padding: "4px var(--sstpa-sp-3)",
            borderBottom: "var(--sstpa-border-soft)",
            fontSize: "0.74rem",
            color: "var(--sstpa-navy-muted)",
          }}
        >
          Context: {contextFocusHid} — showing only States related to this{" "}
          {byHid.get(contextFocusHid)?.typeName ?? "node"}.
        </div>
      )}

      {notice && (
        <div className={NOTICE_CLASS[notice.kind]} style={{ margin: "6px 12px" }}>
          {notice.text}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {states.length === 0 ? (
          <div style={{ flex: 1 }}>
            <ToolStatus
              empty="No (:State) nodes in this SoI yet."
              emptyHint="Use “+ State” to create the first State (§6.5.5.10)."
            />
          </div>
        ) : (
          <StateCanvas
            nodes={nodes}
            mode={mode}
            kindFilter={kindFilter}
            showCriteria={showCriteria}
            showOverlays={showOverlays}
            visibleStates={visibleStates}
            envFocusHid={envFocusHid}
            orderBySequence={mode === "criteria" && !!envFilter}
            selectedState={selectedState}
            selectedTransition={selectedTransition}
            creatingTransition={creatingTransition}
            onPickForTransition={(hid) => {
              setCreatingTransition((cur) => {
                if (!cur) return cur;
                if (!cur.source) {
                  setNotice({ kind: "info", text: `Source ${hid} — now click the target State…` });
                  return { source: hid };
                }
                return { source: cur.source, target: hid };
              });
            }}
            onSelectState={(hid) => {
              setSelectedState(hid);
              setSelectedTransition(null);
            }}
            onSelectTransition={(t) => {
              setSelectedTransition(t);
              setSelectedState(null);
            }}
          />
        )}
        <aside
          style={{
            width: 330,
            borderLeft: "var(--sstpa-border)",
            overflow: "auto",
            background: "var(--sstpa-ivory-raised)",
          }}
        >
          {selectedState && byHid.get(selectedState) && (
            <StateDetailPanel
              key={selectedState}
              ctx={ctx}
              state={byHid.get(selectedState)!}
              nodes={nodes}
              onChanged={refresh}
              onNotice={setNotice}
            />
          )}
          {selectedTransition && (
            <TransitionDetailPanel
              key={`${selectedTransition.sourceHid}->${selectedTransition.targetHid}#${selectedTransition.index}`}
              ctx={ctx}
              sel={selectedTransition}
              byHid={byHid}
              onChanged={(msg) => {
                refresh();
                setSelectedTransition(null);
                if (msg) setNotice(msg);
              }}
            />
          )}
          {!selectedState && !selectedTransition && (
            <p style={{ padding: 14, fontSize: "0.8rem", color: "var(--sstpa-navy-muted)" }}>
              Select a State block or a transition edge. Press Escape to
              deselect.
              <br />
              <br />
              States: {states.length} · Transitions:{" "}
              {states.reduce(
                (acc, s) =>
                  acc + (s.relationships ?? []).filter((r) => r.type === "TRANSITIONS_TO").length,
                0,
              )}
            </p>
          )}
        </aside>
      </div>

      {creatingTransition?.source && creatingTransition.target && (
        <NewTransitionDialog
          ctx={ctx}
          source={creatingTransition.source}
          target={creatingTransition.target}
          countermeasures={countermeasures}
          onClose={(msg) => {
            setCreatingTransition(null);
            if (msg) setNotice(msg);
            refresh();
          }}
        />
      )}
      {prompt.element}
    </div>
  );
}

/** Cytoscape canvas: SysML state blocks + transition edges + optional
 *  analytical overlays (§6.5.5.7–§6.5.5.9). */
function StateCanvas({
  nodes,
  mode,
  kindFilter,
  showCriteria,
  showOverlays,
  visibleStates,
  envFocusHid,
  orderBySequence,
  selectedState,
  selectedTransition,
  creatingTransition,
  onPickForTransition,
  onSelectState,
  onSelectTransition,
}: {
  nodes: SoINode[];
  mode: Mode;
  kindFilter: string;
  showCriteria: boolean;
  showOverlays: boolean;
  visibleStates: Set<string> | null;
  envFocusHid: string | null;
  orderBySequence: boolean;
  selectedState: string | null;
  selectedTransition: TransitionSel | null;
  creatingTransition: null | { source?: string; target?: string };
  onPickForTransition: (hid: string) => void;
  onSelectState: (hid: string) => void;
  onSelectTransition: (t: TransitionSel) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const creatingTransitionRef = useRef(creatingTransition);
  creatingTransitionRef.current = creatingTransition;
  const pickRef = useRef(onPickForTransition);
  pickRef.current = onPickForTransition;
  const selectStateRef = useRef(onSelectState);
  selectStateRef.current = onSelectState;
  const selectTransitionRef = useRef(onSelectTransition);
  selectTransitionRef.current = onSelectTransition;

  const elements = useMemo(() => {
    const els: cytoscape.ElementDefinition[] = [];
    const states = nodes.filter(
      (n) => n.typeName === "State" && (!visibleStates || visibleStates.has(n.hid)),
    );
    for (const s of states) {
      const seq = s.properties.StateSequence;
      els.push({
        data: {
          id: s.hid,
          label: `${s.hid}${seq != null ? ` [#${seq}]` : ""}\n${String(s.properties.Name ?? "")}`,
          kind: "state",
          seq: seq == null ? Number.MAX_SAFE_INTEGER : Number(seq),
          envHi:
            !!envFocusHid &&
            (s.relationships ?? []).some(
              (r) => r.type === "VALID_IN" && r.targetHID === envFocusHid,
            ),
        },
      });
      // Parallel transitions keep a per-pair index so the detail panel can
      // recreate every survivor on edit (Backend deletes all pair edges).
      const pairIndex = new Map<string, number>();
      for (const rel of s.relationships ?? []) {
        if (rel.type === "TRANSITIONS_TO") {
          const idx = pairIndex.get(rel.targetHID) ?? 0;
          pairIndex.set(rel.targetHID, idx + 1);
          const kind = String(rel.props?.TransitionKind ?? "FUNCTIONAL");
          if (kindFilter && kind !== kindFilter) continue;
          const trigger = String(rel.props?.Trigger ?? "");
          const guard = String(rel.props?.GuardCondition ?? "");
          let label = "";
          if (showCriteria) {
            label = trigger && trigger !== "null" ? trigger : "";
            if (guard && guard !== "null") label += ` [${guard}]`;
          }
          els.push({
            data: {
              id: `${s.hid}->${rel.targetHID}#${idx}`,
              source: s.hid,
              target: rel.targetHID,
              label,
              tkind: kind,
              pidx: idx,
              props: rel.props ?? {},
            },
          });
        }
        if (showOverlays && rel.type === "VALID_IN") {
          els.push({
            data: {
              id: `${s.hid}~${rel.targetHID}`,
              source: s.hid,
              target: rel.targetHID,
              validIn: true,
            },
          });
        }
      }
    }
    if (showOverlays) {
      const overlayTypes = ["Hazard", "Countermeasure", "Environment"];
      const shown = new Set(els.map((e) => e.data.id as string));
      const stateShown = new Set(states.map((s) => s.hid));
      for (const n of nodes) {
        if (!overlayTypes.includes(n.typeName)) continue;
        const related =
          n.typeName === "Countermeasure"
            ? (n.relationships ?? []).some(
                (r) => r.type === "APPLIES_TO_STATE" && stateShown.has(r.targetHID),
              )
            : n.typeName === "Environment"
              ? els.some(
                  (e) => (e.data as Record<string, unknown>).validIn && e.data.target === n.hid,
                )
              : states.some((s) =>
                  (s.relationships ?? []).some(
                    (r) => r.type === "HAS_HAZARD" && r.targetHID === n.hid,
                  ),
                );
        if (!related) continue;
        if (!shown.has(n.hid)) {
          els.push({
            data: {
              id: n.hid,
              label: `${n.typeName}\n${String(n.properties.Name ?? "")}`,
              kind: n.typeName.toLowerCase(),
            },
          });
          shown.add(n.hid);
        }
      }
      // Overlay edges
      for (const s of states) {
        for (const rel of s.relationships ?? []) {
          if (rel.type === "HAS_HAZARD" && shown.has(rel.targetHID)) {
            els.push({
              data: {
                id: `${s.hid}!${rel.targetHID}`,
                source: s.hid,
                target: rel.targetHID,
                overlay: true,
              },
            });
          }
        }
      }
      for (const cm of nodes.filter((n) => n.typeName === "Countermeasure")) {
        for (const rel of cm.relationships ?? []) {
          if (rel.type === "APPLIES_TO_STATE" && shown.has(cm.hid) && stateShown.has(rel.targetHID)) {
            els.push({
              data: {
                id: `${cm.hid}!${rel.targetHID}`,
                source: cm.hid,
                target: rel.targetHID,
                overlay: true,
              },
            });
          }
        }
      }
    }
    // Drop edges to missing endpoints.
    const ids = new Set(els.filter((e) => !e.data.source).map((e) => e.data.id as string));
    return els.filter(
      (e) => !e.data.source || (ids.has(e.data.source as string) && ids.has(e.data.target as string)),
    );
  }, [nodes, kindFilter, showCriteria, showOverlays, visibleStates, envFocusHid]);

  useEffect(() => {
    if (!containerRef.current) return;
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node[kind = "state"]',
          style: {
            shape: "round-rectangle",
            "background-color": "#fcfaf2",
            "border-width": 2,
            "border-color": "#6d5a8e",
            label: "data(label)",
            "text-wrap": "wrap",
            "text-valign": "center",
            "font-size": 9,
            "font-family": "JetBrains Mono, monospace",
            width: 150,
            height: 54,
            color: "#1b2a4a",
          },
        },
        {
          // Environment-focused invocation: VALID_IN States are visually
          // distinguished from unassigned States (§6.5.5.4).
          selector: "node[?envHi]",
          style: {
            "border-color": "#567045",
            "border-width": 4,
            "background-color": "#f2f4ee",
          },
        },
        {
          selector: 'node[kind = "hazard"]',
          style: {
            shape: "diamond",
            "background-color": "#fbeeee",
            "border-color": "#8c2f2f",
            "border-width": 1.5,
            label: "data(label)",
            "text-wrap": "wrap",
            "font-size": 8,
            width: 110,
            height: 60,
            color: "#8c2f2f",
          },
        },
        {
          selector: 'node[kind = "countermeasure"]',
          style: {
            shape: "hexagon",
            "background-color": "#eef2ee",
            "border-color": "#2e6b4f",
            "border-width": 1.5,
            label: "data(label)",
            "text-wrap": "wrap",
            "font-size": 8,
            width: 120,
            height: 56,
            color: "#2e6b4f",
          },
        },
        {
          selector: 'node[kind = "environment"]',
          style: {
            shape: "ellipse",
            "background-color": "#f2f4ee",
            "border-color": "#567045",
            "border-width": 1.5,
            label: "data(label)",
            "text-wrap": "wrap",
            "font-size": 8,
            width: 120,
            height: 54,
            color: "#567045",
          },
        },
        {
          selector: "node:selected",
          style: { "border-color": "#a8853a", "border-width": 3.5 },
        },
        {
          selector: "edge",
          style: {
            width: 1.6,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            label: "data(label)",
            "font-size": 7.5,
            "text-rotation": "autorotate",
            "text-background-color": "#faf7ee",
            "text-background-opacity": 0.85,
            color: "#22304c",
            "line-color": "#33567e",
            "target-arrow-color": "#33567e",
          },
        },
        {
          selector: 'edge[tkind = "COUNTERMEASURE_REQUIRED"]',
          style: {
            "line-color": KIND_COLOR.COUNTERMEASURE_REQUIRED,
            "target-arrow-color": KIND_COLOR.COUNTERMEASURE_REQUIRED,
            "line-style": "dashed",
          },
        },
        {
          selector: 'edge[tkind = "BOTH"]',
          style: {
            "line-color": KIND_COLOR.BOTH,
            "target-arrow-color": KIND_COLOR.BOTH,
            width: 2.4,
          },
        },
        {
          selector: "edge[?validIn]",
          style: {
            "line-color": "#567045",
            "target-arrow-shape": "none",
            "line-style": "dotted",
            width: 1,
          },
        },
        {
          selector: "edge[?overlay]",
          style: {
            "line-color": "#9aa4b5",
            "target-arrow-shape": "vee",
            "line-style": "dotted",
            width: 1,
          },
        },
        {
          selector: "edge:selected",
          style: { "line-color": "#a8853a", "target-arrow-color": "#a8853a", width: 3 },
        },
      ],
      layout:
        mode === "criteria"
          ? orderBySequence
            ? ({
                name: "grid",
                condense: true,
                sort: (a: cytoscape.NodeSingular, b: cytoscape.NodeSingular) =>
                  Number(a.data("seq") ?? Number.MAX_SAFE_INTEGER) -
                  Number(b.data("seq") ?? Number.MAX_SAFE_INTEGER),
              } as unknown as cytoscape.LayoutOptions)
            : ({ name: "cose", animate: false } as cytoscape.LayoutOptions)
          : ({
              name: "breadthfirst",
              directed: true,
              spacingFactor: 1.3,
              animate: false,
            } as cytoscape.LayoutOptions),
    });
    cy.on("tap", 'node[kind = "state"]', (ev) => {
      const hid = ev.target.id();
      if (creatingTransitionRef.current) {
        pickRef.current(hid);
      } else {
        selectStateRef.current(hid);
      }
    });
    cy.on("tap", "edge", (ev) => {
      const d = ev.target.data();
      if (d.tkind) {
        selectTransitionRef.current({
          sourceHid: d.source,
          targetHid: d.target,
          index: Number(d.pidx ?? 0),
          props: d.props ?? {},
        });
      }
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, mode, orderBySequence]);

  // Selected-state changes re-center without rebuilding the graph
  // (§6.5.5.9 animated centering; §6.5.5.19 layout stability).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!selectedState) {
      cy.nodes().unselect();
      return;
    }
    const el = cy.getElementById(selectedState);
    if (el.nonempty()) {
      cy.nodes().unselect();
      el.select();
      cy.animate({ center: { eles: el }, duration: 200 });
    }
  }, [selectedState, elements]);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || selectedTransition) return;
    cy.edges().unselect();
  }, [selectedTransition, elements]);

  const doExport = (full: boolean, asSvg: boolean) => {
    const cy = cyRef.current;
    if (!cy) return;
    if (asSvg) exportSvg(cy, "sstpa-state-diagram", full);
    else exportPng(cy, "sstpa-state-diagram", full);
  };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, background: "var(--sstpa-canvas)" }}
      />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
        <button className="icon-button" onClick={() => doExport(false, false)}>
          PNG (view)
        </button>
        <button className="icon-button" onClick={() => doExport(true, false)}>
          PNG (full)
        </button>
        <button className="icon-button" onClick={() => doExport(false, true)}>
          SVG (view)
        </button>
        <button className="icon-button" onClick={() => doExport(true, true)}>
          SVG (full)
        </button>
      </div>
      {/* Legend (§6.5.5.8) */}
      <div
        className="sstpa-frame"
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          padding: "6px 12px",
          fontSize: "0.68rem",
          display: "flex",
          gap: 14,
        }}
      >
        <span style={{ color: KIND_COLOR.FUNCTIONAL }}>— FUNCTIONAL</span>
        <span style={{ color: KIND_COLOR.COUNTERMEASURE_REQUIRED }}>-- COUNTERMEASURE_REQUIRED</span>
        <span style={{ color: KIND_COLOR.BOTH }}>▬ BOTH</span>
        <span style={{ color: "#567045" }}>·· VALID_IN</span>
        {envFocusHid && <span style={{ color: "#567045" }}>▣ valid in {envFocusHid}</span>}
      </div>
    </div>
  );
}

/** State Detail Panel (§6.5.5.9, §6.5.5.12, §6.5.5.13.1): properties,
 *  StateSequence, VALID_IN management, and Hazard / Countermeasure /
 *  Requirement association with staged Commit. */
function StateDetailPanel({
  ctx,
  state,
  nodes,
  onChanged,
  onNotice,
}: {
  ctx: ToolLaunchContext;
  state: SoINode;
  nodes: SoINode[];
  onChanged: () => void;
  onNotice: (n: Notice) => void;
}) {
  const [seq, setSeq] = useState<string>(
    state.properties.StateSequence == null ? "" : String(state.properties.StateSequence),
  );
  const [error, setError] = useState<string | null>(null);
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const prompt = usePrompt();

  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const nameOf = (hid: string) => String(byHid.get(hid)?.properties.Name ?? hid);
  const environments = nodes.filter((n) => n.typeName === "Environment");
  const hazards = nodes.filter((n) => n.typeName === "Hazard");
  const countermeasures = nodes.filter((n) => n.typeName === "Countermeasure");
  const requirements = nodes.filter((n) => n.typeName === "Requirement");

  const validIn = (state.relationships ?? []).filter((r) => r.type === "VALID_IN");
  const assignedEnvs = new Set(validIn.map((r) => r.targetHID));
  const unassignedEnvs = environments.filter((e) => !assignedEnvs.has(e.hid));
  const [addEnv, setAddEnv] = useState("");

  const stateHazards = (state.relationships ?? []).filter((r) => r.type === "HAS_HAZARD");
  const hazardSet = new Set(stateHazards.map((r) => r.targetHID));
  const unlinkedHazards = hazards.filter((h) => !hazardSet.has(h.hid));
  const [addHaz, setAddHaz] = useState("");

  // Countermeasures applying to this State: (:Countermeasure)-[:APPLIES_TO_STATE]->(:State).
  const applyingCms = countermeasures.filter((cm) =>
    (cm.relationships ?? []).some(
      (r) => r.type === "APPLIES_TO_STATE" && r.targetHID === state.hid,
    ),
  );
  const applyingSet = new Set(applyingCms.map((cm) => cm.hid));
  const otherCms = countermeasures.filter((cm) => !applyingSet.has(cm.hid));
  const [addCm, setAddCm] = useState("");

  // Requirement association goes through a requirement-bearing
  // Countermeasure (§6.5.5.12).
  const [reqCm, setReqCm] = useState("");
  const [addReq, setAddReq] = useState("");

  const commitOps = async (
    ops: Parameters<typeof api.commit>[0]["operations"],
    success?: string,
  ) => {
    setError(null);
    try {
      await api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.state", operations: ops });
      if (success) onNotice({ kind: "success", text: success });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sectionH = (t: string) => <h4 style={{ margin: "12px 0 4px" }}>{t}</h4>;

  return (
    <div style={{ padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      <div className="mono" style={{ fontSize: "0.7rem" }}>
        {state.hid}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{String(state.properties.Name ?? "")}</div>
      {error && <div className="sstpa-alert-error">{error}</div>}

      <label style={{ display: "block", marginTop: 8 }}>
        Lifecycle Sequence:
        <span style={{ display: "flex", gap: 6 }}>
          <input
            className="sstpa-input"
            type="number"
            min={0}
            placeholder="Not Set"
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
          />
          <button
            className="icon-button"
            onClick={() =>
              void commitOps(
                [
                  {
                    op: "updateNode",
                    hid: state.hid,
                    properties: { StateSequence: seq === "" ? null : parseInt(seq, 10) },
                  },
                ],
                `StateSequence for ${state.hid} committed.`,
              )
            }
          >
            Commit
          </button>
        </span>
        <span style={{ fontSize: "0.68rem", color: "var(--sstpa-navy-muted)" }}>
          Used for SAND sequencing in the Loss Tool.
        </span>
      </label>

      {sectionH("Valid in Environments")}
      {validIn.length === 0 && (
        <p style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.74rem" }}>
          No [:VALID_IN] assignments.
        </p>
      )}
      {validIn.map((r) => (
        <div key={r.targetHID} className="prop-row">
          <span className="mono" style={{ fontSize: "0.7rem" }} title={nameOf(r.targetHID)}>
            {r.targetHID} {nameOf(r.targetHID)}
          </span>
          <button
            className="icon-button danger"
            onClick={() =>
              void commitOps(
                [
                  {
                    op: "deleteRelationship",
                    type: "VALID_IN",
                    sourceHid: state.hid,
                    targetHid: r.targetHID,
                  },
                ],
                `Removed [:VALID_IN] ${state.hid} → ${r.targetHID}.`,
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      {unassignedEnvs.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <select className="sstpa-input" value={addEnv} onChange={(e) => setAddEnv(e.target.value)}>
            <option value="">Add Environment…</option>
            {unassignedEnvs.map((e) => (
              <option key={e.hid} value={e.hid}>
                {String(e.properties.Name ?? e.hid)}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            disabled={!addEnv}
            onClick={() => {
              setAddEnv("");
              void commitOps(
                [
                  {
                    op: "createRelationship",
                    type: "VALID_IN",
                    sourceHid: state.hid,
                    targetHid: addEnv,
                  },
                ],
                `Added [:VALID_IN] ${state.hid} → ${addEnv}.`,
              );
            }}
          >
            Add
          </button>
        </div>
      )}

      {sectionH("Hazards")}
      {stateHazards.length === 0 && (
        <p style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.74rem" }}>
          No [:HAS_HAZARD] associations.
        </p>
      )}
      {stateHazards.map((r) => (
        <div key={r.targetHID} className="prop-row">
          <span className="mono" style={{ fontSize: "0.7rem" }} title={nameOf(r.targetHID)}>
            {r.targetHID} {nameOf(r.targetHID)}
          </span>
          <button
            className="icon-button danger"
            onClick={() =>
              void commitOps(
                [
                  {
                    op: "deleteRelationship",
                    type: "HAS_HAZARD",
                    sourceHid: state.hid,
                    targetHid: r.targetHID,
                  },
                ],
                `Removed [:HAS_HAZARD] ${state.hid} → ${r.targetHID}.`,
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {unlinkedHazards.length > 0 && (
          <>
            <select className="sstpa-input" value={addHaz} onChange={(e) => setAddHaz(e.target.value)}>
              <option value="">Associate Hazard…</option>
              {unlinkedHazards.map((h) => (
                <option key={h.hid} value={h.hid}>
                  {String(h.properties.Name ?? h.hid)}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={!addHaz}
              onClick={() => {
                setAddHaz("");
                void commitOps(
                  [
                    {
                      op: "createRelationship",
                      type: "HAS_HAZARD",
                      sourceHid: state.hid,
                      targetHid: addHaz,
                    },
                  ],
                  `Associated Hazard ${addHaz} with ${state.hid}.`,
                );
              }}
            >
              Add
            </button>
          </>
        )}
        <button
          className="icon-button"
          title="Create a new (:Hazard) linked to this State via [:HAS_HAZARD]"
          onClick={() =>
            requestOpenDrawer({
              mode: "create",
              label: "Hazard",
              linkFrom: { sourceHid: state.hid, type: "HAS_HAZARD" },
            })
          }
        >
          New Hazard…
        </button>
      </div>

      {sectionH("Countermeasures")}
      {applyingCms.length === 0 && (
        <p style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.74rem" }}>
          No [:APPLIES_TO_STATE] associations.
        </p>
      )}
      {applyingCms.map((cm) => (
        <div key={cm.hid} className="prop-row">
          <span className="mono" style={{ fontSize: "0.7rem" }} title={nameOf(cm.hid)}>
            {cm.hid} {nameOf(cm.hid)}
          </span>
          <button
            className="icon-button danger"
            onClick={() =>
              void commitOps(
                [
                  {
                    op: "deleteRelationship",
                    type: "APPLIES_TO_STATE",
                    sourceHid: cm.hid,
                    targetHid: state.hid,
                  },
                ],
                `Removed [:APPLIES_TO_STATE] ${cm.hid} → ${state.hid}.`,
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {otherCms.length > 0 && (
          <>
            <select className="sstpa-input" value={addCm} onChange={(e) => setAddCm(e.target.value)}>
              <option value="">Apply Countermeasure…</option>
              {otherCms.map((cm) => (
                <option key={cm.hid} value={cm.hid}>
                  {String(cm.properties.Name ?? cm.hid)}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={!addCm}
              onClick={() => {
                setAddCm("");
                void commitOps(
                  [
                    {
                      op: "createRelationship",
                      type: "APPLIES_TO_STATE",
                      sourceHid: addCm,
                      targetHid: state.hid,
                    },
                  ],
                  `Applied Countermeasure ${addCm} to ${state.hid}.`,
                );
              }}
            >
              Apply
            </button>
          </>
        )}
        <button
          className="icon-button"
          title="Create a new (:Countermeasure) applied to this State"
          onClick={() =>
            prompt.ask(
              "Name for the new (:Countermeasure)",
              (name) =>
                void commitOps(
                  [
                    {
                      op: "createNode",
                      tempId: "cm",
                      label: "Countermeasure",
                      properties: { Name: name },
                    },
                    {
                      op: "createRelationship",
                      type: "APPLIES_TO_STATE",
                      sourceHid: "$cm",
                      targetHid: state.hid,
                    },
                  ],
                  `Countermeasure "${name}" created and applied to ${state.hid}.`,
                ),
              { placeholder: "New Countermeasure" },
            )
          }
        >
          New Countermeasure…
        </button>
      </div>

      {sectionH("Requirements (via Countermeasure)")}
      {applyingCms.length === 0 ? (
        <p style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.74rem" }}>
          Requirements associate through a requirement-bearing node — apply a
          Countermeasure to this State first (§6.5.5.12).
        </p>
      ) : (
        <>
          {applyingCms.map((cm) =>
            (cm.relationships ?? [])
              .filter((r) => r.type === "HAS_REQUIREMENT")
              .map((r) => (
                <div key={`${cm.hid}-${r.targetHID}`} className="mono" style={{ fontSize: "0.7rem" }}>
                  {cm.hid} → {r.targetHID} {nameOf(r.targetHID)}
                </div>
              )),
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <select className="sstpa-input" value={reqCm} onChange={(e) => setReqCm(e.target.value)}>
              <option value="">On Countermeasure…</option>
              {applyingCms.map((cm) => (
                <option key={cm.hid} value={cm.hid}>
                  {String(cm.properties.Name ?? cm.hid)}
                </option>
              ))}
            </select>
            <select className="sstpa-input" value={addReq} onChange={(e) => setAddReq(e.target.value)}>
              <option value="">Existing Requirement…</option>
              {requirements.map((rq) => (
                <option key={rq.hid} value={rq.hid}>
                  {String(rq.properties.Name ?? rq.hid)}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={!reqCm || !addReq}
              onClick={() => {
                setAddReq("");
                void commitOps(
                  [
                    {
                      op: "createRelationship",
                      type: "HAS_REQUIREMENT",
                      sourceHid: reqCm,
                      targetHid: addReq,
                    },
                  ],
                  `Associated Requirement ${addReq} with ${reqCm}.`,
                );
              }}
            >
              Associate
            </button>
            <button
              className="icon-button"
              disabled={!reqCm}
              title="Create a new (:Requirement) borne by the selected Countermeasure"
              onClick={() =>
                requestOpenDrawer({
                  mode: "create",
                  label: "Requirement",
                  linkFrom: { sourceHid: reqCm, type: "HAS_REQUIREMENT" },
                })
              }
            >
              New Requirement…
            </button>
          </div>
        </>
      )}
      {prompt.element}
    </div>
  );
}

/** Transition Detail Panel (§6.5.5.9, §6.5.5.11): view and edit the
 *  [:TRANSITIONS_TO] relationship properties. Because the Backend deletes ALL
 *  [:TRANSITIONS_TO] edges between the pair, edit/removal stages the delete
 *  plus recreation of every surviving parallel transition in one commit. */
function TransitionDetailPanel({
  ctx,
  sel,
  byHid,
  onChanged,
}: {
  ctx: ToolLaunchContext;
  sel: TransitionSel;
  byHid: Map<string, SoINode>;
  onChanged: (msg?: Notice) => void;
}) {
  const [props, setProps] = useState<Record<string, unknown>>({ ...sel.props });
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const kind = String(props.TransitionKind ?? "FUNCTIONAL");

  const parallels = parallelTransitions(byHid.get(sel.sourceHid), sel.targetHid);

  const set = (k: string, v: unknown) => setProps((p) => ({ ...p, [k]: v }));

  const recreateOps = (edited: Record<string, unknown> | null) => {
    const ops: Parameters<typeof api.commit>[0]["operations"] = [
      {
        op: "deleteRelationship",
        type: "TRANSITIONS_TO",
        sourceHid: sel.sourceHid,
        targetHid: sel.targetHid,
      },
    ];
    parallels.forEach((p, i) => {
      const nextProps = i === sel.index ? edited : (p.props ?? {});
      if (nextProps === null) return; // removed transition
      ops.push({
        op: "createRelationship",
        type: "TRANSITIONS_TO",
        sourceHid: sel.sourceHid,
        targetHid: sel.targetHid,
        properties: nextProps,
      });
    });
    return ops;
  };

  const save = async () => {
    setError(null);
    if (
      (kind === "COUNTERMEASURE_REQUIRED" || kind === "BOTH") &&
      !props.RequiredByCountermeasureHID &&
      !props.RequiredByCountermeasureUUID
    ) {
      setError(
        "TransitionKind " + kind + " requires a governing Countermeasure HID (SRS §6.5.5.11).",
      );
      return;
    }
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.state",
        operations: recreateOps(props),
      });
      onChanged({
        kind: "success",
        text: `Transition ${sel.sourceHid} → ${sel.targetHid} committed.`,
      });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.state",
        operations: recreateOps(null),
      });
      onChanged({
        kind: "success",
        text: `Transition ${sel.sourceHid} → ${sel.targetHid} removed.`,
      });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const field = (name: string, label: string) => (
    <label style={{ display: "block", marginTop: 6 }}>
      {label}
      <input
        className="sstpa-input"
        value={props[name] == null ? "" : String(props[name])}
        onChange={(e) => set(name, e.target.value === "" ? null : e.target.value)}
      />
    </label>
  );

  return (
    <div style={{ padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      <div className="mono" style={{ fontSize: "0.7rem" }}>
        {sel.sourceHid} → {sel.targetHid}
        {parallels.length > 1 ? ` (edge ${sel.index + 1} of ${parallels.length})` : ""}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {String(byHid.get(sel.sourceHid)?.properties.Name ?? "")} →{" "}
        {String(byHid.get(sel.targetHid)?.properties.Name ?? "")}
      </div>
      {parallels.length > 1 && (
        <div className="sstpa-alert-warning" style={{ marginBottom: 6 }}>
          {parallels.length} parallel transitions exist between this State
          pair. Committing an edit or removal recreates every other parallel
          transition in the same transaction so none are lost. Prefer a single
          transition with TransitionKind = BOTH where applicable (§6.5.5.6).
        </div>
      )}
      {error && <div className="sstpa-alert-error">{error}</div>}
      <label style={{ display: "block" }}>
        Transition Kind
        <select
          className="sstpa-input"
          value={kind}
          onChange={(e) => set("TransitionKind", e.target.value)}
        >
          <option>FUNCTIONAL</option>
          <option>COUNTERMEASURE_REQUIRED</option>
          <option>BOTH</option>
        </select>
      </label>
      {field("Trigger", "Trigger")}
      {field("GuardCondition", "Guard Condition")}
      {field("Rationale", "Rationale")}
      {(kind === "COUNTERMEASURE_REQUIRED" || kind === "BOTH") &&
        field("RequiredByCountermeasureHID", "Required by Countermeasure (HID)")}
      {field("Priority", "Priority")}
      {field("ResidualRiskNote", "Residual Risk Note")}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="sstpa-button" onClick={() => void save()}>
          Commit
        </button>
        <button className="sstpa-button danger" onClick={() => setConfirmRemove(true)}>
          Remove
        </button>
      </div>
      {confirmRemove && (
        <ConfirmDialog
          title="Remove transition"
          danger
          confirmLabel="Remove"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmRemove(false)}
        >
          <p>
            Remove the [:TRANSITIONS_TO] relationship{" "}
            <span className="mono">
              {sel.sourceHid} → {sel.targetHid}
            </span>
            ?
          </p>
          {parallels.length > 1 && (
            <p>
              The other {parallels.length - 1} parallel transition(s) between
              this pair will be preserved by recreation in the same commit.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** New transition dialog (§6.5.5.11) — staged properties then one Commit. */
function NewTransitionDialog({
  ctx,
  source,
  target,
  countermeasures,
  onClose,
}: {
  ctx: ToolLaunchContext;
  source: string;
  target: string;
  countermeasures: SoINode[];
  onClose: (notice?: Notice) => void;
}) {
  const [kind, setKind] = useState("FUNCTIONAL");
  const [trigger, setTrigger] = useState("");
  const [guard, setGuard] = useState("");
  const [cmHid, setCmHid] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    if ((kind === "COUNTERMEASURE_REQUIRED" || kind === "BOTH") && !cmHid) {
      setError("Select the governing Countermeasure (SRS §6.5.5.11).");
      return;
    }
    const props: Record<string, unknown> = { TransitionKind: kind };
    if (trigger) props.Trigger = trigger;
    if (guard) props.GuardCondition = guard;
    if (cmHid) props.RequiredByCountermeasureHID = cmHid;
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.state",
        operations: [
          {
            op: "createRelationship",
            type: "TRANSITIONS_TO",
            sourceHid: source,
            targetHid: target,
            properties: props,
          },
        ],
      });
      onClose({ kind: "success", text: `Transition ${source} → ${target} created.` });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="sstpa-dialog-overlay" onClick={() => onClose()}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>
          New transition{" "}
          <span className="mono" style={{ fontSize: "0.8rem" }}>
            {source} → {target}
          </span>
        </h2>
        {error && <div className="sstpa-alert-error">{error}</div>}
        <label style={{ display: "block", fontSize: "0.82rem" }}>
          Transition Kind
          <select className="sstpa-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>FUNCTIONAL</option>
            <option>COUNTERMEASURE_REQUIRED</option>
            <option>BOTH</option>
          </select>
        </label>
        <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
          Trigger
          <input className="sstpa-input" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
        </label>
        <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
          Guard Condition
          <input className="sstpa-input" value={guard} onChange={(e) => setGuard(e.target.value)} />
        </label>
        {(kind === "COUNTERMEASURE_REQUIRED" || kind === "BOTH") && (
          <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
            Governing Countermeasure
            <select className="sstpa-input" value={cmHid} onChange={(e) => setCmHid(e.target.value)}>
              <option value="">Select…</option>
              {countermeasures.map((cm) => (
                <option key={cm.hid} value={cm.hid}>
                  {String(cm.properties.Name ?? cm.hid)} ({cm.hid})
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={() => onClose()}>
            Cancel
          </button>
          <button className="sstpa-button" onClick={() => void create()}>
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
