// Loss Tool (SRS §6.5.10): Attack Tree construction, trace-coverage review,
// path/RV analysis, edge tailoring, metric definition and leaf-value editing,
// snapshot-reconciliation findings, and certification exports.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  AttackTreeEdge,
  AttackTreeNode,
  CommitOperation,
  LossPathResult,
  LossTreeResponse,
  SoINode,
} from "../../api/types";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { ToolStatus, downloadText, errorText, usePrompt } from "../shared";

const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;
const ENTITY_TYPES = ["Interface", "SystemFunction", "Component"];
const ATTACK_LEVELS = ["STRATEGY", "TACTIC", "PROCEDURE"] as const;

/** [:AT_RELATES_TO] properties accepted by the Backend schema (§3.3.4.11).
 *  Edge recreation must not echo the auto-build's internal merge keys
 *  (targetKind/entityKey/attackKey/cmKey/counterKey) — castRelProps rejects
 *  properties outside this table. */
const EDGE_PROP_KEYS = [
  "LossHID", "Lossuuid", "LogicOperator", "SANDSequence", "TailoredOut",
  "TailorReason", "CompleteBlock", "CompleteBlockReason", "AllowedRV",
  "AllowedRVReason", "MetricCacheJSON",
] as const;

const PAGE_SIZE = 100;

const STATUS_COLOR: Record<string, string> = {
  NOT_BUILT: "var(--sstpa-node-muted)",
  AUTO_GENERATED: "var(--sstpa-status-info)",
  ANALYST_REFINED: "var(--sstpa-status-ok)",
  BASELINED: "var(--sstpa-accent)",
  EXPORTED: "#6d5a8e",
  INVALIDATED: "var(--sstpa-status-error)",
};

type Mode = "coverage" | "tree" | "paths" | "metrics";

interface MetricDef {
  MetricName: string;
  MetricDirection: "MINIMIZE" | "MAXIMIZE";
  LeafDefault: number;
  ANDFormula: "SUM" | "PRODUCT" | "MIN" | "MAX";
  ORFormula: "SUM" | "PRODUCT" | "MIN" | "MAX";
  SANDFormula: "SUM" | "PRODUCT" | "MIN" | "MAX";
  AcceptanceThreshold: number;
  ThresholdDirection: "ABOVE" | "BELOW";
  Description?: string;
}

/** One §6.5.10.12 reconciliation finding from the tree endpoint. */
interface LossFinding {
  severity: "ERROR" | "WARNING" | "INFO" | string;
  type: string;
  nodeHid?: string;
  message: string;
}

type TreeData = LossTreeResponse & { validationFindings?: LossFinding[] | null };

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

type Ask = (title: string, onSubmit: (value: string) => void, opts?: { placeholder?: string; initial?: string }) => void;

