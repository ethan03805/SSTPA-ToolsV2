// Attack Tool (SRS §6.5.16): create, organize, associate, metric-tag, and
// export (:Attack) nodes consumed by the Loss Tool. Includes in-tool
// clone-from-Reference (§6.5.16.6), hierarchy management (§6.5.16.7),
// Asset scope filtering (§6.5.16.8), and validation warnings (§6.5.16.10).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  CommitOperation,
  ReferenceSearchResult,
  SoINode,
} from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer } from "../../state/stores";
import { downloadText, errorText, ToolStatus, usePrompt } from "../shared";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

type AttackLevel = "STRATEGY" | "TACTIC" | "PROCEDURE";
type Mode = "entity" | "hierarchy" | "catalog";
type EntityFilter = "all" | "Interface" | "SystemFunction" | "Component";
type CoverageFilter = "all" | "has-attacks" | "no-attacks";
type NoticeKind = "success" | "warning" | "error";

interface Notice {
  kind: NoticeKind;
  text: string;
}

/** Asset Scope Filter state (§6.5.16.8): Asset + Criticality + Assurance. */
interface ScopeState {
  asset: string;
  criticality: string;
  assurance: string;
}

const ENTITY_ORDER = ["Interface", "SystemFunction", "Component"] as const;
const LEVELS: AttackLevel[] = ["STRATEGY", "TACTIC", "PROCEDURE"];
/** Criticality dimensions carried on (:Asset)/(:Loss) as <Dim>Critical booleans. */
const CRITICALITY_DIMS = ["Safety", "Mission", "Flight", "Security"] as const;
/** Assurance dimensions carried on (:Asset)/(:Loss) as booleans. */
const ASSURANCE_DIMS = [
  "Confidentiality",
  "Availability",
  "Authenticity",
  "NonRepudiation",
  "Certifiable",
  "Privacy",
  "Trustworthy",
] as const;
/** Reference node types authorized for Attack cloning (§6.5.16.6). */
const CLONE_LABELS = ["AK_Technique", "AT_Technique", "EMB3D_Vulnerability"];

const EMPTY_SCOPE: ScopeState = { asset: "", criticality: "", assurance: "" };

