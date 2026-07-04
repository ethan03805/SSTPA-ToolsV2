// Goal Keeper Tool (SRS §6.5.11): GSN assurance-case construction, evidence
// association, validation, diagram-state persistence, and exports.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { ToolStatus, downloadText, errorText } from "../shared";

type Mode = "structure" | "evidence" | "validation" | "export";
type GsnLabel = "GsnGoal" | "GsnStrategy" | "GsnContext" | "GsnJustification" | "GsnAssumption" | "GsnSolution";
type GsnRel = "SUPPORTED_BY" | "IN_CONTEXT_OF";

const GSN_LABELS: GsnLabel[] = ["GsnGoal", "GsnStrategy", "GsnContext", "GsnJustification", "GsnAssumption", "GsnSolution"];
const EVIDENCE_RELS = ["HAS_VALIDATION", "HAS_VERIFICATION", "HAS_LOSS"] as const;
const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;

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

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

type GsnEdge = { source: string; target: string; type: string };

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
  const [notice, setNotice] = useState<Notice>(null);
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
    // Cross-tool focus context wins over Data Drawer context (SRS §6.4).
    const hid = ctx.focusHid ?? ctx.drawerNodeHid;
    if (!hid || rootHid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (GSN_LABELS.includes(node.typeName as GsnLabel)) {
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
  }, [byHid, ctx.drawerNodeHid, ctx.focusHid, gsnNodes, rootHid, structures]);

  useEffect(() => {
    if (!rootHid && structures[0]) setRootHid(structures[0].root.hid);
  }, [rootHid, structures]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.goalkeeper", operations: ops }),
    onSuccess: (res) => {
      setNotice({ kind: "success", text: `Goal Keeper commit ${res.commitId.slice(0, 8)} accepted.` });
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  if (!ctx.soiHid) return <ToolStatus needsSoI />;
  if (soi.isLoading || soi.error) {
    return <ToolStatus loading={soi.isLoading} error={soi.error} onRetry={() => void soi.refetch()} />;
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
                properties: {
                  GoalStructure: JSON.stringify(
                    layoutSnapshot(rootHid, byHid.get(rootHid)?.uuid, graph.nodes),
                  ),
                },
              },
            ])
          }
        >
          Commit Layout
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
          {notice.text} <button className="icon-button" onClick={() => setNotice(null)}>x</button>
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
            <ExportView
              rootHid={rootHid}
              rootUuid={byHid.get(rootHid)?.uuid}
              nodes={graph.nodes}
              edges={graph.edges}
              byHid={byHid}
              findings={findings}
            />
          )}
        </div>
        <DetailPanel
          node={selectedNode}
          rootHid={rootHid}
          graphNodes={graph.nodes}
          graphEdges={graph.edges}
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
              <span className="type-badge" style={{ background: ev.length > 0 ? "var(--sstpa-status-ok)" : "var(--sstpa-status-warn)" }}>
                {ev.length > 0 ? `${ev.length} evidence` : "incomplete — no evidence"}
              </span>
            </div>
            <div style={{ fontWeight: 700 }}>{String(s.properties.Name ?? "")}</div>
            {/* Evidence rows per §6.5.11.12: type, HID, Name, ShortDescription,
                V-method/procedure, Loss Criticality/Assurance. */}
            {ev.map(({ node: e, relType }) => (
              <div
                key={`${relType}-${e.hid}`}
                style={{ borderTop: "1px solid var(--sstpa-line-soft)", padding: "4px 0", fontSize: "0.72rem" }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="type-badge" style={{ background: "var(--sstpa-status-info)" }}>{e.typeName}</span>
                  <button className="icon-button" onClick={() => onSelect(e.hid)}>{e.hid}</button>
                  <strong>{String(e.properties.Name ?? "")}</strong>
                  <span className="mono" style={{ fontSize: "0.62rem", color: "var(--sstpa-navy-muted)" }}>{relType}</span>
                </div>
                {String(e.properties.ShortDescription ?? "").trim() !== "" && (
                  <div style={{ color: "var(--sstpa-navy-muted)" }}>{String(e.properties.ShortDescription)}</div>
                )}
                {e.typeName === "Validation" && String(e.properties.VMethod ?? "").trim() !== "" && (
                  <div>Validation method: {String(e.properties.VMethod)}</div>
                )}
                {e.typeName === "Verification" && String(e.properties.Procedure ?? "").trim() !== "" && (
                  <div>Verification procedure: {String(e.properties.Procedure)}</div>
                )}
                {e.typeName === "Loss" && (
                  <div>
                    Criticality: {singleTrueProp(e, CRITICALITIES)} / Assurance: {singleTrueProp(e, ASSURANCES)}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {solutions.length === 0 && <p style={{ color: "var(--sstpa-navy-muted)" }}>No Solution nodes in this structure.</p>}
    </div>
  );
}

function singleTrueProp(n: SoINode, keys: readonly string[]): string {
  return keys.find((k) => n.properties[k] === true) ?? "—";
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
  rootUuid,
  nodes,
  edges,
  byHid,
  findings,
}: {
  rootHid: string;
  rootUuid?: string;
  nodes: SoINode[];
  edges: GsnEdge[];
  byHid: Map<string, SoINode>;
  findings: Finding[];
}) {
  const md = exportMarkdown(rootHid, nodes, edges, findings);
  // Full diagram JSON per §6.5.11.9/§6.5.11.19: authoritative GSN content
  // plus layout, viewport, and display settings sufficient to reconstruct
  // the diagram from Backend data alone.
  const json = JSON.stringify(
    {
      ...layoutSnapshot(rootHid, rootUuid, nodes),
      gsnNodes: nodes.map((n) => ({
        hid: n.hid,
        uuid: n.uuid,
        typeName: n.typeName,
        gsnId: gsnId(n) || null,
        name: String(n.properties.Name ?? ""),
        statement: statement(n),
      })),
      gsnRelationships: edges,
      evidenceReferences: nodes
        .filter((n) => n.typeName === "GsnSolution")
        .map((n) => ({
          solutionHid: n.hid,
          evidence: evidenceFor(n, byHid).map(({ node: e, relType }) => ({
            relType,
            hid: e.hid,
            typeName: e.typeName,
            name: String(e.properties.Name ?? ""),
          })),
        })),
      validationFindings: findings,
    },
    null,
    2,
  );
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)", display: "flex", gap: 8, alignItems: "center" }}>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${rootHid}-gsn.md`, md, "text/markdown")}>Markdown</button>
        <button className="sstpa-button" onClick={() => downloadText(`sstpa-${rootHid}-gsn.json`, json, "application/json")}>JSON</button>
        <span style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
          PNG/SVG export deferred: the structure view renders as DOM tiers, not a canvas.
        </span>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "var(--sstpa-sp-3)", whiteSpace: "pre-wrap", fontSize: "0.76rem" }}>{md}</pre>
    </div>
  );
}

