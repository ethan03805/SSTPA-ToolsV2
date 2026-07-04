// Goal Keeper Tool (SRS §6.5.11): GSN assurance-case construction, evidence
// association, validation, diagram-state persistence, and exports.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type Mode = "structure" | "evidence" | "validation" | "export";
type GsnLabel = "GsnGoal" | "GsnStrategy" | "GsnContext" | "GsnJustification" | "GsnAssumption" | "GsnSolution";
type GsnRel = "SUPPORTED_BY" | "IN_CONTEXT_OF";

const GSN_LABELS: GsnLabel[] = ["GsnGoal", "GsnStrategy", "GsnContext", "GsnJustification", "GsnAssumption", "GsnSolution"];
const EVIDENCE_RELS = ["HAS_VALIDATION", "HAS_VERIFICATION", "HAS_LOSS"] as const;

interface StructureOption {
  asset?: SoINode;
  loss?: SoINode;
  root: SoINode;
}

interface Finding {
  severity: "ERROR" | "WARNING" | "INFO";
  nodeHid?: string;
  message: string;
}

export default function GoalKeeperTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const [mode, setMode] = useState<Mode>("structure");
  const [rootHid, setRootHid] = useState("");
  const [selectedHid, setSelectedHid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const gsnNodes = nodes.filter((n) => GSN_LABELS.includes(n.typeName as GsnLabel));
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");
  const losses = nodes.filter((n) => n.typeName === "Loss");
  const evidenceNodes = nodes.filter((n) => ["Validation", "Verification", "Loss"].includes(n.typeName));

  const structures = useMemo(() => buildStructures(assets, losses, gsnNodes, byHid), [assets, losses, gsnNodes, byHid]);
  const graph = useMemo(() => buildGsnGraph(rootHid, gsnNodes, byHid), [rootHid, gsnNodes, byHid]);
  const selectedNode = selectedHid ? byHid.get(selectedHid) : undefined;
  const findings = useMemo(() => validateStructure(rootHid, graph.nodes, gsnNodes), [rootHid, graph.nodes, gsnNodes]);

  useEffect(() => {
    const hid = ctx.drawerNodeHid;
    if (!hid || rootHid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "GsnGoal") {
      const root = rootForNode(hid, gsnNodes);
      if (root) {
        setRootHid(root);
        setSelectedHid(hid);
      }
    } else if (GSN_LABELS.includes(node.typeName as GsnLabel)) {
      const root = rootForNode(hid, gsnNodes);
      if (root) {
        setRootHid(root);
        setSelectedHid(hid);
      }
    } else if (node.typeName === "Asset" || node.typeName === "DerivedAsset") {
      const root = structures.find((s) => s.asset?.hid === hid)?.root.hid;
      if (root) setRootHid(root);
    } else if (node.typeName === "Loss") {
      const root = structures.find((s) => s.loss?.hid === hid)?.root.hid;
      if (root) setRootHid(root);
    }
  }, [byHid, ctx.drawerNodeHid, gsnNodes, rootHid, structures]);

  useEffect(() => {
    if (!rootHid && structures[0]) setRootHid(structures[0].root.hid);
  }, [rootHid, structures]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.goalkeeper", operations: ops }),
    onSuccess: (res) => {
      setNotice(`Goal Keeper commit ${res.commitId.slice(0, 8)} accepted.`);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  if (!ctx.soiHid) return <p style={{ padding: 20 }}>Select a System of Interest first.</p>;

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
        <select
          className="sstpa-input"
          style={{ width: 300 }}
          value={rootHid}
          onChange={(e) => {
            setRootHid(e.target.value);
            setSelectedHid(e.target.value);
          }}
        >
          <option value="">Select Goal Structure</option>
          {structures.map((s) => (
            <option key={s.root.hid} value={s.root.hid}>
              {s.root.hid} - {String(s.root.properties.Name ?? "Root Goal")}
              {s.loss ? ` / ${s.loss.hid}` : ""}
            </option>
          ))}
        </select>
        <button className={`sstpa-button ${mode === "structure" ? "" : "secondary"}`} onClick={() => setMode("structure")}>Structure</button>
        <button className={`sstpa-button ${mode === "evidence" ? "" : "secondary"}`} onClick={() => setMode("evidence")}>Evidence</button>
        <button className={`sstpa-button ${mode === "validation" ? "" : "secondary"}`} onClick={() => setMode("validation")}>
          Validation {findings.filter((f) => f.severity === "ERROR").length > 0 ? "!" : ""}
        </button>
        <button className={`sstpa-button ${mode === "export" ? "" : "secondary"}`} onClick={() => setMode("export")}>Export</button>
        <input className="sstpa-input" style={{ width: 180 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search GSN" />
        <span style={{ flex: 1 }} />
        <button
          className="icon-button"
          disabled={!rootHid}
          onClick={() =>
            commit.mutate([
              {
                op: "updateNode",
                hid: rootHid,
                properties: { GoalStructure: JSON.stringify(layoutSnapshot(rootHid, graph.nodes)) },
              },
            ])
          }
        >
          Save Layout
        </button>
      </div>
      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice} <button className="icon-button" onClick={() => setNotice(null)}>x</button>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <StructureList structures={structures} selectedRoot={rootHid} onSelect={setRootHid} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {mode === "structure" && (
            <StructureView
              rootHid={rootHid}
              nodes={filterGraphNodes(graph.nodes, search)}
              edges={graph.edges}
              selectedHid={selectedHid}
              findings={findings}
              onSelect={setSelectedHid}
            />
          )}
          {mode === "evidence" && (
            <EvidenceView nodes={graph.nodes} byHid={byHid} onSelect={setSelectedHid} />
          )}
          {mode === "validation" && (
            <ValidationView findings={findings} allGsnNodes={gsnNodes} graphNodes={graph.nodes} onSelect={setSelectedHid} />
          )}
          {mode === "export" && (
            <ExportView rootHid={rootHid} nodes={graph.nodes} edges={graph.edges} findings={findings} />
          )}
        </div>
        <DetailPanel
          node={selectedNode}
          rootHid={rootHid}
          graphNodes={graph.nodes}
          evidenceNodes={evidenceNodes}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onCommit={(ops) => commit.mutate(ops)}
          onSelect={setSelectedHid}
        />
      </div>
    </div>
  );
}

function StructureList({
  structures,
  selectedRoot,
  onSelect,
}: {
  structures: StructureOption[];
  selectedRoot: string;
  onSelect: (hid: string) => void;
}) {
  return (
    <div style={{ width: 280, borderRight: "var(--sstpa-border)", overflow: "auto" }}>
      {structures.map((s) => (
        <button
          key={s.root.hid}
          className="entity-card"
          style={{ width: "calc(100% - 12px)", margin: 6, textAlign: "left", borderColor: selectedRoot === s.root.hid ? "var(--sstpa-gold)" : undefined }}
          onClick={() => onSelect(s.root.hid)}
        >
          <div className="entity-card-header">
            <span className="entity-hid">{s.root.hid}</span>
            <span className="type-badge" style={{ background: "var(--sstpa-status-info)" }}>ROOT</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{String(s.root.properties.Name ?? "")}</div>
          <div style={{ color: "var(--sstpa-navy-muted)", fontSize: "0.68rem" }}>
            {s.asset ? `${s.asset.hid} ${String(s.asset.properties.Name ?? "")}` : "No Asset"}<br />
            {s.loss ? `${s.loss.hid} ${String(s.loss.properties.Name ?? "")}` : "No paired Loss"}
          </div>
        </button>
      ))}
      {structures.length === 0 && <p style={{ padding: 12, color: "var(--sstpa-navy-muted)" }}>No root Goals in this SoI.</p>}
    </div>
  );
}

function StructureView({
  rootHid,
  nodes,
  edges,
  selectedHid,
  findings,
  onSelect,
}: {
  rootHid: string;
  nodes: SoINode[];
  edges: { source: string; target: string; type: string }[];
  selectedHid: string | null;
  findings: Finding[];
  onSelect: (hid: string) => void;
}) {
  const byTier = tierNodes(rootHid, nodes);
  const errors = new Set(findings.filter((f) => f.severity === "ERROR").map((f) => f.nodeHid));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: "max-content" }}>
          {byTier.map(([tier, group]) => (
            <div key={tier} style={{ width: 220 }}>
              <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)", marginBottom: 6 }}>Tier {tier}</div>
              {group.map((n) => (
                <button
                  key={n.hid}
                  className="entity-card"
                  style={{
                    width: "100%",
                    marginBottom: 8,
                    textAlign: "left",
                    borderColor: selectedHid === n.hid ? "var(--sstpa-gold)" : errors.has(n.hid) ? "var(--sstpa-status-error)" : undefined,
                    borderRadius: shapeRadius(n.typeName),
                  }}
                  onClick={() => onSelect(n.hid)}
                >
                  <div className="entity-card-header">
                    <span className="entity-hid">{n.hid}</span>
                    <GsnBadge typeName={n.typeName} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{String(n.properties.Name ?? "")}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--sstpa-navy-muted)" }}>{statement(n).slice(0, 90)}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: 150, overflow: "auto", borderTop: "var(--sstpa-border-soft)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
          <tbody>
            {edges.map((e) => (
              <tr key={`${e.source}-${e.type}-${e.target}`} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td className="mono" style={{ padding: "3px 6px" }}>{e.source}</td>
                <td>{e.type}</td>
                <td className="mono">{e.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceView({
  nodes,
  byHid,
  onSelect,
}: {
  nodes: SoINode[];
  byHid: Map<string, SoINode>;
  onSelect: (hid: string) => void;
}) {
  const solutions = nodes.filter((n) => n.typeName === "GsnSolution");
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {solutions.map((s) => {
        const ev = evidenceFor(s, byHid);
        return (
          <div key={s.hid} className="entity-card" style={{ marginBottom: 8 }}>
            <div className="entity-card-header">
              <span className="entity-hid">{s.hid}</span>
              <span className="type-badge" style={{ background: ev.length > 0 ? "var(--sstpa-status-ok)" : "var(--sstpa-status-warn)" }}>{ev.length} evidence</span>
            </div>
            <div style={{ fontWeight: 700 }}>{String(s.properties.Name ?? "")}</div>
            {ev.map((e) => (
              <button key={e.hid} className="icon-button" style={{ margin: 4 }} onClick={() => onSelect(e.hid)}>
                {e.typeName} {e.hid}
              </button>
            ))}
          </div>
        );
      })}
      {solutions.length === 0 && <p style={{ color: "var(--sstpa-navy-muted)" }}>No Solution nodes in this structure.</p>}
    </div>
  );
}

function ValidationView({
  findings,
  allGsnNodes,
  graphNodes,
  onSelect,
}: {
  findings: Finding[];
  allGsnNodes: SoINode[];
  graphNodes: SoINode[];
  onSelect: (hid: string) => void;
}) {
  const graphSet = new Set(graphNodes.map((n) => n.hid));
  const unreachable = allGsnNodes.filter((n) => !graphSet.has(n.hid));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      {findings.map((f, i) => (
        <div key={i} className="sstpa-alert-warning" style={{ marginBottom: 8 }}>
          <strong>{f.severity}</strong> {f.message}{" "}
          {f.nodeHid && <button className="icon-button" onClick={() => onSelect(f.nodeHid!)}>{f.nodeHid}</button>}
        </div>
      ))}
      {findings.length === 0 && <p className="state-ok">No structural findings for this Goal Structure.</p>}
      {unreachable.length > 0 && (
        <>
          <h3>Unreachable GSN Nodes In SoI</h3>
          {unreachable.map((n) => (
            <button key={n.hid} className="icon-button" onClick={() => onSelect(n.hid)}>{n.hid} {String(n.properties.Name ?? "")}</button>
          ))}
        </>
      )}
    </div>
  );
}

function ExportView({
  rootHid,
  nodes,
  edges,
  findings,
}: {
  rootHid: string;
  nodes: SoINode[];
  edges: { source: string; target: string; type: string }[];
  findings: Finding[];
}) {
  const md = exportMarkdown(rootHid, nodes, edges, findings);
  const json = JSON.stringify({ schemaVersion: "1.0", rootHid, nodes, edges, findings }, null, 2);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)", display: "flex", gap: 8 }}>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${rootHid}-gsn.md`, md, "text/markdown")}>Markdown</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${rootHid}-gsn.json`, json, "application/json")}>JSON</button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "var(--sstpa-sp-3)", whiteSpace: "pre-wrap", fontSize: "0.76rem" }}>{md}</pre>
    </div>
  );
}

function DetailPanel({
  node,
  rootHid,
  graphNodes,
  evidenceNodes,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onSelect,
}: {
  node?: SoINode;
  rootHid: string;
  graphNodes: SoINode[];
  evidenceNodes: SoINode[];
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onSelect: (hid: string) => void;
}) {
  const [newLabel, setNewLabel] = useState<GsnLabel>("GsnGoal");
  const [relType, setRelType] = useState<GsnRel>("SUPPORTED_BY");
  const [existingTarget, setExistingTarget] = useState("");
  const [evidenceTarget, setEvidenceTarget] = useState("");
  const [edit, setEdit] = useState({ name: "", statement: "" });

  useEffect(() => {
    if (!node) return;
    setEdit({ name: String(node.properties.Name ?? ""), statement: statement(node) });
  }, [node]);

  if (!node) {
    return <div style={{ width: 330, borderLeft: "var(--sstpa-border)", padding: "var(--sstpa-sp-3)" }}><p>Select a GSN node.</p></div>;
  }

  const canSupport = node.typeName === "GsnGoal" || node.typeName === "GsnStrategy";
  const canContext = node.typeName === "GsnGoal" || node.typeName === "GsnStrategy";
  const canEvidence = node.typeName === "GsnSolution";
  const outgoing = (node.relationships ?? []).filter((r) => ["SUPPORTED_BY", "IN_CONTEXT_OF", ...EVIDENCE_RELS].includes(r.type));

  const createNode = () => {
    const temp = "gsn";
    const props = defaultGsnProps(newLabel);
    const rel = relationshipFor(node.typeName, newLabel, relType);
    if (!rel) return;
    onCommit([
      { op: "createNode", tempId: temp, label: newLabel, properties: props },
      { op: "createRelationship", type: rel, sourceHid: node.hid, targetHid: `$${temp}` },
    ]);
  };

  const save = () => {
    onCommit([{ op: "updateNode", hid: node.hid, properties: { Name: edit.name, [statementProp(node.typeName)]: edit.statement } }]);
  };

  return (
    <div style={{ width: 330, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{node.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(node.properties.Name ?? "")}</h3>
      <GsnBadge typeName={node.typeName} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(node.hid)}>Open Drawer</button>
      </div>

      {GSN_LABELS.includes(node.typeName as GsnLabel) && (
        <>
          <label style={labelStyle}>Name<input className="sstpa-input" value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} /></label>
          <label style={labelStyle}>Statement<textarea className="sstpa-input" rows={4} value={edit.statement} onChange={(e) => setEdit((x) => ({ ...x, statement: e.target.value }))} /></label>
          <button className="sstpa-button" onClick={save}>Commit Node</button>
        </>
      )}

      {(canSupport || canContext) && (
        <>
          <h4>Add GSN Node</h4>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sstpa-input" value={newLabel} onChange={(e) => setNewLabel(e.target.value as GsnLabel)}>
              {GSN_LABELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <select className="sstpa-input" value={relType} onChange={(e) => setRelType(e.target.value as GsnRel)}>
              <option>SUPPORTED_BY</option>
              <option>IN_CONTEXT_OF</option>
            </select>
          </div>
          <button className="sstpa-button" style={{ marginTop: 6 }} disabled={!relationshipFor(node.typeName, newLabel, relType)} onClick={createNode}>
            Create
          </button>
          <h4>Link Existing</h4>
          <select className="sstpa-input" value={existingTarget} onChange={(e) => setExistingTarget(e.target.value)}>
            <option value="">Select GSN node</option>
            {graphNodes.filter((n) => n.hid !== node.hid && relationshipFor(node.typeName, n.typeName, relType)).map((n) => (
              <option key={n.hid} value={n.hid}>{n.hid} - {String(n.properties.Name ?? "")}</option>
            ))}
          </select>
          <button className="sstpa-button" style={{ marginTop: 6 }} disabled={!existingTarget} onClick={() => onCommit([{ op: "createRelationship", type: relType, sourceHid: node.hid, targetHid: existingTarget }])}>
            Link
          </button>
        </>
      )}

      {canEvidence && (
        <>
          <h4>Evidence</h4>
          <select className="sstpa-input" value={evidenceTarget} onChange={(e) => setEvidenceTarget(e.target.value)}>
            <option value="">Select evidence</option>
            {evidenceNodes.map((n) => (
              <option key={n.hid} value={n.hid}>{n.typeName} {n.hid} - {String(n.properties.Name ?? "")}</option>
            ))}
          </select>
          <button
            className="sstpa-button"
            style={{ marginTop: 6 }}
            disabled={!evidenceTarget}
            onClick={() => {
              const target = evidenceNodes.find((n) => n.hid === evidenceTarget);
              const type = target?.typeName === "Validation" ? "HAS_VALIDATION" : target?.typeName === "Verification" ? "HAS_VERIFICATION" : "HAS_LOSS";
              onCommit([{ op: "createRelationship", type, sourceHid: node.hid, targetHid: evidenceTarget }]);
            }}
          >
            Add Evidence
          </button>
        </>
      )}

      <h4>Outgoing</h4>
      {outgoing.map((r) => (
        <div key={`${r.type}-${r.targetHID}`} style={{ borderBottom: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.72rem" }}>
          <button className="icon-button" onClick={() => onSelect(r.targetHID)}>{r.type} {r.targetHID}</button>
          <button className="icon-button danger" onClick={() => onCommit([{ op: "deleteRelationship", type: r.type, sourceHid: node.hid, targetHid: r.targetHID }])}>Remove</button>
        </div>
      ))}
      {rootHid === node.hid && <div className="state-info" style={{ marginTop: 10, fontSize: "0.72rem" }}>Root Goal</div>}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };

function buildStructures(assets: SoINode[], losses: SoINode[], goals: SoINode[], byHid: Map<string, SoINode>): StructureOption[] {
  const out: StructureOption[] = [];
  const assetsWithGoals = assets.filter((a) => (a.relationships ?? []).some((r) => r.type === "HAS_GOAL"));
  for (const asset of assetsWithGoals) {
    const assetLosses = (asset.relationships ?? []).filter((r) => r.type === "HAS_LOSS").map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
    const assetGoals = (asset.relationships ?? []).filter((r) => r.type === "HAS_GOAL").map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
    for (const root of assetGoals) {
      const paired = assetLosses.find((l) => sameCriticalityAssurance(l, root)) ?? assetLosses[0];
      out.push({ asset, loss: paired, root });
    }
  }
  for (const root of goals.filter((g) => g.typeName === "GsnGoal" && !out.some((s) => s.root.hid === g.hid))) {
    const asset = assets.find((a) => (a.relationships ?? []).some((r) => r.type === "HAS_GOAL" && r.targetHID === root.hid));
    const loss = losses.find((l) => asset?.relationships?.some((r) => r.type === "HAS_LOSS" && r.targetHID === l.hid));
    out.push({ asset, loss, root });
  }
  return out.sort((a, b) => a.root.hid.localeCompare(b.root.hid));
}

function buildGsnGraph(rootHid: string, allGsnNodes: SoINode[], byHid: Map<string, SoINode>) {
  if (!rootHid) return { nodes: [] as SoINode[], edges: [] as { source: string; target: string; type: string }[] };
  const seen = new Set<string>();
  const edges: { source: string; target: string; type: string }[] = [];
  const queue = [rootHid];
  while (queue.length > 0) {
    const hid = queue.shift()!;
    if (seen.has(hid)) continue;
    seen.add(hid);
    const n = byHid.get(hid);
    if (!n) continue;
    for (const rel of n.relationships ?? []) {
      if (!["SUPPORTED_BY", "IN_CONTEXT_OF", ...EVIDENCE_RELS].includes(rel.type)) continue;
      edges.push({ source: hid, target: rel.targetHID, type: rel.type });
      const target = byHid.get(rel.targetHID);
      if (target && GSN_LABELS.includes(target.typeName as GsnLabel)) queue.push(rel.targetHID);
    }
  }
  return { nodes: allGsnNodes.filter((n) => seen.has(n.hid)), edges };
}

function validateStructure(rootHid: string, nodes: SoINode[], allGsnNodes: SoINode[]): Finding[] {
  const findings: Finding[] = [];
  if (!rootHid) return [{ severity: "ERROR", message: "No Root Goal selected." }];
  const root = nodes.find((n) => n.hid === rootHid);
  if (!root) findings.push({ severity: "ERROR", message: "Root Goal is not reachable in the current graph.", nodeHid: rootHid });
  for (const n of nodes) {
    if ((n.typeName === "GsnGoal" || n.typeName === "GsnStrategy") && !hasSupport(n)) {
      findings.push({ severity: "WARNING", nodeHid: n.hid, message: `${n.hid} has no SUPPORTING node.` });
    }
    if (n.typeName === "GsnSolution" && evidenceRelCount(n) === 0) {
      findings.push({ severity: "ERROR", nodeHid: n.hid, message: `${n.hid} is a Solution without evidence.` });
    }
    if (n.typeName === "GsnSolution" && (n.relationships ?? []).some((r) => r.type === "SUPPORTED_BY")) {
      findings.push({ severity: "ERROR", nodeHid: n.hid, message: `${n.hid} is a Solution with outgoing SUPPORT.` });
    }
  }
  const graphSet = new Set(nodes.map((n) => n.hid));
  const unreachable = allGsnNodes.filter((n) => !graphSet.has(n.hid));
  if (unreachable.length > 0) findings.push({ severity: "INFO", message: `${unreachable.length} GSN node(s) in the SoI are outside this Goal Structure.` });
  return findings;
}

function hasSupport(n: SoINode): boolean {
  return (n.relationships ?? []).some((r) => r.type === "SUPPORTED_BY");
}

function evidenceRelCount(n: SoINode): number {
  return (n.relationships ?? []).filter((r) => EVIDENCE_RELS.includes(r.type as (typeof EVIDENCE_RELS)[number])).length;
}

function evidenceFor(solution: SoINode, byHid: Map<string, SoINode>): SoINode[] {
  return (solution.relationships ?? [])
    .filter((r) => EVIDENCE_RELS.includes(r.type as (typeof EVIDENCE_RELS)[number]))
    .map((r) => byHid.get(r.targetHID))
    .filter((n): n is SoINode => !!n);
}

function filterGraphNodes(nodes: SoINode[], search: string): SoINode[] {
  if (!search.trim()) return nodes;
  const q = search.toLowerCase();
  return nodes.filter((n) => `${n.hid} ${n.uuid} ${n.typeName} ${String(n.properties.Name ?? "")} ${statement(n)}`.toLowerCase().includes(q));
}

function tierNodes(rootHid: string, nodes: SoINode[]): [number, SoINode[]][] {
  const byHid = new Map(nodes.map((n) => [n.hid, n]));
  const tiers = new Map<string, number>([[rootHid, 0]]);
  const queue = [rootHid];
  while (queue.length > 0) {
    const hid = queue.shift()!;
    const n = byHid.get(hid);
    if (!n) continue;
    for (const rel of n.relationships ?? []) {
      if (!["SUPPORTED_BY", "IN_CONTEXT_OF"].includes(rel.type)) continue;
      if (!byHid.has(rel.targetHID)) continue;
      if (!tiers.has(rel.targetHID)) {
        tiers.set(rel.targetHID, (tiers.get(hid) ?? 0) + 1);
        queue.push(rel.targetHID);
      }
    }
  }
  const grouped = new Map<number, SoINode[]>();
  for (const n of nodes) {
    const tier = tiers.get(n.hid) ?? 0;
    grouped.set(tier, [...(grouped.get(tier) ?? []), n]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b);
}

function rootForNode(hid: string, nodes: SoINode[]): string | null {
  const incoming = new Map<string, string[]>();
  for (const n of nodes) {
    for (const rel of n.relationships ?? []) {
      if (["SUPPORTED_BY", "IN_CONTEXT_OF"].includes(rel.type)) {
        incoming.set(rel.targetHID, [...(incoming.get(rel.targetHID) ?? []), n.hid]);
      }
    }
  }
  let cur: string | null = hid;
  const visited = new Set<string>();
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const parents: string[] = incoming.get(cur) ?? [];
    const supportedParent: string | undefined = parents.find((p: string) => nodes.find((n) => n.hid === p)?.typeName === "GsnGoal");
    if (!supportedParent) return cur;
    cur = supportedParent;
  }
  return cur;
}

function relationshipFor(sourceType: string, targetType: string, requested: GsnRel): GsnRel | null {
  if (requested === "SUPPORTED_BY") {
    if (sourceType === "GsnGoal" && ["GsnGoal", "GsnStrategy", "GsnSolution"].includes(targetType)) return "SUPPORTED_BY";
    if (sourceType === "GsnStrategy" && ["GsnGoal", "GsnSolution"].includes(targetType)) return "SUPPORTED_BY";
  }
  if (requested === "IN_CONTEXT_OF") {
    if (["GsnGoal", "GsnStrategy"].includes(sourceType) && ["GsnContext", "GsnJustification", "GsnAssumption"].includes(targetType)) return "IN_CONTEXT_OF";
  }
  return null;
}

function defaultGsnProps(label: GsnLabel): Record<string, unknown> {
  const prop = statementProp(label);
  return { Name: label.replace("Gsn", "New "), [prop]: "" };
}

function statementProp(typeName: string): string {
  switch (typeName) {
    case "GsnStrategy": return "StrategyStatement";
    case "GsnContext": return "ContextStatement";
    case "GsnJustification": return "JustificationStatement";
    case "GsnAssumption": return "AssumptionStatement";
    case "GsnSolution": return "SolutionStatement";
    default: return "GoalStatement";
  }
}

function statement(n: SoINode): string {
  return String(n.properties[statementProp(n.typeName)] ?? "");
}

function GsnBadge({ typeName }: { typeName: string }) {
  return <span className="type-badge" style={{ background: gsnColor(typeName) }}>{typeName.replace("Gsn", "")}</span>;
}

function gsnColor(typeName: string): string {
  if (typeName === "GsnGoal") return "var(--sstpa-status-info)";
  if (typeName === "GsnStrategy") return "var(--sstpa-node-interface)";
  if (typeName === "GsnSolution") return "var(--sstpa-status-ok)";
  if (typeName === "GsnAssumption") return "var(--sstpa-status-warn)";
  if (typeName === "GsnJustification") return "var(--sstpa-node-purpose)";
  return "var(--sstpa-node-muted)";
}

function shapeRadius(typeName: string): number {
  if (typeName === "GsnSolution") return 999;
  if (typeName === "GsnContext") return 18;
  if (typeName === "GsnAssumption" || typeName === "GsnJustification") return 999;
  return 4;
}

function sameCriticalityAssurance(loss: SoINode, goal: SoINode): boolean {
  const c = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"].some((k) => loss.properties[k] === true && goal.properties[k] === true);
  const a = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"].some((k) => loss.properties[k] === true && goal.properties[k] === true);
  return c && a;
}

function layoutSnapshot(rootHid: string, nodes: SoINode[]) {
  return {
    schemaVersion: "1.0",
    rootHid,
    toolType: "sstpa.goalkeeper",
    savedAt: new Date().toISOString(),
    layoutMode: "hierarchical-left-to-right",
    nodes: tierNodes(rootHid, nodes).flatMap(([tier, group]) =>
      group.map((n, idx) => ({ hid: n.hid, x: tier * 260, y: idx * 130, collapsed: false })),
    ),
  };
}

function exportMarkdown(rootHid: string, nodes: SoINode[], edges: { source: string; target: string; type: string }[], findings: Finding[]): string {
  let md = `# Goal Structure ${rootHid}\n\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const [tier, group] of tierNodes(rootHid, nodes)) {
    md += `## Tier ${tier}\n\n`;
    for (const n of group) md += `- ${n.hid} ${n.typeName}: ${String(n.properties.Name ?? "")}\n  ${statement(n)}\n`;
    md += "\n";
  }
  md += "## Relationships\n\n";
  for (const e of edges) md += `- ${e.source} -[:${e.type}]-> ${e.target}\n`;
  md += "\n## Findings\n\n";
  for (const f of findings) md += `- ${f.severity}: ${f.nodeHid ? `${f.nodeHid} ` : ""}${f.message}\n`;
  if (findings.length === 0) md += "No findings.\n";
  return md;
}

function downloadText(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