export default function LossTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const openTool = useToolWindows((s) => s.openTool);
  const prompt = usePrompt();
  const [mode, setMode] = useState<Mode>("tree");
  const [selectedLoss, setSelectedLoss] = useState("");
  const [selectedNodeHid, setSelectedNodeHid] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pathOffset, setPathOffset] = useState(0);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const losses = useMemo(() => nodes.filter((n) => n.typeName === "Loss"), [nodes]);
  const assets = useMemo(
    () => nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset"),
    [nodes],
  );

  const contextHid = ctx.focusHid ?? ctx.drawerNodeHid;
  const firstContextLoss = useMemo(() => {
    if (contextHid?.startsWith("LOS_")) return contextHid;
    if (contextHid?.startsWith("AST_") || contextHid?.startsWith("DA_")) {
      const asset = byHid.get(contextHid);
      const rel = asset?.relationships?.find((r) => r.type === "HAS_LOSS");
      if (rel) return rel.targetHID;
    }
    const needsWork = losses.find((l) =>
      ["NOT_BUILT", "INVALIDATED"].includes(String(l.properties.AttackTreeStatus ?? "NOT_BUILT")),
    );
    return needsWork?.hid ?? losses[0]?.hid ?? "";
  }, [byHid, contextHid, losses]);

  useEffect(() => {
    if (!selectedLoss && firstContextLoss) {
      setSelectedLoss(firstContextLoss);
    }
  }, [firstContextLoss, selectedLoss]);

  useEffect(() => setPathOffset(0), [selectedLoss]);

  const lossNode = selectedLoss ? byHid.get(selectedLoss) : undefined;
  const tree = useQuery({
    queryKey: ["loss-tree", selectedLoss],
    queryFn: () => api.lossTree(selectedLoss),
    enabled: !!selectedLoss,
  });
  const paths = useQuery({
    queryKey: ["loss-paths", selectedLoss, pathOffset],
    queryFn: () =>
      api.lossPaths(selectedLoss, { limit: String(PAGE_SIZE), offset: String(pathOffset) }),
    enabled: !!selectedLoss,
  });

  const refreshLoss = () => {
    void qc.invalidateQueries({ queryKey: ["soi"] });
    void qc.invalidateQueries({ queryKey: ["loss-tree", selectedLoss] });
    void qc.invalidateQueries({ queryKey: ["loss-paths", selectedLoss] });
  };

  const buildTree = useMutation({
    mutationFn: (rebuild: boolean) => api.lossAutoBuild(selectedLoss, rebuild),
    onSuccess: () => {
      setNotice({ kind: "success", text: "Attack Tree build committed." });
      refreshLoss();
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.loss", operations: ops }),
    onSuccess: () => {
      setNotice({ kind: "success", text: "Loss Tool changes committed." });
      refreshLoss();
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  const treeData = tree.data as TreeData | undefined;
  const treeNodes = useMemo(() => treeData?.nodes ?? [], [treeData]);
  const treeEdges = useMemo(() => treeData?.edges ?? [], [treeData]);
  const findings = useMemo(() => treeData?.validationFindings ?? [], [treeData]);
  const treeNodeMap = useMemo(() => new Map(treeNodes.map((n) => [n.hid, n])), [treeNodes]);
  const selectedTreeNode = selectedNodeHid ? treeNodeMap.get(selectedNodeHid) : undefined;
  const selectedEdge = selectedEdgeKey ? treeEdges.find((e) => edgeKey(e) === selectedEdgeKey) : undefined;
  const lossProps: Record<string, unknown> = treeData?.loss ?? lossNode?.properties ?? {};
  const metricDefs = parseMetricDefs(lossProps.MetricDefinitionsJSON);

  const lossStatus = String(lossProps.AttackTreeStatus ?? "NOT_BUILT");
  const treeValidity = validity(lossProps, findings);
  const pathRows = paths.data?.paths ?? [];
  const pathTotal = paths.data?.total ?? 0;

  const assetHid = String(treeData?.asset?.HID ?? "");
  const envHid = String(treeData?.environment?.HID ?? "");
  const goalHid = assetHid
    ? byHid.get(assetHid)?.relationships?.find((r) => r.type === "HAS_GOAL")?.targetHID
    : undefined;

  const notify = (kind: "success" | "error" | "info", text: string) => setNotice({ kind, text });

  const copyHid = (hid: string) => {
    void navigator.clipboard.writeText(hid).then(
      () => notify("info", `${hid} copied to clipboard.`),
      () => notify("error", "Clipboard copy failed."),
    );
  };

  const exportTreeJson = () => {
    const parse = (v: unknown): unknown => {
      if (typeof v !== "string" || !v.trim()) return null;
      try {
        return JSON.parse(v) as unknown;
      } catch {
        return v;
      }
    };
    downloadText(
      `sstpa-${selectedLoss}-attack-tree.json`,
      JSON.stringify(
        {
          lossHid: selectedLoss,
          attackTreeVersion: lossProps.AttackTreeVersion ?? null,
          attackTreeStatus: lossStatus,
          attackTreeJSON: parse(lossProps.AttackTreeJSON),
          metricDefinitionsJSON: parse(lossProps.MetricDefinitionsJSON),
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  if (!ctx.soiHid) return <ToolStatus needsSoI />;

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      {/* Top bar row 1 — Loss identity, status, validity, mode tabs (§6.5.10.2). */}
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
        <select
          className="sstpa-input"
          style={{ width: 240 }}
          value={selectedLoss}
          onChange={(e) => {
            setSelectedLoss(e.target.value);
            setSelectedNodeHid(null);
            setSelectedEdgeKey(null);
          }}
        >
          <option value="">Select Loss</option>
          {losses.map((l) => (
            <option key={l.hid} value={l.hid}>
              {l.hid} - {String(l.properties.Name ?? "Loss")}
            </option>
          ))}
        </select>
        {selectedLoss && (
          <button className="icon-button" title="Copy Loss HID" onClick={() => copyHid(selectedLoss)}>
            <span className="mono" style={{ fontSize: "0.7rem" }}>{selectedLoss}</span> copy
          </button>
        )}
        <span className="type-badge" style={{ background: STATUS_COLOR[lossStatus] ?? "var(--sstpa-node-muted)" }}>
          {lossStatus}
        </span>
        <span className="type-badge" style={{ background: treeValidity.color }} title="Tree Validity">
          {treeValidity.label}
        </span>
        <span style={{ fontSize: "0.74rem" }}>
          {lossProps.PathCount != null ? `${String(lossProps.PathCount)} paths` : "-- paths"}
        </span>
        <span className="mono" style={{ fontSize: "0.72rem" }}>
          v{String(lossProps.AttackTreeVersion ?? 0)}
        </span>
        <span style={{ flex: 1 }} />
        <button className={`sstpa-button ${mode === "coverage" ? "" : "secondary"}`} onClick={() => setMode("coverage")}>
          Trace Coverage
        </button>
        <button className={`sstpa-button ${mode === "tree" ? "" : "secondary"}`} onClick={() => setMode("tree")}>
          Tree Construction
        </button>
        <button className={`sstpa-button ${mode === "paths" ? "" : "secondary"}`} onClick={() => setMode("paths")}>
          Path Analysis
        </button>
        <button className={`sstpa-button ${mode === "metrics" ? "" : "secondary"}`} onClick={() => setMode("metrics")}>
          Metrics
        </button>
      </div>
      {/* Top bar row 2 — toolbar actions and cross-tool launches (§6.5.10.2). */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "4px var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
          flexWrap: "wrap",
        }}
      >
        <button className="sstpa-button" disabled={!selectedLoss || buildTree.isPending} onClick={() => buildTree.mutate(false)}>
          Auto-build
        </button>
        <button className="sstpa-button secondary" disabled={!selectedLoss || buildTree.isPending} onClick={() => buildTree.mutate(true)}>
          Rebuild Tree
        </button>
        <button
          className="sstpa-button secondary"
          disabled={!selectedLoss}
          onClick={() => {
            void tree.refetch();
            notify("info", "Validation re-run: findings refreshed from Backend reconciliation.");
          }}
        >
          Validate
        </button>
        <button className="sstpa-button secondary" disabled={!selectedLoss} onClick={exportTreeJson}>
          Export Tree JSON
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>Launch:</span>
        <button className="icon-button" onClick={() => openTool("sstpa.trace", assetHid ? { focusHid: assetHid, focusType: "Asset" } : undefined)}>
          Trace
        </button>
        <button
          className="icon-button"
          onClick={() =>
            openTool(
              "sstpa.attack",
              selectedTreeNode?.typeName === "Attack"
                ? { focusHid: selectedTreeNode.hid, focusType: "Attack" }
                : undefined,
            )
          }
        >
          Attack
        </button>
        <button className="icon-button" onClick={() => openTool("sstpa.context", envHid ? { focusHid: envHid, focusType: "Environment" } : undefined)}>
          Context
        </button>
        <button className="icon-button" onClick={() => openTool("sstpa.goalkeeper", goalHid ? { focusHid: goalHid, focusType: "GsnGoal" } : undefined)}>
          Goal Keeper
        </button>
      </div>

      {notice && (
        <div
          className={
            notice.kind === "success"
              ? "sstpa-alert-success"
              : notice.kind === "error"
                ? "sstpa-alert-error"
                : "sstpa-alert-warning"
          }
          style={{ margin: "6px 12px" }}
        >
          {notice.text}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            x
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LossRoster
          losses={losses}
          assets={assets}
          byHid={byHid}
          selectedLoss={selectedLoss}
          onSelect={setSelectedLoss}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          drawerOpen={drawerOpen}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <LossSummary treeNodes={treeNodes} treeEdges={treeEdges} tree={treeData} loss={lossNode} paths={pathTotal || undefined} />

          {findings.length > 0 && (
            <FindingsPanel
              findings={findings}
              onSelectNode={(hid) => {
                setSelectedNodeHid(hid);
                setSelectedEdgeKey(null);
                setMode("tree");
              }}
              onRebuild={() => buildTree.mutate(true)}
            />
          )}

          {soi.isLoading || soi.error ? (
            <ToolStatus loading={soi.isLoading} error={soi.error} onRetry={() => void soi.refetch()} />
          ) : tree.error ? (
            <ToolStatus error={tree.error} onRetry={() => void tree.refetch()} />
          ) : (
            <>
              {mode === "coverage" && (
                <CoverageView tree={treeData} loading={tree.isLoading} onBuild={() => buildTree.mutate(false)} disabled={!selectedLoss} />
              )}
              {mode === "tree" && (
                <TreeView
                  loading={tree.isLoading}
                  nodes={treeNodes}
                  edges={treeEdges}
                  selectedNodeHid={selectedNodeHid}
                  selectedEdgeKey={selectedEdgeKey}
                  onSelectNode={(hid) => {
                    setSelectedNodeHid(hid);
                    setSelectedEdgeKey(null);
                  }}
                  onSelectEdge={(edge) => {
                    setSelectedEdgeKey(edgeKey(edge));
                    setSelectedNodeHid(null);
                  }}
                />
              )}
              {mode === "paths" && (
                <PathAnalysis
                  paths={pathRows}
                  total={pathTotal}
                  offset={pathOffset}
                  onOffset={setPathOffset}
                  loading={paths.isLoading}
                  error={paths.error}
                  metricDefs={metricDefs}
                  selectedLoss={selectedLoss}
                  lossProps={lossProps}
                  treeEdges={treeEdges}
                />
              )}
              {mode === "metrics" && (
                <MetricEditor
                  selectedLoss={selectedLoss}
                  defs={metricDefs}
                  onSave={(defs) =>
                    // §6.5.10.8: saving metric definitions stages
                    // MetricDefinitionsJSON only — it must NOT invalidate the
                    // tree (metrics are recomputed from definitions on read).
                    commit.mutate([
                      {
                        op: "updateNode",
                        hid: selectedLoss,
                        properties: { MetricDefinitionsJSON: JSON.stringify(defs) },
                      },
                    ])
                  }
                />
              )}
            </>
          )}

          <MetricSummaryBar metricDefs={metricDefs} paths={pathRows} />
        </div>

        <DetailPanel
          key={selectedNodeHid ?? selectedEdgeKey ?? "none"}
          node={selectedTreeNode}
          edge={selectedEdge}
          nodes={treeNodeMap}
          edges={treeEdges}
          lossHid={selectedLoss}
          metricDefs={metricDefs}
          soiNodes={nodes}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onCommit={(ops) => commit.mutate(ops)}
          onSelectEdge={(edge) => {
            setSelectedEdgeKey(edgeKey(edge));
            setSelectedNodeHid(null);
          }}
          onCopyHid={copyHid}
          ask={prompt.ask}
          notify={notify}
        />
      </div>
      {prompt.element}
    </div>
  );
}

function LossRoster({
  losses,
  assets,
  byHid,
  selectedLoss,
  onSelect,
  onOpenDrawer,
  drawerOpen,
}: {
  losses: SoINode[];
  assets: SoINode[];
  byHid: Map<string, SoINode>;
  selectedLoss: string;
  onSelect: (hid: string) => void;
  onOpenDrawer: (hid: string) => void;
  drawerOpen: boolean;
}) {
  const assetForLoss = (lossHid: string) =>
    assets.find((a) => (a.relationships ?? []).some((r) => r.type === "HAS_LOSS" && r.targetHID === lossHid));
  return (
    <div style={{ width: 280, borderRight: "var(--sstpa-border)", overflow: "auto" }}>
      {losses.map((l) => {
        const asset = assetForLoss(l.hid);
        const env = (l.relationships ?? []).find((r) => r.type === "HAS_ENVIRONMENT")?.targetHID;
        const status = String(l.properties.AttackTreeStatus ?? "NOT_BUILT");
        return (
          <button
            key={l.hid}
            className="entity-card"
            style={{
              width: "calc(100% - 12px)",
              margin: 6,
              textAlign: "left",
              borderColor: selectedLoss === l.hid ? "var(--sstpa-accent)" : undefined,
              cursor: "pointer",
            }}
            onClick={() => onSelect(l.hid)}
          >
            <div className="entity-card-header" style={{ alignItems: "flex-start" }}>
              <span className="entity-hid">{l.hid}</span>
              <span className="type-badge" style={{ background: STATUS_COLOR[status] ?? "var(--sstpa-node-muted)" }}>
                {status}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.82rem", marginTop: 4 }}>{String(l.properties.Name ?? "")}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
              {String(asset?.properties.Name ?? "No Asset")} / {env ? String(byHid.get(env)?.properties.Name ?? env) : "No Environment"}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: "0.68rem" }}>
                {singleTrueProps(l.properties, CRITICALITIES).replace("Critical", "")} / {singleTrueProps(l.properties, ASSURANCES)}
              </span>
              <span style={{ flex: 1 }} />
              <button
                className="icon-button"
                disabled={drawerOpen}
                title="Edit Loss in Data Drawer"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDrawer(l.hid);
                }}
              >
                edit
              </button>
            </div>
          </button>
        );
      })}
      {losses.length === 0 && (
        <p style={{ padding: 12, color: "var(--sstpa-muted)" }}>No Loss nodes in this SoI.</p>
      )}
    </div>
  );
}

function LossSummary({
  treeNodes,
  treeEdges,
  tree,
  loss,
  paths,
}: {
  treeNodes: AttackTreeNode[];
  treeEdges: AttackTreeEdge[];
  tree?: TreeData;
  loss?: SoINode;
  paths?: number;
}) {
  const lossProps = tree?.loss ?? loss?.properties ?? {};
  const assetLabel = tree?.asset ? `${String(tree.asset.HID ?? "")} ${String(tree.asset.Name ?? "")}` : "—";
  const envLabel = tree?.environment ? `${String(tree.environment.HID ?? "")} ${String(tree.environment.Name ?? "")}` : "—";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 8,
        padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
        borderBottom: "var(--sstpa-border-soft)",
        fontSize: "0.75rem",
      }}
    >
      <SummaryCell label="Asset" value={assetLabel} />
      <SummaryCell label="Environment" value={envLabel} />
      <SummaryCell
        label="Criticality / Assurance"
        value={`${singleTrueProps(lossProps, CRITICALITIES)} / ${singleTrueProps(lossProps, ASSURANCES)}`}
      />
      <SummaryCell label="Coverage" value={`${tree?.statesCovered ?? 0}/${tree?.statesTotal ?? 0} states`} />
      <SummaryCell label="Tree" value={`${treeNodes.length} nodes / ${treeEdges.length} edges`} />
      <SummaryCell
        label="Paths / RV"
        value={`${String(paths ?? lossProps.PathCount ?? "—")} / ${lossProps.TreeHasRVs === true ? "RVs present" : "none recorded"}`}
      />
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--sstpa-muted)", fontSize: "0.66rem" }}>{label}</div>
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>
        {value}
      </div>
    </div>
  );
}

