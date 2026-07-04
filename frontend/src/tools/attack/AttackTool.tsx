// Attack Tool (SRS §6.5.16): create, organize, associate, metric-tag, and
// export (:Attack) nodes consumed by the Loss Tool.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type AttackLevel = "STRATEGY" | "TACTIC" | "PROCEDURE";
type Mode = "entity" | "hierarchy" | "catalog";
type EntityFilter = "all" | "Interface" | "SystemFunction" | "Component";
type CoverageFilter = "all" | "has-attacks" | "no-attacks";

const ENTITY_ORDER = ["Interface", "SystemFunction", "Component"] as const;
const LEVELS: AttackLevel[] = ["STRATEGY", "TACTIC", "PROCEDURE"];

export default function AttackTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const openTool = useToolWindows((s) => s.openTool);
  const [mode, setMode] = useState<Mode>("entity");
  const [entityType, setEntityType] = useState<EntityFilter>("all");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [assetScope, setAssetScope] = useState("");
  const [query, setQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedAttack, setSelectedAttack] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const attacks = nodes.filter((n) => n.typeName === "Attack");
  const entities = useMemo(
    () =>
      ENTITY_ORDER.flatMap((type) => nodes.filter((n) => n.typeName === type)),
    [nodes],
  );
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");
  const losses = nodes.filter((n) => n.typeName === "Loss");
  const countermeasures = nodes.filter((n) => n.typeName === "Countermeasure");

  useEffect(() => {
    const hid = ctx.drawerNodeHid;
    if (!hid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "Attack") {
      setSelectedAttack(hid);
      const entity = attackEntities(node, byHid)[0];
      if (entity) setSelectedEntity(entity.hid);
      setMode("catalog");
    } else if (ENTITY_ORDER.includes(node.typeName as (typeof ENTITY_ORDER)[number])) {
      setSelectedEntity(hid);
      setMode("entity");
    } else if (node.typeName === "Asset" || node.typeName === "DerivedAsset") {
      setAssetScope(hid);
    }
  }, [byHid, ctx.drawerNodeHid]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.attack", operations: ops }),
    onSuccess: (res) => {
      setNotice(`Attack Tool commit ${res.commitId.slice(0, 8)} accepted.`);
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice(String(e)),
  });

  const attackMap = useMemo(() => new Map(attacks.map((a) => [a.hid, a])), [attacks]);
  const selectedAttackNode = selectedAttack ? attackMap.get(selectedAttack) : undefined;
  const selectedEntityNode = selectedEntity ? byHid.get(selectedEntity) : undefined;

  const visibleEntities = entities.filter((e) => {
    if (entityType !== "all" && e.typeName !== entityType) return false;
    if (query && !`${e.hid} ${String(e.properties.Name ?? "")}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (assetScope && !entityHasCurrentTrace(e, assetScope)) return false;
    const count = attacksForEntity(e.hid, attacks).length;
    if (coverageFilter === "has-attacks" && count === 0) return false;
    if (coverageFilter === "no-attacks" && count > 0) return false;
    return true;
  });

  useEffect(() => {
    if (!selectedEntity && visibleEntities[0]) setSelectedEntity(visibleEntities[0].hid);
  }, [selectedEntity, visibleEntities]);

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
        <button className={`sstpa-button ${mode === "entity" ? "" : "secondary"}`} onClick={() => setMode("entity")}>
          Entity Mode
        </button>
        <button className={`sstpa-button ${mode === "hierarchy" ? "" : "secondary"}`} onClick={() => setMode("hierarchy")}>
          Hierarchy
        </button>
        <button className={`sstpa-button ${mode === "catalog" ? "" : "secondary"}`} onClick={() => setMode("catalog")}>
          Catalog
        </button>
        <select className="sstpa-input" style={{ width: "auto" }} value={assetScope} onChange={(e) => setAssetScope(e.target.value)}>
          <option value="">All Assets</option>
          {assets.map((a) => (
            <option key={a.hid} value={a.hid}>
              {a.hid} - {String(a.properties.Name ?? "")}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button className="icon-button" onClick={() => downloadText("sstpa-attack-coverage.csv", coverageCsv(entities, attacks), "text/csv")}>
          Coverage CSV
        </button>
        <button className="icon-button" onClick={() => downloadText("sstpa-attack-catalog.md", catalogMarkdown(attacks, byHid), "text/markdown")}>
          Catalog MD
        </button>
        <button className="icon-button" onClick={() => downloadText("sstpa-attack-hierarchy.md", hierarchyMarkdown(attacks), "text/markdown")}>
          Hierarchy MD
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
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <EntityRoster
          entities={visibleEntities}
          attacks={attacks}
          entityType={entityType}
          coverageFilter={coverageFilter}
          query={query}
          selectedEntity={selectedEntity}
          onEntityType={setEntityType}
          onCoverageFilter={setCoverageFilter}
          onQuery={setQuery}
          onSelect={(hid) => {
            setSelectedEntity(hid);
            setMode("entity");
          }}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {mode === "entity" && (
            <EntityAttackView
              entity={selectedEntityNode}
              attacks={attacksForEntity(selectedEntity ?? "", attacks)}
              allAttacks={attacks}
              byHid={byHid}
              onNew={() => setNewOpen(true)}
              onSelectAttack={setSelectedAttack}
              selectedAttack={selectedAttack}
              onAssociate={(attackHid) =>
                selectedEntity &&
                commit.mutate([{ op: "createRelationship", type: "EXPLOITS", sourceHid: attackHid, targetHid: selectedEntity }])
              }
              onRemove={(attackHid) =>
                selectedEntity &&
                commit.mutate([{ op: "deleteRelationship", type: "EXPLOITS", sourceHid: attackHid, targetHid: selectedEntity }])
              }
              onOpenReference={() => openTool("sstpa.reference")}
            />
          )}
          {mode === "hierarchy" && (
            <HierarchyView
              attacks={attacks}
              selectedAttack={selectedAttack}
              onSelectAttack={setSelectedAttack}
              onSetParent={(child, parent) => {
                const oldParent = parentOf(attackMap.get(child));
                const ops: CommitOperation[] = [];
                if (oldParent) ops.push({ op: "deleteRelationship", type: "SUBORDINATE_TO", sourceHid: child, targetHid: oldParent });
                if (parent) ops.push({ op: "createRelationship", type: "SUBORDINATE_TO", sourceHid: child, targetHid: parent });
                if (ops.length > 0) commit.mutate(ops);
              }}
            />
          )}
          {mode === "catalog" && (
            <AttackCatalog
              attacks={attacks}
              selectedAttack={selectedAttack}
              onSelectAttack={setSelectedAttack}
              byHid={byHid}
            />
          )}
        </div>

        <AttackDetail
          attack={selectedAttackNode}
          attacks={attacks}
          losses={losses}
          countermeasures={countermeasures}
          byHid={byHid}
          drawerOpen={drawerOpen}
          onOpenDrawer={(hid) => openDrawer({ mode: "edit", hid })}
          onCommit={(ops) => commit.mutate(ops)}
        />
      </div>
      {newOpen && (
        <NewAttackDialog
          selectedEntity={selectedEntity}
          onClose={() => setNewOpen(false)}
          onCreate={(props) => {
            const ops: CommitOperation[] = [{ op: "createNode", tempId: "atk", label: "Attack", properties: props }];
            if (selectedEntity) ops.push({ op: "createRelationship", type: "EXPLOITS", sourceHid: "$atk", targetHid: selectedEntity });
            commit.mutate(ops);
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EntityRoster({
  entities,
  attacks,
  entityType,
  coverageFilter,
  query,
  selectedEntity,
  onEntityType,
  onCoverageFilter,
  onQuery,
  onSelect,
}: {
  entities: SoINode[];
  attacks: SoINode[];
  entityType: EntityFilter;
  coverageFilter: CoverageFilter;
  query: string;
  selectedEntity: string | null;
  onEntityType: (v: EntityFilter) => void;
  onCoverageFilter: (v: CoverageFilter) => void;
  onQuery: (v: string) => void;
  onSelect: (hid: string) => void;
}) {
  return (
    <div style={{ width: 300, borderRight: "var(--sstpa-border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: 8, display: "grid", gap: 6 }}>
        <input className="sstpa-input" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search entities" />
        <div style={{ display: "flex", gap: 6 }}>
          <select className="sstpa-input" value={entityType} onChange={(e) => onEntityType(e.target.value as EntityFilter)}>
            <option value="all">All types</option>
            <option value="Interface">Interfaces</option>
            <option value="SystemFunction">Functions</option>
            <option value="Component">Elements</option>
          </select>
          <select className="sstpa-input" value={coverageFilter} onChange={(e) => onCoverageFilter(e.target.value as CoverageFilter)}>
            <option value="all">All</option>
            <option value="has-attacks">Has Attacks</option>
            <option value="no-attacks">No Attacks</option>
          </select>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {entities.map((e) => {
          const count = attacksForEntity(e.hid, attacks).length;
          return (
            <button
              key={e.hid}
              className="entity-card"
              style={{
                width: "calc(100% - 12px)",
                margin: 6,
                textAlign: "left",
                cursor: "pointer",
                borderColor: selectedEntity === e.hid ? "var(--sstpa-gold)" : undefined,
              }}
              onClick={() => onSelect(e.hid)}
            >
              <div className="entity-card-header">
                <span className="type-badge" style={{ background: colorForType(e.typeName) }}>{shortType(e.typeName)}</span>
                <span className="entity-hid">{e.hid}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", marginTop: 4 }}>{String(e.properties.Name ?? "")}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--sstpa-navy-muted)" }}>
                {readinessLabel(e, attacks)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EntityAttackView({
  entity,
  attacks,
  allAttacks,
  byHid,
  selectedAttack,
  onNew,
  onSelectAttack,
  onAssociate,
  onRemove,
  onOpenReference,
}: {
  entity?: SoINode;
  attacks: SoINode[];
  allAttacks: SoINode[];
  byHid: Map<string, SoINode>;
  selectedAttack: string | null;
  onNew: () => void;
  onSelectAttack: (hid: string) => void;
  onAssociate: (hid: string) => void;
  onRemove: (hid: string) => void;
  onOpenReference: () => void;
}) {
  const [associate, setAssociate] = useState("");
  const available = allAttacks.filter((a) => !attacks.some((x) => x.hid === a.hid));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)" }}>
        <div style={{ fontWeight: 700 }}>{entity ? `${entity.hid} - ${String(entity.properties.Name ?? "")}` : "No entity selected"}</div>
        <span style={{ flex: 1 }} />
        <button className="sstpa-button" disabled={!entity} onClick={onNew}>New Attack</button>
        <button className="sstpa-button secondary" onClick={onOpenReference}>Reference Tool</button>
      </div>
      <div style={{ padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)", display: "flex", gap: 6 }}>
        <select className="sstpa-input" value={associate} onChange={(e) => setAssociate(e.target.value)}>
          <option value="">Associate existing Attack</option>
          {available.map((a) => (
            <option key={a.hid} value={a.hid}>{a.hid} - {String(a.properties.Name ?? "")}</option>
          ))}
        </select>
        <button className="sstpa-button" disabled={!associate || !entity} onClick={() => { onAssociate(associate); setAssociate(""); }}>
          Associate
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
        {attacks.map((a) => (
          <AttackRow
            key={a.hid}
            attack={a}
            byHid={byHid}
            selected={selectedAttack === a.hid}
            onSelect={() => onSelectAttack(a.hid)}
            action={<button className="icon-button danger" onClick={() => onRemove(a.hid)}>Remove</button>}
          />
        ))}
        {entity && attacks.length === 0 && <p style={{ color: "var(--sstpa-navy-muted)" }}>No Attacks associated to this entity.</p>}
      </div>
    </div>
  );
}

function HierarchyView({
  attacks,
  selectedAttack,
  onSelectAttack,
  onSetParent,
}: {
  attacks: SoINode[];
  selectedAttack: string | null;
  onSelectAttack: (hid: string) => void;
  onSetParent: (child: string, parent: string | null) => void;
}) {
  const roots = attacks.filter((a) => !parentOf(a));
  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
        {roots.map((r) => (
          <HierarchyNode
            key={r.hid}
            attack={r}
            attacks={attacks}
            depth={0}
            selectedAttack={selectedAttack}
            onSelectAttack={onSelectAttack}
          />
        ))}
        {attacks.length === 0 && <p style={{ color: "var(--sstpa-navy-muted)" }}>No Attack nodes in this SoI.</p>}
      </div>
      <div style={{ width: 260, borderLeft: "var(--sstpa-border-soft)", padding: "var(--sstpa-sp-3)" }}>
        <h3 style={{ marginTop: 0 }}>Parent</h3>
        <select className="sstpa-input" value={selectedAttack ?? ""} onChange={(e) => onSelectAttack(e.target.value)}>
          <option value="">Select child Attack</option>
          {attacks.map((a) => <option key={a.hid} value={a.hid}>{a.hid} - {String(a.properties.Name ?? "")}</option>)}
        </select>
        <select className="sstpa-input" style={{ marginTop: 8 }} disabled={!selectedAttack} onChange={(e) => selectedAttack && onSetParent(selectedAttack, e.target.value || null)} value={selectedAttack ? parentOf(attacks.find((a) => a.hid === selectedAttack)) ?? "" : ""}>
          <option value="">No parent</option>
          {attacks.filter((a) => a.hid !== selectedAttack && !wouldSelfParent(a, selectedAttack, attacks)).map((a) => (
            <option key={a.hid} value={a.hid}>{a.hid} - {String(a.properties.Name ?? "")}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function HierarchyNode({
  attack,
  attacks,
  depth,
  selectedAttack,
  onSelectAttack,
}: {
  attack: SoINode;
  attacks: SoINode[];
  depth: number;
  selectedAttack: string | null;
  onSelectAttack: (hid: string) => void;
}) {
  const children = attacks.filter((a) => parentOf(a) === attack.hid);
  return (
    <div style={{ marginLeft: depth * 18, marginBottom: 6 }}>
      <button
        className="entity-card"
        style={{ width: 340, maxWidth: "100%", textAlign: "left", borderColor: selectedAttack === attack.hid ? "var(--sstpa-gold)" : undefined }}
        onClick={() => onSelectAttack(attack.hid)}
      >
        <div className="entity-card-header">
          <span className="entity-hid">{attack.hid}</span>
          <LevelBadge level={String(attack.properties.AttackLevel ?? "TACTIC") as AttackLevel} />
          {attack.properties.IsRVCandidate === true && <span className="type-badge" style={{ background: "var(--sstpa-gold)" }}>RV</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{String(attack.properties.Name ?? "")}</div>
      </button>
      {children.map((c) => (
        <HierarchyNode key={c.hid} attack={c} attacks={attacks} depth={depth + 1} selectedAttack={selectedAttack} onSelectAttack={onSelectAttack} />
      ))}
    </div>
  );
}

function AttackCatalog({
  attacks,
  selectedAttack,
  onSelectAttack,
  byHid,
}: {
  attacks: SoINode[];
  selectedAttack: string | null;
  onSelectAttack: (hid: string) => void;
  byHid: Map<string, SoINode>;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
            <th style={{ padding: "4px 6px" }}>HID</th>
            <th>Name</th>
            <th>Level</th>
            <th>References</th>
            <th>Entities</th>
            <th>Metrics</th>
          </tr>
        </thead>
        <tbody>
          {attacks.map((a) => (
            <tr
              key={a.hid}
              onClick={() => onSelectAttack(a.hid)}
              style={{ cursor: "pointer", borderBottom: "1px solid var(--sstpa-line-soft)", background: selectedAttack === a.hid ? "var(--sstpa-ivory-sunken)" : undefined }}
            >
              <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>{a.hid}</td>
              <td>{String(a.properties.Name ?? "")}</td>
              <td><LevelBadge level={String(a.properties.AttackLevel ?? "TACTIC") as AttackLevel} /></td>
              <td>{[a.properties.ReferenceFramework, a.properties.ReferenceID].filter(Boolean).join(" ") || "—"}</td>
              <td>{attackEntities(a, byHid).map((e) => e.hid).join(", ") || "—"}</td>
              <td className="mono" style={{ fontSize: "0.66rem" }}>{String(a.properties.MetricsJSON ?? "") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttackDetail({
  attack,
  attacks,
  losses,
  countermeasures,
  byHid,
  drawerOpen,
  onOpenDrawer,
  onCommit,
}: {
  attack?: SoINode;
  attacks: SoINode[];
  losses: SoINode[];
  countermeasures: SoINode[];
  byHid: Map<string, SoINode>;
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
}) {
  const [edit, setEdit] = useState({ name: "", short: "", long: "", level: "TACTIC" as AttackLevel, rv: false, metrics: "{}" });
  const [targetLoss, setTargetLoss] = useState("");
  useEffect(() => {
    if (!attack) return;
    setEdit({
      name: String(attack.properties.Name ?? ""),
      short: String(attack.properties.ShortDescription ?? ""),
      long: String(attack.properties.LongDescription ?? ""),
      level: String(attack.properties.AttackLevel ?? "TACTIC") as AttackLevel,
      rv: attack.properties.IsRVCandidate === true,
      metrics: String(attack.properties.MetricsJSON ?? "{}"),
    });
  }, [attack]);

  if (!attack) {
    return (
      <div style={{ width: 330, borderLeft: "var(--sstpa-border)", padding: "var(--sstpa-sp-3)" }}>
        <p style={{ color: "var(--sstpa-navy-muted)" }}>Select an Attack.</p>
      </div>
    );
  }

  const entities = attackEntities(attack, byHid);
  const parent = parentOf(attack);
  const children = attacks.filter((a) => parentOf(a) === attack.hid);
  const blockers = countermeasures.filter((cm) => (cm.relationships ?? []).some((r) => r.type === "BLOCKS" && r.targetHID === attack.hid));
  const targeted = (attack.relationships ?? []).filter((r) => r.type === "TARGETS_LOSS").map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
  const metricsValid = validMetrics(edit.metrics);

  const save = () => {
    onCommit([
      {
        op: "updateNode",
        hid: attack.hid,
        properties: {
          Name: edit.name,
          ShortDescription: edit.short,
          LongDescription: edit.long,
          AttackLevel: edit.level,
          IsRVCandidate: edit.rv,
          MetricsJSON: normalizeMetrics(edit.metrics),
        },
      },
    ]);
  };

  return (
    <div style={{ width: 330, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>{attack.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(attack.properties.Name ?? "")}</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(attack.hid)}>Open Drawer</button>
      </div>
      <label style={labelStyle}>Name<input className="sstpa-input" value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} /></label>
      <label style={labelStyle}>Short Description<textarea className="sstpa-input" rows={2} value={edit.short} onChange={(e) => setEdit((x) => ({ ...x, short: e.target.value }))} /></label>
      <label style={labelStyle}>Long Description<textarea className="sstpa-input" rows={3} value={edit.long} onChange={(e) => setEdit((x) => ({ ...x, long: e.target.value }))} /></label>
      <label style={labelStyle}>
        Level
        <select className="sstpa-input" value={edit.level} onChange={(e) => setEdit((x) => ({ ...x, level: e.target.value as AttackLevel }))}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={edit.rv} onChange={(e) => setEdit((x) => ({ ...x, rv: e.target.checked }))} />
        RV Candidate
      </label>
      <label style={labelStyle}>MetricsJSON<textarea className="sstpa-input mono" rows={4} value={edit.metrics} onChange={(e) => setEdit((x) => ({ ...x, metrics: e.target.value }))} /></label>
      {!metricsValid && <div className="state-warn" style={{ fontSize: "0.72rem" }}>MetricsJSON values must be numeric.</div>}
      <button className="sstpa-button" disabled={!edit.name.trim() || !metricsValid} onClick={save}>Commit Attack</button>

      <h4>Relationships</h4>
      <SmallList title="Entities" values={entities.map((e) => `${e.hid} ${String(e.properties.Name ?? "")}`)} />
      <SmallList title="Parent" values={parent ? [parent] : []} />
      <SmallList title="Subordinates" values={children.map((c) => `${c.hid} ${String(c.properties.Name ?? "")}`)} />
      <SmallList title="Countermeasures" values={blockers.map((c) => `${c.hid} ${String(c.properties.Name ?? "")}`)} />
      <SmallList title="Targeted Losses" values={targeted.map((l) => `${l.hid} ${String(l.properties.Name ?? "")}`)} />

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <select className="sstpa-input" value={targetLoss} onChange={(e) => setTargetLoss(e.target.value)}>
          <option value="">Scope to Loss</option>
          {losses.map((l) => <option key={l.hid} value={l.hid}>{l.hid} - {String(l.properties.Name ?? "")}</option>)}
        </select>
        <button className="sstpa-button" disabled={!targetLoss} onClick={() => onCommit([{ op: "createRelationship", type: "TARGETS_LOSS", sourceHid: attack.hid, targetHid: targetLoss }])}>
          Add
        </button>
      </div>
    </div>
  );
}

function NewAttackDialog({
  selectedEntity,
  onClose,
  onCreate,
}: {
  selectedEntity: string | null;
  onClose: () => void;
  onCreate: (props: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [long, setLong] = useState("");
  const [level, setLevel] = useState<AttackLevel>("TACTIC");
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Attack</h2>
        <p className="mono" style={{ fontSize: "0.72rem" }}>{selectedEntity ? `EXPLOITS ${selectedEntity}` : "Standalone Attack"}</p>
        <label style={labelStyle}>Name<input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label style={labelStyle}>Short Description<textarea className="sstpa-input" rows={2} value={short} onChange={(e) => setShort(e.target.value)} /></label>
        <label style={labelStyle}>Long Description<textarea className="sstpa-input" rows={3} value={long} onChange={(e) => setLong(e.target.value)} /></label>
        <label style={labelStyle}>
          Level
          <select className="sstpa-input" value={level} onChange={(e) => setLevel(e.target.value as AttackLevel)}>
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={onClose}>Cancel</button>
          <button className="sstpa-button" disabled={!name.trim() || !short.trim()} onClick={() => onCreate({ Name: name, ShortDescription: short, LongDescription: long, AttackLevel: level, IsRVCandidate: false })}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function AttackRow({
  attack,
  byHid,
  selected,
  onSelect,
  action,
}: {
  attack: SoINode;
  byHid: Map<string, SoINode>;
  selected: boolean;
  onSelect: () => void;
  action?: React.ReactNode;
}) {
  return (
    <button
      className="entity-card"
      style={{ width: "100%", marginBottom: 8, textAlign: "left", borderColor: selected ? "var(--sstpa-gold)" : undefined }}
      onClick={onSelect}
    >
      <div className="entity-card-header">
        <span className="entity-hid">{attack.hid}</span>
        <LevelBadge level={String(attack.properties.AttackLevel ?? "TACTIC") as AttackLevel} />
        {attack.properties.IsRVCandidate === true && <span className="type-badge" style={{ background: "var(--sstpa-gold)" }}>RV</span>}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      <div style={{ fontWeight: 700, fontSize: "0.84rem", marginTop: 4 }}>{String(attack.properties.Name ?? "")}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--sstpa-navy-muted)" }}>
        {attackEntities(attack, byHid).map((e) => e.hid).join(", ") || "Unassociated"}
      </div>
    </button>
  );
}

function LevelBadge({ level }: { level: AttackLevel }) {
  const color = level === "STRATEGY" ? "var(--sstpa-node-security)" : level === "PROCEDURE" ? "var(--sstpa-node-muted)" : "var(--sstpa-status-info)";
  return <span className="type-badge" style={{ background: color, fontStyle: level === "PROCEDURE" ? "italic" : undefined }}>{level}</span>;
}

function SmallList({ title, values }: { title: string; values: string[] }) {
  return (
    <div style={{ marginTop: 8, fontSize: "0.74rem" }}>
      <strong>{title}</strong>
      <div style={{ color: "var(--sstpa-navy-muted)" }}>{values.length > 0 ? values.join("; ") : "—"}</div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };

function attacksForEntity(entityHid: string, attacks: SoINode[]): SoINode[] {
  return attacks.filter((a) => (a.relationships ?? []).some((r) => r.type === "EXPLOITS" && r.targetHID === entityHid));
}

function attackEntities(attack: SoINode, byHid: Map<string, SoINode>): SoINode[] {
  return (attack.relationships ?? [])
    .filter((r) => r.type === "EXPLOITS")
    .map((r) => byHid.get(r.targetHID))
    .filter((n): n is SoINode => !!n);
}

function parentOf(attack?: SoINode): string | null {
  return (attack?.relationships ?? []).find((r) => r.type === "SUBORDINATE_TO")?.targetHID ?? null;
}

function entityHasCurrentTrace(entity: SoINode, assetHid: string): boolean {
  return (entity.relationships ?? []).some(
    (r) =>
      ["HOLDS", "TRANSPORTS", "USES"].includes(r.type) &&
      r.targetHID === assetHid &&
      String(r.props?.TraceStatus ?? "CURRENT") === "CURRENT",
  );
}

function readinessLabel(entity: SoINode, attacks: SoINode[]): string {
  const count = attacksForEntity(entity.hid, attacks).length;
  return count > 0 ? "Loss Tool ready" : "No Tier 3 attacks";
}

function wouldSelfParent(candidateParent: SoINode, childHid: string | null, attacks: SoINode[]): boolean {
  if (!childHid) return false;
  let cur: string | null = candidateParent.hid;
  const byHid = new Map(attacks.map((a) => [a.hid, a]));
  while (cur) {
    if (cur === childHid) return true;
    cur = parentOf(byHid.get(cur));
  }
  return false;
}

function validMetrics(raw: string): boolean {
  if (!raw.trim()) return true;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") return false;
    return Object.values(parsed).every((v) => typeof v === "number" && Number.isFinite(v));
  } catch {
    return false;
  }
}

function normalizeMetrics(raw: string): string | null {
  if (!raw.trim() || raw.trim() === "{}") return null;
  return JSON.stringify(JSON.parse(raw));
}

function colorForType(typeName: string): string {
  if (typeName === "Interface") return "var(--sstpa-node-interface)";
  if (typeName === "SystemFunction") return "var(--sstpa-node-function)";
  if (typeName === "Component") return "var(--sstpa-node-element)";
  return "var(--sstpa-node-muted)";
}

function shortType(typeName: string): string {
  if (typeName === "Interface") return "INT";
  if (typeName === "SystemFunction") return "FUN";
  if (typeName === "Component") return "EL";
  return typeName.slice(0, 3).toUpperCase();
}

function coverageCsv(entities: SoINode[], attacks: SoINode[]): string {
  const rows = [["EntityHID", "EntityType", "EntityName", "AttackCount", "RVCandidateCount"]];
  for (const e of entities) {
    const assoc = attacksForEntity(e.hid, attacks);
    rows.push([
      e.hid,
      e.typeName,
      String(e.properties.Name ?? ""),
      String(assoc.length),
      String(assoc.filter((a) => a.properties.IsRVCandidate === true).length),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function catalogMarkdown(attacks: SoINode[], byHid: Map<string, SoINode>): string {
  let md = `# Attack Catalog\n\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const a of attacks) {
    md += `## ${a.hid} - ${String(a.properties.Name ?? "")}\n\n`;
    md += `Level: ${String(a.properties.AttackLevel ?? "TACTIC")}\n\n`;
    md += `RV Candidate: ${a.properties.IsRVCandidate === true ? "Yes" : "No"}\n\n`;
    md += `Entities: ${attackEntities(a, byHid).map((e) => e.hid).join(", ") || "None"}\n\n`;
    if (a.properties.MetricsJSON) md += `Metrics: \`${String(a.properties.MetricsJSON)}\`\n\n`;
  }
  return md;
}

function hierarchyMarkdown(attacks: SoINode[]): string {
  const roots = attacks.filter((a) => !parentOf(a));
  const render = (a: SoINode, depth: number): string => {
    const line = `${"  ".repeat(depth)}- ${a.hid} ${String(a.properties.Name ?? "")} (${String(a.properties.AttackLevel ?? "TACTIC")})\n`;
    return line + attacks.filter((c) => parentOf(c) === a.hid).map((c) => render(c, depth + 1)).join("");
  };
  return `# Attack Hierarchy\n\n${roots.map((r) => render(r, 0)).join("")}`;
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
