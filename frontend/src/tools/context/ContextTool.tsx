// Context Tool (SRS §6.5.8): the authoritative workspace for Environments,
// State [:VALID_IN] assignment, StateSequence, Hazard management, and Loss
// (Asset, Criticality, Assurance, Environment) allocation with confirmed
// auto-generation of Loss + root Goal nodes (§6.5.8.6).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;

const STATUS_COLOR: Record<string, string> = {
  NOT_BUILT: "var(--sstpa-node-muted)",
  AUTO_GENERATED: "var(--sstpa-status-info)",
  ANALYST_REFINED: "var(--sstpa-status-ok)",
  BASELINED: "var(--sstpa-gold)",
  EXPORTED: "#6d5a8e",
  INVALIDATED: "var(--sstpa-status-error)",
};

type Mode = "environment" | "matrix" | "loss";

export default function ContextTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const drawerPrefix = ctx.drawerNodeHid?.split("_")[0] ?? "";
  const initialMode: Mode =
    drawerPrefix === "ST" ? "matrix" : ["LOS", "AST", "DA"].includes(drawerPrefix) ? "loss" : "environment";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.context", operations: ops }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["soi"] }),
    onError: (e) => setNotice(String(e)),
  });

  const environments = nodes.filter((n) => n.typeName === "Environment");
  const states = nodes.filter((n) => n.typeName === "State");
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");

  // Non-blocking warnings (§6.5.8.9).
  const warnings: string[] = [];
  for (const s of states) {
    if (!(s.relationships ?? []).some((r) => r.type === "VALID_IN")) {
      warnings.push(`State ${s.hid} has no [:VALID_IN] Environment — it will not appear in any Attack Tree.`);
    }
  }
  for (const e of environments) {
    const assigned = states.some((s) =>
      (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === e.hid),
    );
    if (!assigned) {
      warnings.push(`Environment ${e.hid} has no States assigned — its Loss trees cannot be built.`);
    }
  }

  if (!ctx.soiHid) {
    return <p style={{ padding: 20 }}>Select a System of Interest first.</p>;
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
        }}
      >
        <button className={`sstpa-button ${mode === "environment" ? "" : "secondary"}`} onClick={() => setMode("environment")}>
          Environment Detail
        </button>
        <button className={`sstpa-button ${mode === "matrix" ? "" : "secondary"}`} onClick={() => setMode("matrix")}>
          State–Environment Matrix
        </button>
        <button className={`sstpa-button ${mode === "loss" ? "" : "secondary"}`} onClick={() => setMode("loss")}>
          Loss Allocation
        </button>
        <span style={{ flex: 1 }} />
        {warnings.length > 0 && (
          <span className="state-warn" style={{ fontSize: "0.74rem" }} title={warnings.join("\n")}>
            ⚠ {warnings.length} warning(s)
          </span>
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
      {mode === "environment" && (
        <EnvironmentDetail
          ctx={ctx}
          environments={environments}
          states={states}
          byHid={byHid}
          commit={commit.mutate}
        />
      )}
      {mode === "matrix" && (
        <StateEnvMatrix states={states} environments={environments} commit={commit.mutate} />
      )}
      {mode === "loss" && (
        <LossAllocation
          assets={assets}
          environments={environments}
          byHid={byHid}
          commit={commit.mutate}
        />
      )}
    </div>
  );
}