/** Validation Findings panel (§6.5.10.2): severity rows with clickable HIDs. */
function FindingsPanel({
  findings,
  onSelectNode,
  onRebuild,
}: {
  findings: LossFinding[];
  onSelectNode: (hid: string) => void;
  onRebuild: () => void;
}) {
  const errors = findings.filter((f) => f.severity === "ERROR").length;
  const warnings = findings.filter((f) => f.severity === "WARNING").length;
  const infos = findings.length - errors - warnings;
  const [collapsed, setCollapsed] = useState(errors === 0);
  return (
    <div style={{ margin: "6px 12px 0", border: "var(--sstpa-border-soft)", borderRadius: 4 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 8px", fontSize: "0.76rem" }}>
        <strong>Validation findings:</strong>
        <span className={errors > 0 ? "state-warn" : "state-ok"}>{errors} errors</span>
        <span>{warnings} warnings</span>
        <span>{infos} info</span>
        {errors > 0 && <span style={{ color: "var(--sstpa-muted)" }}>tree may be stale</span>}
        <span style={{ flex: 1 }} />
        {errors > 0 && (
          <button className="sstpa-button secondary" style={{ padding: "2px 10px" }} onClick={onRebuild}>
            Rebuild Tree
          </button>
        )}
        <button className="icon-button" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? "expand" : "collapse"}
        </button>
      </div>
      {!collapsed &&
        findings.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "3px 8px",
              borderTop: "1px solid var(--sstpa-line-soft)",
              fontSize: "0.72rem",
            }}
          >
            <span className="type-badge" style={{ background: severityColor(f.severity) }}>{f.severity}</span>
            <span className="mono" style={{ fontSize: "0.64rem", color: "var(--sstpa-muted)" }}>{f.type}</span>
            {f.nodeHid && (
              <button className="icon-button" onClick={() => onSelectNode(f.nodeHid!)}>
                {f.nodeHid}
              </button>
            )}
            <span>{f.message}</span>
          </div>
        ))}
    </div>
  );
}

function severityColor(severity: string): string {
  if (severity === "ERROR") return "var(--sstpa-status-error)";
  if (severity === "WARNING") return "var(--sstpa-status-warn)";
  return "var(--sstpa-status-info)";
}

