// Context Tool (SRS §6.5.8): the authoritative workspace for Environments,
// State [:VALID_IN] assignment, StateSequence, Hazard management, and Loss
// (Asset, Criticality, Assurance, Environment) allocation with confirmed
// auto-generation of Loss + root Goal nodes (§6.5.8.6).
//
// Environment membership uses (:System)-[:ACTS_IN]->(:Environment), the
// relationship the canonical schema authorizes for System→Environment
// (backend/internal/schema/data/relationships.json, SRS §3.3.4.2).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  CommitOperation,
  CommitResponse,
  ReferenceSearchResult,
  SoINode,
} from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { downloadText, errorText, ToolStatus, usePrompt } from "../shared";

const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;

const STATUS_COLOR: Record<string, string> = {
  NOT_BUILT: "var(--sstpa-node-muted)",
  AUTO_GENERATED: "var(--sstpa-status-info)",
  ANALYST_REFINED: "var(--sstpa-status-ok)",
  BASELINED: "var(--sstpa-accent)",
  EXPORTED: "#6d5a8e",
  INVALIDATED: "var(--sstpa-status-error)",
};

type Mode = "environment" | "matrix" | "loss";
type Notice = { kind: "success" | "error"; text: string };
type Notify = (kind: Notice["kind"], text: string) => void;
/** Commit staged operations; resolves null on failure (error surfaced centrally). */
type CommitFn = (ops: CommitOperation[], message?: string) => Promise<CommitResponse | null>;