function DetailPanel({
  node,
  rootHid,
  graphNodes,
  graphEdges,
  evidenceNodes,
  drawerOpen,
  onOpenDrawer,
  onCommit,
  onSelect,
}: {
  node?: SoINode;
  rootHid: string;
  graphNodes: SoINode[];
  graphEdges: GsnEdge[];
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
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);

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
  const isRoot = rootHid === node.hid;
  const rootPath = pathToRoot(rootHid, node.hid, graphEdges);

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

  /** §6.5.11.11: warn before Commit when removing a relationship would leave
   *  GSN nodes unreachable from the Root Goal. */
  const removeRelationship = (type: string, targetHid: string) => {
    const ops: CommitOperation[] = [{ op: "deleteRelationship", type, sourceHid: node.hid, targetHid }];
    const orphans = unreachableAfterRemoval(rootHid, graphNodes, graphEdges, node.hid, type, targetHid);
    if (orphans.length > 0) {
      setConfirm({
        title: "Removing this relationship orphans nodes",
        body: `Deleting ${node.hid} -[:${type}]-> ${targetHid} leaves ${orphans.length} GSN node(s) unreachable from the Root Goal: ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? ", …" : ""}. Commit anyway?`,
        onConfirm: () => onCommit(ops),
      });
    } else {
      onCommit(ops);
    }
  };

  /** §6.5.11.13: Root Goal deletion removes the certification argument —
   *  always behind a danger confirmation. */
  const deleteNode = () => {
    setConfirm({
      title: isRoot ? "Delete Root Goal" : `Delete ${node.typeName.replace("Gsn", "")}`,
      body: isRoot
        ? `Deleting Root Goal ${node.hid} removes the entire certification argument for this Asset-Loss case (SRS §6.5.11.13). This cannot be undone.`
        : `Delete ${node.hid} (${String(node.properties.Name ?? "")}) and all of its relationships? Descendant nodes may become unreachable.`,
      onConfirm: () => onCommit([{ op: "deleteNode", hid: node.hid }]),
    });
  };

  return (
    <div style={{ width: 330, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{node.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(node.properties.Name ?? "")}</h3>
      <GsnBadge typeName={node.typeName} />
      {gsnId(node) !== "" && (
        <span className="mono" style={{ fontSize: "0.7rem", marginLeft: 6 }}>GSN ID: {gsnId(node)}</span>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(node.hid)}>Open Drawer</button>
        <button className="sstpa-button danger" onClick={deleteNode}>Delete Node</button>
      </div>

      {/* Path-to-root display (§6.5.11.17). */}
      {rootPath.length > 1 && (
        <div style={{ marginTop: 10, fontSize: "0.7rem" }}>
          <div style={{ color: "var(--sstpa-navy-muted)" }}>Path to root</div>
          {rootPath.map((hid, i) => (
            <span key={hid}>
              {i > 0 && " -> "}
              <button className="icon-button" onClick={() => onSelect(hid)}>{hid}</button>
            </span>
          ))}
        </div>
      )}

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
          <button className="icon-button danger" onClick={() => removeRelationship(r.type, r.targetHID)}>Commit Remove</button>
        </div>
      ))}
      {isRoot && <div className="state-info" style={{ marginTop: 10, fontSize: "0.72rem" }}>Root Goal</div>}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          danger
          confirmLabel="Commit"
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        >
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Chain from the Root Goal to the target following SUPPORTED_BY and
 *  IN_CONTEXT_OF edges (§6.5.11.17 path-to-root display). */
function pathToRoot(rootHid: string, targetHid: string, edges: GsnEdge[]): string[] {
  if (!rootHid || rootHid === targetHid) return [rootHid].filter(Boolean);
  const children = new Map<string, string[]>();
  for (const e of edges) {
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }
  const parent = new Map<string, string>();
  const queue = [rootHid];
  const seen = new Set([rootHid]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of children.get(cur) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      parent.set(c, cur);
      if (c === targetHid) {
        const path = [c];
        let p: string | undefined = cur;
        while (p) {
          path.unshift(p);
          p = parent.get(p);
        }
        return path;
      }
      queue.push(c);
    }
  }
  return [];
}

/** Nodes of the structure that become unreachable from the Root Goal if one
 *  relationship is removed (§6.5.11.11 deletion safety). */
function unreachableAfterRemoval(
  rootHid: string,
  nodes: SoINode[],
  edges: GsnEdge[],
  removeSource: string,
  removeType: string,
  removeTarget: string,
): string[] {
  const inStructure = new Set(nodes.map((n) => n.hid));
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (e.source === removeSource && e.type === removeType && e.target === removeTarget) continue;
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }
  const reachable = new Set([rootHid]);
  const queue = [rootHid];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of children.get(cur) ?? []) {
      if (!reachable.has(c)) {
        reachable.add(c);
        queue.push(c);
      }
    }
  }
  return [...inStructure].filter((hid) => !reachable.has(hid));
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