function CoverageView({
  tree,
  loading,
  onBuild,
  disabled,
}: {
  tree?: { traceCoverage: Record<string, unknown>[] | null; statesCovered: number; statesTotal: number };
  loading: boolean;
  onBuild: () => void;
  disabled: boolean;
}) {
  const coverage = tree?.traceCoverage ?? [];
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {loading && <ToolStatus loading />}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>{tree?.statesCovered ?? 0}</strong>
        <span>of</span>
        <strong>{tree?.statesTotal ?? 0}</strong>
        <span>Environment states have CURRENT trace coverage.</span>
        <span style={{ flex: 1 }} />
        <button className="sstpa-button" disabled={disabled} onClick={onBuild}>
          Auto-build
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 6px" }}>State</th>
            <th>Name</th>
            <th>Sequence</th>
            <th>Traced entities</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((row) => {
            const traced = Number(row.tracedEntities ?? 0);
            return (
              <tr key={String(row.stateHid)} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>
                  {String(row.stateHid)}
                </td>
                <td>{String(row.stateName ?? "")}</td>
                <td>{String(row.seq ?? "—")}</td>
                <td>
                  <span className={traced > 0 ? "state-ok" : "state-warn"}>{traced}</span>
                </td>
              </tr>
            );
          })}
          {!loading && coverage.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 14, color: "var(--sstpa-muted)" }}>
                No coverage rows returned for this Loss.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TreeView({
  loading,
  nodes,
  edges,
  selectedNodeHid,
  selectedEdgeKey,
  onSelectNode,
  onSelectEdge,
}: {
  loading: boolean;
  nodes: AttackTreeNode[];
  edges: AttackTreeEdge[];
  selectedNodeHid: string | null;
  selectedEdgeKey: string | null;
  onSelectNode: (hid: string) => void;
  onSelectEdge: (edge: AttackTreeEdge) => void;
}) {
  const tiers = useMemo(() => {
    const grouped = new Map<number, AttackTreeNode[]>();
    for (const n of nodes) {
      const tier = Number.isFinite(n.tier) ? n.tier : 0;
      grouped.set(tier, [...(grouped.get(tier) ?? []), n]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tier, group]) => [tier, group.sort((a, b) => a.hid.localeCompare(b.hid))] as const);
  }, [nodes]);

  const leafSet = useMemo(() => {
    const sources = new Set(edges.map((e) => e.sourceHid));
    return new Set(nodes.filter((n) => !sources.has(n.hid)).map((n) => n.hid));
  }, [nodes, edges]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
        {loading && <ToolStatus loading />}
        {!loading && nodes.length === 0 && <p style={{ color: "var(--sstpa-muted)" }}>No Attack Tree nodes returned.</p>}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: "max-content" }}>
          {tiers.map(([tier, group]) => (
            <div key={tier} style={{ width: 190 }}>
              <div
                style={{
                  fontFamily: "var(--sstpa-font-mono)",
                  color: "var(--sstpa-muted)",
                  fontSize: "0.72rem",
                  marginBottom: 6,
                }}
              >
                T{tier}
              </div>
              {group.map((n) => {
                const incoming = edges.filter((e) => e.targetHid === n.hid);
                const isRvLeaf = n.typeName === "Attack" && leafSet.has(n.hid);
                const allowed = incoming.some((e) => e.props?.AllowedRV === true);
                return (
                  <button
                    key={n.hid}
                    className="entity-card"
                    style={{
                      width: "100%",
                      marginBottom: 8,
                      textAlign: "left",
                      cursor: "pointer",
                      background: selectedNodeHid === n.hid ? "var(--sstpa-inset)" : undefined,
                      borderColor:
                        selectedNodeHid === n.hid
                          ? "var(--sstpa-accent)"
                          : isRvLeaf
                            ? allowed
                              ? "var(--sstpa-status-warn)"
                              : "var(--sstpa-status-error)"
                            : undefined,
                      opacity: incoming.length > 0 && incoming.every((e) => e.tailoredOut) ? 0.55 : 1,
                    }}
                    onClick={() => onSelectNode(n.hid)}
                  >
                    <div className="entity-card-header">
                      <span className="entity-hid">{n.hid}</span>
                      <span className="type-badge" style={{ background: colorForType(n.typeName) }}>{n.typeName}</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, marginTop: 4 }}>{n.name || n.hid}</div>
                    {isRvLeaf && (
                      <div style={{ fontSize: "0.64rem", marginTop: 2 }} className={allowed ? "state-warn" : "state-error"}>
                        {allowed ? "Allowed RV" : "Unaddressed RV"}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: 160, overflow: "auto", borderTop: "var(--sstpa-border-soft)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
          <tbody>
            {edges.map((e) => (
              <tr
                key={edgeKey(e)}
                onClick={() => onSelectEdge(e)}
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid var(--sstpa-line-soft)",
                  background: selectedEdgeKey === edgeKey(e) ? "var(--sstpa-inset)" : undefined,
                  opacity: e.tailoredOut ? 0.55 : 1,
                }}
              >
                <td className="mono" style={{ padding: "3px 6px" }}>
                  {e.sourceHid}
                </td>
                <td>{e.logicOperator}{e.sandSequence != null ? ` #${e.sandSequence}` : ""}</td>
                <td className="mono">{e.targetHid}</td>
                <td>{e.tailoredOut ? "Tailored Out" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RV_RANK: Record<string, number> = { RV: 0, ALLOWED_RV: 1, BLOCKED: 2, DERIVED: 3 };

function PathAnalysis({
  paths,
  total,
  offset,
  onOffset,
  loading,
  error,
  metricDefs,
  selectedLoss,
  lossProps,
  treeEdges,
}: {
  paths: LossPathResult[];
  total: number;
  offset: number;
  onOffset: (next: number) => void;
  loading: boolean;
  error: unknown;
  metricDefs: MetricDef[];
  selectedLoss: string;
  lossProps: Record<string, unknown>;
  treeEdges: AttackTreeEdge[];
}) {
  const [sortKey, setSortKey] = useState<string>("path");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [filter, setFilter] = useState<"ALL" | "RV" | "ALLOWED_RV" | "BLOCKED">("ALL");

  const metricNames = metricDefs.map((m) => m.MetricName).filter(Boolean);
  const filtered = filter === "ALL" ? paths : paths.filter((p) => p.rvStatus === filter);
  const sorted = useMemo(() => {
    const rows = [...filtered];
    const valueOf = (p: LossPathResult): number => {
      if (sortKey === "path") return p.pathNumber;
      if (sortKey === "rv") return RV_RANK[p.rvStatus] ?? 4;
      const v = p.metrics?.[sortKey];
      return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
    };
    rows.sort((a, b) => (valueOf(a) - valueOf(b)) * sortDir);
    return rows;
  }, [filtered, sortKey, sortDir]);

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };
  const arrow = (key: string) => (sortKey === key ? (sortDir === 1 ? " (asc)" : " (desc)") : "");

  const rvCount = paths.filter((p) => p.rvStatus === "RV").length;
  const allowedCount = paths.filter((p) => p.rvStatus === "ALLOWED_RV").length;

  if (error) return <ToolStatus error={error} />;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)",
          borderBottom: "var(--sstpa-border-soft)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span>{total} path(s)</span>
        <span className={rvCount > 0 ? "state-warn" : "state-ok"}>{rvCount} RV</span>
        <span>{allowedCount} allowed RV</span>
        <select className="sstpa-input" style={{ width: 150 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="ALL">All paths</option>
          <option value="RV">RV only</option>
          <option value="ALLOWED_RV">Allowed RV only</option>
          <option value="BLOCKED">Blocked paths</option>
        </select>
        <span style={{ flex: 1 }} />
        <button
          className="icon-button"
          disabled={paths.length === 0}
          onClick={() => downloadText(`sstpa-${selectedLoss}-paths.csv`, pathsToCsv(paths, metricDefs, treeEdges), "text/csv")}
        >
          CSV
        </button>
        <button
          className="icon-button"
          disabled={paths.length === 0}
          onClick={() =>
            downloadText(
              `sstpa-${selectedLoss}-rv-report.md`,
              rvReport(selectedLoss, lossProps, paths, total, metricDefs, treeEdges),
              "text/markdown",
            )
          }
        >
          RV Report
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && <ToolStatus loading />}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
              <th style={{ padding: "4px 6px", cursor: "pointer" }} onClick={() => sortBy("path")}>
                #{arrow("path")}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => sortBy("rv")}>
                Status{arrow("rv")}
              </th>
              <th>Leaf</th>
              {metricNames.map((m) => (
                <th key={m} style={{ cursor: "pointer" }} onClick={() => sortBy(m)}>
                  {m}{arrow(m)}
                </th>
              ))}
              <th>Sequence</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.pathNumber} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td style={{ padding: "4px 6px" }}>{p.pathNumber}</td>
                <td><RvBadge status={p.rvStatus} /></td>
                <td>{p.leafType}</td>
                {metricNames.map((m) => {
                  const def = metricDefs.find((d) => d.MetricName === m);
                  const v = p.metrics?.[m];
                  const pass = def && typeof v === "number" ? metricPass(def, v) : null;
                  return (
                    <td key={m} className={pass == null ? "" : pass ? "state-ok" : "state-warn"}>
                      {typeof v === "number" ? v : "—"}
                    </td>
                  );
                })}
                <td className="mono" style={{ fontSize: "0.66rem" }} title={p.nameSequence.join(" -> ")}>
                  {p.sequence.join(" -> ")}
                </td>
              </tr>
            ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={4 + metricNames.length} style={{ padding: 14, color: "var(--sstpa-muted)" }}>
                  No root-to-terminal paths in the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "4px var(--sstpa-sp-3)",
          borderTop: "var(--sstpa-border-soft)",
          fontSize: "0.74rem",
        }}
      >
        <button className="icon-button" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <span>
          Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
        </span>
        <button className="icon-button" disabled={offset + PAGE_SIZE >= total} onClick={() => onOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Bottom Bar metric summary (§6.5.10.8): per-metric root aggregate vs
 *  threshold, computed client-side from the loaded path page. */
function MetricSummaryBar({ metricDefs, paths }: { metricDefs: MetricDef[]; paths: LossPathResult[] }) {
  if (metricDefs.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "6px var(--sstpa-sp-3)",
        borderTop: "var(--sstpa-border)",
        flexWrap: "wrap",
      }}
      title={`Root aggregates computed from the ${paths.length} loaded path(s).`}
    >
      {metricDefs.map((def) => {
        const value = rootMetricValue(def, paths);
        const pass = value == null ? null : metricPass(def, value);
        const pct =
          value == null || def.AcceptanceThreshold === 0
            ? 0
            : Math.max(0, Math.min(100, (value / def.AcceptanceThreshold) * 100));
        return (
          <div key={def.MetricName} style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: "0.74rem" }}>
              <strong>{def.MetricName}</strong>
              <span className="mono">{value == null ? "—" : value.toPrecision(4)}</span>
              <span style={{ color: "var(--sstpa-muted)", fontSize: "0.68rem" }}>
                / {def.AcceptanceThreshold} ({def.ThresholdDirection})
              </span>
              <span className={pass == null ? "" : pass ? "state-ok" : "state-warn"}>
                {pass == null ? "" : pass ? "PASS" : "FAIL"}
              </span>
            </div>
            <div style={{ height: 4, background: "var(--sstpa-inset)", borderRadius: 2, marginTop: 2 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: 4,
                  borderRadius: 2,
                  background: pass === false ? "var(--sstpa-status-error)" : "var(--sstpa-status-ok)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailPanel({
  node,
  edge,
  nodes,
  edges,
  lossHid,
  metricDefs,
  soiNodes,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onSelectEdge,
  onCopyHid,
  ask,
  notify,
}: {
  node?: AttackTreeNode;
  edge?: AttackTreeEdge;
  nodes: Map<string, AttackTreeNode>;
  edges: AttackTreeEdge[];
  lossHid: string;
  metricDefs: MetricDef[];
  soiNodes: SoINode[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onSelectEdge: (edge: AttackTreeEdge) => void;
  onCopyHid: (hid: string) => void;
  ask: Ask;
  notify: (kind: "success" | "error" | "info", text: string) => void;
}) {
  return (
    <div style={{ width: 320, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {node && (
        <NodeDetail
          node={node}
          edges={edges}
          nodes={nodes}
          lossHid={lossHid}
          metricDefs={metricDefs}
          soiNodes={soiNodes}
          drawerOpen={drawerOpen}
          onOpenDrawer={onOpenDrawer}
          onCommit={onCommit}
          onSelectEdge={onSelectEdge}
          onCopyHid={onCopyHid}
          ask={ask}
          notify={notify}
        />
      )}
      {edge && (
        <EdgeEditor
          edge={edge}
          source={nodes.get(edge.sourceHid)}
          target={nodes.get(edge.targetHid)}
          lossHid={lossHid}
          metricDefs={metricDefs}
          hasCountermeasureChild={edges.some(
            (e) => e.sourceHid === edge.targetHid && nodes.get(e.targetHid)?.typeName === "Countermeasure",
          )}
          onCommit={onCommit}
        />
      )}
      {!node && !edge && <p style={{ color: "var(--sstpa-muted)" }}>Select a node or edge.</p>}
    </div>
  );
}

/** Node detail with tree-editing actions per §6.5.10.5b.1: attack and
 *  countermeasure addition, tailoring, complete-block, allowed-RV, and
 *  leaf-attack metric value editing. */
function NodeDetail({
  node,
  edges,
  nodes,
  lossHid,
  metricDefs,
  soiNodes,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onSelectEdge,
  onCopyHid,
  ask,
  notify,
}: {
  node: AttackTreeNode;
  edges: AttackTreeEdge[];
  nodes: Map<string, AttackTreeNode>;
  lossHid: string;
  metricDefs: MetricDef[];
  soiNodes: SoINode[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onSelectEdge: (edge: AttackTreeEdge) => void;
  onCopyHid: (hid: string) => void;
  ask: Ask;
  notify: (kind: "success" | "error" | "info", text: string) => void;
}) {
  const [existingPick, setExistingPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<(typeof ATTACK_LEVELS)[number]>("TACTIC");
  const [metricVals, setMetricVals] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const raw = node.props?.MetricsJSON;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) out[k] = String(v);
      } catch {
        /* malformed MetricsJSON — start empty */
      }
    }
    return out;
  });

  const outgoing = edges.filter((e) => e.sourceHid === node.hid);
  const incoming = edges.filter((e) => e.targetHid === node.hid);
  const childHids = new Set(outgoing.map((e) => e.targetHid));
  const isEntity = ENTITY_TYPES.includes(node.typeName);
  const isAttack = node.typeName === "Attack";
  const isCountermeasure = node.typeName === "Countermeasure";
  const isLeafAttack = isAttack && outgoing.length === 0;

  const refineOp: CommitOperation = {
    op: "updateNode",
    hid: lossHid,
    properties: { AttackTreeStatus: "ANALYST_REFINED" },
  };
  const atEdgeOp = (sourceHid: string, targetHid: string, logic: "AND" | "OR"): CommitOperation => ({
    op: "createRelationship",
    type: "AT_RELATES_TO",
    sourceHid,
    targetHid,
    properties: { LossHID: lossHid, LogicOperator: logic, TailoredOut: false },
  });

  // Pickers (§6.5.10.5b.1): Attacks exploiting this entity; Countermeasures
  // in the SoI; Attacks defeating this Countermeasure.
  const attackCandidates = isEntity
    ? soiNodes.filter(
        (n) =>
          n.typeName === "Attack" &&
          (n.relationships ?? []).some((r) => r.type === "EXPLOITS" && r.targetHID === node.hid) &&
          !childHids.has(n.hid),
      )
    : [];
  const cmCandidates = isAttack
    ? soiNodes.filter((n) => n.typeName === "Countermeasure" && !childHids.has(n.hid))
    : [];
  const counterAttackCandidates = isCountermeasure
    ? soiNodes.filter(
        (n) =>
          n.typeName === "Attack" &&
          (n.relationships ?? []).some((r) => r.type === "DEFEATS" && r.targetHID === node.hid) &&
          !childHids.has(n.hid),
      )
    : [];
  const securityHid = soiNodes.find((n) => n.typeName === "Security")?.hid;

  const addExisting = () => {
    if (!existingPick) return;
    if (isEntity || isCountermeasure) {
      onCommit([atEdgeOp(node.hid, existingPick, "OR"), refineOp]);
    } else if (isAttack) {
      const cm = soiNodes.find((n) => n.hid === existingPick);
      const hasBlocks = (cm?.relationships ?? []).some((r) => r.type === "BLOCKS" && r.targetHID === node.hid);
      const ops: CommitOperation[] = [];
      if (!hasBlocks) {
        ops.push({ op: "createRelationship", type: "BLOCKS", sourceHid: existingPick, targetHid: node.hid });
      }
      ops.push(atEdgeOp(node.hid, existingPick, "AND"), refineOp);
      onCommit(ops);
      if (!hasBlocks) notify("info", "Canonical [:BLOCKS] relationship added with the tree edge (SRS §6.5.10.11).");
    }
    setExistingPick("");
  };

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    if (isEntity) {
      onCommit([
        { op: "createNode", tempId: "atk", label: "Attack", properties: { Name: name, AttackLevel: newLevel } },
        { op: "createRelationship", type: "EXPLOITS", sourceHid: "$atk", targetHid: node.hid },
        atEdgeOp(node.hid, "$atk", "OR"),
        refineOp,
      ]);
    } else if (isAttack) {
      const ops: CommitOperation[] = [
        { op: "createNode", tempId: "cm", label: "Countermeasure", properties: { Name: name } },
      ];
      if (securityHid) {
        ops.push({ op: "createRelationship", type: "HAS_COUNTERMEASURE", sourceHid: securityHid, targetHid: "$cm" });
      }
      ops.push(
        { op: "createRelationship", type: "BLOCKS", sourceHid: "$cm", targetHid: node.hid },
        atEdgeOp(node.hid, "$cm", "AND"),
        refineOp,
      );
      onCommit(ops);
    } else if (isCountermeasure) {
      onCommit([
        { op: "createNode", tempId: "catk", label: "Attack", properties: { Name: name, AttackLevel: newLevel } },
        { op: "createRelationship", type: "DEFEATS", sourceHid: "$catk", targetHid: node.hid },
        atEdgeOp(node.hid, "$catk", "OR"),
        refineOp,
      ]);
    }
    setNewName("");
  };

  const addSectionTitle = isEntity
    ? "Add Attack (§6.5.10.5b.1)"
    : isAttack
      ? "Add Countermeasure (§6.5.10.5b.1)"
      : isCountermeasure
        ? "Add Counter-Attack (§6.5.10.5b.1)"
        : null;

  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>{node.hid}</span>
        <button className="icon-button" title="Copy HID" onClick={() => onCopyHid(node.hid)}>
          copy
        </button>
      </div>
      <h3 style={{ margin: "4px 0 6px" }}>{node.name || node.hid}</h3>
      <span className="type-badge" style={{ background: colorForType(node.typeName) }}>{node.typeName}</span>
      {typeof node.props?.ShortDescription === "string" && node.props.ShortDescription.trim() !== "" && (
        <p style={{ fontSize: "0.74rem", margin: "6px 0 0" }}>{node.props.ShortDescription}</p>
      )}
      {isAttack && (
        <div style={{ fontSize: "0.72rem", marginTop: 6, color: "var(--sstpa-muted)" }}>
          Level: {String(node.props?.AttackLevel ?? "—")}
          {typeof node.props?.ReferenceFramework === "string" && node.props.ReferenceFramework.trim() !== "" && (
            <> / Ref: {String(node.props.ReferenceFramework)} {String(node.props?.ReferenceID ?? "")}</>
          )}
        </div>
      )}
      {isEntity && (
        <div style={{ fontSize: "0.72rem", marginTop: 6 }}>
          {singleTrueProps(node.props ?? {}, CRITICALITIES)} / {singleTrueProps(node.props ?? {}, ASSURANCES)}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(node.hid)}>
          Open Drawer
        </button>
      </div>

      <h4>Incoming edges</h4>
      {incoming.length === 0 && <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>Root node — no incoming edges.</p>}
      {incoming.map((e) => (
        <div key={edgeKey(e)} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.72rem" }}>
          <div className="mono">
            {e.sourceHid} {"->"} {e.targetHid}
          </div>
          <div>
            {e.logicOperator}
            {e.sandSequence != null ? ` #${e.sandSequence}` : ""}
            {e.tailoredOut ? " / Tailored Out" : ""}
            {e.props?.CompleteBlock === true ? " / Complete Block" : ""}
            {e.props?.AllowedRV === true ? " / Allowed RV" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
            <button className="icon-button" onClick={() => onSelectEdge(e)}>
              Edit Edge
            </button>
            {e.tailoredOut ? (
              <button className="icon-button" onClick={() => onCommit(edgeUpdateOps(e, lossHid, { TailoredOut: false, TailorReason: null }))}>
                Restore
              </button>
            ) : (
              <button
                className="icon-button"
                onClick={() =>
                  ask("Tailor Out reason", (v) =>
                    onCommit(edgeUpdateOps(e, lossHid, { TailoredOut: true, TailorReason: v.trim() })),
                  )
                }
              >
                Tailor Out
              </button>
            )}
            {isCountermeasure &&
              (e.props?.CompleteBlock === true ? (
                <button
                  className="icon-button"
                  onClick={() => onCommit(edgeUpdateOps(e, lossHid, { CompleteBlock: false, CompleteBlockReason: null }))}
                >
                  Remove Complete Block
                </button>
              ) : (
                <button
                  className="icon-button"
                  onClick={() =>
                    ask("Complete Block reason", (v) =>
                      onCommit(edgeUpdateOps(e, lossHid, { CompleteBlock: true, CompleteBlockReason: v.trim() })),
                    )
                  }
                >
                  Mark Complete Block
                </button>
              ))}
            {isLeafAttack &&
              (e.props?.AllowedRV === true ? (
                <button
                  className="icon-button"
                  onClick={() => onCommit(edgeUpdateOps(e, lossHid, { AllowedRV: false, AllowedRVReason: null }))}
                >
                  Revoke Allowed RV
                </button>
              ) : (
                <button
                  className="icon-button"
                  onClick={() =>
                    ask("Allowed RV reason (min 20 characters)", (v) => {
                      if (v.trim().length < 20) {
                        notify("error", "Allowed RV reason must be at least 20 characters (SRS §6.5.10.16).");
                        return;
                      }
                      onCommit(edgeUpdateOps(e, lossHid, { AllowedRV: true, AllowedRVReason: v.trim() }));
                    })
                  }
                >
                  Mark Allowed RV
                </button>
              ))}
          </div>
        </div>
      ))}

      <h4>Outgoing edges</h4>
      {outgoing.length === 0 && (
        <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
          Leaf node{isLeafAttack ? " — Residual Vulnerability endpoint" : ""}.
        </p>
      )}
      {outgoing.map((e) => (
        <div key={edgeKey(e)} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.72rem" }}>
          <button className="icon-button" onClick={() => onSelectEdge(e)}>
            {e.logicOperator} {"->"} {nodes.get(e.targetHid)?.name ?? e.targetHid}
          </button>
          {e.tailoredOut ? " (Tailored Out)" : ""}
        </div>
      ))}

      {addSectionTitle && (
        <>
          <h4>{addSectionTitle}</h4>
          <select className="sstpa-input" value={existingPick} onChange={(e) => setExistingPick(e.target.value)}>
            <option value="">
              {isEntity ? "Existing Attack (EXPLOITS this entity)" : isAttack ? "Existing Countermeasure" : "Existing counter-Attack (DEFEATS)"}
            </option>
            {(isEntity ? attackCandidates : isAttack ? cmCandidates : counterAttackCandidates).map((n) => (
              <option key={n.hid} value={n.hid}>
                {n.hid} - {String(n.properties.Name ?? "")}
              </option>
            ))}
          </select>
          <button className="sstpa-button" style={{ marginTop: 6 }} disabled={!existingPick} onClick={addExisting}>
            Commit Add Existing
          </button>
          {isAttack && (
            <p style={{ fontSize: "0.68rem", color: "var(--sstpa-muted)", margin: "4px 0 0" }}>
              A canonical [:BLOCKS] relationship is created with the tree edge when missing (§6.5.10.11).
            </p>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <input
              className="sstpa-input"
              placeholder={isAttack ? "New Countermeasure name" : "New Attack name"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {(isEntity || isCountermeasure) && (
              <select className="sstpa-input" value={newLevel} onChange={(e) => setNewLevel(e.target.value as (typeof ATTACK_LEVELS)[number])}>
                {ATTACK_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            )}
            <button className="sstpa-button secondary" disabled={!newName.trim()} onClick={addNew}>
              Commit Add New
            </button>
          </div>
        </>
      )}

      {isLeafAttack && metricDefs.length > 0 && (
        <>
          <h4>Metric values (§6.5.10.8)</h4>
          {metricDefs.map((d) => (
            <label key={d.MetricName} style={{ display: "block", fontSize: "0.74rem", marginTop: 6 }}>
              {d.MetricName}
              <input
                className="sstpa-input"
                type="number"
                placeholder={`LeafDefault ${d.LeafDefault}`}
                value={metricVals[d.MetricName] ?? ""}
                onChange={(e) => setMetricVals((x) => ({ ...x, [d.MetricName]: e.target.value }))}
              />
            </label>
          ))}
          <button
            className="sstpa-button"
            style={{ marginTop: 8 }}
            onClick={() => {
              const values: Record<string, number> = {};
              for (const [k, v] of Object.entries(metricVals)) {
                if (v.trim() !== "" && Number.isFinite(Number(v))) values[k] = Number(v);
              }
              onCommit([
                { op: "updateNode", hid: node.hid, properties: { MetricsJSON: JSON.stringify(values) } },
                refineOp,
              ]);
            }}
          >
            Commit Metric Values
          </button>
        </>
      )}
    </>
  );
}

function EdgeEditor({
  edge,
  source,
  target,
  lossHid,
  metricDefs,
  hasCountermeasureChild,
  onCommit,
}: {
  edge: AttackTreeEdge;
  source?: AttackTreeNode;
  target?: AttackTreeNode;
  lossHid: string;
  metricDefs: MetricDef[];
  hasCountermeasureChild: boolean;
  onCommit: (ops: CommitOperation[]) => void;
}) {
  const [logic, setLogic] = useState(edge.logicOperator);
  const [tailored, setTailored] = useState(edge.tailoredOut);
  const [tailorReason, setTailorReason] = useState(String(edge.props?.TailorReason ?? ""));
  const [completeBlock, setCompleteBlock] = useState(edge.props?.CompleteBlock === true);
  const [completeBlockReason, setCompleteBlockReason] = useState(String(edge.props?.CompleteBlockReason ?? ""));
  const [allowedRV, setAllowedRV] = useState(edge.props?.AllowedRV === true);
  const [allowedRVReason, setAllowedRVReason] = useState(String(edge.props?.AllowedRVReason ?? ""));
  const [sandSequence, setSandSequence] = useState(edge.sandSequence == null ? "" : String(edge.sandSequence));
  const targetIsAttackLeaf = target?.typeName === "Attack" && !hasCountermeasureChild;
  const targetIsCountermeasure = target?.typeName === "Countermeasure";

  useEffect(() => {
    setLogic(edge.logicOperator);
    setTailored(edge.tailoredOut);
    setTailorReason(String(edge.props?.TailorReason ?? ""));
    setCompleteBlock(edge.props?.CompleteBlock === true);
    setCompleteBlockReason(String(edge.props?.CompleteBlockReason ?? ""));
    setAllowedRV(edge.props?.AllowedRV === true);
    setAllowedRVReason(String(edge.props?.AllowedRVReason ?? ""));
    setSandSequence(edge.sandSequence == null ? "" : String(edge.sandSequence));
  }, [edge]);

  const invalid =
    (tailored && !tailorReason.trim()) ||
    (completeBlock && !completeBlockReason.trim()) ||
    (allowedRV && allowedRVReason.trim().length < 20) ||
    (logic === "SAND" && (sandSequence.trim() === "" || Number(sandSequence) < 0));

  const save = () => {
    // Delete + recreate keyed by LossHID is the Backend contract for
    // [:AT_RELATES_TO] edits (properties.LossHID scopes deleteRelationship
    // to this tree, §3.3.4.11).
    const props: Record<string, unknown> = {
      ...schemaEdgeProps(edge.props),
      LossHID: lossHid,
      LogicOperator: logic,
      TailoredOut: tailored,
    };
    if (logic === "SAND") props.SANDSequence = Number(sandSequence);
    else delete props.SANDSequence;
    if (tailored) props.TailorReason = tailorReason.trim();
    else delete props.TailorReason;
    if (targetIsCountermeasure) {
      props.CompleteBlock = completeBlock;
      if (completeBlock) props.CompleteBlockReason = completeBlockReason.trim();
      else delete props.CompleteBlockReason;
    } else {
      delete props.CompleteBlock;
      delete props.CompleteBlockReason;
    }
    if (targetIsAttackLeaf) {
      props.AllowedRV = allowedRV;
      if (allowedRV) props.AllowedRVReason = allowedRVReason.trim();
      else delete props.AllowedRVReason;
    } else {
      delete props.AllowedRV;
      delete props.AllowedRVReason;
    }
    onCommit([
      { op: "deleteRelationship", type: "AT_RELATES_TO", sourceHid: edge.sourceHid, targetHid: edge.targetHid, properties: { LossHID: lossHid } },
      { op: "createRelationship", type: "AT_RELATES_TO", sourceHid: edge.sourceHid, targetHid: edge.targetHid, properties: props },
      { op: "updateNode", hid: lossHid, properties: { AttackTreeStatus: "ANALYST_REFINED" } },
    ]);
  };

  return (
    <>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
        {edge.sourceHid} {"->"} {edge.targetHid}
      </div>
      <h3 style={{ margin: "4px 0 6px" }}>{source?.name ?? edge.sourceHid} to {target?.name ?? edge.targetHid}</h3>
      <label style={{ display: "block", fontSize: "0.76rem", marginTop: 8 }}>
        Logic
        <select className="sstpa-input" value={logic} onChange={(e) => setLogic(e.target.value as AttackTreeEdge["logicOperator"])}>
          <option>AND</option>
          <option>OR</option>
          <option>SAND</option>
        </select>
      </label>
      {logic === "SAND" && (
        <label style={{ display: "block", fontSize: "0.76rem", marginTop: 8 }}>
          SAND Sequence
          <input className="sstpa-input" type="number" min={0} value={sandSequence} onChange={(e) => setSandSequence(e.target.value)} />
        </label>
      )}
      <label style={{ display: "block", fontSize: "0.76rem", marginTop: 8 }}>
        <input type="checkbox" checked={tailored} onChange={(e) => setTailored(e.target.checked)} /> Tailored Out
      </label>
      {tailored && (
        <textarea className="sstpa-input" rows={3} value={tailorReason} onChange={(e) => setTailorReason(e.target.value)} />
      )}
      {targetIsCountermeasure && (
        <>
          <label style={{ display: "block", fontSize: "0.76rem", marginTop: 8 }}>
            <input type="checkbox" checked={completeBlock} onChange={(e) => setCompleteBlock(e.target.checked)} /> Complete Block
          </label>
          {completeBlock && (
            <textarea className="sstpa-input" rows={3} value={completeBlockReason} onChange={(e) => setCompleteBlockReason(e.target.value)} />
          )}
        </>
      )}
      {targetIsAttackLeaf && (
        <>
          <label style={{ display: "block", fontSize: "0.76rem", marginTop: 8 }}>
            <input type="checkbox" checked={allowedRV} onChange={(e) => setAllowedRV(e.target.checked)} /> Allowed RV
          </label>
          {allowedRV && (
            <textarea className="sstpa-input" rows={3} value={allowedRVReason} onChange={(e) => setAllowedRVReason(e.target.value)} />
          )}
        </>
      )}
      {metricDefs.length > 0 && (
        <div style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
          Metrics defined: {metricDefs.map((m) => m.MetricName).join(", ")}
        </div>
      )}
      <button className="sstpa-button" style={{ marginTop: 12 }} disabled={invalid} onClick={save}>
        Commit Edge
      </button>
    </>
  );
}

function MetricEditor({
  selectedLoss,
  defs,
  onSave,
}: {
  selectedLoss: string;
  defs: MetricDef[];
  onSave: (defs: MetricDef[]) => void;
}) {
  const [rows, setRows] = useState<MetricDef[]>(defs);
  useEffect(() => setRows(defs), [defs]);
  const update = (idx: number, patch: Partial<MetricDef>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const names = rows.map((r) => r.MetricName.trim()).filter(Boolean);
  const duplicateName = names.length !== new Set(names).size;
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          className="sstpa-button"
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                MetricName: "AttackCost",
                MetricDirection: "MINIMIZE",
                LeafDefault: 0,
                ANDFormula: "SUM",
                ORFormula: "MIN",
                SANDFormula: "SUM",
                AcceptanceThreshold: 0,
                ThresholdDirection: "ABOVE",
                Description: "",
              },
            ])
          }
        >
          Add Metric
        </button>
        <button className="sstpa-button" disabled={!selectedLoss || duplicateName} onClick={() => onSave(rows)}>
          Commit Metric Definitions
        </button>
        {duplicateName && <span className="state-warn">Metric names must be unique.</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th>Name</th>
            <th>Direction</th>
            <th>Leaf</th>
            <th>AND</th>
            <th>OR</th>
            <th>SAND</th>
            <th>Threshold</th>
            <th>Threshold Dir</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
              <td><input className="sstpa-input" value={r.MetricName} onChange={(e) => update(i, { MetricName: e.target.value })} /></td>
              <td>
                <select className="sstpa-input" value={r.MetricDirection} onChange={(e) => update(i, { MetricDirection: e.target.value as MetricDef["MetricDirection"] })}>
                  <option>MINIMIZE</option>
                  <option>MAXIMIZE</option>
                </select>
              </td>
              <td><input className="sstpa-input" type="number" value={r.LeafDefault} onChange={(e) => update(i, { LeafDefault: Number(e.target.value) })} /></td>
              <td><FormulaSelect value={r.ANDFormula} onChange={(v) => update(i, { ANDFormula: v })} /></td>
              <td><FormulaSelect value={r.ORFormula} onChange={(v) => update(i, { ORFormula: v })} /></td>
              <td><FormulaSelect value={r.SANDFormula} onChange={(v) => update(i, { SANDFormula: v })} /></td>
              <td>
                <input className="sstpa-input" type="number" value={r.AcceptanceThreshold} onChange={(e) => update(i, { AcceptanceThreshold: Number(e.target.value) })} />
              </td>
              <td>
                <select
                  className="sstpa-input"
                  value={r.ThresholdDirection}
                  onChange={(e) => update(i, { ThresholdDirection: e.target.value as MetricDef["ThresholdDirection"] })}
                >
                  <option>ABOVE</option>
                  <option>BELOW</option>
                </select>
              </td>
              <td>
                <input
                  className="sstpa-input"
                  value={r.Description ?? ""}
                  placeholder="Analyst note"
                  onChange={(e) => update(i, { Description: e.target.value })}
                />
              </td>
              <td>
                <button className="icon-button danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)", marginTop: 8 }}>
        Committing metric definitions does not invalidate the tree; metric values are recomputed from
        the definitions on the next path enumeration (§6.5.10.8).
      </p>
    </div>
  );
}

function FormulaSelect({ value, onChange }: { value: MetricDef["ANDFormula"]; onChange: (v: MetricDef["ANDFormula"]) => void }) {
  return (
    <select className="sstpa-input" value={value} onChange={(e) => onChange(e.target.value as MetricDef["ANDFormula"])}>
      <option>SUM</option>
      <option>PRODUCT</option>
      <option>MIN</option>
      <option>MAX</option>
    </select>
  );
}

function RvBadge({ status }: { status: LossPathResult["rvStatus"] }) {
  const color =
    status === "RV"
      ? "var(--sstpa-status-error)"
      : status === "ALLOWED_RV"
        ? "var(--sstpa-accent)"
        : status === "BLOCKED"
          ? "var(--sstpa-status-ok)"
          : "var(--sstpa-node-muted)";
  return <span className="type-badge" style={{ background: color }}>{status || "—"}</span>;
}

// --- pure helpers ---

function parseMetricDefs(raw: unknown): MetricDef[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as Partial<MetricDef>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => typeof m.MetricName === "string")
      .map((m) => ({
        MetricName: m.MetricName ?? "",
        MetricDirection: m.MetricDirection === "MAXIMIZE" ? "MAXIMIZE" : "MINIMIZE",
        LeafDefault: Number(m.LeafDefault ?? 0),
        ANDFormula: formula(m.ANDFormula, "SUM"),
        ORFormula: formula(m.ORFormula, "MIN"),
        SANDFormula: formula(m.SANDFormula, "SUM"),
        AcceptanceThreshold: Number(m.AcceptanceThreshold ?? 0),
        ThresholdDirection: m.ThresholdDirection === "BELOW" ? "BELOW" : "ABOVE",
        Description: m.Description,
      }));
  } catch {
    return [];
  }
}

function formula(v: unknown, fallback: MetricDef["ANDFormula"]): MetricDef["ANDFormula"] {
  return v === "PRODUCT" || v === "MIN" || v === "MAX" || v === "SUM" ? v : fallback;
}

function edgeKey(edge: AttackTreeEdge): string {
  return `${edge.sourceHid}->${edge.targetHid}:${String(edge.props?.LossHID ?? "")}`;
}

/** Keep only the [:AT_RELATES_TO] properties the Backend schema defines —
 *  the auto-build's internal merge keys must not be echoed on recreate. */
function schemaEdgeProps(props?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDGE_PROP_KEYS) {
    const v = props?.[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** Delete + recreate ops for a single edge property patch. A `null` patch
 *  value clears the property. */
function edgeUpdateOps(edge: AttackTreeEdge, lossHid: string, patch: Record<string, unknown>): CommitOperation[] {
  const props: Record<string, unknown> = {
    ...schemaEdgeProps(edge.props),
    LossHID: lossHid,
    LogicOperator: edge.logicOperator,
    TailoredOut: edge.tailoredOut,
    ...patch,
  };
  for (const k of Object.keys(props)) {
    if (props[k] === undefined || props[k] === null) delete props[k];
  }
  return [
    { op: "deleteRelationship", type: "AT_RELATES_TO", sourceHid: edge.sourceHid, targetHid: edge.targetHid, properties: { LossHID: lossHid } },
    { op: "createRelationship", type: "AT_RELATES_TO", sourceHid: edge.sourceHid, targetHid: edge.targetHid, properties: props },
    { op: "updateNode", hid: lossHid, properties: { AttackTreeStatus: "ANALYST_REFINED" } },
  ];
}

function singleTrueProps(props: Record<string, unknown>, keys: readonly string[]): string {
  return keys.find((k) => props[k] === true) ?? "—";
}

function colorForType(typeName: string): string {
  if (typeName === "Loss") return "var(--sstpa-status-error)";
  if (typeName === "Attack") return "var(--sstpa-node-security)";
  if (typeName === "Countermeasure") return "var(--sstpa-node-security)";
  if (typeName === "Asset" || typeName === "DerivedAsset") return "var(--sstpa-node-asset)";
  if (typeName === "State") return "var(--sstpa-node-state)";
  if (typeName === "Environment") return "var(--sstpa-node-environment)";
  return "var(--sstpa-node-muted)";
}

function validity(lossProps: Record<string, unknown>, findings: LossFinding[]): { label: string; color: string } {
  const status = String(lossProps.AttackTreeStatus ?? "NOT_BUILT");
  if (status === "NOT_BUILT") return { label: "NOT_BUILT", color: "var(--sstpa-node-muted)" };
  if (status === "INVALIDATED" || lossProps.TreeIsValid === false || findings.some((f) => f.severity === "ERROR")) {
    return { label: "INVALID", color: "var(--sstpa-status-error)" };
  }
  if (lossProps.TreeHasRVs === true || findings.some((f) => f.severity === "WARNING")) {
    return { label: "WARNING", color: "var(--sstpa-status-warn)" };
  }
  return { label: "VALID", color: "var(--sstpa-status-ok)" };
}

/** Root aggregate of a metric across the loaded paths, combined by the
 *  metric's OR formula (paths are alternative root-to-leaf scenarios). */
function rootMetricValue(def: MetricDef, paths: LossPathResult[]): number | null {
  const vals = paths
    .map((p) => p.metrics?.[def.MetricName])
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  switch (def.ORFormula) {
    case "MIN":
      return Math.min(...vals);
    case "MAX":
      return Math.max(...vals);
    case "PRODUCT":
      return vals.reduce((a, b) => a * b, 1);
    default:
      return vals.reduce((a, b) => a + b, 0);
  }
}

function metricPass(def: MetricDef, value: number): boolean {
  return def.ThresholdDirection === "ABOVE" ? value > def.AcceptanceThreshold : value < def.AcceptanceThreshold;
}

function allowedReasonFor(leafHid: string | undefined, treeEdges: AttackTreeEdge[]): string {
  if (!leafHid) return "";
  const e = treeEdges.find((x) => x.targetHid === leafHid && x.props?.AllowedRV === true);
  return String(e?.props?.AllowedRVReason ?? "");
}

function pathsToCsv(paths: LossPathResult[], metricDefs: MetricDef[], treeEdges: AttackTreeEdge[]): string {
  const metricCols = metricDefs.flatMap((d) => [`${d.MetricName}_Value`, `${d.MetricName}_PassFail`]);
  const rows = [["PathNumber", "RVStatus", "LeafType", "LeafHID", ...metricCols, "AllowedRVReason", "NodeSequence", "NodeNameSequence"]];
  for (const p of paths) {
    const leafHid = p.sequence[p.sequence.length - 1];
    rows.push([
      String(p.pathNumber),
      p.rvStatus,
      p.leafType,
      leafHid ?? "",
      ...metricDefs.flatMap((d) => {
        const v = p.metrics?.[d.MetricName];
        return [
          typeof v === "number" ? String(v) : "",
          typeof v === "number" ? (metricPass(d, v) ? "PASS" : "FAIL") : "",
        ];
      }),
      allowedReasonFor(leafHid, treeEdges),
      p.sequence.join("; "),
      p.nameSequence.join("; "),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Residual Vulnerability Report (§6.5.10.14): executive summary, per-metric
 *  pass/fail, and per-path sections with AllowedRVReason. */
function rvReport(
  lossHid: string,
  lossProps: Record<string, unknown>,
  paths: LossPathResult[],
  total: number,
  metricDefs: MetricDef[],
  treeEdges: AttackTreeEdge[],
): string {
  const rvs = paths.filter((p) => p.rvStatus === "RV");
  const allowed = paths.filter((p) => p.rvStatus === "ALLOWED_RV");
  const blocked = paths.filter((p) => p.rvStatus === "BLOCKED").length;
  const derived = paths.filter((p) => p.rvStatus === "DERIVED").length;

  let md = `# Residual Vulnerability Report\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| Loss HID | ${lossHid} |\n`;
  md += `| Loss Name | ${String(lossProps.Name ?? "—")} |\n`;
  md += `| Criticality | ${singleTrueProps(lossProps, CRITICALITIES)} |\n`;
  md += `| Assurance | ${singleTrueProps(lossProps, ASSURANCES)} |\n`;
  md += `| Attack Tree Version | v${String(lossProps.AttackTreeVersion ?? 0)} |\n`;
  md += `| Attack Tree Status | ${String(lossProps.AttackTreeStatus ?? "NOT_BUILT")} |\n`;
  md += `| Generated | ${new Date().toISOString()} |\n\n`;

  md += `## Executive Summary\n\n`;
  md += `| Measure | Count |\n|---|---|\n`;
  md += `| Total paths | ${total} |\n`;
  md += `| Paths in this report | ${paths.length} |\n`;
  md += `| Unaddressed Residual Vulnerabilities | ${rvs.length} |\n`;
  md += `| Allowed Residual Vulnerabilities | ${allowed.length} |\n`;
  md += `| Blocked paths (Complete Block) | ${blocked} |\n`;
  md += `| Derived Asset terminals | ${derived} |\n\n`;

  if (metricDefs.length > 0) {
    md += `### Metric Pass/Fail (root aggregate over reported paths)\n\n`;
    md += `| Metric | Root value | Threshold | Direction | Result |\n|---|---|---|---|---|\n`;
    for (const d of metricDefs) {
      const v = rootMetricValue(d, paths);
      md += `| ${d.MetricName} | ${v == null ? "—" : v.toPrecision(4)} | ${d.AcceptanceThreshold} | ${d.ThresholdDirection} | ${v == null ? "—" : metricPass(d, v) ? "PASS" : "FAIL"} |\n`;
    }
    md += "\n";
  }

  for (const p of [...rvs, ...allowed]) {
    md += `## Path ${p.pathNumber} — ${p.rvStatus === "RV" ? "Unaddressed RV" : "Allowed RV"}\n\n`;
    p.sequence.forEach((hid, i) => {
      md += `${i + 1}. ${hid} — ${p.nameSequence[i] ?? ""}\n`;
    });
    md += "\n";
    if (metricDefs.length > 0) {
      md += `| Metric | Value | Result |\n|---|---|---|\n`;
      for (const d of metricDefs) {
        const v = p.metrics?.[d.MetricName];
        md += `| ${d.MetricName} | ${typeof v === "number" ? v : "—"} | ${typeof v === "number" ? (metricPass(d, v) ? "PASS" : "FAIL") : "—"} |\n`;
      }
      md += "\n";
    }
    if (p.rvStatus === "ALLOWED_RV") {
      const reason = allowedReasonFor(p.sequence[p.sequence.length - 1], treeEdges);
      md += `AllowedRVReason: ${reason || "(not recorded on the loaded tree edges)"}\n\n`;
    }
  }
  if (rvs.length + allowed.length === 0) md += "No RV paths in the current path result set.\n\n";

  if (metricDefs.length > 0) {
    md += `## Appendix — Metric Definitions\n\n`;
    md += `| Metric | Direction | LeafDefault | AND | OR | SAND | Threshold | Threshold Dir | Description |\n|---|---|---|---|---|---|---|---|---|\n`;
    for (const d of metricDefs) {
      md += `| ${d.MetricName} | ${d.MetricDirection} | ${d.LeafDefault} | ${d.ANDFormula} | ${d.ORFormula} | ${d.SANDFormula} | ${d.AcceptanceThreshold} | ${d.ThresholdDirection} | ${d.Description ?? ""} |\n`;
    }
  }
  // PNG/SVG diagram export is deferred: the tiered-column tree renders as DOM,
  // not a canvas, so exportPng/exportSvg (cytoscape-based) do not apply.
  return md;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
