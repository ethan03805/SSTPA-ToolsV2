// Loss Tool (SRS §6.5.10): Attack Tree construction, trace-coverage review,
// path/RV analysis, edge tailoring, and metric-definition editing.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  AttackTreeEdge,
  AttackTreeNode,
  CommitOperation,
  LossPathResult,
  SoINode,
} from "../../api/types";
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
  const [mode, setMode] = useState<Mode>("tree");
  const [selectedLoss, setSelectedLoss] = useState("");
  const [selectedNodeHid, setSelectedNodeHid] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const losses = nodes.filter((n) => n.typeName === "Loss");
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");

  const firstContextLoss = useMemo(() => {
    if (ctx.drawerNodeHid?.startsWith("LOS_")) return ctx.drawerNodeHid;
    if (ctx.drawerNodeHid?.startsWith("AST_") || ctx.drawerNodeHid?.startsWith("DA_")) {
      const asset = byHid.get(ctx.drawerNodeHid);
      const rel = asset?.relationships?.find((r) => r.type === "HAS_LOSS");
      if (rel) return rel.targetHID;
    }
    const needsWork = losses.find((l) =>
      ["NOT_BUILT", "INVALIDATED"].includes(String(l.properties.AttackTreeStatus ?? "NOT_BUILT")),
    );
    return needsWork?.hid ?? losses[0]?.hid ?? "";
  }, [byHid, ctx.drawerNodeHid, losses]);

  useEffect(() => {
    if (!selectedLoss && firstContextLoss) {
      setSelectedLoss(firstContextLoss);
    }
  }, [firstContextLoss, selectedLoss]);

  const lossNode = selectedLoss ? byHid.get(selectedLoss) : undefined;
  const tree = useQuery({
    queryKey: ["loss-tree", selectedLoss],
    queryFn: () => api.lossTree(selectedLoss),
    enabled: !!selectedLoss,
  });
  const paths = useQuery({
    queryKey: ["loss-paths", selectedLoss],
    queryFn: () => api.lossPaths(selectedLoss, { limit: "500" }),
    enabled: !!selectedLoss && mode === "paths",
  });

  const refreshLoss = () => {
    void qc.invalidateQueries({ queryKey: ["soi"] });
    void qc.invalidateQueries({ queryKey: ["loss-tree", selectedLoss] });
    void qc.invalidateQueries({ queryKey: ["loss-paths", selectedLoss] });
  };

  const buildTree = useMutation({
    mutationFn: (rebuild: boolean) => api.lossAutoBuild(selectedLoss, rebuild),
    onSuccess: () => {
      setNotice("Attack Tree build committed.");
      refreshLoss();
    },
    onError: (e) => setNotice(String(e)),
  });

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.loss", operations: ops }),
    onSuccess: () => {
      setNotice("Loss Tool changes committed.");
      refreshLoss();
    },
    onError: (e) => setNotice(String(e)),
  });

  const treeNodes = tree.data?.nodes ?? [];
  const treeEdges = tree.data?.edges ?? [];
  const treeNodeMap = useMemo(() => new Map(treeNodes.map((n) => [n.hid, n])), [treeNodes]);
  const selectedTreeNode = selectedNodeHid ? treeNodeMap.get(selectedNodeHid) : undefined;
  const selectedEdge = selectedEdgeKey ? treeEdges.find((e) => edgeKey(e) === selectedEdgeKey) : undefined;
  const metricDefs = parseMetricDefs((tree.data?.loss ?? lossNode?.properties)?.MetricDefinitionsJSON);

  const lossStatus = String(lossNode?.properties.AttackTreeStatus ?? tree.data?.loss?.AttackTreeStatus ?? "NOT_BUILT");
  const pathRows = paths.data?.paths ?? [];

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
          flexWrap: "wrap",
        }}
      >
        <select
          className="sstpa-input"
          style={{ width: 260 }}
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
        <span className="type-badge" style={{ background: STATUS_COLOR[lossStatus] ?? "var(--sstpa-node-muted)" }}>
          {lossStatus}
        </span>
        <button className="sstpa-button" disabled={!selectedLoss || buildTree.isPending} onClick={() => buildTree.mutate(false)}>
          Auto-build
        </button>
        <button className="sstpa-button secondary" disabled={!selectedLoss || buildTree.isPending} onClick={() => buildTree.mutate(true)}>
          Rebuild
        </button>
        <span style={{ flex: 1 }} />
        <button className={`sstpa-button ${mode === "coverage" ? "" : "secondary"}`} onClick={() => setMode("coverage")}>
          Coverage
        </button>
        <button className={`sstpa-button ${mode === "tree" ? "" : "secondary"}`} onClick={() => setMode("tree")}>
          Tree
        </button>
        <button className={`sstpa-button ${mode === "paths" ? "" : "secondary"}`} onClick={() => setMode("paths")}>
          Paths
        </button>
        <button className={`sstpa-button ${mode === "metrics" ? "" : "secondary"}`} onClick={() => setMode("metrics")}>
          Metrics
        </button>
      </div>

      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice}{" "}
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
          <LossSummary treeNodes={treeNodes} treeEdges={treeEdges} tree={tree.data} loss={lossNode} paths={paths.data?.total} />

          {mode === "coverage" && (
            <CoverageView tree={tree.data} loading={tree.isLoading} onBuild={() => buildTree.mutate(false)} disabled={!selectedLoss} />
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
              total={paths.data?.total ?? 0}
              loading={paths.isLoading}
              metricDefs={metricDefs}
              selectedLoss={selectedLoss}
            />
          )}
          {mode === "metrics" && (
            <MetricEditor
              selectedLoss={selectedLoss}
              defs={metricDefs}
              onSave={(defs) =>
                commit.mutate([
                  {
                    op: "updateNode",
                    hid: selectedLoss,
                    properties: {
                      MetricDefinitionsJSON: JSON.stringify(defs),
                      AttackTreeStatus: "INVALIDATED",
                    },
                  },
                ])
              }
            />
          )}
        </div>

        <DetailPanel
          node={selectedTreeNode}
          edge={selectedEdge}
          nodes={treeNodeMap}
          edges={treeEdges}
          lossHid={selectedLoss}
          metricDefs={metricDefs}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onOpenTool={openTool}
          onCommit={(ops) => commit.mutate(ops)}
        />
      </div>
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
              borderColor: selectedLoss === l.hid ? "var(--sstpa-gold)" : undefined,
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
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}>
              {String(asset?.properties.Name ?? "No Asset")} / {env ? String(byHid.get(env)?.properties.Name ?? env) : "No Environment"}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: "0.68rem" }}>
                {singleTrue(l, CRITICALITIES).replace("Critical", "")} / {singleTrue(l, ASSURANCES)}
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
        <p style={{ padding: 12, color: "var(--sstpa-navy-muted)" }}>No Loss nodes in this SoI.</p>
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
  tree?: { statesCovered: number; statesTotal: number; asset: Record<string, unknown> | null; environment: Record<string, unknown> | null };
  loss?: SoINode;
  paths?: number;
}) {
  const lossProps = loss?.properties ?? {};
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
      <SummaryCell label="Asset" value={String(tree?.asset?.Name ?? "—")} />
      <SummaryCell label="Environment" value={String(tree?.environment?.Name ?? "—")} />
      <SummaryCell label="Coverage" value={`${tree?.statesCovered ?? 0}/${tree?.statesTotal ?? 0} states`} />
      <SummaryCell label="Tree" value={`${treeNodes.length} nodes / ${treeEdges.length} edges`} />
      <SummaryCell label="Paths" value={String(paths ?? lossProps.PathCount ?? "—")} />
      <SummaryCell label="RV" value={lossProps.TreeHasRVs === true ? "present" : "none recorded"} />
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.66rem" }}>{label}</div>
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
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
      {loading && <p>Loading coverage...</p>}
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
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
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
              <td colSpan={4} style={{ padding: 14, color: "var(--sstpa-navy-muted)" }}>
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
        {loading && <p>Loading Attack Tree...</p>}
        {!loading && nodes.length === 0 && <p style={{ color: "var(--sstpa-navy-muted)" }}>No Attack Tree nodes returned.</p>}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: "max-content" }}>
          {tiers.map(([tier, group]) => (
            <div key={tier} style={{ width: 190 }}>
              <div
                style={{
                  fontFamily: "var(--sstpa-font-mono)",
                  color: "var(--sstpa-navy-muted)",
                  fontSize: "0.72rem",
                  marginBottom: 6,
                }}
              >
                T{tier}
              </div>
              {group.map((n) => (
                <button
                  key={n.hid}
                  className="entity-card"
                  style={{
                    width: "100%",
                    marginBottom: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    background: selectedNodeHid === n.hid ? "var(--sstpa-ivory-sunken)" : undefined,
                    borderColor: selectedNodeHid === n.hid ? "var(--sstpa-gold)" : undefined,
                  }}
                  onClick={() => onSelectNode(n.hid)}
                >
                  <div className="entity-card-header">
                    <span className="entity-hid">{n.hid}</span>
                    <span className="type-badge" style={{ background: colorForType(n.typeName) }}>{n.typeName}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, marginTop: 4 }}>{n.name || n.hid}</div>
                </button>
              ))}
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
                  background: selectedEdgeKey === edgeKey(e) ? "var(--sstpa-ivory-sunken)" : undefined,
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

function PathAnalysis({
  paths,
  total,
  loading,
  metricDefs,
  selectedLoss,
}: {
  paths: LossPathResult[];
  total: number;
  loading: boolean;
  metricDefs: MetricDef[];
  selectedLoss: string;
}) {
  const metricNames = metricDefs.map((m) => m.MetricName).filter(Boolean);
  const rvCount = paths.filter((p) => p.rvStatus === "RV").length;
  const allowedCount = paths.filter((p) => p.rvStatus === "ALLOWED_RV").length;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)", display: "flex", gap: 8 }}>
        <span>{total} path(s)</span>
        <span className={rvCount > 0 ? "state-warn" : "state-ok"}>{rvCount} RV</span>
        <span>{allowedCount} allowed RV</span>
        <span style={{ flex: 1 }} />
        <button className="icon-button" disabled={paths.length === 0} onClick={() => downloadText(`sstpa-${selectedLoss}-paths.csv`, pathsToCsv(paths, metricNames), "text/csv")}>
          CSV
        </button>
        <button className="icon-button" disabled={paths.length === 0} onClick={() => downloadText(`sstpa-${selectedLoss}-rv-report.md`, rvReport(selectedLoss, paths, metricNames), "text/markdown")}>
          RV Report
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && <p style={{ padding: 14 }}>Enumerating paths...</p>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
              <th style={{ padding: "4px 6px" }}>#</th>
              <th>Status</th>
              <th>Leaf</th>
              {metricNames.map((m) => (
                <th key={m}>{m}</th>
              ))}
              <th>Sequence</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((p) => (
              <tr key={p.pathNumber} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td style={{ padding: "4px 6px" }}>{p.pathNumber}</td>
                <td><RvBadge status={p.rvStatus} /></td>
                <td>{p.leafType}</td>
                {metricNames.map((m) => (
                  <td key={m}>{p.metrics?.[m] ?? "—"}</td>
                ))}
                <td className="mono" style={{ fontSize: "0.66rem" }}>{p.sequence.join(" -> ")}</td>
              </tr>
            ))}
            {!loading && paths.length === 0 && (
              <tr>
                <td colSpan={5 + metricNames.length} style={{ padding: 14, color: "var(--sstpa-navy-muted)" }}>
                  No root-to-terminal paths found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
  drawerOpen,
  onOpenDrawer,
  onOpenTool,
  onCommit,
}: {
  node?: AttackTreeNode;
  edge?: AttackTreeEdge;
  nodes: Map<string, AttackTreeNode>;
  edges: AttackTreeEdge[];
  lossHid: string;
  metricDefs: MetricDef[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onOpenTool: (toolId: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
}) {
  const outgoing = node ? edges.filter((e) => e.sourceHid === node.hid) : [];
  const incoming = node ? edges.filter((e) => e.targetHid === node.hid) : [];
  return (
    <div style={{ width: 310, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button className="icon-button" onClick={() => onOpenTool("sstpa.trace")}>Trace</button>
        <button className="icon-button" onClick={() => onOpenTool("sstpa.attack")}>Attack</button>
        <button className="icon-button" onClick={() => onOpenTool("sstpa.context")}>Context</button>
        <button className="icon-button" onClick={() => onOpenTool("sstpa.goalkeeper")}>Goal</button>
      </div>
      {node && (
        <>
          <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{node.hid}</div>
          <h3 style={{ margin: "4px 0 6px" }}>{node.name || node.hid}</h3>
          <span className="type-badge" style={{ background: colorForType(node.typeName) }}>{node.typeName}</span>
          <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
            <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(node.hid)}>
              Open Drawer
            </button>
          </div>
          <h4>Edges</h4>
          {[...incoming, ...outgoing].map((e) => (
            <div key={edgeKey(e)} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.72rem" }}>
              <div className="mono">{e.sourceHid} {"->"} {e.targetHid}</div>
              <div>{e.logicOperator} {e.tailoredOut ? "/ Tailored Out" : ""}</div>
            </div>
          ))}
        </>
      )}
      {edge && (
        <EdgeEditor
          edge={edge}
          source={nodes.get(edge.sourceHid)}
          target={nodes.get(edge.targetHid)}
          lossHid={lossHid}
          metricDefs={metricDefs}
          hasCountermeasureChild={edges.some((e) => e.sourceHid === edge.targetHid && nodes.get(e.targetHid)?.typeName === "Countermeasure")}
          onCommit={onCommit}
        />
      )}
      {!node && !edge && <p style={{ color: "var(--sstpa-navy-muted)" }}>Select a node or edge.</p>}
    </div>
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
    const props: Record<string, unknown> = {
      ...edge.props,
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
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
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
        <div style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
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
              },
            ])
          }
        >
          Add Metric
        </button>
        <button className="sstpa-button" disabled={!selectedLoss || duplicateName} onClick={() => onSave(rows)}>
          Save Metrics
        </button>
        {duplicateName && <span className="state-warn">Metric names must be unique.</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
            <th>Name</th>
            <th>Direction</th>
            <th>Leaf</th>
            <th>AND</th>
            <th>OR</th>
            <th>SAND</th>
            <th>Threshold</th>
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
                <button className="icon-button danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        ? "var(--sstpa-gold)"
        : status === "BLOCKED"
          ? "var(--sstpa-status-ok)"
          : "var(--sstpa-node-muted)";
  return <span className="type-badge" style={{ background: color }}>{status || "—"}</span>;
}

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

function singleTrue(n: SoINode, keys: readonly string[]): string {
  return keys.find((k) => n.properties[k] === true) ?? "—";
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

function pathsToCsv(paths: LossPathResult[], metrics: string[]): string {
  const rows = [["Path", "Status", "LeafType", ...metrics, "Sequence", "Names"]];
  for (const p of paths) {
    rows.push([
      String(p.pathNumber),
      p.rvStatus,
      p.leafType,
      ...metrics.map((m) => String(p.metrics?.[m] ?? "")),
      p.sequence.join(" -> "),
      p.nameSequence.join(" -> "),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function rvReport(lossHid: string, paths: LossPathResult[], metrics: string[]): string {
  const rvs = paths.filter((p) => p.rvStatus === "RV" || p.rvStatus === "ALLOWED_RV");
  let md = `# Residual Vulnerability Report\n\nLoss: ${lossHid}\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const p of rvs) {
    md += `## Path ${p.pathNumber} - ${p.rvStatus}\n\n`;
    md += `Sequence: ${p.sequence.join(" -> ")}\n\n`;
    if (metrics.length > 0) {
      md += "Metrics:\n\n";
      for (const m of metrics) md += `- ${m}: ${p.metrics?.[m] ?? "—"}\n`;
      md += "\n";
    }
  }
  if (rvs.length === 0) md += "No RV paths in the current path result set.\n";
  return md;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
