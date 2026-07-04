// The Requirements Tool (SRS §6.5.2): hierarchical tier visualization of
// (:Requirement) nodes with user-selectable parent/child depth, allocation
// view, orphan/barren analysis, SysML 2-style requirement blocks, creation
// via the Data Drawer from a selected bearer (§6.5.2.12), deletion with
// dependent listing (§6.5.2.13), [:PARENTS] and [:VERIFIED_BY] management
// (§6.5.2.1), editing via the Data Drawer, and PNG + SVG export (§6.5.2.16).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { SoINode, ValidateRelationshipResult } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer, useSession } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { errorText, exportPng, exportSvg, ToolStatus } from "../shared";

interface ReqRecord {
  hid: string;
  uuid: string;
  name: string;
  rStatement?: string;
  vMethod?: string;
  tier: number;
  soi: string;
  bearers: { hid: string; name: string; typeName: string }[];
  parents: string[];
  childCount: number;
  verificationCount: number;
  orphan: boolean;
  barren: boolean;
}

interface LineageNode {
  hid: string;
  name: string;
  rStatement?: string;
  tier: number;
  orphan: boolean;
  barren: boolean;
}

interface Lineage {
  focus: string;
  nodes: LineageNode[] | null;
  edges: { type: string; sourceHid: string; targetHid: string }[] | null;
  bearers?: { hid: string; name: string; typeName: string }[];
  verifications?: { hid: string; name: string }[];
}

interface Notice {
  kind: "success" | "error";
  text: string;
}

/** Valid [:HAS_REQUIREMENT] bearer types (§6.5.2.14, schema). */
const BEARER_TYPES = [
  "Project",
  "Purpose",
  "Connection",
  "Interface",
  "SystemFunction",
  "Component",
  "Constraint",
  "Countermeasure",
  "SecurityControl",
];