/** §6.5.8.7: sort by StateSequence ascending; unset sequences last, by HID. */
function sortByStateSequence(states: SoINode[]): SoINode[] {
  return [...states].sort((a, b) => {
    const sa = a.properties.StateSequence as number | null;
    const sb = b.properties.StateSequence as number | null;
    if (sa == null && sb == null) return a.hid.localeCompare(b.hid);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb || a.hid.localeCompare(b.hid);
  });
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const trueFlags = (n: SoINode, keys: readonly string[]) => keys.filter((k) => n.properties[k] === true);
const singleTrue = (n: SoINode, keys: readonly string[]) => keys.find((k) => n.properties[k] === true) ?? "—";
const nodeName = (n: SoINode | undefined) => String(n?.properties.Name ?? n?.hid ?? "");

export default function ContextTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  // Focus context: cross-tool focus wins over the Data Drawer node (§6.5.8.3).
  const focusHid = ctx.focusHid ?? ctx.drawerNodeHid ?? null;
  const focusPrefix = focusHid?.split("_")[0] ?? "";
  const initialMode: Mode =
    focusPrefix === "ST" ? "matrix" : ["LOS", "AST", "DA"].includes(focusPrefix) ? "loss" : "environment";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const qc = useQueryClient();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);

  const commitMutation = useMutation({
    mutationFn: (vars: { ops: CommitOperation[]; message?: string }) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.context", operations: vars.ops }),
    onSuccess: (res, vars) => {
      void qc.invalidateQueries({ queryKey: ["soi"] });
      setNotice({
        kind: "success",
        text:
          vars.message ??
          `Committed ${res.nodesChanged} node change(s) and ${res.relationshipsChanged} relationship change(s).`,
      });
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });
  const commit: CommitFn = async (ops, message) => {
    try {
      return await commitMutation.mutateAsync({ ops, message });
    } catch {
      return null; // error notice already raised by onError
    }
  };
  const busy = commitMutation.isPending;
  const notify: Notify = (kind, text) => setNotice({ kind, text });

  const environments = useMemo(() => nodes.filter((n) => n.typeName === "Environment"), [nodes]);
  const states = useMemo(() => nodes.filter((n) => n.typeName === "State"), [nodes]);
  const assets = useMemo(
    () => nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset"),
    [nodes],
  );
  const hazards = useMemo(() => nodes.filter((n) => n.typeName === "Hazard"), [nodes]);

  // Non-blocking warnings (§6.5.8.9, all three).
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
  for (const a of assets) {
    const aLosses = (a.relationships ?? [])
      .filter((r) => r.type === "HAS_LOSS")
      .map((r) => byHid.get(r.targetHID))
      .filter((l): l is SoINode => !!l);
    if (
      aLosses.length > 0 &&
      !aLosses.some((l) => (l.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT"))
    ) {
      warnings.push(
        `Asset ${a.hid} has ${aLosses.length} Loss node(s) with no Environment assignment — not ready for Loss analysis.`,
      );
    }
  }

  /** Environment Summary Report, Markdown (§6.5.8.13). */
  const exportSummaryReport = () => {
    const lines: string[] = [
      "# Environment Summary Report",
      "",
      `- SoI: ${ctx.soiHid ?? ""}`,
      `- Generated: ${new Date().toISOString()}`,
      "",
    ];
    const sortedEnvs = [...environments].sort((a, b) => nodeName(a).localeCompare(nodeName(b)));
    for (const e of sortedEnvs) {
      lines.push(`## ${e.hid} — ${nodeName(e)}`, "");
      const desc = String(e.properties.ShortDescription ?? "");
      if (desc) lines.push(desc, "");
      const envStates = sortByStateSequence(
        states.filter((s) =>
          (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === e.hid),
        ),
      );
      lines.push("### States (VALID_IN)", "");
      if (envStates.length === 0) {
        lines.push("_No States assigned._", "");
      } else {
        lines.push("| HID | Name | StateSequence |", "| --- | --- | --- |");
        for (const s of envStates) {
          lines.push(
            `| ${s.hid} | ${nodeName(s)} | ${s.properties.StateSequence == null ? "—" : String(s.properties.StateSequence)} |`,
          );
        }
        lines.push("");
      }
      const envHazards = (e.relationships ?? [])
        .filter((r) => r.type === "HAS_HAZARD")
        .map((r) => byHid.get(r.targetHID))
        .filter((h): h is SoINode => !!h);
      lines.push("### Hazards (HAS_HAZARD)", "");
      if (envHazards.length === 0) {
        lines.push("_No Hazards associated._", "");
      } else {
        lines.push("| HID | Name | ShortDescription |", "| --- | --- | --- |");
        for (const h of envHazards) {
          lines.push(`| ${h.hid} | ${nodeName(h)} | ${String(h.properties.ShortDescription ?? "")} |`);
        }
        lines.push("");
      }
    }
    downloadText("sstpa-environment-summary.md", lines.join("\n"), "text/markdown");
  };

  if (!ctx.soiHid) {
    return <ToolStatus needsSoI />;
  }
  if (soi.isLoading || soi.error) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus loading={soi.isLoading} error={soi.error} onRetry={() => void soi.refetch()} />
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
        {busy && <span style={{ fontSize: "0.74rem", color: "var(--sstpa-muted)" }}>Committing…</span>}
        {warnings.length > 0 && (
          <button
            className="icon-button"
            title="Show/hide validation warnings (§6.5.8.9)"
            onClick={() => setShowWarnings((v) => !v)}
          >
            <span className="state-warn">⚠ {warnings.length} warning(s)</span>
          </button>
        )}
        <button className="icon-button" title="Environment Summary Report, Markdown (§6.5.8.13)" onClick={exportSummaryReport}>
          Report (MD)
        </button>
      </div>
      {showWarnings && warnings.length > 0 && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          <strong>Validation warnings (non-blocking, §6.5.8.9)</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <div
          className={notice.kind === "success" ? "sstpa-alert-success" : "sstpa-alert-error"}
          style={{ margin: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ flex: 1 }}>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      {mode === "environment" && (
        <EnvironmentDetail
          soiHid={ctx.soiHid}
          focusHid={focusHid}
          environments={environments}
          states={states}
          hazards={hazards}
          byHid={byHid}
          commit={commit}
          busy={busy}
          notify={notify}
        />
      )}
      {mode === "matrix" && (
        <StateEnvMatrix states={states} environments={environments} focusHid={focusHid} commit={commit} busy={busy} />
      )}
      {mode === "loss" && (
        <LossAllocation
          assets={assets}
          environments={environments}
          byHid={byHid}
          focusHid={focusHid}
          commit={commit}
          busy={busy}
        />
      )}
    </div>
  );
}

/** Environment Detail Mode (§6.5.8.5a). */
function EnvironmentDetail({
  soiHid,
  focusHid,
  environments,
  states,
  hazards,
  byHid,
  commit,
  busy,
  notify,
}: {
  soiHid: string;
  focusHid: string | null;
  environments: SoINode[];
  states: SoINode[];
  hazards: SoINode[];
  byHid: Map<string, SoINode>;
  commit: CommitFn;
  busy: boolean;
  notify: Notify;
}) {
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<CommitOperation[]>([]);
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const prompt = usePrompt();

  // Auto-selection once the SoI loads (§6.5.8.3): a Hazard context selects
  // that Hazard's Environment; an Environment context selects itself;
  // otherwise the first Environment is selected automatically.
  useEffect(() => {
    if (selectedEnv && byHid.has(selectedEnv)) return;
    if (environments.length === 0) return;
    let pick: string | undefined;
    if (focusHid?.startsWith("ENV_") && byHid.has(focusHid)) {
      pick = focusHid;
    } else if (focusHid?.startsWith("HAZ_")) {
      pick = environments.find((e) =>
        (e.relationships ?? []).some((r) => r.type === "HAS_HAZARD" && r.targetHID === focusHid),
      )?.hid;
    }
    setSelectedEnv(pick ?? environments[0].hid);
  }, [selectedEnv, environments, byHid, focusHid]);

  const env = selectedEnv ? byHid.get(selectedEnv) : undefined;
  const sortedStates = sortByStateSequence(states);

  const isAssigned = (s: SoINode) =>
    (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === selectedEnv);
  const stagedFor = (s: SoINode) =>
    staged.find((op) => op.type === "VALID_IN" && op.sourceHid === s.hid && op.targetHid === selectedEnv);
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

  // StateSequence edits stage with the [:VALID_IN] batch and commit in the
  // same single transaction (§6.5.8.5a).
  const stagedSeq = (s: SoINode): number | null | undefined => {
    const op = staged.find((o) => o.op === "updateNode" && o.hid === s.hid);
    return op ? ((op.properties?.StateSequence ?? null) as number | null) : undefined;
  };
  const stageSequence = (s: SoINode, v: number | null) => {
    setStaged((prev) => {
      const rest = prev.filter((op) => !(op.op === "updateNode" && op.hid === s.hid));
      const current = (s.properties.StateSequence ?? null) as number | null;
      if (v === current) return rest;
      return [...rest, { op: "updateNode", hid: s.hid, properties: { StateSequence: v } }];
    });
  };

  // "Logic in tree" (§6.5.8.5a): derived from [:AT_RELATES_TO] edges of the
  // Losses allocated to the selected Environment (LogicOperator set by the
  // Loss Tool). "—" when no tree references the State yet.
  const lossesInEnv = useMemo(
    () =>
      [...byHid.values()].filter(
        (n) =>
          n.typeName === "Loss" &&
          (n.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT" && r.targetHID === selectedEnv),
      ),
    [byHid, selectedEnv],
  );
  const logicInTree = (stateHid: string): string => {
    const ops = new Set<string>();
    for (const l of lossesInEnv) {
      for (const r of l.relationships ?? []) {
        if (r.type === "AT_RELATES_TO" && r.targetHID === stateHid) {
          const op = String(r.props?.LogicOperator ?? "");
          if (op) ops.add(op);
        }
      }
    }
    return ops.size > 0 ? [...ops].sort().join(" / ") : "—";
  };

  const envHazardRels = (env?.relationships ?? []).filter((r) => r.type === "HAS_HAZARD");
  const associatedHazardHids = new Set(envHazardRels.map((r) => r.targetHID));
  const lossCountForEnv = (e: SoINode) =>
    [...byHid.values()].filter(
      (n) =>
        n.typeName === "Loss" &&
        (n.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT" && r.targetHID === e.hid),
    ).length;
  const unallocatedLosses = [...byHid.values()].filter(
    (n) => n.typeName === "Loss" && !(n.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT"),
  ).length;

  // Summary graph data reflecting staged changes before Commit (§6.5.8.5a).
  const graphStates = sortedStates
    .map((s) => {
      const op = stagedFor(s);
      const committed = isAssigned(s);
      const kind: "committed" | "add" | "remove" | null = op
        ? op.op === "createRelationship"
          ? "add"
          : "remove"
        : committed
          ? "committed"
          : null;
      return kind ? { hid: s.hid, label: `${s.hid} ${nodeName(s)}`, kind } : null;
    })
    .filter((x): x is { hid: string; label: string; kind: "committed" | "add" | "remove" } => x !== null);
  const graphHazards = envHazardRels.map((r) => ({
    hid: r.targetHID,
    label: `${r.targetHID} ${nodeName(byHid.get(r.targetHID))}`,
  }));

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {prompt.element}
      {/* Left: environment list (§6.5.8.2) */}
      <div style={{ width: 280, borderRight: "var(--sstpa-border)", overflow: "auto", flexShrink: 0 }}>
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
            disabled={busy}
            onClick={() =>
              prompt.ask(
                "Name for the new (:Environment)",
                (name) =>
                  void commit(
                    [
                      { op: "createNode", tempId: "env", label: "Environment", properties: { Name: name } },
                      // System→Environment membership is [:ACTS_IN] (§3.3.4.2).
                      { op: "createRelationship", type: "ACTS_IN", sourceHid: soiHid, targetHid: "$env" },
                    ],
                    `Environment "${name}" created.`,
                  ),
                { placeholder: "New Environment" },
              )
            }
          >
            +
          </button>
        </div>
        {environments
          .filter((e) => !search || nodeName(e).toLowerCase().includes(search.toLowerCase()))
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
                  background: selectedEnv === e.hid ? "var(--sstpa-inset)" : undefined,
                }}
              >
                <div className="mono" style={{ fontSize: "0.66rem", color: "var(--sstpa-muted)" }}>
                  {e.hid}
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{nodeName(e)}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
                  {stateCount} states · {hazardCount} hazards · {lossCountForEnv(e)} losses assigned ·{" "}
                  {unallocatedLosses} unassigned (SoI)
                </div>
              </div>
            );
          })}
        {environments.length === 0 && (
          <p style={{ padding: 10, fontSize: "0.78rem", color: "var(--sstpa-muted)" }}>
            No Environments yet — create one with “+”.
          </p>
        )}
      </div>

      {/* Right: selected environment detail */}
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
        {!env && <p style={{ color: "var(--sstpa-muted)" }}>Select or create an Environment.</p>}
        {env && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontFamily: "var(--sstpa-font-ui)", margin: 0 }}>
                {nodeName(env)}{" "}
                <span className="mono" style={{ fontSize: "0.7rem" }}>
                  {env.hid}
                </span>
              </h3>
              <button
                className="icon-button"
                title="Edit properties in the Data Drawer (§6.5.8.10)"
                onClick={() => requestOpenDrawer({ mode: "edit", hid: env.hid })}
              >
                ✎ Edit properties
              </button>
            </div>

            <h4 style={{ margin: "10px 0 4px" }}>Summary graph (reflects staged changes)</h4>
            <EnvSummaryGraph envLabel={`${env.hid} ${nodeName(env)}`} states={graphStates} hazards={graphHazards} />

            <h4 style={{ margin: "14px 0 4px" }}>State Assignments (sorted by StateSequence)</h4>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
                  <th style={{ padding: "3px 6px" }}>HID</th>
                  <th>Name</th>
                  <th>Sequence</th>
                  <th>Assigned to this Environment</th>
                  <th title="OR / SAND, set by the Loss Tool on [:AT_RELATES_TO] edges (§6.5.8.5a)">Logic in tree</th>
                </tr>
              </thead>
              <tbody>
                {sortedStates.map((s) => {
                  const stagedOp = stagedFor(s);
                  const effective = stagedOp ? stagedOp.op === "createRelationship" : isAssigned(s);
                  return (
                    <tr key={s.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                      <td className="mono" style={{ padding: "3px 6px", fontSize: "0.68rem" }}>
                        {s.hid}
                      </td>
                      <td>{nodeName(s)}</td>
                      <td>
                        <SequenceEditor
                          value={(s.properties.StateSequence ?? null) as number | null}
                          stagedValue={stagedSeq(s)}
                          onStage={(v) => stageSequence(s, v)}
                        />
                      </td>
                      <td>
                        <input type="checkbox" checked={effective} onChange={() => toggleAssignment(s)} />
                        {stagedOp && <span className="state-warn"> (staged)</span>}
                      </td>
                      <td>{logicInTree(s.hid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {staged.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  className="sstpa-button"
                  disabled={busy}
                  onClick={() =>
                    void commit(staged, `${staged.length} assignment/sequence change(s) committed.`).then(
                      (res) => res && setStaged([]),
                    )
                  }
                >
                  {busy ? "Committing…" : `Commit ${staged.length} staged change(s)`}
                </button>
                <button className="sstpa-button secondary" disabled={busy} onClick={() => setStaged([])}>
                  Cancel
                </button>
              </div>
            )}

            <h4 style={{ margin: "14px 0 4px" }}>Hazard Associations</h4>
            {envHazardRels.length === 0 && (
              <p style={{ color: "var(--sstpa-muted)", margin: "2px 0" }}>No Hazards associated.</p>
            )}
            {envHazardRels.map((r) => {
              const h = byHid.get(r.targetHID);
              return (
                <div key={r.targetHID} className="prop-row">
                  <span>
                    <span className="mono" style={{ fontSize: "0.68rem" }}>
                      {r.targetHID}
                    </span>{" "}
                    <strong>{nodeName(h)}</strong>{" "}
                    <span style={{ color: "var(--sstpa-muted)" }}>
                      {String(h?.properties.ShortDescription ?? "")}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <AlsoAppliesToState hazardHid={r.targetHID} states={sortedStates} commit={commit} busy={busy} />
                    <button
                      className="icon-button"
                      title="Open in Data Drawer"
                      onClick={() => requestOpenDrawer({ mode: "edit", hid: r.targetHID })}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button danger"
                      disabled={busy}
                      onClick={() =>
                        void commit(
                          [{ op: "deleteRelationship", type: "HAS_HAZARD", sourceHid: env.hid, targetHid: r.targetHID }],
                          `Hazard ${r.targetHID} removed from ${env.hid}.`,
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
            <HazardTools
              envHid={env.hid}
              allHazards={hazards}
              associatedHids={associatedHazardHids}
              commit={commit}
              busy={busy}
              notify={notify}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Read-only mini node-edge summary graph for the selected Environment
 *  (§6.5.8.5a): Environment ↔ VALID_IN States ↔ HAS_HAZARD Hazards. Staged
 *  [:VALID_IN] changes render dashed (gold = staged add, red = staged remove). */
function EnvSummaryGraph({
  envLabel,
  states,
  hazards,
}: {
  envLabel: string;
  states: { hid: string; label: string; kind: "committed" | "add" | "remove" }[];
  hazards: { hid: string; label: string }[];
}) {
  const rows = Math.max(states.length, hazards.length, 1);
  const height = 28 + rows * 32;
  const midY = height / 2;
  const trunc = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const edgeColor = (kind: "committed" | "add" | "remove") =>
    kind === "add" ? "var(--sstpa-accent)" : kind === "remove" ? "var(--sstpa-status-error)" : "var(--sstpa-muted)";
  const boxY = (i: number) => 22 + i * 32;
  return (
    <svg
      viewBox={`0 0 700 ${height}`}
      role="img"
      aria-label="Environment summary graph"
      style={{
        width: "100%",
        maxWidth: 760,
        border: "1px solid var(--sstpa-line-soft)",
        borderRadius: 4,
        background: "var(--sstpa-bg)",
      }}
    >
      <text x={200} y={12} style={{ fill: "var(--sstpa-muted)", fontSize: 9 }}>
        [:VALID_IN]
      </text>
      <text x={440} y={12} style={{ fill: "var(--sstpa-muted)", fontSize: 9 }}>
        [:HAS_HAZARD]
      </text>
      {states.map((s, i) => (
        <line
          key={`se-${s.hid}`}
          x1={195}
          y1={boxY(i) + 12}
          x2={265}
          y2={midY}
          style={{
            stroke: edgeColor(s.kind),
            strokeWidth: 1.4,
            strokeDasharray: s.kind !== "committed" ? "4 3" : undefined,
          }}
        />
      ))}
      {hazards.map((h, i) => (
        <line
          key={`he-${h.hid}`}
          x1={435}
          y1={midY}
          x2={505}
          y2={boxY(i) + 12}
          style={{ stroke: "var(--sstpa-muted)", strokeWidth: 1.4 }}
        />
      ))}
      <rect
        x={265}
        y={midY - 14}
        width={170}
        height={28}
        rx={5}
        style={{ fill: "var(--sstpa-surface)", stroke: "var(--sstpa-text)", strokeWidth: 1.6 }}
      />
      <text x={350} y={midY + 4} textAnchor="middle" style={{ fill: "var(--sstpa-text)", fontSize: 10, fontWeight: 700 }}>
        {trunc(envLabel, 28)}
      </text>
      {states.map((s, i) => (
        <g key={`sn-${s.hid}`} opacity={s.kind === "remove" ? 0.55 : 1}>
          <rect
            x={25}
            y={boxY(i)}
            width={170}
            height={24}
            rx={4}
            style={{ fill: "var(--sstpa-surface)", stroke: edgeColor(s.kind), strokeWidth: 1.2 }}
          />
          <text x={110} y={boxY(i) + 15} textAnchor="middle" style={{ fill: "var(--sstpa-text)", fontSize: 9 }}>
            {trunc(s.label)}
          </text>
        </g>
      ))}
      {states.length === 0 && (
        <text x={110} y={midY + 3} textAnchor="middle" style={{ fill: "var(--sstpa-muted)", fontSize: 9 }}>
          no States assigned
        </text>
      )}
      {hazards.map((h, i) => (
        <g key={`hn-${h.hid}`}>
          <rect
            x={505}
            y={boxY(i)}
            width={170}
            height={24}
            rx={4}
            style={{ fill: "var(--sstpa-surface)", stroke: "var(--sstpa-status-warn)", strokeWidth: 1.2 }}
          />
          <text x={590} y={boxY(i) + 15} textAnchor="middle" style={{ fill: "var(--sstpa-text)", fontSize: 9 }}>
            {trunc(h.label)}
          </text>
        </g>
      ))}
      {hazards.length === 0 && (
        <text x={590} y={midY + 3} textAnchor="middle" style={{ fill: "var(--sstpa-muted)", fontSize: 9 }}>
          no Hazards associated
        </text>
      )}
    </svg>
  );
}

/** Inline StateSequence editor. Edits are STAGED via onStage (committed with
 *  the [:VALID_IN] batch in one transaction, §6.5.8.5a); values are clamped to
 *  non-negative integers (§6.5.8.9). */
function SequenceEditor({
  value,
  stagedValue,
  onStage,
}: {
  value: number | null;
  stagedValue: number | null | undefined;
  onStage: (v: number | null) => void;
}) {
  const effective = stagedValue !== undefined ? stagedValue : value;
  const [text, setText] = useState(effective == null ? "" : String(effective));
  useEffect(() => {
    setText(effective == null ? "" : String(effective));
  }, [effective]);
  return (
    <input
      className="sstpa-input"
      type="number"
      min={0}
      style={{ width: 64, outline: stagedValue !== undefined ? "2px solid var(--sstpa-accent)" : undefined }}
      placeholder="—"
      title={stagedValue !== undefined ? "Staged — commits with the assignment batch" : "StateSequence"}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === "") {
          onStage(null);
          return;
        }
        const parsed = parseInt(text, 10);
        if (Number.isNaN(parsed)) {
          setText(effective == null ? "" : String(effective));
          return;
        }
        onStage(Math.max(0, parsed));
      }}
    />
  );
}

/** Hazard creation and association tools (§6.5.8.8): add an existing SoI
 *  Hazard, create a new one, or clone from Reference Data (AK_Group /
 *  AK_Technique). Note: the §3.4.6.1 authorization table permits (:Hazard)
 *  clones only from AK_Technique / AT_Technique / EMB3D_Vulnerability, so
 *  AK_Group results are shown but not cloneable. */
function HazardTools({
  envHid,
  allHazards,
  associatedHids,
  commit,
  busy,
  notify,
}: {
  envHid: string;
  allHazards: SoINode[];
  associatedHids: Set<string>;
  commit: CommitFn;
  busy: boolean;
  notify: Notify;
}) {
  const [panel, setPanel] = useState<"none" | "existing" | "new" | "reference">("none");
  const [existingPick, setExistingPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [refText, setRefText] = useState("");

  const refSearch = useQuery({
    queryKey: ["context-ref-search", refText],
    queryFn: () => api.referenceSearch({ text: refText, limit: "40" }),
    enabled: panel === "reference" && refText.trim().length >= 2,
  });
  const refResults = (refSearch.data?.results ?? []).filter(
    (r) => r.labels.includes("AK_Group") || r.labels.includes("AK_Technique"),
  );
  const cloneable = (r: ReferenceSearchResult) => r.labels.includes("AK_Technique");

  const unassociated = allHazards.filter((h) => !associatedHids.has(h.hid));

  const addExisting = async () => {
    if (!existingPick) return;
    const res = await commit(
      [{ op: "createRelationship", type: "HAS_HAZARD", sourceHid: envHid, targetHid: existingPick }],
      `Hazard ${existingPick} associated to ${envHid}.`,
    );
    if (res) {
      setExistingPick("");
      setPanel("none");
    }
  };

  const createNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await commit(
      [
        {
          op: "createNode",
          tempId: "haz",
          label: "Hazard",
          properties: { Name: name, ShortDescription: newDesc.trim() },
        },
        { op: "createRelationship", type: "HAS_HAZARD", sourceHid: envHid, targetHid: "$haz" },
      ],
      `Hazard "${name}" created and associated to ${envHid}.`,
    );
    if (res) {
      setNewName("");
      setNewDesc("");
      setPanel("none");
    }
  };

  const cloneFromReference = async (r: ReferenceSearchResult) => {
    // Clone-and-own pattern (§6.5.8.8): create the (:Hazard) + [:HAS_HAZARD]
    // in one commit, then clone shared reference properties + [:REFERENCES].
    const res = await commit([
      {
        op: "createNode",
        tempId: "haz",
        label: "Hazard",
        properties: { Name: r.name, ShortDescription: r.shortDescription ?? "" },
      },
      { op: "createRelationship", type: "HAS_HAZARD", sourceHid: envHid, targetHid: "$haz" },
    ]);
    const hid = res?.createdNodes?.haz;
    if (!hid) return;
    try {
      await api.referenceClone({ coreHid: hid, referenceUuid: r.uuid });
      notify(
        "success",
        `Hazard ${hid} cloned from ${r.externalId} (${r.frameworkName}) and linked via [:REFERENCES] (§3.4.6.2).`,
      );
      setPanel("none");
    } catch (e) {
      notify("error", `Hazard ${hid} was created but the reference clone failed: ${errorText(e)}`);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          className={`icon-button ${panel === "existing" ? "danger" : ""}`}
          onClick={() => setPanel(panel === "existing" ? "none" : "existing")}
        >
          + Add existing Hazard
        </button>
        <button
          className={`icon-button ${panel === "new" ? "danger" : ""}`}
          onClick={() => setPanel(panel === "new" ? "none" : "new")}
        >
          + New Hazard
        </button>
        <button
          className={`icon-button ${panel === "reference" ? "danger" : ""}`}
          title="Clone a Hazard from AK_Group / AK_Technique reference data (§6.5.8.8)"
          onClick={() => setPanel(panel === "reference" ? "none" : "reference")}
        >
          ⎘ Clone from Reference
        </button>
      </div>

      {panel === "existing" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
          <select
            className="sstpa-input"
            style={{ width: "auto" }}
            value={existingPick}
            onChange={(e) => setExistingPick(e.target.value)}
          >
            <option value="">Existing Hazard…</option>
            {unassociated.map((h) => (
              <option key={h.hid} value={h.hid}>
                {h.hid} — {nodeName(h)}
              </option>
            ))}
          </select>
          <button className="icon-button" disabled={!existingPick || busy} onClick={() => void addExisting()}>
            Add
          </button>
          {unassociated.length === 0 && (
            <span style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
              All SoI Hazards are already associated.
            </span>
          )}
        </div>
      )}

      {panel === "new" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="sstpa-input"
            style={{ width: 200 }}
            placeholder="Hazard Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="sstpa-input"
            style={{ width: 280 }}
            placeholder="ShortDescription"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <button className="icon-button" disabled={!newName.trim() || busy} onClick={() => void createNew()}>
            Create
          </button>
        </div>
      )}

      {panel === "reference" && (
        <div style={{ marginTop: 6 }}>
          <input
            className="sstpa-input"
            style={{ width: 320 }}
            placeholder="Search AK_Group / AK_Technique reference data…"
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
          />
          {refSearch.isFetching && (
            <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)", margin: "4px 0" }}>Searching…</p>
          )}
          {refSearch.error != null && (
            <p className="state-error" style={{ fontSize: "0.72rem", margin: "4px 0" }}>
              {errorText(refSearch.error)}
            </p>
          )}
          {refText.trim().length >= 2 && !refSearch.isFetching && refResults.length === 0 && !refSearch.error && (
            <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)", margin: "4px 0" }}>
              No AK_Group / AK_Technique matches.
            </p>
          )}
          {refResults.slice(0, 12).map((r) => (
            <div key={r.uuid} className="prop-row">
              <span>
                <span className="mono" style={{ fontSize: "0.66rem" }}>
                  {r.externalId}
                </span>{" "}
                {r.name}{" "}
                <span style={{ color: "var(--sstpa-muted)", fontSize: "0.7rem" }}>
                  ({r.labels.filter((l) => l.startsWith("AK_")).join(", ")} · {r.frameworkName})
                </span>
              </span>
              <button
                className="icon-button"
                disabled={busy || !cloneable(r)}
                title={
                  cloneable(r)
                    ? "Create a (:Hazard) cloned from this reference node"
                    : "(:Hazard) may not clone from AK_Group (SRS §3.4.6.1 authorization table)"
                }
                onClick={() => void cloneFromReference(r)}
              >
                Clone
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Also Applies to State" (§6.5.8.8): associate an Environment Hazard to a
 *  (:State) via (:State)-[:HAS_HAZARD]->(:Hazard). */
function AlsoAppliesToState({
  hazardHid,
  states,
  commit,
  busy,
}: {
  hazardHid: string;
  states: SoINode[];
  commit: CommitFn;
  busy: boolean;
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
            {nodeName(s)}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        disabled={!target || busy}
        onClick={() => {
          void commit(
            [{ op: "createRelationship", type: "HAS_HAZARD", sourceHid: target, targetHid: hazardHid }],
            `Hazard ${hazardHid} associated to State ${target}.`,
          );
          setOpen(false);
        }}
      >
        OK
      </button>
      <button className="icon-button" onClick={() => setOpen(false)}>
        ✕
      </button>
    </span>
  );
}

/** State-Environment Matrix Mode (§6.5.8.5b): staged [:VALID_IN] toggles and
 *  StateSequence edits, committed together in one transaction. */
function StateEnvMatrix({
  states,
  environments,
  focusHid,
  commit,
  busy,
}: {
  states: SoINode[];
  environments: SoINode[];
  focusHid: string | null;
  commit: CommitFn;
  busy: boolean;
}) {
  const [staged, setStaged] = useState<CommitOperation[]>([]);
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned">("all");

  const sorted = sortByStateSequence(states);
  const envs = [...environments].sort((a, b) => nodeName(a).localeCompare(nodeName(b)));

  const persisted = (s: SoINode, envHid: string) =>
    (s.relationships ?? []).some((r) => r.type === "VALID_IN" && r.targetHID === envHid);
  const stagedOp = (s: SoINode, envHid: string) =>
    staged.find((op) => op.type === "VALID_IN" && op.sourceHid === s.hid && op.targetHid === envHid);
  const effective = (s: SoINode, envHid: string) => {
    const op = stagedOp(s, envHid);
    return op ? op.op === "createRelationship" : persisted(s, envHid);
  };

  const stagedSeq = (s: SoINode): number | null | undefined => {
    const op = staged.find((o) => o.op === "updateNode" && o.hid === s.hid);
    return op ? ((op.properties?.StateSequence ?? null) as number | null) : undefined;
  };
  const stageSequence = (s: SoINode, v: number | null) => {
    setStaged((prev) => {
      const rest = prev.filter((op) => !(op.op === "updateNode" && op.hid === s.hid));
      const current = (s.properties.StateSequence ?? null) as number | null;
      if (v === current) return rest;
      return [...rest, { op: "updateNode", hid: s.hid, properties: { StateSequence: v } }];
    });
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
              disabled={busy}
              onClick={() =>
                void commit(staged, `${staged.length} matrix change(s) committed in one transaction.`).then(
                  (res) => res && setStaged([]),
                )
              }
            >
              {busy ? "Committing…" : `Commit ${staged.length} change(s)`}
            </button>
            <button className="sstpa-button secondary" disabled={busy} onClick={() => setStaged([])}>
              Cancel
            </button>
          </>
        )}
        <button
          className="icon-button"
          style={{ marginLeft: "auto" }}
          title="Export matrix as CSV (§6.5.8.13)"
          onClick={() => {
            const header = ["StateHID", "StateName", "StateSequence", ...envs.map((e) => nodeName(e))];
            const rows = sorted.map((s) => {
              const seq = stagedSeq(s);
              const eff = seq !== undefined ? seq : ((s.properties.StateSequence ?? null) as number | null);
              return [
                s.hid,
                nodeName(s),
                eff == null ? "" : String(eff),
                ...envs.map((e) => (effective(s, e.hid) ? "X" : "")),
              ];
            });
            const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
            downloadText("sstpa-state-environment-matrix.csv", csv, "text/csv");
          }}
        >
          CSV
        </button>
      </div>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--sstpa-text)", textAlign: "left" }}>
            <th style={{ padding: "4px 8px" }}>State</th>
            <th>Seq</th>
            {envs.map((e) => (
              <th key={e.hid} style={{ padding: "4px 8px", fontSize: "0.7rem" }}>
                {nodeName(e)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <tr
              key={s.hid}
              style={{
                borderBottom: "1px solid var(--sstpa-line-soft)",
                background: focusHid === s.hid ? "var(--sstpa-inset)" : undefined,
              }}
            >
              <td style={{ padding: "3px 8px" }}>
                <span className="mono" style={{ fontSize: "0.66rem" }}>
                  {s.hid}
                </span>{" "}
                {nodeName(s)}
              </td>
              <td>
                <SequenceEditor
                  value={(s.properties.StateSequence ?? null) as number | null}
                  stagedValue={stagedSeq(s)}
                  onStage={(v) => stageSequence(s, v)}
                />
              </td>
              {envs.map((e) => {
                const op = stagedOp(s, e.hid);
                return (
                  <td key={e.hid} style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={effective(s, e.hid)}
                      style={op ? { outline: "2px solid var(--sstpa-accent)" } : undefined}
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
  focusHid,
  commit,
  busy,
}: {
  assets: SoINode[];
  environments: SoINode[];
  byHid: Map<string, SoINode>;
  focusHid: string | null;
  commit: CommitFn;
  busy: boolean;
}) {
  const openTool = useToolWindows((s) => s.openTool);
  const [filter, setFilter] = useState<"all" | "unassigned" | "assigned" | "invalidated">("all");
  // Asset context (AST/DA drawer or focus) filters to that Asset (§6.5.8.3).
  const [assetFilter, setAssetFilter] = useState<string>(
    focusHid && (focusHid.startsWith("AST_") || focusHid.startsWith("DA_")) ? focusHid : "",
  );
  const [envFilter, setEnvFilter] = useState<string>("");
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

  const executeGeneration = async () => {
    if (!genPlan || genPlan.tuples.length === 0) {
      setGenPlan(null);
      return;
    }
    // Name uniqueness within the SoI: append a counter suffix on collision
    // (§6.5.8.9), also de-duplicating within this generation batch.
    const usedNames = new Set<string>();
    for (const n of byHid.values()) {
      if (n.typeName === "Loss") usedNames.add(String(n.properties.Name ?? ""));
    }
    const uniqueName = (base: string) => {
      if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
      }
      let i = 2;
      while (usedNames.has(`${base} (${i})`)) i++;
      const name = `${base} (${i})`;
      usedNames.add(name);
      return name;
    };

    const ops: CommitOperation[] = [];
    let i = 0;
    for (const t of genPlan.tuples) {
      const aName = nodeName(t.asset);
      const eName = nodeName(t.env);
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
        Name: uniqueName(`Compromise ${aName} ${t.c} ${t.s} in ${eName}`),
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
    const created = genPlan.tuples.filter((t) => !t.existingLoss).length;
    const allocated = genPlan.tuples.length - created;
    const res = await commit(
      ops,
      `Auto-generation complete: ${created} new Loss/Goal pair(s) created, ${allocated} existing Loss node(s) allocated (§6.5.8.6).`,
    );
    if (res) setGenPlan(null);
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.78rem" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <select className="sstpa-input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All Loss nodes</option>
          <option value="unassigned">Only unassigned</option>
          <option value="assigned">Only assigned</option>
          <option value="invalidated">Only INVALIDATED</option>
        </select>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          title="Filter by Asset (§6.5.8.5c)"
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.target.value)}
        >
          <option value="">All Assets</option>
          {assets.map((a) => (
            <option key={a.hid} value={a.hid}>
              {a.hid} — {nodeName(a)}
            </option>
          ))}
        </select>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          title="Filter by Environment (§6.5.8.5c)"
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
        >
          <option value="">All Environments</option>
          {environments.map((e) => (
            <option key={e.hid} value={e.hid}>
              {nodeName(e)}
            </option>
          ))}
        </select>
        <button className="sstpa-button" onClick={computeMissing}>
          Generate Missing…
        </button>
        <button
          className="icon-button"
          style={{ marginLeft: "auto" }}
          title="Loss Allocation Summary CSV (§6.5.8.13)"
          onClick={() => {
            const rows = [
              ["LossHID", "AssetHID", "Criticality", "Assurance", "Environment", "AttackTreeStatus", "PathCount"],
            ];
            for (const a of assets) {
              for (const l of lossesByAsset.get(a.hid) ?? []) {
                rows.push([
                  l.hid,
                  a.hid,
                  singleTrue(l, CRITICALITIES),
                  singleTrue(l, ASSURANCES),
                  lossEnv(l) ?? "Unassigned",
                  String(l.properties.AttackTreeStatus ?? "NOT_BUILT"),
                  l.properties.PathCount == null ? "" : String(l.properties.PathCount),
                ]);
              }
            }
            const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
            downloadText("sstpa-loss-allocation.csv", csv, "text/csv");
          }}
        >
          CSV
        </button>
      </div>

      {assets.map((a) => {
        if (assetFilter && a.hid !== assetFilter) return null;
        const aLosses = (lossesByAsset.get(a.hid) ?? []).filter((l) => {
          const env = lossEnv(l);
          if (envFilter && env !== envFilter) return false;
          if (filter === "unassigned") return !env;
          if (filter === "assigned") return !!env;
          if (filter === "invalidated") return l.properties.AttackTreeStatus === "INVALIDATED";
          return true;
        });
        if (aLosses.length === 0 && (filter !== "all" || envFilter)) return null;
        const assigned = (lossesByAsset.get(a.hid) ?? []).filter((l) => lossEnv(l)).length;
        const total = (lossesByAsset.get(a.hid) ?? []).length;
        const critFlags = trueFlags(a, CRITICALITIES).map((c) => c.replace("Critical", ""));
        const assurFlags = trueFlags(a, ASSURANCES);
        return (
          <details key={a.hid} open style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {nodeName(a)}{" "}
              <span className="mono" style={{ fontSize: "0.66rem" }}>
                {a.hid}
              </span>{" "}
              <span className="type-badge" style={{ background: "var(--sstpa-text)" }}>
                C: {critFlags.join("/") || "—"}
              </span>{" "}
              <span className="type-badge" style={{ background: "var(--sstpa-muted)" }}>
                A: {assurFlags.join("/") || "—"}
              </span>{" "}
              <span style={{ color: "var(--sstpa-muted)" }}>
                — {total} losses / {assigned} assigned / {total - assigned} unassigned
              </span>{" "}
              <button
                className="icon-button"
                title="Open the Asset Manager Tool for this Asset (§6.5.8.1)"
                onClick={(ev) => {
                  ev.preventDefault();
                  openTool("sstpa.assets", { focusHid: a.hid, focusType: a.typeName });
                }}
              >
                Asset Manager
              </button>
            </summary>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--sstpa-line)", fontSize: "0.7rem" }}>
                  <th style={{ padding: "2px 6px" }}>Loss HID</th>
                  <th>Criticality</th>
                  <th>Assurance</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Valid</th>
                  <th>Paths</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {aLosses.map((l) => {
                  const env = lossEnv(l);
                  const status = String(l.properties.AttackTreeStatus ?? "NOT_BUILT");
                  return (
                    <tr
                      key={l.hid}
                      style={{
                        borderBottom: "1px solid var(--sstpa-line-soft)",
                        background: focusHid === l.hid ? "var(--sstpa-inset)" : undefined,
                      }}
                    >
                      <td className="mono" style={{ fontSize: "0.66rem", padding: "3px 6px" }}>
                        {l.hid}
                      </td>
                      <td>{singleTrue(l, CRITICALITIES).replace("Critical", "")}</td>
                      <td>{singleTrue(l, ASSURANCES)}</td>
                      <td>
                        {env ? (
                          <span className="state-ok">{nodeName(byHid.get(env))}</span>
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
                      <td>{l.properties.PathCount == null ? "—" : String(l.properties.PathCount)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {!env ? (
                          <EnvPicker
                            environments={environments}
                            busy={busy}
                            onPick={(envHid) =>
                              void commit(
                                [{ op: "createRelationship", type: "HAS_ENVIRONMENT", sourceHid: l.hid, targetHid: envHid }],
                                `Loss ${l.hid} allocated to ${envHid}.`,
                              )
                            }
                          />
                        ) : (
                          <button
                            className="icon-button danger"
                            title="Remove Environment assignment"
                            disabled={busy}
                            onClick={() =>
                              void commit(
                                [{ op: "deleteRelationship", type: "HAS_ENVIRONMENT", sourceHid: l.hid, targetHid: env }],
                                `Loss ${l.hid} de-allocated from ${env}.`,
                              )
                            }
                          >
                            De-allocate
                          </button>
                        )}
                        <button
                          className="icon-button"
                          title="Open the Loss Tool focused on this Loss (§6.5.8.1)"
                          onClick={() => openTool("sstpa.loss", { focusHid: l.hid, focusType: "Loss" })}
                        >
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
          confirmLabel={busy ? "Generating…" : `Generate (${genPlan.tuples.length})`}
          confirmDisabled={busy || genPlan.tuples.length === 0}
          onCancel={() => {
            if (!busy) setGenPlan(null);
          }}
          onConfirm={() => void executeGeneration()}
        >
          <p>
            {genPlan.tuples.filter((t) => !t.existingLoss).length} new (:Loss) node(s) +{" "}
            {genPlan.tuples.filter((t) => !t.existingLoss).length} new (:GsnGoal) node(s);{" "}
            {genPlan.tuples.filter((t) => t.existingLoss).length} existing Loss node(s) will be
            allocated to Environments (SRS §6.5.8.6).
          </p>
          {busy && (
            <p className="state-info">Generating Loss and Goal nodes — please wait (progress, §6.5.8.12)…</p>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--sstpa-text)" }}>
                <th>Asset</th>
                <th>Criticality</th>
                <th>Assurance</th>
                <th>Environment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {genPlan.tuples.slice(0, 30).map((t) => (
                <tr key={`${t.asset.hid}|${t.c}|${t.s}|${t.env.hid}`}>
                  <td>{nodeName(t.asset)}</td>
                  <td>{t.c}</td>
                  <td>{t.s}</td>
                  <td>{nodeName(t.env)}</td>
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
  busy,
  onPick,
}: {
  environments: SoINode[];
  busy: boolean;
  onPick: (envHid: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <select className="sstpa-input" style={{ width: "auto" }} value={val} onChange={(e) => setVal(e.target.value)}>
        <option value="">Assign Environment…</option>
        {environments.map((e) => (
          <option key={e.hid} value={e.hid}>
            {nodeName(e)}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        disabled={!val || busy}
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
