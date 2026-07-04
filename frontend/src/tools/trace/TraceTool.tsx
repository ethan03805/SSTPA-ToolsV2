// Trace Tool (SRS §6.5.9): Asset Trace Analysis matrix — States as columns,
// Interfaces/Functions/Elements as rows; each cell assigns [:HOLDS]/
// [:TRANSPORTS]/[:USES] between the entity and the selected Asset in that
// State's context. Staged cells commit as one ACID transaction; the Backend
// executes supersession, inheritance, Connection inheritance, protection
// Requirement generation, and orphan detection (§6.5.9.6 phases 1–6).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type RelType = "HOLDS" | "TRANSPORTS" | "USES";
const CYCLE: (RelType | null)[] = [null, "HOLDS", "TRANSPORTS", "USES"];
const REL_STYLE: Record<RelType, { label: string; color: string }> = {
  HOLDS: { label: "H", color: "#33567e" },
  TRANSPORTS: { label: "T", color: "#4a7a6f" },
  USES: { label: "U", color: "#a8853a" },
};
const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;

interface CellState {
  current?: { type: RelType; status: string; version: number; date?: string };
  staged?: RelType | null; // null = staged clear; undefined = untouched
}

type Mode = "entry" | "validation" | "criticality";

export default function TraceTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const drawerPrefix = ctx.drawerNodeHid?.split("_")[0] ?? "";
  const [assetHid, setAssetHid] = useState<string | null>(
    drawerPrefix === "AST" ? ctx.drawerNodeHid : null,
  );
  const highlightEntity = ["INT", "FUN", "EL"].includes(drawerPrefix) ? ctx.drawerNodeHid : null;
  const highlightState = drawerPrefix === "ST" ? ctx.drawerNodeHid : null;
  const [mode, setMode] = useState<Mode>("entry");
  const [staged, setStaged] = useState<Map<string, RelType | null>>(new Map());
  const [selectedCell, setSelectedCell] = useState<{ entity: string; state: string } | null>(null);
  const [rowFilter, setRowFilter] = useState<"all" | "assigned" | "unassigned" | "invalidated">("all");
  const [showReadiness, setShowReadiness] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const openTool = useToolWindows((s) => s.openTool);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);

  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");
  const states = nodes.filter((n) => n.typeName === "State");
  const entities = useMemo(
    () =>
      [
        ...nodes.filter((n) => n.typeName === "Interface"),
        ...nodes.filter((n) => n.typeName === "SystemFunction"),
        ...nodes.filter((n) => n.typeName === "Component"),
      ],
    [nodes],
  );
  const asset = assetHid ? byHid.get(assetHid) : undefined;

  // Cell map: entityHid|stateHid → CellState (from current graph + staging).
  const cells = useMemo(() => {
    const m = new Map<string, CellState>();
    if (!assetHid) return m;
    for (const e of entities) {
      for (const rel of e.relationships ?? []) {
        if (!["HOLDS", "TRANSPORTS", "USES"].includes(rel.type)) continue;
        if (rel.targetHID !== assetHid) continue;
        const stateHid = String(rel.props?.TraceStateHID ?? "");
        const status = String(rel.props?.TraceStatus ?? "CURRENT");
        const key = `${e.hid}|${stateHid}`;
        const existing = m.get(key);
        // Prefer CURRENT over superseded history for display.
        if (!existing || (existing.current?.status !== "CURRENT" && status === "CURRENT")) {
          m.set(key, {
            current: {
              type: rel.type as RelType,
              status,
              version: Number(rel.props?.TraceVersion ?? 1),
              date: rel.props?.TraceDate ? String(rel.props.TraceDate) : undefined,
            },
          });
        }
      }
    }
    for (const [key, val] of staged) {
      m.set(key, { ...(m.get(key) ?? {}), staged: val });
    }
    return m;
  }, [entities, assetHid, staged]);

  const effectiveType = (key: string): RelType | null => {
    const c = cells.get(key);
    if (!c) return null;
    if (c.staged !== undefined) return c.staged;
    if (c.current?.status === "CURRENT") return c.current.type;
    return null;
  };

  const cycleCell = (entityHid: string, stateHid: string) => {
    const key = `${entityHid}|${stateHid}`;
    const cur = effectiveType(key);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setCell(entityHid, stateHid, next);
  };

  const setCell = (entityHid: string, stateHid: string, next: RelType | null) => {
    const key = `${entityHid}|${stateHid}`;
    const c = cells.get(key);
    const persisted = c?.current?.status === "CURRENT" ? c.current.type : null;
    setStaged((prev) => {
      const m = new Map(prev);
      if (next === persisted) {
        m.delete(key); // back to persisted value — nothing staged
      } else {
        m.set(key, next);
      }
      return m;
    });
    setSelectedCell({ entity: entityHid, state: stateHid });
  };

  const commit = useMutation({
    mutationFn: () => {
      const ops: CommitOperation[] = [];
      for (const [key, next] of staged) {
        const [entityHid, stateHid] = key.split("|");
        const c = cells.get(key);
        const persisted = c?.current?.status === "CURRENT" ? c.current.type : null;
        if (next === null && persisted) {
          // Cleared cell → supersede (Phase 1), scoped by TraceStateHID.
          ops.push({
            op: "deleteRelationship",
            type: persisted,
            sourceHid: entityHid,
            targetHid: assetHid!,
            properties: { TraceStateHID: stateHid },
          });
        } else if (next) {
          ops.push({
            op: "createRelationship",
            type: next,
            sourceHid: entityHid,
            targetHid: assetHid!,
            properties: { TraceStateHID: stateHid },
          });
        }
      }
      return api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.trace",
        operations: ops,
      });
    },
    onSuccess: (res) => {
      setStaged(new Map());
      setNotice(
        `Trace commit ${res.commitId.slice(0, 8)}: ${res.relationshipsChanged} relationship(s); inheritance and protection Requirements recomputed (§6.5.9.6).`,
      );
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  // Loss Tool readiness per entity (§6.5.9.2).
  const readiness = (e: SoINode): "Ready" | "Partial" | "Not Traced" => {
    let hasCurrent = false;
    let hasStale = false;
    for (const rel of e.relationships ?? []) {
      if (!["HOLDS", "TRANSPORTS", "USES"].includes(rel.type)) continue;
      if (rel.targetHID !== assetHid) continue;
      const st = String(rel.props?.TraceStatus ?? "CURRENT");
      if (st === "CURRENT") hasCurrent = true;
      else hasStale = true;
    }
    if (hasCurrent && !hasStale) return "Ready";
    if (hasCurrent || hasStale) return "Partial";
    return "Not Traced";
  };

  const visibleEntities = entities.filter((e) => {
    if (rowFilter === "all") return true;
    const r = readiness(e);
    if (rowFilter === "assigned") return r !== "Not Traced";
    if (rowFilter === "unassigned") return r === "Not Traced";
    return r === "Partial";
  });

  const sessionStatus = (() => {
    let any = false;
    let invalid = false;
    for (const e of entities) {
      for (const rel of e.relationships ?? []) {
        if (!["HOLDS", "TRANSPORTS", "USES"].includes(rel.type) || rel.targetHID !== assetHid) continue;
        any = true;
        if (rel.props?.TraceStatus === "INVALIDATED") invalid = true;
      }
    }
    if (invalid) return "CONTAINS INVALIDATIONS";
    if (any) return "PRIOR TRACE EXISTS";
    return "NEW SESSION";
  })();

  if (!ctx.soiHid) return <p style={{ padding: 20 }}>Select a System of Interest first.</p>;
  if (assets.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <p>No (:Asset) nodes in this SoI yet.</p>
        <button className="sstpa-button" onClick={() => openTool("sstpa.assets")}>
          Open Asset Manager Tool
        </button>
      </div>
    );
  }

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      {/* Top bar (§6.5.9.2) */}
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
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={assetHid ?? ""}
          onChange={(e) => {
            setAssetHid(e.target.value || null);
            setStaged(new Map());
          }}
        >
          <option value="">Select Asset to trace…</option>
          {assets.map((a) => (
            <option key={a.hid} value={a.hid}>
              {a.hid} — {String(a.properties.Name ?? "")}
            </option>
          ))}
        </select>
        {assetHid && (
          <>
            <span
              className="type-badge"
              style={{
                background:
                  sessionStatus === "CONTAINS INVALIDATIONS"
                    ? "var(--sstpa-status-error)"
                    : sessionStatus === "PRIOR TRACE EXISTS"
                      ? "var(--sstpa-status-info)"
                      : "var(--sstpa-node-muted)",
              }}
            >
              {sessionStatus}
            </span>
            {(["entry", "validation", "criticality"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`sstpa-button ${mode === m ? "" : "secondary"}`}
                onClick={() => setMode(m)}
              >
                {m === "entry" ? "Trace Entry" : m === "validation" ? "Validation" : "Criticality Review"}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: "0.74rem" }}>
              <input type="checkbox" checked={showReadiness} onChange={(e) => setShowReadiness(e.target.checked)} />{" "}
              Loss Tool Readiness
            </label>
            <select className="sstpa-input" style={{ width: "auto" }} value={rowFilter} onChange={(e) => setRowFilter(e.target.value as typeof rowFilter)}>
              <option value="all">All entities</option>
              <option value="assigned">Only assigned</option>
              <option value="unassigned">Only unassigned</option>
              <option value="invalidated">Only partial/invalidated</option>
            </select>
            <button
              className="sstpa-button"
              disabled={staged.size === 0 || commit.isPending}
              onClick={() => commit.mutate()}
            >
              Commit ({staged.size})
            </button>
            <button className="sstpa-button secondary" disabled={staged.size === 0} onClick={() => setStaged(new Map())}>
              Revert
            </button>
            <button
              className="icon-button"
              title="Export trace matrix CSV (§6.5.9.12)"
              onClick={() => {
                const header = ["Entity", "Type", ...states.map((s) => s.hid), "Readiness"];
                const rows = entities.map((e) => [
                  e.hid,
                  e.typeName,
                  ...states.map((s) => effectiveType(`${e.hid}|${s.hid}`) ?? ""),
                  readiness(e),
                ]);
                const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                a.download = `sstpa-trace-${assetHid}.csv`;
                a.click();
              }}
            >
              CSV
            </button>
          </>
        )}
      </div>

      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      {assetHid && mode === "entry" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.74rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--sstpa-navy)", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px", position: "sticky", left: 0, background: "var(--sstpa-ivory)" }}>
                    Entity \ State
                  </th>
                  {states.map((s) => (
                    <th
                      key={s.hid}
                      style={{
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: highlightState === s.hid ? "var(--sstpa-ivory-sunken)" : undefined,
                      }}
                      title={`${s.hid} — click to open in Data Drawer`}
                      onClick={() => !drawerOpen && openDrawer({ mode: "edit", hid: s.hid })}
                    >
                      <span className="mono" style={{ fontSize: "0.62rem", display: "block" }}>
                        {s.hid}
                      </span>
                      {String(s.properties.Name ?? "")}
                    </th>
                  ))}
                  {showReadiness && <th style={{ padding: "4px 8px" }}>Loss Readiness</th>}
                </tr>
              </thead>
              <tbody>
                {["Interface", "SystemFunction", "Component"].map((type) => {
                  const group = visibleEntities.filter((e) => e.typeName === type);
                  if (group.length === 0) return null;
                  return [
                    <tr key={`hdr-${type}`}>
                      <td
                        colSpan={states.length + (showReadiness ? 2 : 1)}
                        style={{
                          fontFamily: "var(--sstpa-font-brand)",
                          fontWeight: 600,
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--sstpa-line)",
                          position: "sticky",
                          left: 0,
                        }}
                      >
                        {type === "Component" ? "Elements" : type === "SystemFunction" ? "Functions" : "Interfaces"}
                      </td>
                    </tr>,
                    ...group.map((e) => {
                      const r = readiness(e);
                      return (
                        <tr
                          key={e.hid}
                          style={{
                            borderBottom: "1px solid var(--sstpa-line-soft)",
                            background: highlightEntity === e.hid ? "var(--sstpa-ivory-sunken)" : undefined,
                          }}
                        >
                          <td
                            style={{
                              padding: "3px 8px",
                              cursor: "pointer",
                              position: "sticky",
                              left: 0,
                              background: "var(--sstpa-ivory-raised)",
                              whiteSpace: "nowrap",
                            }}
                            title="Open in Data Drawer"
                            onClick={() => !drawerOpen && openDrawer({ mode: "edit", hid: e.hid })}
                          >
                            <span className="mono" style={{ fontSize: "0.62rem" }}>
                              {e.hid}
                            </span>{" "}
                            {String(e.properties.Name ?? "")}
                          </td>
                          {states.map((s) => {
                            const key = `${e.hid}|${s.hid}`;
                            const c = cells.get(key);
                            const eff = effectiveType(key);
                            const isStaged = c?.staged !== undefined;
                            const stale =
                              c?.current && c.current.status !== "CURRENT" && c.staged === undefined;
                            return (
                              <td
                                key={s.hid}
                                onClick={() => cycleCell(e.hid, s.hid)}
                                onContextMenu={(ev) => {
                                  ev.preventDefault();
                                  const choice = window.prompt(
                                    "Set cell: H (HOLDS), T (TRANSPORTS), U (USES), or C (Clear)",
                                    eff?.[0] ?? "",
                                  );
                                  if (choice == null) return;
                                  const map: Record<string, RelType | null> = {
                                    H: "HOLDS",
                                    T: "TRANSPORTS",
                                    U: "USES",
                                    C: null,
                                  };
                                  const v = map[choice.trim().toUpperCase()];
                                  if (v !== undefined) setCell(e.hid, s.hid, v);
                                }}
                                style={{
                                  width: 46,
                                  textAlign: "center",
                                  cursor: "pointer",
                                  userSelect: "none",
                                  fontWeight: 700,
                                  color: eff ? REL_STYLE[eff].color : "var(--sstpa-line-soft)",
                                  outline: isStaged ? "2px solid var(--sstpa-gold)" : undefined,
                                  outlineOffset: -2,
                                  textDecoration:
                                    stale && c?.current?.status === "SUPERSEDED" ? "line-through" : undefined,
                                }}
                                title={
                                  stale
                                    ? `${c?.current?.type} (${c?.current?.status}) v${c?.current?.version}`
                                    : eff ?? "empty — click to cycle"
                                }
                              >
                                {stale && c?.current?.status === "INVALIDATED" && (
                                  <span className="state-error">!</span>
                                )}
                                {eff ? REL_STYLE[eff].label : stale ? "S" : "·"}
                              </td>
                            );
                          })}
                          {showReadiness && (
                            <td style={{ textAlign: "center" }}>
                              <span
                                className="type-badge"
                                style={{
                                  background:
                                    r === "Ready"
                                      ? "var(--sstpa-status-ok)"
                                      : r === "Partial"
                                        ? "var(--sstpa-status-warn)"
                                        : "var(--sstpa-node-muted)",
                                }}
                              >
                                {r}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>

          {/* Right detail panel (§6.5.9.2) */}
          <aside
            style={{
              width: 280,
              borderLeft: "var(--sstpa-border)",
              overflow: "auto",
              background: "var(--sstpa-ivory-raised)",
              padding: "var(--sstpa-sp-3)",
              fontSize: "0.78rem",
            }}
          >
            <h4 style={{ margin: "0 0 4px" }}>Asset</h4>
            <div className="mono" style={{ fontSize: "0.68rem" }}>
              {asset?.hid}
            </div>
            <div style={{ fontWeight: 700 }}>{String(asset?.properties.Name ?? "")}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}>
              {[...CRITICALITIES]
                .filter((c) => asset?.properties[c] === true)
                .map((c) => c.replace("Critical", ""))
                .join(", ") || "no criticality"}
            </div>
            {selectedCell && (
              <>
                <h4 style={{ margin: "12px 0 4px" }}>Selected cell</h4>
                <div className="mono" style={{ fontSize: "0.68rem" }}>
                  {selectedCell.entity} × {selectedCell.state}
                </div>
                {(() => {
                  const c = cells.get(`${selectedCell.entity}|${selectedCell.state}`);
                  return (
                    <div>
                      <div>
                        Current:{" "}
                        {c?.current
                          ? `${c.current.type} (${c.current.status}, v${c.current.version})`
                          : "none"}
                      </div>
                      {c?.staged !== undefined && (
                        <div className="state-warn">Staged: {c.staged ?? "clear"}</div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
            <h4 style={{ margin: "12px 0 4px" }}>Staged changes ({staged.size})</h4>
            {[...staged.entries()].slice(0, 20).map(([key, v]) => (
              <div key={key} className="mono" style={{ fontSize: "0.64rem" }}>
                {key.replace("|", " × ")} → {v ?? "clear"}
              </div>
            ))}
          </aside>
        </div>
      )}

      {assetHid && mode === "validation" && (
        <ValidationMode
          assetHid={assetHid}
          entities={entities}
          states={states}
          nodes={nodes}
          byHid={byHid}
          onFix={() => setMode("entry")}
          onContextTool={() => openTool("sstpa.context")}
        />
      )}

      {assetHid && mode === "criticality" && (
        <CriticalityReview entities={entities} assets={assets} />
      )}
    </div>
  );
}

/** Validation Mode (§6.5.9.5b). */
function ValidationMode({
  assetHid,
  entities,
  states,
  nodes,
  byHid,
  onFix,
  onContextTool,
}: {
  assetHid: string;
  entities: SoINode[];
  states: SoINode[];
  nodes: SoINode[];
  byHid: Map<string, SoINode>;
  onFix: () => void;
  onContextTool: () => void;
}) {
  const findings: { type: string; text: string; action?: { label: string; fn: () => void } }[] = [];
  const assetName = String(byHid.get(assetHid)?.properties.Name ?? assetHid);

  const relsToAsset = (e: SoINode) =>
    (e.relationships ?? []).filter(
      (r) => ["HOLDS", "TRANSPORTS", "USES"].includes(r.type) && r.targetHID === assetHid,
    );

  for (const e of entities) {
    const rels = relsToAsset(e);
    if (rels.length === 0) {
      findings.push({
        type: "Unassigned Entity",
        text: `${e.hid} has no relationship to ${assetName} in any State.`,
        action: { label: "Fix in Trace Entry Mode", fn: onFix },
      });
      continue;
    }
    const current = rels.filter((r) => r.props?.TraceStatus === "CURRENT");
    for (const r of rels) {
      if (r.props?.TraceStatus === "INVALIDATED" && r.props?.AcknowledgedInvalidation !== true) {
        findings.push({
          type: "Invalidated Relationship",
          text: `${e.hid} -[:${r.type}]-> ${assetHid} (state ${String(r.props?.TraceStateHID)}) is INVALIDATED.`,
          action: { label: "Re-trace", fn: onFix },
        });
      }
    }
    if (current.length > 0) {
      const hasProtection = (e.relationships ?? []).some((r) => {
        if (r.type !== "HAS_REQUIREMENT") return false;
        const rq = byHid.get(r.targetHID);
        return String(rq?.properties.RStatement ?? "").includes(` of ${assetName}.`);
      });
      if (!hasProtection) {
        findings.push({
          type: "Entity Without Requirements",
          text: `${e.hid} relates to ${assetName} but has no protection Requirement (commit a trace to generate).`,
        });
      }
    }
  }

  for (const s of states) {
    if (!(s.relationships ?? []).some((r) => r.type === "VALID_IN")) {
      findings.push({
        type: "State Not Assigned to Any Environment",
        text: `${s.hid} has no [:VALID_IN]; entities in this State appear in no Attack Tree.`,
        action: { label: "Fix in Context Tool", fn: onContextTool },
      });
    }
  }

  // Loss trees with no trace data for this asset.
  const asset = byHid.get(assetHid);
  const anyCurrent = entities.some((e) =>
    relsToAsset(e).some((r) => r.props?.TraceStatus === "CURRENT"),
  );
  for (const r of asset?.relationships ?? []) {
    if (r.type === "HAS_LOSS" && !anyCurrent) {
      findings.push({
        type: "Loss Tree With No Trace Data",
        text: `Loss ${r.targetHID} cannot be built — ${assetName} has no CURRENT trace relationships.`,
        action: { label: "Fix in Trace Entry Mode", fn: onFix },
      });
    }
  }
  void nodes;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      {findings.length === 0 && <p className="state-ok">No findings — trace data is consistent.</p>}
      {findings.map((f, i) => (
        <div key={i} className="prop-row">
          <span>
            <strong>{f.type}:</strong> {f.text}
          </span>
          {f.action && (
            <button className="icon-button" onClick={f.action.fn}>
              {f.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Criticality Review Mode (§6.5.9.5c / §6.5.9.10). */
function CriticalityReview({
  entities,
  assets,
}: {
  entities: SoINode[];
  assets: SoINode[];
}) {
  const byHid = new Map(assets.map((a) => [a.hid, a]));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.78rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
            <th style={{ padding: "4px 8px" }}>Entity</th>
            {CRITICALITIES.map((c) => (
              <th key={c}>{c.replace("Critical", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => {
            const contributing = new Map<string, string[]>();
            for (const rel of e.relationships ?? []) {
              if (!["HOLDS", "TRANSPORTS", "USES"].includes(rel.type)) continue;
              if (rel.props?.TraceStatus !== "CURRENT") continue;
              const a = byHid.get(rel.targetHID);
              if (!a) continue;
              for (const c of CRITICALITIES) {
                if (a.properties[c] === true) {
                  contributing.set(c, [...(contributing.get(c) ?? []), a.hid]);
                }
              }
            }
            return (
              <tr key={e.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td style={{ padding: "3px 8px" }}>
                  <span className="mono" style={{ fontSize: "0.64rem" }}>
                    {e.hid}
                  </span>{" "}
                  {String(e.properties.Name ?? "")}
                </td>
                {CRITICALITIES.map((c) => {
                  const sources = [...new Set(contributing.get(c) ?? [])];
                  const value = e.properties[c] === true;
                  const stale = value !== sources.length > 0 && (value || sources.length > 0);
                  return (
                    <td key={c}>
                      <span className={value ? "state-error" : "state-ok"}>{value ? "True" : "False"}</span>
                      {sources.length > 0 && (
                        <span className="mono" style={{ fontSize: "0.6rem", display: "block" }}>
                          ← {sources.join(", ")}
                          {sources.length === 1 && " (sole source)"}
                        </span>
                      )}
                      {stale && (
                        <span className="state-warn" style={{ fontSize: "0.62rem", display: "block" }}>
                          stale — re-commit trace
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