/** Structural validation per §6.5.11.14: exactly-one-root, DAG acyclicity,
 *  duplicate relationships, GSN ID uniqueness, Solution rules. Solutions
 *  without evidence are incompleteness (WARNING), not a hard error. */
function validateStructure(rootHid: string, nodes: SoINode[], allGsnNodes: SoINode[]): Finding[] {
  const findings: Finding[] = [];
  if (!rootHid) return [{ severity: "ERROR", message: "No Root Goal selected." }];
  const root = nodes.find((n) => n.hid === rootHid);
  if (!root) findings.push({ severity: "ERROR", message: "Root Goal is not reachable in the current graph.", nodeHid: rootHid });

  const inStructure = new Set(nodes.map((n) => n.hid));
  const incomingSupport = new Set<string>();
  const edgeCounts = new Map<string, number>();
  for (const n of nodes) {
    for (const rel of n.relationships ?? []) {
      if (!["SUPPORTED_BY", "IN_CONTEXT_OF", ...EVIDENCE_RELS].includes(rel.type)) continue;
      if (rel.type === "SUPPORTED_BY" && inStructure.has(rel.targetHID)) incomingSupport.add(rel.targetHID);
      const key = `${n.hid}|${rel.type}|${rel.targetHID}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  // Exactly one Root Goal (§6.5.11.8): no other in-structure GsnGoal may be
  // free of incoming SUPPORTED_BY.
  for (const n of nodes) {
    if (n.typeName === "GsnGoal" && n.hid !== rootHid && !incomingSupport.has(n.hid)) {
      findings.push({
        severity: "ERROR",
        nodeHid: n.hid,
        message: `${n.hid} is a second root Goal (no incoming SUPPORTED_BY). A Goal Structure has exactly one Root Goal.`,
      });
    }
  }

  // Duplicate logical relationships (§6.5.11.7).
  for (const [key, count] of edgeCounts) {
    if (count > 1) {
      const [source, type, target] = key.split("|");
      findings.push({
        severity: "ERROR",
        nodeHid: source,
        message: `Duplicate ${type} relationship ${source} -> ${target} (${count} copies). Remove the duplicates.`,
      });
    }
  }

  // DAG acyclicity (§6.5.11.7) — DFS over SUPPORTED_BY within the structure.
  const cycleAt = findSupportCycle(nodes, inStructure);
  if (cycleAt) {
    findings.push({
      severity: "ERROR",
      nodeHid: cycleAt,
      message: `Cycle detected in SUPPORTED_BY relationships involving ${cycleAt}. The Goal Structure must be a DAG.`,
    });
  }

  // GSN ID uniqueness within the structure (§6.5.11.14).
  const idOwners = new Map<string, string[]>();
  for (const n of nodes) {
    const gid = gsnId(n);
    if (gid) idOwners.set(gid, [...(idOwners.get(gid) ?? []), n.hid]);
  }
  for (const [gid, hids] of idOwners) {
    if (hids.length > 1) {
      findings.push({
        severity: "ERROR",
        nodeHid: hids[1],
        message: `GSN ID "${gid}" is used by ${hids.length} nodes (${hids.join(", ")}). GSN IDs must be unique within the Goal Structure.`,
      });
    }
  }

  for (const n of nodes) {
    if ((n.typeName === "GsnGoal" || n.typeName === "GsnStrategy") && !hasSupport(n)) {
      findings.push({ severity: "WARNING", nodeHid: n.hid, message: `${n.hid} has no SUPPORTING node.` });
    }
    if (n.typeName === "GsnSolution" && evidenceRelCount(n) === 0) {
      findings.push({
        severity: "WARNING",
        nodeHid: n.hid,
        message: `${n.hid} is a Solution without evidence — the Goal Structure cannot be marked complete until evidence is referenced (§6.5.11.12).`,
      });
    }
    if (n.typeName === "GsnSolution" && (n.relationships ?? []).some((r) => r.type === "SUPPORTED_BY")) {
      findings.push({ severity: "ERROR", nodeHid: n.hid, message: `${n.hid} is a Solution with outgoing SUPPORT.` });
    }
  }
  const unreachable = allGsnNodes.filter((n) => !inStructure.has(n.hid));
  if (unreachable.length > 0) findings.push({ severity: "INFO", message: `${unreachable.length} GSN node(s) in the SoI are outside this Goal Structure.` });
  return findings;
}

/** DFS cycle detection over SUPPORTED_BY edges; returns a node on a cycle. */
function findSupportCycle(nodes: SoINode[], inStructure: Set<string>): string | null {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(
      n.hid,
      (n.relationships ?? [])
        .filter((r) => r.type === "SUPPORTED_BY" && inStructure.has(r.targetHID))
        .map((r) => r.targetHID),
    );
  }
  const state = new Map<string, 1 | 2>(); // 1 = in stack, 2 = done
  const visit = (hid: string): string | null => {
    state.set(hid, 1);
    for (const next of adj.get(hid) ?? []) {
      const st = state.get(next);
      if (st === 1) return next;
      if (st === undefined) {
        const found = visit(next);
        if (found) return found;
      }
    }
    state.set(hid, 2);
    return null;
  };
  for (const n of nodes) {
    if (!state.has(n.hid)) {
      const found = visit(n.hid);
      if (found) return found;
    }
  }
  return null;
}

/** Per-type GSN ID property (GoalID, StrategyID, …) per the schema. */
function gsnId(n: SoINode): string {
  if (!GSN_LABELS.includes(n.typeName as GsnLabel)) return "";
  const prop = `${n.typeName.replace("Gsn", "")}ID`;
  return String(n.properties[prop] ?? "").trim();
}

function hasSupport(n: SoINode): boolean {
  return (n.relationships ?? []).some((r) => r.type === "SUPPORTED_BY");
}

function evidenceRelCount(n: SoINode): number {
  return (n.relationships ?? []).filter((r) => EVIDENCE_RELS.includes(r.type as (typeof EVIDENCE_RELS)[number])).length;
}

function evidenceFor(solution: SoINode, byHid: Map<string, SoINode>): { node: SoINode; relType: string }[] {
  return (solution.relationships ?? [])
    .filter((r) => EVIDENCE_RELS.includes(r.type as (typeof EVIDENCE_RELS)[number]))
    .map((r) => ({ node: byHid.get(r.targetHID), relType: r.type }))
    .filter((x): x is { node: SoINode; relType: string } => !!x.node);
}

/** Search per §6.5.11.17: HID, uuid, type, name, statement text, GSN ID,
 *  and referenced evidence HIDs. */
function filterGraphNodes(nodes: SoINode[], search: string): SoINode[] {
  if (!search.trim()) return nodes;
  const q = search.toLowerCase();
  return nodes.filter((n) => {
    const evidenceHids = (n.relationships ?? [])
      .filter((r) => EVIDENCE_RELS.includes(r.type as (typeof EVIDENCE_RELS)[number]))
      .map((r) => r.targetHID)
      .join(" ");
    return `${n.hid} ${n.uuid} ${n.typeName} ${gsnId(n)} ${String(n.properties.Name ?? "")} ${statement(n)} ${evidenceHids}`
      .toLowerCase()
      .includes(q);
  });
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

/** Resolve the Root Goal for any GSN node by walking incoming SUPPORTED_BY
 *  edges upward through Goals AND Strategies until no structural parent
 *  remains (§6.5.11.8). IN_CONTEXT_OF is ignored for root resolution, except
 *  as a single anchor hop for pure context nodes (Context / Justification /
 *  Assumption), which have no SUPPORTED_BY parents of their own. */
function rootForNode(hid: string, nodes: SoINode[]): string | null {
  const byHid = new Map(nodes.map((n) => [n.hid, n]));
  const supportParents = new Map<string, string[]>();
  const contextParents = new Map<string, string[]>();
  for (const n of nodes) {
    for (const rel of n.relationships ?? []) {
      if (rel.type === "SUPPORTED_BY") {
        supportParents.set(rel.targetHID, [...(supportParents.get(rel.targetHID) ?? []), n.hid]);
      } else if (rel.type === "IN_CONTEXT_OF") {
        contextParents.set(rel.targetHID, [...(contextParents.get(rel.targetHID) ?? []), n.hid]);
      }
    }
  }
  let cur = hid;
  if (!supportParents.has(cur)) {
    const anchor = (contextParents.get(cur) ?? [])[0];
    if (anchor) cur = anchor;
  }
  const visited = new Set<string>();
  while (!visited.has(cur)) {
    visited.add(cur);
    const structural = (supportParents.get(cur) ?? []).filter((p) => {
      const t = byHid.get(p)?.typeName;
      return t === "GsnGoal" || t === "GsnStrategy";
    });
    const next = structural.find((p) => !visited.has(p));
    if (!next) break;
    cur = next;
  }
  return byHid.has(cur) ? cur : null;
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

/** Persisted diagram JSON per §6.5.11.9: schema version, root identity, tool
 *  type, viewport/zoom, node positions, edge routing, collapsed state, and
 *  display toggles — presentation data only, never authoritative. */
function layoutSnapshot(rootHid: string, rootUuid: string | undefined, nodes: SoINode[]) {
  return {
    schemaVersion: "1.0",
    rootGoalHid: rootHid,
    rootGoalUuid: rootUuid ?? null,
    toolType: "sstpa.goalkeeper",
    savedAt: new Date().toISOString(),
    layoutMode: "hierarchical-left-to-right",
    viewport: { x: 0, y: 0 },
    zoom: 1,
    displayToggles: {
      evidencePanel: true,
      statements: true,
      validationMarkers: true,
    },
    edgeRouting: [],
    nodes: tierNodes(rootHid, nodes).flatMap(([tier, group]) =>
      group.map((n, idx) => ({ hid: n.hid, x: tier * 260, y: idx * 130, collapsed: false })),
    ),
  };
}

function exportMarkdown(rootHid: string, nodes: SoINode[], edges: GsnEdge[], findings: Finding[]): string {
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