/** Environment Detail Mode (§6.5.8.5a). */
function EnvironmentDetail({
  ctx,
  environments,
  states,
  byHid,
  commit,
}: {
  ctx: ToolLaunchContext;
  environments: SoINode[];
  states: SoINode[];
  byHid: Map<string, SoINode>;
  commit: (ops: CommitOperation[]) => void;
}) {
  const [selectedEnv, setSelectedEnv] = useState<string | null>(
    ctx.drawerNodeHid?.startsWith("ENV_") ? ctx.drawerNodeHid : environments[0]?.hid ?? null,
  );
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<CommitOperation[]>([]);
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);

  const env = selectedEnv ? byHid.get(selectedEnv) : undefined;

  const sortedStates = [...states].sort((a, b) => {
    const sa = a.properties.StateSequence as number | null;
    const sb = b.properties.StateSequence as number | null;
    if (sa == null && sb == null) return a.hid.localeCompare(b.hid);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || a.hid.localeCompare(b.hid);
  });

  const isAssigned = (s: SoINode) =>
    (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === selectedEnv);

  const stagedFor = (s: SoINode) =>
    staged.find((op) => op.sourceHid === s.hid && op.type === "VALID_IN");

  const toggleAssignment = (s: SoINode) => {
    if (!selectedEnv) return;
    const existing = stagedFor(s);
    if (existing) {
      setStaged((x) => x.filter((op) => op !== existing));
      return;
    }
    setStaged((x) => [
      ...x,
      {
        op: isAssigned(s) ? "deleteRelationship" : "createRelationship",
        type: "VALID_IN",
        sourceHid: s.hid,
        targetHid: selectedEnv,
      },
    ]);
  };

  const envHazards = (env?.relationships ?? []).filter((r) => r.type === "HAS_HAZARD");
  const lossesForEnv = (e: SoINode) => {
    let assigned = 0;
    for (const n of byHid.values()) {
      if (n.typeName !== "Loss") continue;
      if ((n.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT" && r.targetHID === e.hid)) assigned++;
    }
    return assigned;
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Left: environment list (§6.5.8.2) */}
      <div style={{ width: 280, borderRight: "var(--sstpa-border)", overflow: "auto" }}>
        <div style={{ padding: 8, display: "flex", gap: 6 }}>
          <input
            className="sstpa-input"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="icon-button"
            title="New Environment"
            onClick={() => {
              const name = window.prompt("Name for the new (:Environment):", "New Environment");
              if (name)
                commit([
                  { op: "createNode", tempId: "env", label: "Environment", properties: { Name: name } },
                  { op: "createRelationship", type: "ACTS_IN", sourceHid: ctx.soiHid!, targetHid: "$env" },
                ]);
            }}
          >
            +
          </button>
        </div>
        {environments
          .filter((e) => !search || String(e.properties.Name ?? "").toLowerCase().includes(search.toLowerCase()))
          .map((e) => {
            const stateCount = states.filter((s) =>
              (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === e.hid),
            ).length;
            const hazardCount = (e.relationships ?? []).filter((r) => r.type === "HAS_HAZARD").length;
            return (
              <div
                key={e.hid}
                onClick={() => setSelectedEnv(e.hid)}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--sstpa-line-soft)",
                  background: selectedEnv === e.hid ? "var(--sstpa-ivory-sunken)" : undefined,
                }}
              >
                <div className="mono" style={{ fontSize: "0.66rem", color: "var(--sstpa-navy-muted)" }}>
                  {e.hid}
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{String(e.properties.Name ?? "")}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}>
                  {stateCount} states · {hazardCount} hazards · {lossesForEnv(e)} losses
                </div>
              </div>
            );
          })}
      </div>

      {/* Right: selected environment detail */}
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
        {!env && <p style={{ color: "var(--sstpa-navy-muted)" }}>Select or create an Environment.</p>}
        {env && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontFamily: "var(--sstpa-font-brand)", margin: 0 }}>
                {String(env.properties.Name ?? "")}{" "}
                <span className="mono" style={{ fontSize: "0.7rem" }}>
                  {env.hid}
                </span>
              </h3>
              <button
                className="icon-button"
                disabled={drawerOpen}
                onClick={() => openDrawer({ mode: "edit", hid: env.hid })}
              >
                ✎ Edit properties
              </button>
            </div>

            <h4 style={{ marginBottom: 4 }}>State Assignments (sorted by StateSequence)</h4>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
                  <th style={{ padding: "3px 6px" }}>HID</th>
                  <th>Name</th>
                  <th>Sequence</th>
                  <th>Assigned to this Environment</th>
                </tr>
              </thead>
              <tbody>
                {sortedStates.map((s) => {
                  const stagedOp = stagedFor(s);
                  const effective = stagedOp
                    ? stagedOp.op === "createRelationship"
                    : isAssigned(s);
                  return (
                    <tr key={s.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                      <td className="mono" style={{ padding: "3px 6px", fontSize: "0.68rem" }}>
                        {s.hid}
                      </td>
                      <td>{String(s.properties.Name ?? "")}</td>
                      <td>
                        <SequenceEditor state={s} commit={commit} />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={effective}
                          onChange={() => toggleAssignment(s)}
                        />
                        {stagedOp && <span className="state-warn"> (staged)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {staged.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  className="sstpa-button"
                  onClick={() => {
                    commit(staged);
                    setStaged([]);
                  }}
                >
                  Commit {staged.length} assignment change(s)
                </button>
                <button className="sstpa-button secondary" onClick={() => setStaged([])}>
                  Cancel
                </button>
              </div>
            )}

            <h4 style={{ margin: "14px 0 4px" }}>Hazard Associations</h4>
            {envHazards.map((r) => {
              const h = byHid.get(r.targetHID);
              return (
                <div key={r.targetHID} className="prop-row">
                  <span>
                    <span className="mono" style={{ fontSize: "0.68rem" }}>
                      {r.targetHID}
                    </span>{" "}
                    {String(h?.properties.Name ?? "")}
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <AlsoAppliesToState hazardHid={r.targetHID} states={sortedStates} commit={commit} />
                    <button
                      className="icon-button"
                      disabled={drawerOpen}
                      onClick={() => openDrawer({ mode: "edit", hid: r.targetHID })}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() =>
                        commit([
                          { op: "deleteRelationship", type: "HAS_HAZARD", sourceHid: env.hid, targetHid: r.targetHID },
                        ])
                      }
                    >
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
            <button
              className="icon-button"
              style={{ marginTop: 6 }}
              onClick={() => {
                const name = window.prompt("Name for the new (:Hazard):", "New Hazard");
                if (name)
                  commit([
                    { op: "createNode", tempId: "haz", label: "Hazard", properties: { Name: name } },
                    { op: "createRelationship", type: "HAS_HAZARD", sourceHid: env.hid, targetHid: "$haz" },
                  ]);
              }}
            >
              + New Hazard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SequenceEditor({
  state,
  commit,
}: {
  state: SoINode;
  commit: (ops: CommitOperation[]) => void;
}) {
  const current = state.properties.StateSequence;
  const [val, setVal] = useState(current == null ? "" : String(current));
  return (
    <span style={{ display: "flex", gap: 4 }}>
      <input
        className="sstpa-input"
        type="number"
        min={0}
        style={{ width: 64 }}
        placeholder="—"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const parsed = val === "" ? null : Math.max(0, parseInt(val, 10));
          if (parsed !== current) {
            commit([{ op: "updateNode", hid: state.hid, properties: { StateSequence: parsed } }]);
          }
        }}
      />
    </span>
  );
}

function AlsoAppliesToState({
  hazardHid,
  states,
  commit,
}: {
  hazardHid: string;
  states: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  if (!open) {
    return (
      <button className="icon-button" title="Also applies to a State (§6.5.8.8)" onClick={() => setOpen(true)}>
        +State
      </button>
    );
  }
  return (
    <span style={{ display: "flex", gap: 4 }}>
      <select className="sstpa-input" style={{ width: "auto" }} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">State…</option>
        {states.map((s) => (
          <option key={s.hid} value={s.hid}>
            {String(s.properties.Name ?? s.hid)}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        disabled={!target}
        onClick={() => {
          commit([{ op: "createRelationship", type: "HAS_HAZARD", sourceHid: target, targetHid: hazardHid }]);
          setOpen(false);
        }}
      >
        OK
      </button>
    </span>
  );
}

/** State-Environment Matrix Mode (§6.5.8.5b) with staged toggles. */
function StateEnvMatrix({
  states,
  environments,
  commit,
}: {
  states: SoINode[];
  environments: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [staged, setStaged] = useState<CommitOperation[]>([]);
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned">("all");

  const sorted = [...states].sort((a, b) => {
    const sa = a.properties.StateSequence as number | null;
    const sb = b.properties.StateSequence as number | null;
    if (sa == null && sb == null) return a.hid.localeCompare(b.hid);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || a.hid.localeCompare(b.hid);
  });
  const envs = [...environments].sort((a, b) =>
    String(a.properties.Name ?? "").localeCompare(String(b.properties.Name ?? "")),
  );

  const persisted = (s: SoINode, envHid: string) =>
    (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === envHid);
  const stagedOp = (s: SoINode, envHid: string) =>
    staged.find((op) => op.sourceHid === s.hid && op.targetHid === envHid && op.type === "VALID_IN");
  const effective = (s: SoINode, envHid: string) => {
    const op = stagedOp(s, envHid);
    return op ? op.op === "createRelationship" : persisted(s, envHid);
  };

  const visible = sorted.filter((s) => {
    if (filter === "all") return true;
    const any = envs.some((e) => effective(s, e.hid));
    return filter === "assigned" ? any : !any;
  });

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.78rem" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <select className="sstpa-input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All States</option>
          <option value="assigned">Only assigned States</option>
          <option value="unassigned">Only unassigned States</option>
        </select>
        {staged.length > 0 && (
          <>
            <button
              className="sstpa-button"
              onClick={() => {
                commit(staged);
                setStaged([]);
              }}
            >
              Commit {staged.length} change(s)
            </button>
            <button className="sstpa-button secondary" onClick={() => setStaged([])}>
              Cancel
            </button>
          </>
        )}
        <button
          className="icon-button"
          style={{ marginLeft: "auto" }}
          title="Export matrix as CSV (§6.5.8.13)"
          onClick={() => {
            const header = ["StateHID", "StateName", "StateSequence", ...envs.map((e) => String(e.properties.Name ?? e.hid))];
            const rows = sorted.map((s) => [
              s.hid,
              String(s.properties.Name ?? ""),
              s.properties.StateSequence == null ? "" : String(s.properties.StateSequence),
              ...envs.map((e) => (effective(s, e.hid) ? "X" : "")),
            ]);
            const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "sstpa-state-environment-matrix.csv";
            a.click();
          }}
        >
          CSV
        </button>
      </div>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--sstpa-navy)", textAlign: "left" }}>
            <th style={{ padding: "4px 8px" }}>State</th>
            <th>Seq</th>
            {envs.map((e) => (
              <th key={e.hid} style={{ padding: "4px 8px", fontSize: "0.7rem" }}>
                {String(e.properties.Name ?? e.hid)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <tr key={s.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
              <td style={{ padding: "3px 8px" }}>
                <span className="mono" style={{ fontSize: "0.66rem" }}>
                  {s.hid}
                </span>{" "}
                {String(s.properties.Name ?? "")}
              </td>
              <td>
                <SequenceEditor state={s} commit={commit} />
              </td>
              {envs.map((e) => {
                const op = stagedOp(s, e.hid);
                return (
                  <td key={e.hid} style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={effective(s, e.hid)}
                      style={op ? { outline: "2px solid var(--sstpa-gold)" } : undefined}
                      onChange={() => {
                        if (op) {
                          setStaged((x) => x.filter((o) => o !== op));
                        } else {
                          setStaged((x) => [
                            ...x,
                            {
                              op: persisted(s, e.hid) ? "deleteRelationship" : "createRelationship",
                              type: "VALID_IN",
                              sourceHid: s.hid,
                              targetHid: e.hid,
                            },
                          ]);
                        }
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Loss Allocation Mode (§6.5.8.5c/§6.5.8.6). */
function LossAllocation({
  assets,
  environments,
  byHid,
  commit,
}: {
  assets: SoINode[];
  environments: SoINode[];
  byHid: Map<string, SoINode>;
  commit: (ops: CommitOperation[]) => void;
}) {
  const openTool = useToolWindows((s) => s.openTool);
  const [filter, setFilter] = useState<"all" | "unassigned" | "assigned" | "invalidated">("all");
  const [genPlan, setGenPlan] = useState<null | {
    tuples: { asset: SoINode; c: string; s: string; env: SoINode; existingLoss?: SoINode }[];
  }>(null);

  const lossEnv = (l: SoINode) =>
    (l.relationships ?? []).find((r) => r.type === "HAS_ENVIRONMENT")?.targetHID;

  const lossesByAsset = new Map<string, SoINode[]>();
  for (const a of assets) {
    lossesByAsset.set(
      a.hid,
      (a.relationships ?? [])
        .filter((r) => r.type === "HAS_LOSS")
        .map((r) => byHid.get(r.targetHID))
        .filter((l): l is SoINode => !!l),
    );
  }

  const singleTrue = (l: SoINode, keys: readonly string[]) =>
    keys.find((k) => l.properties[k] === true) ?? "—";

  /** "Generate Missing" (§6.5.8.5c): tuples with a VALID_IN State but no Loss. */
  const computeMissing = () => {
    const tuples: NonNullable<typeof genPlan>["tuples"] = [];
    for (const a of assets) {
      const aLosses = lossesByAsset.get(a.hid) ?? [];
      for (const c of CRITICALITIES) {
        if (a.properties[c] !== true) continue;
        for (const s of ASSURANCES) {
          if (a.properties[s] !== true) continue;
          for (const env of environments) {
            // Environment must have at least one VALID_IN State.
            const hasStates = [...byHid.values()].some(
              (n) =>
                n.typeName === "State" &&
                (n.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === env.hid),
            );
            if (!hasStates) continue;
            const covered = aLosses.some(
              (l) => l.properties[c] === true && l.properties[s] === true && lossEnv(l) === env.hid,
            );
            if (covered) continue;
            // Prefer assigning an existing un-allocated Loss (§6.5.8.6).
            const unallocated = aLosses.find(
              (l) =>
                l.properties[c] === true &&
                l.properties[s] === true &&
                !lossEnv(l) &&
                !tuples.some((t) => t.existingLoss?.hid === l.hid),
            );
            tuples.push({ asset: a, c, s, env, existingLoss: unallocated });
          }
        }
      }
    }
    setGenPlan({ tuples });
  };

  const executeGeneration = () => {
    if (!genPlan) return;
    const ops: CommitOperation[] = [];
    let i = 0;
    for (const t of genPlan.tuples) {
      const aName = String(t.asset.properties.Name ?? t.asset.hid);
      const eName = String(t.env.properties.Name ?? t.env.hid);
      if (t.existingLoss) {
        ops.push({
          op: "createRelationship",
          type: "HAS_ENVIRONMENT",
          sourceHid: t.existingLoss.hid,
          targetHid: t.env.hid,
        });
        continue;
      }
      i++;
      const lossProps: Record<string, unknown> = {
        Name: `Compromise ${aName} ${t.c} ${t.s} in ${eName}`,
        ShortDescription: `Loss of ${t.s} of ${aName} (${t.c}) in the ${eName} environment.`,
        AttackTreeStatus: "NOT_BUILT",
        TreeIsValid: false,
        TreeHasRVs: false,
      };
      for (const cc of CRITICALITIES) lossProps[cc] = cc === t.c;
      for (const ss of ASSURANCES) lossProps[ss] = ss === t.s;
      ops.push(
        { op: "createNode", tempId: `l${i}`, label: "Loss", properties: lossProps },
        { op: "createRelationship", type: "HAS_LOSS", sourceHid: t.asset.hid, targetHid: `$l${i}` },
        { op: "createRelationship", type: "HAS_ENVIRONMENT", sourceHid: `$l${i}`, targetHid: t.env.hid },
        {
          op: "createNode",
          tempId: `g${i}`,
          label: "GsnGoal",
          properties: {
            Name: `${aName} ${t.c} ${t.s} in ${eName} acceptable`,
            GoalStatement: `The ${t.c} of ${t.s} of ${aName} in ${eName} is acceptable.`,
          },
        },
        { op: "createRelationship", type: "HAS_GOAL", sourceHid: t.asset.hid, targetHid: `$g${i}` },
      );
    }
    commit(ops);
    setGenPlan(null);
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.78rem" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <select className="sstpa-input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All Loss nodes</option>
          <option value="unassigned">Only unassigned</option>
          <option value="assigned">Only assigned</option>
          <option value="invalidated">Only INVALIDATED</option>
        </select>
        <button className="sstpa-button" onClick={computeMissing}>
          Generate Missing…
        </button>
        <button
          className="icon-button"
          style={{ marginLeft: "auto" }}
          title="Loss Allocation Summary CSV (§6.5.8.13)"
          onClick={() => {
            const rows = [["LossHID", "AssetHID", "Criticality", "Assurance", "Environment", "AttackTreeStatus"]];
            for (const a of assets) {
              for (const l of lossesByAsset.get(a.hid) ?? []) {
                rows.push([
                  l.hid,
                  a.hid,
                  singleTrue(l, CRITICALITIES),
                  singleTrue(l, ASSURANCES),
                  lossEnv(l) ?? "Unassigned",
                  String(l.properties.AttackTreeStatus ?? "NOT_BUILT"),
                ]);
              }
            }
            const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
            const el = document.createElement("a");
            el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            el.download = "sstpa-loss-allocation.csv";
            el.click();
          }}
        >
          CSV
        </button>
      </div>

      {assets.map((a) => {
        const aLosses = (lossesByAsset.get(a.hid) ?? []).filter((l) => {
          const env = lossEnv(l);
          if (filter === "unassigned") return !env;
          if (filter === "assigned") return !!env;
          if (filter === "invalidated") return l.properties.AttackTreeStatus === "INVALIDATED";
          return true;
        });
        if (aLosses.length === 0 && filter !== "all") return null;
        const assigned = (lossesByAsset.get(a.hid) ?? []).filter((l) => lossEnv(l)).length;
        const total = (lossesByAsset.get(a.hid) ?? []).length;
        return (
          <details key={a.hid} open style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {String(a.properties.Name ?? a.hid)}{" "}
              <span className="mono" style={{ fontSize: "0.66rem" }}>
                {a.hid}
              </span>{" "}
              <span style={{ color: "var(--sstpa-navy-muted)" }}>
                — {total} losses / {assigned} assigned / {total - assigned} unassigned
              </span>
            </summary>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
              <tbody>
                {aLosses.map((l) => {
                  const env = lossEnv(l);
                  const status = String(l.properties.AttackTreeStatus ?? "NOT_BUILT");
                  return (
                    <tr key={l.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                      <td className="mono" style={{ fontSize: "0.66rem", padding: "3px 6px" }}>
                        {l.hid}
                      </td>
                      <td>{singleTrue(l, CRITICALITIES).replace("Critical", "")}</td>
                      <td>{singleTrue(l, ASSURANCES)}</td>
                      <td>
                        {env ? (
                          <span className="state-ok">
                            {String(byHid.get(env)?.properties.Name ?? env)}
                          </span>
                        ) : (
                          <span className="state-warn">● Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="type-badge"
                          style={{ background: STATUS_COLOR[status] ?? "var(--sstpa-node-muted)" }}
                        >
                          {status === "INVALIDATED" ? "! " : ""}
                          {status}
                        </span>
                      </td>
                      <td>{l.properties.TreeIsValid === true ? "✓" : "✗"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {!env ? (
                          <EnvPicker
                            environments={environments}
                            onPick={(envHid) =>
                              commit([
                                { op: "createRelationship", type: "HAS_ENVIRONMENT", sourceHid: l.hid, targetHid: envHid },
                              ])
                            }
                          />
                        ) : (
                          <button
                            className="icon-button danger"
                            title="Remove Environment assignment"
                            onClick={() =>
                              commit([
                                { op: "deleteRelationship", type: "HAS_ENVIRONMENT", sourceHid: l.hid, targetHid: env },
                              ])
                            }
                          >
                            De-allocate
                          </button>
                        )}
                        <button className="icon-button" onClick={() => openTool("sstpa.loss")}>
                          Loss Tool
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}

      {genPlan && (
        <ConfirmDialog
          title="Auto-generate Losses and Goals?"
          confirmLabel={`Generate (${genPlan.tuples.length})`}
          onCancel={() => setGenPlan(null)}
          onConfirm={executeGeneration}
        >
          <p>
            {genPlan.tuples.filter((t) => !t.existingLoss).length} new (:Loss) node(s) +{" "}
            {genPlan.tuples.filter((t) => !t.existingLoss).length} new (:GsnGoal) node(s);{" "}
            {genPlan.tuples.filter((t) => t.existingLoss).length} existing Loss node(s) will be
            allocated to Environments (SRS §6.5.8.6).
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--sstpa-navy)" }}>
                <th>Asset</th>
                <th>Criticality</th>
                <th>Assurance</th>
                <th>Environment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {genPlan.tuples.slice(0, 30).map((t, i) => (
                <tr key={i}>
                  <td>{String(t.asset.properties.Name ?? "")}</td>
                  <td>{t.c}</td>
                  <td>{t.s}</td>
                  <td>{String(t.env.properties.Name ?? "")}</td>
                  <td>{t.existingLoss ? `allocate ${t.existingLoss.hid}` : "create"}</td>
                </tr>
              ))}
              {genPlan.tuples.length > 30 && (
                <tr>
                  <td colSpan={5}>… and {genPlan.tuples.length - 30} more</td>
                </tr>
              )}
            </tbody>
          </table>
          {genPlan.tuples.length === 0 && <p className="state-ok">Nothing missing — all tuples covered.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}

function EnvPicker({
  environments,
  onPick,
}: {
  environments: SoINode[];
  onPick: (envHid: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <select className="sstpa-input" style={{ width: "auto" }} value={val} onChange={(e) => setVal(e.target.value)}>
        <option value="">Assign Environment…</option>
        {environments.map((e) => (
          <option key={e.hid} value={e.hid}>
            {String(e.properties.Name ?? e.hid)}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        disabled={!val}
        onClick={() => {
          onPick(val);
          setVal("");
        }}
      >
        OK
      </button>
    </span>
  );
}