function tokenHeader(): Record<string, string> {
  const token = useSession.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function RequirementsTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  // Initialize per §6.5.2.3: Hierarchy view centered on the drawer node when
  // it is a Requirement; Allocation view otherwise.
  const drawerIsReq = ctx.drawerNodeHid?.startsWith("REQ_") ?? false;
  const [view, setView] = useState<"hierarchy" | "allocation">(
    drawerIsReq ? "hierarchy" : "allocation",
  );
  const [focusHid, setFocusHid] = useState<string | null>(
    drawerIsReq ? ctx.drawerNodeHid : null,
  );
  const [history, setHistory] = useState<string[]>([]);
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const soiIndex = ctx.soiHid ? ctx.soiHid.split("_")[1] : "";

  const soiReqs = useQuery({
    queryKey: ["requirements", soiIndex],
    queryFn: async () => {
      const res = await fetch(
        `${ctx.backendBaseUrl}/api/requirements/soi/${encodeURIComponent(soiIndex)}`,
        { headers: tokenHeader() },
      );
      if (!res.ok) throw new Error(`requirements query failed (${res.status})`);
      return (await res.json()) as { requirements: ReqRecord[] | null };
    },
    enabled: !!ctx.soiHid,
  });
  const records = useMemo(() => soiReqs.data?.requirements ?? [], [soiReqs.data]);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const soiNodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);

  // Memoized so the HierarchyView graph effect does not rebuild on every
  // parent render (fixes the onFocus-dependency churn).
  const focusHidRef = useRef(focusHid);
  focusHidRef.current = focusHid;
  const focusReq = useCallback((hid: string) => {
    const prev = focusHidRef.current;
    if (prev && prev !== hid) setHistory((h) => [...h, prev]);
    setFocusHid(hid);
    setView("hierarchy");
  }, []);
  // Revert to prior context on back arrow (§6.5.2.4).
  const goBack = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      setFocusHid(prev);
    } else {
      setView("allocation");
      setFocusHid(null);
    }
  };

  // The Allocation view (and creation) need a SoI; a drawer-focused
  // Requirement can still be explored in Hierarchy view without one.
  if (!ctx.soiHid && !focusHid) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus needsSoI />
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
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
          flexWrap: "wrap",
        }}
      >
        <button
          className="icon-button"
          title="Back to previous context"
          disabled={!focusHid && history.length === 0}
          onClick={goBack}
        >
          ←
        </button>
        <button
          className={`sstpa-button ${view === "allocation" ? "" : "secondary"}`}
          onClick={() => setView("allocation")}
        >
          Allocation View
        </button>
        <button
          className={`sstpa-button ${view === "hierarchy" ? "" : "secondary"}`}
          disabled={!focusHid}
          onClick={() => setView("hierarchy")}
        >
          Hierarchy View
        </button>
        <button
          className="icon-button"
          title="Create a new (:Requirement) allocated to a bearer node (§6.5.2.12)"
          disabled={!ctx.soiHid}
          onClick={() => setCreating(true)}
        >
          + New Requirement
        </button>
        {view === "hierarchy" && (
          <>
            <label style={{ fontSize: "0.76rem" }}>
              Up{" "}
              <input
                type="number"
                className="sstpa-input"
                style={{ width: 52, display: "inline-block" }}
                min={1}
                max={10}
                value={up}
                onChange={(e) => setUp(Math.max(1, +e.target.value || 1))}
              />
            </label>
            <label style={{ fontSize: "0.76rem" }}>
              Down{" "}
              <input
                type="number"
                className="sstpa-input"
                style={{ width: 52, display: "inline-block" }}
                min={1}
                max={10}
                value={down}
                onChange={(e) => setDown(Math.max(1, +e.target.value || 1))}
              />
            </label>
          </>
        )}
      </div>
      {notice && (
        <div
          className={notice.kind === "success" ? "sstpa-alert-success" : "sstpa-alert-error"}
          style={{ margin: "6px 12px" }}
        >
          {notice.text}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      {view === "allocation" ? (
        !ctx.soiHid ? (
          <ToolStatus needsSoI />
        ) : soiReqs.isLoading ? (
          <ToolStatus loading />
        ) : soiReqs.isError ? (
          <ToolStatus error={soiReqs.error} onRetry={() => void soiReqs.refetch()} />
        ) : (
          <AllocationView
            ctx={ctx}
            records={records}
            onFocus={focusReq}
            onNotice={setNotice}
          />
        )
      ) : (
        <HierarchyView
          ctx={ctx}
          focusHid={focusHid!}
          up={up}
          down={down}
          records={records}
          soiNodes={soiNodes}
          onFocus={focusReq}
          onNotice={setNotice}
        />
      )}
      {creating && (
        <NewRequirementDialog
          soiNodes={soiNodes}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/** New Requirement (§6.5.2.12): pick the bearer node, then stage the node and
 *  its [:HAS_REQUIREMENT] allocation in the Data Drawer for Commit. */
function NewRequirementDialog({
  soiNodes,
  onClose,
}: {
  soiNodes: SoINode[];
  onClose: () => void;
}) {
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const [bearer, setBearer] = useState("");
  const candidates = soiNodes.filter((n) => BEARER_TYPES.includes(n.typeName));

  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Requirement</h2>
        <p style={{ fontSize: "0.82rem" }}>
          Creation requires an associated bearer node with a
          [:HAS_REQUIREMENT] relationship (§6.5.2.12). Properties are staged in
          the Data Drawer and persisted on Commit.
        </p>
        <select
          className="sstpa-input"
          value={bearer}
          onChange={(e) => setBearer(e.target.value)}
        >
          <option value="">Select bearer node…</option>
          {candidates.map((c) => (
            <option key={c.hid} value={c.hid}>
              {c.typeName}: {String(c.properties.Name ?? c.hid)} ({c.hid})
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="sstpa-button"
            disabled={!bearer}
            onClick={() => {
              requestOpenDrawer({
                mode: "create",
                label: "Requirement",
                linkFrom: { sourceHid: bearer, type: "HAS_REQUIREMENT" },
              });
              onClose();
            }}
          >
            Open in Data Drawer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Deletion confirmation (§6.5.2.13): Alert/Confirm pattern listing dependent
 *  relationships and warning of nodes that would be orphaned. */
function DeleteRequirementDialog({
  ctx,
  target,
  records,
  onClose,
}: {
  ctx: ToolLaunchContext;
  target: { hid: string; name: string };
  records: ReqRecord[];
  onClose: (notice?: Notice) => void;
}) {
  const rec = records.find((r) => r.hid === target.hid);
  const children = records.filter((r) => r.parents.includes(target.hid));
  const orphaned = children.filter((c) => c.parents.length === 1);
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.requirements",
        operations: [{ op: "deleteNode", hid: target.hid }],
      });
      onClose({ kind: "success", text: `Requirement ${target.hid} deleted.` });
    } catch (e) {
      onClose({ kind: "error", text: errorText(e) });
    }
  };

  return (
    <ConfirmDialog
      title={`Delete ${target.hid}?`}
      danger
      confirmLabel={busy ? "Deleting…" : "Delete"}
      confirmDisabled={busy}
      onConfirm={() => void doDelete()}
      onCancel={() => onClose()}
    >
      <p>
        <strong>{target.name}</strong> and all of its relationships will be
        removed. Dependent relationships (§6.5.2.13):
      </p>
      <ul style={{ paddingLeft: 18 }}>
        <li>
          Children via [:PARENTS]: {children.length}
          {children.length > 0 && (
            <span className="mono" style={{ fontSize: "0.72rem" }}>
              {" "}
              ({children.map((c) => c.hid).join(", ")})
            </span>
          )}
        </li>
        <li>Verifications via [:VERIFIED_BY]: {rec?.verificationCount ?? "unknown"}</li>
        <li>
          Allocations via [:HAS_REQUIREMENT]:{" "}
          {rec ? rec.bearers.map((b) => `${b.typeName} ${b.hid}`).join(", ") || "none" : "unknown"}
        </li>
      </ul>
      {orphaned.length > 0 && (
        <div className="sstpa-alert-warning">
          {orphaned.length} child requirement(s) have no other parent and will
          become orphans: {orphaned.map((c) => c.hid).join(", ")}
        </div>
      )}
      <p style={{ fontSize: "0.76rem", color: "var(--sstpa-muted)" }}>
        Cross-SoI dependents are not listed here; deletion does not cascade
        outside the current SoI (§6.5.2.13).
      </p>
    </ConfirmDialog>
  );
}

/** Allocation View (§6.5.2.3/§6.5.2.14): requirements with bearers,
 *  orphan/barren flags, allocation, deletion, and hierarchy navigation. */
function AllocationView({
  ctx,
  records,
  onFocus,
  onNotice,
}: {
  ctx: ToolLaunchContext;
  records: ReqRecord[];
  onFocus: (hid: string) => void;
  onNotice: (n: Notice) => void;
}) {
  const openDrawer = useDrawer((s) => s.requestOpenDrawer);
  const qc = useQueryClient();
  const [associating, setAssociating] = useState<ReqRecord | null>(null);
  const [deleting, setDeleting] = useState<ReqRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orphans = records.filter((r) => r.orphan).length;
  const barrens = records.filter((r) => r.barren).length;

  if (records.length === 0) {
    return (
      <ToolStatus
        empty="No requirements in this SoI yet."
        emptyHint="Use “+ New Requirement” to create the first one (§6.5.2.12)."
      />
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {(orphans > 0 || barrens > 0) && (
        <div className="sstpa-alert-warning" style={{ marginBottom: 10 }}>
          {orphans} orphan / {barrens} barren requirement(s) in this SoI —
          allocate, parent, verify, or remove them (§6.5.2.1).
        </div>
      )}
      {error && <div className="sstpa-alert-error">{error}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 8px" }}>HID</th>
            <th>Name</th>
            <th>Statement</th>
            <th>Tier</th>
            <th>Allocated to</th>
            <th>Flags</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
              <td className="mono" style={{ padding: "4px 8px", fontSize: "0.7rem" }}>
                {r.hid}
              </td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td
                style={{
                  maxWidth: 340,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={r.rStatement ?? ""}
              >
                {r.rStatement ?? ""}
              </td>
              <td>{r.tier}</td>
              <td style={{ fontSize: "0.72rem" }}>
                {r.bearers.map((b) => `${b.typeName}: ${b.name}`).join(", ") || "—"}
              </td>
              <td>
                {r.orphan && <span className="state-warn">orphan </span>}
                {r.barren && <span className="state-error">barren</span>}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="icon-button" title="Hierarchy view" onClick={() => onFocus(r.hid)}>
                  ⌘
                </button>
                <button
                  className="icon-button"
                  title="Edit in Data Drawer"
                  onClick={() => openDrawer({ mode: "edit", hid: r.hid })}
                >
                  ✎
                </button>
                <button
                  className="icon-button"
                  title="Allocate to a node"
                  onClick={() => setAssociating(r)}
                >
                  ⇄
                </button>
                <button
                  className="icon-button danger"
                  title="Delete requirement (§6.5.2.13)"
                  onClick={() => setDeleting(r)}
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {associating && (
        <AllocateDialog
          ctx={ctx}
          req={associating}
          onClose={(err) => {
            setAssociating(null);
            if (err) setError(err);
            void qc.invalidateQueries({ queryKey: ["requirements"] });
            void qc.invalidateQueries({ queryKey: ["soi"] });
          }}
        />
      )}
      {deleting && (
        <DeleteRequirementDialog
          ctx={ctx}
          target={{ hid: deleting.hid, name: deleting.name }}
          records={records}
          onClose={(n) => {
            setDeleting(null);
            if (n) onNotice(n);
            void qc.invalidateQueries({ queryKey: ["requirements"] });
            void qc.invalidateQueries({ queryKey: ["soi"] });
          }}
        />
      )}
    </div>
  );
}

/** Allocate a requirement to a bearer node via [:HAS_REQUIREMENT], validated
 *  by the Backend (§6.5.2.14). */
function AllocateDialog({
  ctx,
  req,
  onClose,
}: {
  ctx: ToolLaunchContext;
  req: ReqRecord;
  onClose: (error?: string) => void;
}) {
  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const candidates = (soi.data?.nodes ?? []).filter((n) =>
    BEARER_TYPES.includes(n.typeName),
  );
  const [target, setTarget] = useState("");

  const commit = async () => {
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.requirements",
        operations: [
          {
            op: "createRelationship",
            type: "HAS_REQUIREMENT",
            sourceHid: target,
            targetHid: req.hid,
          },
        ],
      });
      onClose();
    } catch (e) {
      onClose(errorText(e));
    }
  };

  return (
    <div className="sstpa-dialog-overlay" onClick={() => onClose()}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Allocate {req.hid}</h2>
        <select className="sstpa-input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select bearer node…</option>
          {candidates.map((c) => (
            <option key={c.hid} value={c.hid}>
              {c.typeName}: {String(c.properties.Name ?? c.hid)} ({c.hid})
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={() => onClose()}>
            Cancel
          </button>
          <button className="sstpa-button" disabled={!target} onClick={() => void commit()}>
            Allocate
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hierarchy View (§6.5.2.6–§6.5.2.10): SysML 2-style requirement blocks,
 *  tiered layout, parent/child depth controls, selection detail panel with
 *  parentage and verification management, double-click recentering, and
 *  PNG + SVG export (viewport or full, §6.5.2.16). */
function HierarchyView({
  ctx,
  focusHid,
  up,
  down,
  records,
  soiNodes,
  onFocus,
  onNotice,
}: {
  ctx: ToolLaunchContext;
  focusHid: string;
  up: number;
  down: number;
  records: ReqRecord[];
  soiNodes: SoINode[];
  onFocus: (hid: string) => void;
  onNotice: (n: Notice) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const qc = useQueryClient();

  const lineage = useQuery({
    queryKey: ["req-lineage", focusHid, up, down],
    queryFn: async () => {
      const res = await fetch(
        `${ctx.backendBaseUrl}/api/requirements/lineage/${encodeURIComponent(focusHid)}?up=${up}&down=${down}`,
        { headers: tokenHeader() },
      );
      if (!res.ok) throw new Error(`lineage query failed (${res.status})`);
      return (await res.json()) as Lineage;
    },
  });

  const elements = useMemo(() => {
    if (!lineage.data) return [] as cytoscape.ElementDefinition[];
    const els: cytoscape.ElementDefinition[] = [];
    for (const n of lineage.data.nodes ?? []) {
      const stmt = (n.rStatement ?? "").slice(0, 90);
      els.push({
        data: {
          id: n.hid,
          label: `«requirement»\n${n.hid} · Tier ${n.tier}\n${n.name}\n${stmt}`,
          focus: n.hid === lineage.data!.focus,
          problem: n.orphan || n.barren,
        },
      });
    }
    for (const e of lineage.data.edges ?? []) {
      els.push({
        data: {
          id: `${e.sourceHid}->${e.targetHid}`,
          source: e.sourceHid,
          target: e.targetHid,
        },
      });
    }
    for (const b of lineage.data.bearers ?? []) {
      els.push({ data: { id: b.hid, label: `${b.typeName}\n${b.name}`, bearer: true } });
      els.push({
        data: {
          id: `${b.hid}=>${lineage.data.focus}`,
          source: b.hid,
          target: lineage.data.focus,
          label: "HAS_REQUIREMENT",
          assoc: true,
        },
      });
    }
    return els;
  }, [lineage.data]);

  // Callback/data refs keep the graph effect's dependency list to [elements]
  // so parent re-renders do not rebuild and re-layout the diagram.
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const lineageNodesRef = useRef<LineageNode[]>([]);
  lineageNodesRef.current = lineage.data?.nodes ?? [];

  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            shape: "rectangle",
            "background-color": "#fcfaf2",
            "border-width": 1.5,
            "border-color": "#1b2a4a",
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "180px",
            "text-valign": "center",
            "font-size": 8,
            "font-family": "JetBrains Mono, monospace",
            width: 200,
            height: 74,
            color: "#1b2a4a",
          },
        },
        { selector: "node[?focus]", style: { "border-width": 3, "border-color": "#a8853a" } },
        {
          selector: "node[?problem]",
          style: { "border-color": "#8c2f2f", "border-style": "dashed" },
        },
        {
          selector: "node[?bearer]",
          style: {
            shape: "round-rectangle",
            "background-color": "#eef2ee",
            "border-color": "#4a7a6f",
            width: 140,
            height: 44,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": "#1b2a4a",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#1b2a4a",
            "curve-style": "bezier",
          },
        },
        {
          selector: "edge[?assoc]",
          style: {
            "line-color": "#4a7a6f",
            "target-arrow-color": "#4a7a6f",
            "line-style": "dashed",
            label: "data(label)",
            "font-size": 7,
            "text-rotation": "autorotate",
            color: "#4a7a6f",
          },
        },
      ],
      layout: { name: "breadthfirst", directed: true, spacingFactor: 1.15, animate: false },
    });
    cy.on("select", "node", (ev) => {
      const hid = ev.target.id();
      setSelected(lineageNodesRef.current.find((n) => n.hid === hid) ?? null);
    });
    cy.on("dbltap", "node", (ev) => {
      const hid = ev.target.id();
      if (hid.startsWith("REQ_")) onFocusRef.current(hid);
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  const doExport = (full: boolean, asSvg: boolean) => {
    const cy = cyRef.current;
    if (!cy) return;
    const name = `sstpa-requirements-${focusHid}`;
    if (asSvg) exportSvg(cy, name, full);
    else exportPng(cy, name, full);
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["req-lineage"] });
    void qc.invalidateQueries({ queryKey: ["requirements"] });
    void qc.invalidateQueries({ queryKey: ["soi"] });
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0, background: "var(--sstpa-canvas)" }}
        />
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
          <button className="icon-button" onClick={() => doExport(false, false)} title="Export current viewport">
            PNG (view)
          </button>
          <button className="icon-button" onClick={() => doExport(true, false)} title="Export full diagram">
            PNG (full)
          </button>
          <button className="icon-button" onClick={() => doExport(false, true)} title="Export current viewport as SVG">
            SVG (view)
          </button>
          <button className="icon-button" onClick={() => doExport(true, true)} title="Export full diagram as SVG">
            SVG (full)
          </button>
        </div>
        {(lineage.isLoading || lineage.isError) && (
          <ToolStatus
            loading={lineage.isLoading}
            error={lineage.isError ? lineage.error : undefined}
            onRetry={() => void lineage.refetch()}
          />
        )}
      </div>
      {selected && (
        <RequirementDetailPanel
          key={selected.hid}
          ctx={ctx}
          selected={selected}
          lineage={lineage.data ?? null}
          records={records}
          soiNodes={soiNodes}
          onChanged={refresh}
          onNotice={onNotice}
          onDeleted={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Requirement Detail Panel (§6.5.2.10): properties plus [:PARENTS] and
 *  [:VERIFIED_BY] management (§6.5.2.1) with Backend validation (§6.5.2.14). */
function RequirementDetailPanel({
  ctx,
  selected,
  lineage,
  records,
  soiNodes,
  onChanged,
  onNotice,
  onDeleted,
}: {
  ctx: ToolLaunchContext;
  selected: LineageNode;
  lineage: Lineage | null;
  records: ReqRecord[];
  soiNodes: SoINode[];
  onChanged: () => void;
  onNotice: (n: Notice) => void;
  onDeleted: () => void;
}) {
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addParent, setAddParent] = useState("");
  const [validation, setValidation] = useState<ValidateRelationshipResult | null>(null);
  const [addVer, setAddVer] = useState("");

  const parents = (lineage?.edges ?? [])
    .filter((e) => e.type === "PARENTS" && e.targetHid === selected.hid)
    .map((e) => e.sourceHid);

  // Descendants within the SoI (records carry graph-wide parent HIDs), used
  // to mute cycle-forming parent candidates (§6.5.2.14 invalid targets).
  const descendants = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    for (const r of records) {
      for (const p of r.parents) {
        childrenOf.set(p, [...(childrenOf.get(p) ?? []), r.hid]);
      }
    }
    const out = new Set<string>();
    const queue = [selected.hid];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const c of childrenOf.get(cur) ?? []) {
        if (!out.has(c)) {
          out.add(c);
          queue.push(c);
        }
      }
    }
    return out;
  }, [records, selected.hid]);

  const parentCandidates = records.filter(
    (r) => r.hid !== selected.hid && !parents.includes(r.hid),
  );

  const verifications = lineage?.focus === selected.hid ? (lineage?.verifications ?? []) : null;
  const verNodes = soiNodes.filter((n) => n.typeName === "Verification");

  const commitOps = async (
    ops: Parameters<typeof api.commit>[0]["operations"],
    success: string,
  ) => {
    setError(null);
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.requirements",
        operations: ops,
      });
      onNotice({ kind: "success", text: success });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const chooseParent = async (hid: string) => {
    setAddParent(hid);
    setValidation(null);
    if (!hid) return;
    try {
      // Backend validation before Commit (§6.5.2.14).
      setValidation(
        await api.validateRelationship({
          type: "PARENTS",
          sourceHid: hid,
          targetHid: selected.hid,
        }),
      );
    } catch (e) {
      setValidation({ valid: false, reason: errorText(e) });
    }
  };

  return (
    <div
      style={{
        width: 290,
        borderLeft: "var(--sstpa-border)",
        padding: "var(--sstpa-sp-3)",
        overflow: "auto",
        background: "var(--sstpa-surface)",
        fontSize: "0.8rem",
      }}
    >
      <div className="mono" style={{ fontSize: "0.7rem" }}>
        {selected.hid}
      </div>
      <div style={{ fontWeight: 700, margin: "4px 0" }}>{selected.name}</div>
      <p>{selected.rStatement ?? "(no statement)"}</p>
      <p>
        Tier {selected.tier}
        {selected.orphan && <span className="state-warn"> · orphan</span>}
        {selected.barren && <span className="state-error"> · barren</span>}
      </p>
      {error && <div className="sstpa-alert-error">{error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          className="sstpa-button"
          onClick={() => requestOpenDrawer({ mode: "edit", hid: selected.hid })}
        >
          Edit in Data Drawer
        </button>
        <button className="sstpa-button danger" onClick={() => setDeleting(true)}>
          Delete…
        </button>
      </div>

      <h4 style={{ margin: "12px 0 4px" }}>Parents [:PARENTS]</h4>
      {parents.length === 0 && (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.74rem" }}>
          No parents within the loaded lineage window.
        </p>
      )}
      {parents.map((p) => (
        <div key={p} className="prop-row">
          <span className="mono" style={{ fontSize: "0.7rem" }}>
            {p}
          </span>
          <button
            className="icon-button danger"
            onClick={() =>
              void commitOps(
                [
                  {
                    op: "deleteRelationship",
                    type: "PARENTS",
                    sourceHid: p,
                    targetHid: selected.hid,
                  },
                ],
                `Removed parent ${p} from ${selected.hid}.`,
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <select
          className="sstpa-input"
          value={addParent}
          onChange={(e) => void chooseParent(e.target.value)}
        >
          <option value="">Add parent…</option>
          {parentCandidates.map((r) => (
            <option key={r.hid} value={r.hid} disabled={descendants.has(r.hid)}>
              {r.hid} {r.name}
              {descendants.has(r.hid) ? " (descendant — invalid)" : ""}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          disabled={!addParent || !validation?.valid}
          onClick={() => {
            const p = addParent;
            setAddParent("");
            setValidation(null);
            void commitOps(
              [
                {
                  op: "createRelationship",
                  type: "PARENTS",
                  sourceHid: p,
                  targetHid: selected.hid,
                },
              ],
              `Added parent ${p} to ${selected.hid}.`,
            );
          }}
        >
          Add
        </button>
      </div>
      {validation && !validation.valid && (
        <div className="sstpa-alert-warning" style={{ marginTop: 4 }}>
          Invalid parent: {validation.reason ?? "rejected by Backend validation"}
        </div>
      )}

      <h4 style={{ margin: "12px 0 4px" }}>Verifications [:VERIFIED_BY]</h4>
      {verifications === null ? (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.74rem" }}>
          Double-click this requirement to focus it and list its
          verifications.
        </p>
      ) : verifications.length === 0 ? (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.74rem" }}>
          No verifications.
        </p>
      ) : (
        verifications.map((v) => (
          <div key={v.hid} className="prop-row">
            <span className="mono" style={{ fontSize: "0.7rem" }} title={v.name}>
              {v.hid} {v.name}
            </span>
            <button
              className="icon-button danger"
              onClick={() =>
                void commitOps(
                  [
                    {
                      op: "deleteRelationship",
                      type: "VERIFIED_BY",
                      sourceHid: selected.hid,
                      targetHid: v.hid,
                    },
                  ],
                  `Removed verification ${v.hid} from ${selected.hid}.`,
                )
              }
            >
              Remove
            </button>
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {verNodes.length > 0 && (
          <>
            <select className="sstpa-input" value={addVer} onChange={(e) => setAddVer(e.target.value)}>
              <option value="">Associate Verification…</option>
              {verNodes.map((v) => (
                <option key={v.hid} value={v.hid}>
                  {String(v.properties.Name ?? v.hid)}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={!addVer}
              onClick={() => {
                const v = addVer;
                setAddVer("");
                void commitOps(
                  [
                    {
                      op: "createRelationship",
                      type: "VERIFIED_BY",
                      sourceHid: selected.hid,
                      targetHid: v,
                    },
                  ],
                  `Associated verification ${v} with ${selected.hid}.`,
                );
              }}
            >
              Add
            </button>
          </>
        )}
        <button
          className="icon-button"
          title="Create a new (:Verification) linked via [:VERIFIED_BY]"
          onClick={() =>
            requestOpenDrawer({
              mode: "create",
              label: "Verification",
              linkFrom: { sourceHid: selected.hid, type: "VERIFIED_BY" },
            })
          }
        >
          New Verification…
        </button>
      </div>

      {deleting && (
        <DeleteRequirementDialog
          ctx={ctx}
          target={{ hid: selected.hid, name: selected.name }}
          records={records}
          onClose={(n) => {
            setDeleting(false);
            if (n) onNotice(n);
            if (n?.kind === "success") onDeleted();
          }}
        />
      )}
    </div>
  );
}