export default function AttackTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const qc = useQueryClient();
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const prompt = usePrompt();
  const [mode, setMode] = useState<Mode>("entity");
  const [entityType, setEntityType] = useState<EntityFilter>("all");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [scope, setScope] = useState<ScopeState>(EMPTY_SCOPE);
  const [query, setQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedAttack, setSelectedAttack] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  /** New Attack dialog; parentHid set = "Add Subordinate" (§6.5.16.7). */
  const [newAttack, setNewAttack] = useState<{ parentHid: string | null } | null>(null);
  /** Clone-from-Reference dialog target (§6.5.16.6): new node or apply to existing. */
  const [cloneTarget, setCloneTarget] = useState<
    { kind: "new" } | { kind: "apply"; attackHid: string } | null
  >(null);
  const [removeAssoc, setRemoveAssoc] = useState<{ attackHid: string; entityHid: string } | null>(null);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const attacks = useMemo(() => nodes.filter((n) => n.typeName === "Attack"), [nodes]);
  const entities = useMemo(
    () =>
      ENTITY_ORDER.flatMap((type) => nodes.filter((n) => n.typeName === type)),
    [nodes],
  );
  const hazards = useMemo(() => nodes.filter((n) => n.typeName === "Hazard"), [nodes]);
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");
  const losses = nodes.filter((n) => n.typeName === "Loss");
  const countermeasures = nodes.filter((n) => n.typeName === "Countermeasure");

  /** assetHid -> Set of Loss HIDs via (:Asset)-[:HAS_LOSS]->(:Loss). */
  const assetLossMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of nodes) {
      if (a.typeName !== "Asset" && a.typeName !== "DerivedAsset") continue;
      const set = new Set<string>();
      for (const r of a.relationships ?? []) if (r.type === "HAS_LOSS") set.add(r.targetHID);
      map.set(a.hid, set);
    }
    return map;
  }, [nodes]);

  const attackMap = useMemo(() => new Map(attacks.map((a) => [a.hid, a])), [attacks]);
  const selectedAttackNode = selectedAttack ? attackMap.get(selectedAttack) : undefined;
  const selectedEntityNode = selectedEntity ? byHid.get(selectedEntity) : undefined;

  // Drawer / cross-tool focus context (§6.5.16.3): an (:Attack) focus lands in
  // the Attack Association view with its entity highlighted, not the Catalog.
  useEffect(() => {
    const hid = ctx.focusHid ?? ctx.drawerNodeHid;
    if (!hid) return;
    const node = byHid.get(hid);
    if (!node) return;
    if (node.typeName === "Attack") {
      setSelectedAttack(hid);
      const entity = attackEntities(node, byHid)[0];
      if (entity) setSelectedEntity(entity.hid);
      setMode("entity");
    } else if (ENTITY_ORDER.includes(node.typeName as (typeof ENTITY_ORDER)[number])) {
      setSelectedEntity(hid);
      setMode("entity");
    } else if (node.typeName === "Asset" || node.typeName === "DerivedAsset") {
      setScope((s) => ({ ...s, asset: hid }));
      setMode("hierarchy");
    }
  }, [byHid, ctx.drawerNodeHid, ctx.focusHid]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.attack", operations: ops }),
    onSuccess: (res) => {
      setNotice({ kind: "success", text: `Attack Tool commit ${res.commitId.slice(0, 8)} accepted.` });
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  // Clone-from-Reference (§6.5.16.6, §6.5.16.15): fetch full reference
  // properties, create the (:Attack) via commit (with [:EXPLOITS] when an
  // entity is selected), then create [:REFERENCES] via the Backend clone API
  // using the HID the commit returned.
  const clone = useMutation({
    mutationFn: async (payload: {
      ref: ReferenceSearchResult;
      target: { kind: "new"; entityHid: string | null } | { kind: "apply"; attackHid: string };
    }) => {
      const detail = (await api.referenceNode(payload.ref.uuid)) as {
        props?: Record<string, unknown>;
      };
      const props = detail.props ?? {};
      const url = referenceUrl(payload.ref.frameworkName, payload.ref.externalId);

      if (payload.target.kind === "apply") {
        await api.referenceClone({ coreHid: payload.target.attackHid, referenceUuid: payload.ref.uuid });
        if (url) {
          await api.commit({
            soiHid: ctx.soiHid ?? undefined,
            toolId: "sstpa.attack",
            operations: [
              { op: "updateNode", hid: payload.target.attackHid, properties: { ReferenceURL: url } },
            ],
          });
        }
        return { hid: payload.target.attackHid, refWarning: null as string | null };
      }

      const level = levelForReference(payload.ref.labels, props);
      const short = String(props.ShortDescription ?? payload.ref.shortDescription ?? "").slice(0, 500);
      const long = String(props.LongDescription ?? "");
      const ops: CommitOperation[] = [
        {
          op: "createNode",
          tempId: "atk",
          label: "Attack",
          properties: {
            Name: payload.ref.name,
            ShortDescription: short,
            LongDescription: long || null,
            AttackLevel: level,
            IsRVCandidate: false,
            MetricsJSON: null,
            ReferenceFramework: payload.ref.frameworkName,
            ReferenceID: payload.ref.externalId,
            ReferenceURL: url,
          },
        },
      ];
      if (payload.target.entityHid) {
        ops.push({ op: "createRelationship", type: "EXPLOITS", sourceHid: "$atk", targetHid: payload.target.entityHid });
      }
      const res = await api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.attack", operations: ops });
      const hid = res.createdNodes.atk ?? null;
      let refWarning: string | null = null;
      if (hid) {
        try {
          await api.referenceClone({ coreHid: hid, referenceUuid: payload.ref.uuid });
        } catch (e) {
          // Backend §3.4.6.1 authorizes Attack cloning from AK/AT techniques
          // only; keep the created Attack (reference metadata is on it) and
          // report the missing [:REFERENCES] link honestly.
          refWarning = errorText(e);
        }
      }
      return { hid, refWarning };
    },
    onSuccess: ({ hid, refWarning }) => {
      void qc.invalidateQueries({ queryKey: ["soi"] });
      if (hid) setSelectedAttack(hid);
      setNotice(
        refWarning
          ? { kind: "warning", text: `Attack ${hid ?? ""} cloned, but the [:REFERENCES] link was rejected by the Backend: ${refWarning}` }
          : { kind: "success", text: `Reference clone complete${hid ? ` (${hid})` : ""}.` },
      );
      setCloneTarget(null);
    },
    onError: (e) => {
      setNotice({ kind: "error", text: errorText(e) });
      setCloneTarget(null);
    },
  });

  // Asset Scope Filter helpers (§6.5.16.8).
  const scopeAsset = scope.asset ? byHid.get(scope.asset) : undefined;
  const critOptions = CRITICALITY_DIMS.filter(
    (d) => !scopeAsset || scopeAsset.properties[`${d}Critical`] === true,
  );
  const assurOptions = ASSURANCE_DIMS.filter(
    (d) => !scopeAsset || scopeAsset.properties[d] === true,
  );

  /** Attacks relevant to the current scope for Hierarchy/Catalog modes. */
  const scopedAttacks = useMemo(() => {
    if (!scope.asset) return attacks;
    const viaHazard = new Set<string>();
    for (const hz of hazards) {
      if (!(hz.relationships ?? []).some((r) => r.type === "THREATENS" && r.targetHID === scope.asset)) continue;
      for (const r of hz.relationships ?? []) if (r.type === "USES_ATTACK") viaHazard.add(r.targetHID);
    }
    return attacks.filter((a) => {
      if (viaHazard.has(a.hid)) return true;
      if (!attackVisibleInScope(a, scope, byHid, assetLossMap)) return false;
      const exploited = attackEntities(a, byHid);
      return exploited.some((e) => entityHasCurrentTrace(e, scope.asset));
    });
  }, [attacks, byHid, hazards, scope, assetLossMap]);

  // Validation warnings (§6.5.16.10, non-blocking).
  const warnings = useMemo(() => {
    const unassociated = attacks.filter((a) => attackEntities(a, byHid).length === 0);
    const procNoMetrics = attacks.filter(
      (a) =>
        String(a.properties.AttackLevel ?? "TACTIC") === "PROCEDURE" &&
        Object.keys(parseMetrics(a.properties.MetricsJSON)).length === 0,
    );
    const bareEntities = entities.filter((e) => attacksForEntity(e.hid, attacks).length === 0);
    return { unassociated, procNoMetrics, bareEntities, count: unassociated.length + procNoMetrics.length + bareEntities.length };
  }, [attacks, byHid, entities]);

  const visibleEntities = entities.filter((e) => {
    if (entityType !== "all" && e.typeName !== entityType) return false;
    if (query && !`${e.hid} ${String(e.properties.Name ?? "")}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (scope.asset && !entityHasCurrentTrace(e, scope.asset)) return false;
    const count = attacksForEntity(e.hid, attacks).length;
    if (coverageFilter === "has-attacks" && count === 0) return false;
    if (coverageFilter === "no-attacks" && count > 0) return false;
    return true;
  });

  useEffect(() => {
    if (!selectedEntity && visibleEntities[0]) setSelectedEntity(visibleEntities[0].hid);
  }, [selectedEntity, visibleEntities]);

  const directAttacks = attacksForEntity(selectedEntity ?? "", attacks).filter((a) =>
    attackVisibleInScope(a, scope, byHid, assetLossMap),
  );
  const hazardPairs = hazardAttackPairs(selectedEntityNode, hazards, attackMap, scope);
  const cloneBusy = clone.isPending;

  if (!ctx.soiHid) return <ToolStatus needsSoI />;
  if (soi.isLoading) return <ToolStatus loading />;
  if (soi.error) return <ToolStatus error={soi.error} onRetry={() => void soi.refetch()} />;
  if (entities.length === 0) {
    return (
      <ToolStatus
        empty="No Interface, SystemFunction, or Component nodes in this SoI."
        emptyHint="Create entities with the ICD, Function, or PBS Tools, then reopen the Attack Tool."
      />
    );
  }

  const createAttack = (props: Record<string, unknown>) => {
    const parent = newAttack?.parentHid ? attackMap.get(newAttack.parentHid) : undefined;
    const ops: CommitOperation[] = [
      { op: "createNode", tempId: "atk", label: "Attack", properties: { ...props, IsRVCandidate: false, MetricsJSON: null } },
    ];
    if (parent) ops.push({ op: "createRelationship", type: "SUBORDINATE_TO", sourceHid: "$atk", targetHid: parent.hid });
    if (selectedEntity) ops.push({ op: "createRelationship", type: "EXPLOITS", sourceHid: "$atk", targetHid: selectedEntity });
    commit.mutate(ops);
    setNewAttack(null);
  };

  const attachExisting = (childHid: string) => {
    const parent = newAttack?.parentHid ? attackMap.get(newAttack.parentHid) : undefined;
    if (!parent) return;
    commit.mutate([
      { op: "createRelationship", type: "SUBORDINATE_TO", sourceHid: childHid, targetHid: parent.hid },
      { op: "updateNode", hid: childHid, properties: { AttackLevel: nextLevelDown(levelOf(parent)) } },
    ]);
    setNewAttack(null);
  };

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
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={scope.asset}
          onChange={(e) => setScope({ asset: e.target.value, criticality: "", assurance: "" })}
        >
          <option value="">All Assets</option>
          {assets.map((a) => (
            <option key={a.hid} value={a.hid}>
              {a.hid} - {String(a.properties.Name ?? "")}
            </option>
          ))}
        </select>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={scope.criticality}
          disabled={!scope.asset}
          onChange={(e) => setScope((s) => ({ ...s, criticality: e.target.value }))}
        >
          <option value="">Any Criticality</option>
          {(critOptions.length > 0 ? critOptions : CRITICALITY_DIMS).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={scope.assurance}
          disabled={!scope.asset}
          onChange={(e) => setScope((s) => ({ ...s, assurance: e.target.value }))}
        >
          <option value="">Any Assurance</option>
          {(assurOptions.length > 0 ? assurOptions : ASSURANCE_DIMS).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button className={`icon-button ${warningsOpen ? "danger" : ""}`} onClick={() => setWarningsOpen((v) => !v)}>
          Warnings ({warnings.count})
        </button>
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
      {scope.asset && (
        <div
          className="mono"
          style={{
            padding: "4px 12px",
            fontSize: "0.72rem",
            background: "var(--sstpa-inset)",
            borderBottom: "var(--sstpa-border-soft)",
          }}
        >
          Asset scope: {scope.asset} {String(scopeAsset?.properties.Name ?? "")}
          {scope.criticality && ` · ${scope.criticality}-critical`}
          {scope.assurance && ` · ${scope.assurance}`}
          <button className="icon-button" style={{ marginLeft: 8 }} onClick={() => setScope(EMPTY_SCOPE)}>
            Clear
          </button>
        </div>
      )}
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
      {warningsOpen && (
        <WarningsPanel
          warnings={warnings}
          onSelectAttack={(hid) => {
            setSelectedAttack(hid);
            const entity = attackEntities(attackMap.get(hid)!, byHid)[0];
            setMode(entity ? "entity" : "catalog");
            if (entity) setSelectedEntity(entity.hid);
          }}
          onSelectEntity={(hid) => {
            setSelectedEntity(hid);
            setMode("entity");
          }}
        />
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
              attacks={directAttacks}
              hazardPairs={hazardPairs}
              allAttacks={attacks}
              byHid={byHid}
              onNew={() => setNewAttack({ parentHid: null })}
              onCloneNew={() => setCloneTarget({ kind: "new" })}
              onSelectAttack={setSelectedAttack}
              selectedAttack={selectedAttack}
              onAssociate={(attackHid) =>
                selectedEntity &&
                commit.mutate([{ op: "createRelationship", type: "EXPLOITS", sourceHid: attackHid, targetHid: selectedEntity }])
              }
              onAddSubordinate={(attackHid) => setNewAttack({ parentHid: attackHid })}
              onCloneApply={(attackHid) => setCloneTarget({ kind: "apply", attackHid })}
              onRemove={(attackHid) => selectedEntity && setRemoveAssoc({ attackHid, entityHid: selectedEntity })}
            />
          )}
          {mode === "hierarchy" && (
            <HierarchyView
              attacks={scopedAttacks}
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
              attacks={scopedAttacks}
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
          onNewHazard={(attack) =>
            prompt.ask(
              "New Hazard name (will USES_ATTACK this Attack)",
              (name) => {
                const ops: CommitOperation[] = [
                  { op: "createNode", tempId: "hz", label: "Hazard", properties: { Name: name } },
                  { op: "createRelationship", type: "USES_ATTACK", sourceHid: "$hz", targetHid: attack.hid },
                ];
                if (scope.asset) ops.push({ op: "createRelationship", type: "THREATENS", sourceHid: "$hz", targetHid: scope.asset });
                commit.mutate(ops);
              },
              { placeholder: "Threatening condition" },
            )
          }
        />
      </div>
      {newAttack && (
        <NewAttackDialog
          entity={selectedEntityNode}
          parent={newAttack.parentHid ? attackMap.get(newAttack.parentHid) : undefined}
          attacks={attacks}
          onClose={() => setNewAttack(null)}
          onCreate={createAttack}
          onAttachExisting={attachExisting}
        />
      )}
      {cloneTarget && (
        <CloneReferenceDialog
          target={
            cloneTarget.kind === "apply"
              ? `Apply to ${cloneTarget.attackHid}`
              : selectedEntityNode
                ? `New Attack EXPLOITS ${selectedEntityNode.hid}`
                : "New standalone Attack"
          }
          busy={cloneBusy}
          onClose={() => setCloneTarget(null)}
          onPick={(ref) =>
            clone.mutate({
              ref,
              target:
                cloneTarget.kind === "apply"
                  ? { kind: "apply", attackHid: cloneTarget.attackHid }
                  : { kind: "new", entityHid: selectedEntity },
            })
          }
        />
      )}
      {removeAssoc && (
        <ConfirmDialog
          title="Remove Attack association"
          danger
          confirmLabel="Remove"
          onCancel={() => setRemoveAssoc(null)}
          onConfirm={() => {
            commit.mutate([
              { op: "deleteRelationship", type: "EXPLOITS", sourceHid: removeAssoc.attackHid, targetHid: removeAssoc.entityHid },
            ]);
            setRemoveAssoc(null);
          }}
        >
          <p style={{ fontSize: "0.8rem" }}>
            Remove [:EXPLOITS] from {removeAssoc.attackHid} to {removeAssoc.entityHid}?
            {attackEntities(attackMap.get(removeAssoc.attackHid) ?? ({ relationships: [] } as unknown as SoINode), byHid).length <= 1 &&
              " This is the Attack's last entity association — it becomes Unassociated and cannot appear in an Attack Tree (SRS §6.5.16.10)."}
          </p>
        </ConfirmDialog>
      )}
      {prompt.element}
    </div>
  );
}

function WarningsPanel({
  warnings,
  onSelectAttack,
  onSelectEntity,
}: {
  warnings: { unassociated: SoINode[]; procNoMetrics: SoINode[]; bareEntities: SoINode[]; count: number };
  onSelectAttack: (hid: string) => void;
  onSelectEntity: (hid: string) => void;
}) {
  if (warnings.count === 0) {
    return (
      <div style={{ margin: "6px 12px" }}>
        <p className="state-ok" style={{ margin: 0 }}>No Attack Tool validation warnings.</p>
      </div>
    );
  }
  return (
    <div style={{ margin: "6px 12px", maxHeight: 180, overflow: "auto" }}>
      {warnings.unassociated.map((a) => (
        <div key={`u-${a.hid}`} className="sstpa-alert-warning" style={{ marginBottom: 4 }}>
          Unassociated — cannot appear in Attack Tree:{" "}
          <button className="icon-button" onClick={() => onSelectAttack(a.hid)}>
            {a.hid} {String(a.properties.Name ?? "")}
          </button>
        </div>
      ))}
      {warnings.procNoMetrics.map((a) => (
        <div key={`m-${a.hid}`} className="sstpa-alert-warning" style={{ marginBottom: 4 }}>
          PROCEDURE Attack has no MetricsJSON (LeafDefault will apply):{" "}
          <button className="icon-button" onClick={() => onSelectAttack(a.hid)}>
            {a.hid} {String(a.properties.Name ?? "")}
          </button>
        </div>
      ))}
      {warnings.bareEntities.map((e) => (
        <div key={`e-${e.hid}`} className="sstpa-alert-warning" style={{ marginBottom: 4 }}>
          Entity has no associated Attacks (no Tier 3 content):{" "}
          <button className="icon-button" onClick={() => onSelectEntity(e.hid)}>
            {e.hid} {String(e.properties.Name ?? "")}
          </button>
        </div>
      ))}
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
                borderColor: selectedEntity === e.hid ? "var(--sstpa-accent)" : undefined,
              }}
              onClick={() => onSelect(e.hid)}
            >
              <div className="entity-card-header">
                <span className="type-badge" style={{ background: colorForType(e.typeName) }}>{shortType(e.typeName)}</span>
                <span className="entity-hid">{e.hid}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", marginTop: 4 }}>{String(e.properties.Name ?? "")}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--sstpa-muted)" }}>
                {readinessLabel(e, attacks)}
              </div>
            </button>
          );
        })}
        {entities.length === 0 && (
          <p style={{ padding: 12, color: "var(--sstpa-muted)", fontSize: "0.78rem" }}>
            No entities match the current filters.
          </p>
        )}
      </div>
    </div>
  );
}

function EntityAttackView({
  entity,
  attacks,
  hazardPairs,
  allAttacks,
  byHid,
  selectedAttack,
  onNew,
  onCloneNew,
  onSelectAttack,
  onAssociate,
  onAddSubordinate,
  onCloneApply,
  onRemove,
}: {
  entity?: SoINode;
  attacks: SoINode[];
  hazardPairs: { attack: SoINode; hazard: SoINode }[];
  allAttacks: SoINode[];
  byHid: Map<string, SoINode>;
  selectedAttack: string | null;
  onNew: () => void;
  onCloneNew: () => void;
  onSelectAttack: (hid: string) => void;
  onAssociate: (hid: string) => void;
  onAddSubordinate: (hid: string) => void;
  onCloneApply: (hid: string) => void;
  onRemove: (hid: string) => void;
}) {
  const [associate, setAssociate] = useState("");
  const available = allAttacks.filter((a) => !attacks.some((x) => x.hid === a.hid));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "var(--sstpa-sp-2) var(--sstpa-sp-3)", borderBottom: "var(--sstpa-border-soft)" }}>
        <div style={{ fontWeight: 700 }}>{entity ? `${entity.hid} - ${String(entity.properties.Name ?? "")}` : "No entity selected"}</div>
        <span style={{ flex: 1 }} />
        <button className="sstpa-button" disabled={!entity} onClick={onNew}>New Attack</button>
        <button className="sstpa-button secondary" disabled={!entity} onClick={onCloneNew}>Clone from Reference</button>
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
        {attacks.map((a) => {
          const level = levelOf(a);
          return (
            <AttackRow
              key={a.hid}
              attack={a}
              byHid={byHid}
              selected={selectedAttack === a.hid}
              onSelect={() => onSelectAttack(a.hid)}
              actions={
                <>
                  <button className="icon-button" onClick={(e) => { e.stopPropagation(); onSelectAttack(a.hid); }}>
                    Edit
                  </button>
                  <button
                    className="icon-button"
                    disabled={level === "PROCEDURE"}
                    title={level === "PROCEDURE" ? "PROCEDURE is the deepest level (max depth 3, §6.5.16.7)" : "Create a subordinate Attack"}
                    onClick={(e) => { e.stopPropagation(); onAddSubordinate(a.hid); }}
                  >
                    Add Sub
                  </button>
                  <button className="icon-button" onClick={(e) => { e.stopPropagation(); onCloneApply(a.hid); }}>
                    Clone Ref
                  </button>
                  <button className="icon-button danger" onClick={(e) => { e.stopPropagation(); onRemove(a.hid); }}>
                    Remove
                  </button>
                </>
              }
            />
          );
        })}
        {entity && attacks.length === 0 && <p style={{ color: "var(--sstpa-muted)" }}>No Attacks associated to this entity via [:EXPLOITS].</p>}

        {hazardPairs.length > 0 && (
          <>
            <h4 style={{ margin: "12px 0 6px" }}>Via Hazards ([:USES_ATTACK], §6.5.16.4)</h4>
            {hazardPairs.map(({ attack, hazard }) => (
              <AttackRow
                key={`${hazard.hid}-${attack.hid}`}
                attack={attack}
                byHid={byHid}
                selected={selectedAttack === attack.hid}
                onSelect={() => onSelectAttack(attack.hid)}
                actions={
                  <span className="type-badge" style={{ background: "var(--sstpa-node-muted)" }} title={`Hazard ${hazard.hid}`}>
                    HAZARD {hazard.hid}
                  </span>
                }
              />
            ))}
          </>
        )}
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
  const roots = attacks.filter((a) => !parentOf(a) || !attacks.some((p) => p.hid === parentOf(a)));
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
        {attacks.length === 0 && <p style={{ color: "var(--sstpa-muted)" }}>No Attack nodes match the current scope.</p>}
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
        style={{ width: 340, maxWidth: "100%", textAlign: "left", borderColor: selectedAttack === attack.hid ? "var(--sstpa-accent)" : undefined }}
        onClick={() => onSelectAttack(attack.hid)}
      >
        <div className="entity-card-header">
          <span className="entity-hid">{attack.hid}</span>
          <LevelBadge level={levelOf(attack)} />
          {attack.properties.IsRVCandidate === true && <span className="type-badge" style={{ background: "var(--sstpa-accent)" }}>RV</span>}
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
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 6px" }}>HID</th>
            <th>Name</th>
            <th>Level</th>
            <th>References</th>
            <th>Entities</th>
            <th>Metrics</th>
          </tr>
        </thead>
        <tbody>
          {attacks.map((a) => {
            const exploited = attackEntities(a, byHid);
            return (
              <tr
                key={a.hid}
                onClick={() => onSelectAttack(a.hid)}
                style={{ cursor: "pointer", borderBottom: "1px solid var(--sstpa-line-soft)", background: selectedAttack === a.hid ? "var(--sstpa-inset)" : undefined }}
              >
                <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>{a.hid}</td>
                <td>{String(a.properties.Name ?? "")}</td>
                <td><LevelBadge level={levelOf(a)} /></td>
                <td>{[a.properties.ReferenceFramework, a.properties.ReferenceID].filter(Boolean).join(" ") || "—"}</td>
                <td>{exploited.map((e) => e.hid).join(", ") || "Unassociated"}</td>
                <td className="mono" style={{ fontSize: "0.66rem" }}>{String(a.properties.MetricsJSON ?? "") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {attacks.length === 0 && <p style={{ padding: 12, color: "var(--sstpa-muted)" }}>No Attack nodes match the current scope.</p>}
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
  onNewHazard,
}: {
  attack?: SoINode;
  attacks: SoINode[];
  losses: SoINode[];
  countermeasures: SoINode[];
  byHid: Map<string, SoINode>;
  drawerOpen: boolean;
  onOpenDrawer: (hid: string) => void;
  onCommit: (ops: CommitOperation[]) => void;
  onNewHazard: (attack: SoINode) => void;
}) {
  const [edit, setEdit] = useState<{
    name: string;
    short: string;
    long: string;
    level: AttackLevel;
    rv: boolean;
    metrics: Record<string, number>;
  }>({ name: "", short: "", long: "", level: "TACTIC", rv: false, metrics: {} });
  const [targetLoss, setTargetLoss] = useState("");
  useEffect(() => {
    if (!attack) return;
    setEdit({
      name: String(attack.properties.Name ?? ""),
      short: String(attack.properties.ShortDescription ?? ""),
      long: String(attack.properties.LongDescription ?? ""),
      level: levelOf(attack),
      rv: attack.properties.IsRVCandidate === true,
      metrics: parseMetrics(attack.properties.MetricsJSON),
    });
  }, [attack]);

  if (!attack) {
    return (
      <div style={{ width: 330, borderLeft: "var(--sstpa-border)", padding: "var(--sstpa-sp-3)" }}>
        <p style={{ color: "var(--sstpa-muted)" }}>Select an Attack.</p>
      </div>
    );
  }

  const entities = attackEntities(attack, byHid);
  const parent = parentOf(attack);
  const children = attacks.filter((a) => parentOf(a) === attack.hid);
  const blockers = countermeasures.filter((cm) => (cm.relationships ?? []).some((r) => r.type === "BLOCKS" && r.targetHID === attack.hid));
  const targeted = (attack.relationships ?? []).filter((r) => r.type === "TARGETS_LOSS").map((r) => byHid.get(r.targetHID)).filter((n): n is SoINode => !!n);
  const refUrl = String(attack.properties.ReferenceURL ?? "");

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
          MetricsJSON: Object.keys(edit.metrics).length > 0 ? JSON.stringify(edit.metrics) : null,
        },
      },
    ]);
  };

  return (
    <div style={{ width: 330, borderLeft: "var(--sstpa-border)", overflow: "auto", padding: "var(--sstpa-sp-3)" }}>
      <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>{attack.hid}</div>
      <h3 style={{ margin: "4px 0 8px" }}>{String(attack.properties.Name ?? "")}</h3>
      {entities.length === 0 && (
        <div className="sstpa-alert-warning" style={{ marginBottom: 8, fontSize: "0.74rem" }}>
          Unassociated — cannot appear in Attack Tree (§6.5.16.16). Associate this Attack to an entity via [:EXPLOITS].
        </div>
      )}
      {edit.level === "PROCEDURE" && Object.keys(edit.metrics).length === 0 && (
        <div className="sstpa-alert-warning" style={{ marginBottom: 8, fontSize: "0.74rem" }}>
          PROCEDURE Attack with no metric values — LeafDefault will be used in Attack Tree calculations (§6.5.16.10).
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="sstpa-button" disabled={drawerOpen} onClick={() => onOpenDrawer(attack.hid)}>Open Drawer</button>
        <button className="sstpa-button secondary" onClick={() => onNewHazard(attack)}>New Hazard</button>
      </div>
      {Boolean(attack.properties.ReferenceFramework || attack.properties.ReferenceID) && (
        <div style={{ fontSize: "0.74rem", marginBottom: 8 }}>
          <strong>Reference</strong>{" "}
          {String(attack.properties.ReferenceFramework ?? "")} {String(attack.properties.ReferenceID ?? "")}
          {refUrl && (
            <>
              {" "}
              <a href={refUrl} target="_blank" rel="noreferrer">{refUrl}</a>
            </>
          )}
        </div>
      )}
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
      <MetricsEditor metrics={edit.metrics} onChange={(metrics) => setEdit((x) => ({ ...x, metrics }))} />
      <button className="sstpa-button" style={{ marginTop: 8 }} disabled={!edit.name.trim()} onClick={save}>Commit Attack</button>

      <h4>Relationships</h4>
      <SmallList title="Entities" values={entities.map((e) => `${e.hid} ${String(e.properties.Name ?? "")}`)} />
      <SmallList title="Parent" values={parent ? [parent] : []} />
      <SmallList title="Subordinates" values={children.map((c) => `${c.hid} ${String(c.properties.Name ?? "")}`)} />
      <SmallList title="Countermeasures" values={blockers.map((c) => `${c.hid} ${String(c.properties.Name ?? "")}`)} />
      <div style={{ marginTop: 8, fontSize: "0.74rem" }}>
        <strong>Targeted Losses</strong>
        {targeted.length === 0 && <div style={{ color: "var(--sstpa-muted)" }}>— (generally applicable)</div>}
        {targeted.map((l) => (
          <div key={l.hid} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ flex: 1, color: "var(--sstpa-muted)" }}>{l.hid} {String(l.properties.Name ?? "")}</span>
            <button
              className="icon-button danger"
              onClick={() => onCommit([{ op: "deleteRelationship", type: "TARGETS_LOSS", sourceHid: attack.hid, targetHid: l.hid }])}
            >
              x
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <select className="sstpa-input" value={targetLoss} onChange={(e) => setTargetLoss(e.target.value)}>
          <option value="">Scope to Loss</option>
          {losses.filter((l) => !targeted.some((t) => t.hid === l.hid)).map((l) => <option key={l.hid} value={l.hid}>{l.hid} - {String(l.properties.Name ?? "")}</option>)}
        </select>
        <button className="sstpa-button" disabled={!targetLoss} onClick={() => { onCommit([{ op: "createRelationship", type: "TARGETS_LOSS", sourceHid: attack.hid, targetHid: targetLoss }]); setTargetLoss(""); }}>
          Add
        </button>
      </div>
    </div>
  );
}

/** MetricsJSON key/value editor (§6.5.16.9): add, edit, remove numeric metric
 *  values; serialized to JSON on Commit. */
function MetricsEditor({
  metrics,
  onChange,
}: {
  metrics: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const num = Number(value);
  const canAdd = key.trim().length > 0 && !(key.trim() in metrics) && value.trim() !== "" && Number.isFinite(num);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: "0.76rem", fontWeight: 700 }}>Metrics (numeric values)</div>
      {Object.entries(metrics).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <span className="mono" style={{ flex: 1, fontSize: "0.72rem" }}>{k}</span>
          <input
            className="sstpa-input"
            style={{ width: 110 }}
            type="number"
            step="any"
            value={v}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange({ ...metrics, [k]: n });
            }}
          />
          <button
            className="icon-button danger"
            onClick={() => {
              const next = { ...metrics };
              delete next[k];
              onChange(next);
            }}
          >
            x
          </button>
        </div>
      ))}
      {Object.keys(metrics).length === 0 && (
        <div style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>No metric values.</div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input className="sstpa-input" placeholder="Metric name" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="sstpa-input" style={{ width: 110 }} type="number" step="any" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <button
          className="sstpa-button"
          disabled={!canAdd}
          onClick={() => {
            onChange({ ...metrics, [key.trim()]: num });
            setKey("");
            setValue("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** In-tool Clone-from-Reference dialog (§6.5.16.6): searches Reference Data
 *  filtered to AK_Technique / AT_Technique / EMB3D_Vulnerability. */
function CloneReferenceDialog({
  target,
  busy,
  onClose,
  onPick,
}: {
  target: string;
  busy: boolean;
  onClose: () => void;
  onPick: (ref: ReferenceSearchResult) => void;
}) {
  const [text, setText] = useState("");
  const [framework, setFramework] = useState("");
  const enabled = text.trim().length >= 2;
  const search = useQuery({
    queryKey: ["attack-ref-search", text.trim()],
    queryFn: async () => {
      const pages = await Promise.all(
        CLONE_LABELS.map((label) => api.referenceSearch({ label, text: text.trim(), limit: "60" })),
      );
      return pages.flatMap((p) => p.results ?? []);
    },
    enabled,
  });
  const results = (search.data ?? [])
    .filter((r) => !r.isDeprecated && !r.isRevoked)
    .filter((r) => !framework || r.frameworkName === framework)
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
  return (
    <div className="sstpa-dialog-overlay" onClick={busy ? undefined : onClose}>
      <div className="sstpa-frame sstpa-dialog" style={{ width: 560, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Clone from Reference">
        <h2 style={{ marginTop: 0 }}>Clone from Reference</h2>
        <p className="mono" style={{ fontSize: "0.72rem", margin: "0 0 8px" }}>{target}</p>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="sstpa-input"
            autoFocus
            placeholder="Search ATT&CK / ATLAS techniques, EMB3D vulnerabilities (min 2 chars)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select className="sstpa-input" style={{ width: 130 }} value={framework} onChange={(e) => setFramework(e.target.value)}>
            <option value="">All frameworks</option>
            <option value="ATT&CK">ATT&amp;CK</option>
            <option value="ATLAS">ATLAS</option>
            <option value="EMB3D">EMB3D</option>
          </select>
        </div>
        <div style={{ maxHeight: 320, overflow: "auto", marginTop: 8 }}>
          {!enabled && <p style={{ color: "var(--sstpa-muted)", fontSize: "0.78rem" }}>Type at least two characters to search Reference Data.</p>}
          {enabled && search.isLoading && <p style={{ color: "var(--sstpa-muted)", fontSize: "0.78rem" }}>Searching…</p>}
          {enabled && search.error != null && <div className="sstpa-alert-error">{errorText(search.error)}</div>}
          {enabled && !search.isLoading && results.length === 0 && !search.error && (
            <p style={{ color: "var(--sstpa-muted)", fontSize: "0.78rem" }}>No matching reference items.</p>
          )}
          {results.map((r) => (
            <button
              key={r.uuid}
              className="entity-card"
              style={{ width: "100%", textAlign: "left", marginBottom: 6, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => onPick(r)}
            >
              <div className="entity-card-header">
                <span className="entity-hid">{shortExternalId(r.externalId)}</span>
                <span className="type-badge">{r.frameworkName}</span>
                <LevelBadge level={levelForReference(r.labels, {})} />
              </div>
              <strong style={{ fontSize: "0.82rem" }}>{r.name}</strong>
              <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
                {(r.shortDescription ?? "").slice(0, 140)}
              </div>
            </button>
          ))}
        </div>
        {busy && <div className="sstpa-alert-warning" style={{ marginTop: 8 }}>Cloning… creating (:Attack) and [:REFERENCES] link.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button className="sstpa-button secondary" disabled={busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function NewAttackDialog({
  entity,
  parent,
  attacks,
  onClose,
  onCreate,
  onAttachExisting,
}: {
  entity?: SoINode;
  parent?: SoINode;
  attacks: SoINode[];
  onClose: () => void;
  onCreate: (props: Record<string, unknown>) => void;
  onAttachExisting: (attackHid: string) => void;
}) {
  const defaultLevel = parent ? nextLevelDown(levelOf(parent)) : "TACTIC";
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [long, setLong] = useState("");
  const [level, setLevel] = useState<AttackLevel>(defaultLevel);
  const [existing, setExisting] = useState("");
  // Existing-attack candidates for "Add Subordinate" (§6.5.16.7): single
  // parent (tree, not DAG) and no cycles.
  const attachCandidates = parent
    ? attacks.filter((a) => a.hid !== parent.hid && !parentOf(a) && !wouldSelfParent(parent, a.hid, attacks))
    : [];
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={parent ? "Add Subordinate Attack" : "New Attack"}>
        <h2>{parent ? "Add Subordinate Attack" : "New Attack"}</h2>
        <p className="mono" style={{ fontSize: "0.72rem" }}>
          {parent
            ? `SUBORDINATE_TO ${parent.hid} (${levelOf(parent)})${entity ? ` · EXPLOITS ${entity.hid}` : ""}`
            : entity
              ? `EXPLOITS ${entity.hid}`
              : "Standalone Attack (must be associated before it can appear in an Attack Tree)"}
        </p>
        {parent && attachCandidates.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <select className="sstpa-input" value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">…or attach an existing Attack</option>
              {attachCandidates.map((a) => (
                <option key={a.hid} value={a.hid}>{a.hid} - {String(a.properties.Name ?? "")}</option>
              ))}
            </select>
            <button className="sstpa-button secondary" disabled={!existing} onClick={() => onAttachExisting(existing)}>
              Attach
            </button>
          </div>
        )}
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
          <button className="sstpa-button" disabled={!name.trim() || !short.trim()} onClick={() => onCreate({ Name: name, ShortDescription: short, LongDescription: long, AttackLevel: level })}>
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
  actions,
}: {
  attack: SoINode;
  byHid: Map<string, SoINode>;
  selected: boolean;
  onSelect: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="entity-card"
      style={{ width: "100%", marginBottom: 8, textAlign: "left", cursor: "pointer", borderColor: selected ? "var(--sstpa-accent)" : undefined }}
      onClick={onSelect}
    >
      <div className="entity-card-header">
        <span className="entity-hid">{attack.hid}</span>
        <LevelBadge level={levelOf(attack)} />
        {attack.properties.IsRVCandidate === true && <span className="type-badge" style={{ background: "var(--sstpa-accent)" }}>RV</span>}
        {!!attack.properties.ReferenceID && (
          <span className="type-badge" title={String(attack.properties.ReferenceFramework ?? "")}>
            {String(attack.properties.ReferenceID)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {actions}
      </div>
      <div style={{ fontWeight: 700, fontSize: "0.84rem", marginTop: 4 }}>{String(attack.properties.Name ?? "")}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
        {attackEntities(attack, byHid).map((e) => e.hid).join(", ") || "Unassociated — cannot appear in Attack Tree"}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: AttackLevel }) {
  const color = level === "STRATEGY" ? "var(--sstpa-node-security)" : level === "PROCEDURE" ? "var(--sstpa-node-muted)" : "var(--sstpa-status-info)";
  return (
    <span
      className="type-badge"
      style={{
        background: color,
        fontStyle: level === "PROCEDURE" ? "italic" : undefined,
        fontWeight: level === "STRATEGY" ? 800 : undefined,
      }}
    >
      {level}
    </span>
  );
}

function SmallList({ title, values }: { title: string; values: string[] }) {
  return (
    <div style={{ marginTop: 8, fontSize: "0.74rem" }}>
      <strong>{title}</strong>
      <div style={{ color: "var(--sstpa-muted)" }}>{values.length > 0 ? values.join("; ") : "—"}</div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "0.76rem", marginTop: 8 };

function levelOf(attack?: SoINode): AttackLevel {
  const raw = String(attack?.properties.AttackLevel ?? "TACTIC");
  return LEVELS.includes(raw as AttackLevel) ? (raw as AttackLevel) : "TACTIC";
}

function nextLevelDown(level: AttackLevel): AttackLevel {
  if (level === "STRATEGY") return "TACTIC";
  return "PROCEDURE";
}

/** AttackLevel mapping from Reference item type (§6.5.16.6): ATT&CK Tactic →
 *  STRATEGY, Technique → TACTIC, Sub-Technique → PROCEDURE; ATLAS Technique →
 *  TACTIC; EMB3D Vulnerability → TACTIC. */
function levelForReference(labels: string[], props: Record<string, unknown>): AttackLevel {
  if (labels.includes("AK_Tactic") || labels.includes("AT_Tactic")) return "STRATEGY";
  if (props.IsSubTechnique === true) return "PROCEDURE";
  return "TACTIC";
}

/** ReferenceURL construction from ExternalID and framework URL pattern
 *  (§6.5.16.6). EMB3D ExternalIDs are STIX UUIDs with no stable URL pattern. */
function referenceUrl(framework: string, externalId: string): string | null {
  if (framework === "ATT&CK") {
    if (/^TA\d+$/.test(externalId)) return `https://attack.mitre.org/tactics/${externalId}/`;
    const m = externalId.match(/^T(\d+)(?:\.(\d+))?$/);
    if (m) return `https://attack.mitre.org/techniques/T${m[1]}${m[2] ? `/${m[2]}` : ""}/`;
  }
  if (framework === "ATLAS" && /^AML\./.test(externalId)) {
    return `https://atlas.mitre.org/techniques/${externalId}`;
  }
  return null;
}

function shortExternalId(externalId: string): string {
  // EMB3D/STIX-style ids ("vulnerability--<uuid>") are too long for a badge.
  const m = externalId.match(/^([a-z-]+)--([0-9a-f]{8})/);
  return m ? `${m[1]}…${m[2]}` : externalId;
}

function attacksForEntity(entityHid: string, attacks: SoINode[]): SoINode[] {
  return attacks.filter((a) => (a.relationships ?? []).some((r) => r.type === "EXPLOITS" && r.targetHID === entityHid));
}

function attackEntities(attack: SoINode, byHid: Map<string, SoINode>): SoINode[] {
  return (attack.relationships ?? [])
    .filter((r) => r.type === "EXPLOITS")
    .map((r) => byHid.get(r.targetHID))
    .filter((n): n is SoINode => !!n);
}

/** Attacks reachable for an entity through (:Hazard)-[:USES_ATTACK]->(:Attack)
 *  where the Hazard THREATENS an Asset the entity has a CURRENT Trace to
 *  (§6.5.16.2, §6.5.16.8). */
function hazardAttackPairs(
  entity: SoINode | undefined,
  hazards: SoINode[],
  attackMap: Map<string, SoINode>,
  scope: ScopeState,
): { attack: SoINode; hazard: SoINode }[] {
  if (!entity) return [];
  const traced = new Set(
    (entity.relationships ?? [])
      .filter(
        (r) =>
          ["HOLDS", "TRANSPORTS", "USES"].includes(r.type) &&
          String(r.props?.TraceStatus ?? "CURRENT") === "CURRENT",
      )
      .map((r) => r.targetHID),
  );
  const out: { attack: SoINode; hazard: SoINode }[] = [];
  for (const hz of hazards) {
    const relevant = (hz.relationships ?? []).some(
      (r) =>
        r.type === "THREATENS" &&
        traced.has(r.targetHID) &&
        (!scope.asset || r.targetHID === scope.asset),
    );
    if (!relevant) continue;
    for (const r of hz.relationships ?? []) {
      if (r.type !== "USES_ATTACK") continue;
      const attack = attackMap.get(r.targetHID);
      if (attack) out.push({ attack, hazard: hz });
    }
  }
  return out;
}

/** True when the Attack is relevant to the active Asset scope (§6.5.16.8):
 *  Attacks without [:TARGETS_LOSS] are generally applicable; scoped Attacks
 *  must target a Loss of the scoped Asset matching the selected Criticality
 *  and Assurance dimensions. */
function attackVisibleInScope(
  attack: SoINode,
  scope: ScopeState,
  byHid: Map<string, SoINode>,
  assetLossMap: Map<string, Set<string>>,
): boolean {
  if (!scope.asset) return true;
  const targeted = (attack.relationships ?? []).filter((r) => r.type === "TARGETS_LOSS");
  if (targeted.length === 0) return true;
  return targeted.some((r) => {
    const loss = byHid.get(r.targetHID);
    return !!loss && lossMatchesScope(loss, scope, assetLossMap);
  });
}

function lossMatchesScope(
  loss: SoINode,
  scope: ScopeState,
  assetLossMap: Map<string, Set<string>>,
): boolean {
  if (!scope.asset) return true;
  if (!assetLossMap.get(scope.asset)?.has(loss.hid)) return false;
  if (scope.criticality && loss.properties[`${scope.criticality}Critical`] !== true) return false;
  if (scope.assurance && loss.properties[scope.assurance] !== true) return false;
  return true;
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
  const seen = new Set<string>();
  while (cur) {
    if (cur === childHid) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = parentOf(byHid.get(cur));
  }
  return false;
}

function parseMetrics(raw: unknown): Record<string, number> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
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
  const rows = [["EntityHID", "EntityType", "EntityName", "AttackCount", "StrategyCount", "TacticCount", "ProcedureCount", "RVCandidateCount"]];
  for (const e of entities) {
    const assoc = attacksForEntity(e.hid, attacks);
    rows.push([
      e.hid,
      e.typeName,
      String(e.properties.Name ?? ""),
      String(assoc.length),
      String(assoc.filter((a) => levelOf(a) === "STRATEGY").length),
      String(assoc.filter((a) => levelOf(a) === "TACTIC").length),
      String(assoc.filter((a) => levelOf(a) === "PROCEDURE").length),
      String(assoc.filter((a) => a.properties.IsRVCandidate === true).length),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function catalogMarkdown(attacks: SoINode[], byHid: Map<string, SoINode>): string {
  let md = `# Attack Catalog\n\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const a of attacks) {
    md += `## ${a.hid} - ${String(a.properties.Name ?? "")}\n\n`;
    md += `Level: ${levelOf(a)}\n\n`;
    md += `RV Candidate: ${a.properties.IsRVCandidate === true ? "Yes" : "No"}\n\n`;
    if (a.properties.ReferenceFramework || a.properties.ReferenceID) {
      md += `Reference: ${String(a.properties.ReferenceFramework ?? "")} ${String(a.properties.ReferenceID ?? "")}\n\n`;
    }
    md += `Entities: ${attackEntities(a, byHid).map((e) => e.hid).join(", ") || "None"}\n\n`;
    if (a.properties.MetricsJSON) md += `Metrics: \`${String(a.properties.MetricsJSON)}\`\n\n`;
  }
  return md;
}

function hierarchyMarkdown(attacks: SoINode[]): string {
  const roots = attacks.filter((a) => !parentOf(a));
  const render = (a: SoINode, depth: number): string => {
    const line = `${"  ".repeat(depth)}- ${a.hid} ${String(a.properties.Name ?? "")} (${levelOf(a)})\n`;
    return line + attacks.filter((c) => parentOf(c) === a.hid).map((c) => render(c, depth + 1)).join("");
  };
  return `# Attack Hierarchy\n\n${roots.map((r) => render(r, 0)).join("")}`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
