// Asset Manager Tool (SRS §6.5.7): table-oriented management of (:Asset) /
// (:DerivedAsset), (:Regime)/(:MasterRegime), auto-generated (:Loss) and root
// (:GsnGoal) nodes covering the Criticality×Assurance space (§6.5.7.9),
// trace-relationship allocation to Elements/Functions/Interfaces/States
// (§6.5.7.11), DERIVED asset handling, and validation view. Progressive
// disclosure: table row → expanded quick-edit → Data Drawer for full editing.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, NodeResponse, SoINode } from "../../api/types";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { ToolStatus, errorText } from "../shared";

const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;
const TRACE_RELS = ["HOLDS", "TRANSPORTS", "USES"] as const;
const TRACE_SOURCES = ["Component", "SystemFunction", "Interface", "State"];

type View = "table" | "regimes" | "validation";
type Notice = { kind: "success" | "warn" | "error"; text: string } | null;

interface AllocEntry {
  entityHid: string;
  entityType: string;
  relType: string;
  stateHid: string;
}

/** §6.5.7.10 names Master Regime properties (Authority, Standard,
 *  Certification Scope) that the machine-readable schema does not define for
 *  (:MasterRegime)/(:Regime); they are carried as a JSON payload in the
 *  common LongDescription property (schema gap noted per I-12). */
interface RegimeMeta {
  Authority?: string;
  Standard?: string;
  CertificationScope?: string;
}

function regimeMeta(n: { properties: Record<string, unknown> }): RegimeMeta {
  const raw = n.properties.LongDescription;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const p = JSON.parse(raw) as RegimeMeta;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

const lossCS = (l: SoINode) => ({
  c: CRITICALITIES.find((k) => l.properties[k] === true) ?? "",
  s: ASSURANCES.find((k) => l.properties[k] === true) ?? "",
});

const findingsCount = (l: SoINode): number => {
  const raw = l.properties.AttackTreeJSON;
  if (typeof raw !== "string" || !raw) return 0;
  try {
    const p = JSON.parse(raw) as { validationFindings?: unknown[] };
    return p.validationFindings?.length ?? 0;
  } catch {
    return 0;
  }
};

const findingsSummary = (l: SoINode): string => {
  const raw = l.properties.AttackTreeJSON;
  if (typeof raw !== "string" || !raw) return "";
  try {
    const p = JSON.parse(raw) as { validationFindings?: unknown[] };
    return (p.validationFindings ?? [])
      .map((f) => {
        if (typeof f === "string") return f;
        const o = f as { summary?: string; message?: string; reason?: string };
        return o.summary ?? o.message ?? o.reason ?? JSON.stringify(f);
      })
      .join("; ");
  } catch {
    return "";
  }
};

const isDerived = (a: SoINode) =>
  a.typeName === "DerivedAsset" || a.properties.AssetType === "DERIVED";

export default function AssetManagerTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const [view, setView] = useState<View>("table");
  const [notice, setNotice] = useState<Notice>(null);
  const [assocFilter, setAssocFilter] = useState<string | null>(null);
  const qc = useQueryClient();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const masters = useQuery({
    queryKey: ["master-regimes-list"],
    queryFn: () => api.nodesByType("MasterRegime"),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const assets = useMemo(
    () => nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset"),
    [nodes],
  );
  const masterNodes = useMemo(() => masters.data?.nodes ?? [], [masters.data]);

  // §6.5.7.11 allocation index: CURRENT trace relationships targeting each
  // Asset, keyed by Asset HID (entity -[:HOLDS|TRANSPORTS|USES]-> Asset).
  const allocations = useMemo(() => {
    const map = new Map<string, AllocEntry[]>();
    for (const n of nodes) {
      if (!TRACE_SOURCES.includes(n.typeName)) continue;
      for (const r of n.relationships ?? []) {
        if (!(TRACE_RELS as readonly string[]).includes(r.type)) continue;
        if (r.props?.TraceStatus === "SUPERSEDED") continue;
        const list = map.get(r.targetHID) ?? [];
        list.push({
          entityHid: n.hid,
          entityType: n.typeName,
          relType: r.type,
          stateHid: String(r.props?.TraceStateHID ?? ""),
        });
        map.set(r.targetHID, list);
      }
    }
    return map;
  }, [nodes]);

  // Environments reached through each Asset's Losses ([:HAS_ENVIRONMENT];
  // the schema authorizes no direct Asset→Environment relationship).
  const envsByAsset = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of assets) {
      const set = new Set<string>();
      for (const r of a.relationships ?? []) {
        if (r.type !== "HAS_LOSS") continue;
        for (const lr of byHid.get(r.targetHID)?.relationships ?? []) {
          if (lr.type === "HAS_ENVIRONMENT") set.add(lr.targetHID);
        }
      }
      map.set(a.hid, set);
    }
    return map;
  }, [assets, byHid]);

  // §6.5.7.3: when invoked from an Element/Function/Interface/State/Environment
  // drawer, filter to Assets associated with that node.
  const focusHid = ctx.drawerNodeHid ?? ctx.focusHid;
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusApplied.current || !focusHid) return;
    const n = byHid.get(focusHid);
    if (!n) return;
    focusApplied.current = true;
    if (["Component", "SystemFunction", "Interface", "State", "Environment"].includes(n.typeName)) {
      setAssocFilter(focusHid);
    }
  }, [byHid, focusHid]);

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.assets", operations: ops }),
    onSuccess: (_res, ops) => {
      // Query invalidation replaces ad-hoc refetch timers.
      void qc.invalidateQueries({ queryKey: ["soi"] });
      void qc.invalidateQueries({ queryKey: ["master-regimes-list"] });
      const lossTemps = ops
        .filter((o) => o.op === "createNode" && o.label === "Loss")
        .map((o) => `$${o.tempId}`);
      const envAssigned = new Set(
        ops
          .filter((o) => o.op === "createRelationship" && o.type === "HAS_ENVIRONMENT")
          .map((o) => o.sourceHid),
      );
      if (lossTemps.some((t) => !envAssigned.has(t))) {
        setNotice({
          kind: "warn",
          text: "Loss nodes created without Environment assignment. Use the Context Tool to assign Environments and complete Loss definitions (SRS §6.5.7.9).",
        });
      } else {
        setNotice({ kind: "success", text: "Changes committed." });
      }
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  /** Auto-generation ops (§6.5.7.9): for each true (C, S) pair on the asset
   *  with no existing environment-less Loss for that tuple, create Loss +
   *  root Goal in the same transaction. Skipped for (:DerivedAsset): the
   *  schema authorizes [:HAS_LOSS]/[:HAS_GOAL] only from (:Asset). */
  const autoGenOps = (
    assetHid: string,
    assetName: string,
    props: Record<string, unknown>,
  ): CommitOperation[] => {
    const asset = byHid.get(assetHid);
    if (!asset || asset.typeName === "DerivedAsset") return [];
    const existingLosses = (asset.relationships ?? [])
      .filter((r) => r.type === "HAS_LOSS")
      .map((r) => byHid.get(r.targetHID))
      .filter((l): l is SoINode => !!l);
    const ops: CommitOperation[] = [];
    let i = 0;
    for (const c of CRITICALITIES) {
      if (props[c] !== true) continue;
      for (const s of ASSURANCES) {
        if (props[s] !== true) continue;
        const exists = existingLosses.some(
          (l) =>
            l.properties[c] === true &&
            l.properties[s] === true &&
            !(l.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT"),
        );
        if (exists) continue;
        i++;
        const lossProps: Record<string, unknown> = {
          Name: `Compromise ${assetName} ${c} ${s}`,
          ShortDescription: `Pending Environment assignment. Created from Asset ${assetHid}.`,
          AttackTreeStatus: "NOT_BUILT",
          TreeIsValid: false,
          TreeHasRVs: false,
        };
        for (const cc of CRITICALITIES) lossProps[cc] = cc === c;
        for (const ss of ASSURANCES) lossProps[ss] = ss === s;
        ops.push(
          { op: "createNode", tempId: `loss${i}`, label: "Loss", properties: lossProps },
          { op: "createRelationship", type: "HAS_LOSS", sourceHid: assetHid, targetHid: `$loss${i}` },
          {
            op: "createNode",
            tempId: `goal${i}`,
            label: "GsnGoal",
            properties: {
              Name: `${assetName} ${c} ${s} acceptable`,
              GoalStatement: `The ${c} of ${s} of ${assetName} is acceptable.`,
            },
          },
          { op: "createRelationship", type: "HAS_GOAL", sourceHid: assetHid, targetHid: `$goal${i}` },
        );
      }
    }
    return ops;
  };

  if (!ctx.soiHid) {
    return <ToolStatus needsSoI />;
  }

  const filteredAssets = assocFilter
    ? assets.filter((a) => {
        const allocs = allocations.get(a.hid) ?? [];
        if (allocs.some((e) => e.entityHid === assocFilter || e.stateHid === assocFilter)) return true;
        return envsByAsset.get(a.hid)?.has(assocFilter) ?? false;
      })
    : assets;

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
        <button className={`sstpa-button ${view === "table" ? "" : "secondary"}`} onClick={() => setView("table")}>
          Assets
        </button>
        <button className={`sstpa-button ${view === "regimes" ? "" : "secondary"}`} onClick={() => setView("regimes")}>
          Regimes
        </button>
        <button
          className={`sstpa-button ${view === "validation" ? "" : "secondary"}`}
          onClick={() => setView("validation")}
        >
          Validation
        </button>
        <span style={{ flex: 1 }} />
        {view === "table" && (
          <NewAssetDialog
            ctx={ctx}
            assets={assets}
            masters={masterNodes}
            environments={nodes.filter((n) => n.typeName === "Environment")}
            commit={commit.mutate}
          />
        )}
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
            ✕
          </button>
        </div>
      )}
      {assocFilter && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          Showing Assets associated with{" "}
          {String(byHid.get(assocFilter)?.properties.Name ?? assocFilter)} (§6.5.7.3).{" "}
          <button className="icon-button" onClick={() => setAssocFilter(null)}>
            Clear filter
          </button>
        </div>
      )}
      {soi.isPending ? (
        <ToolStatus loading />
      ) : soi.error ? (
        <ToolStatus error={soi.error} onRetry={() => void soi.refetch()} />
      ) : (
        <>
          {view === "table" && (
            <AssetTable
              assets={filteredAssets}
              nodes={nodes}
              byHid={byHid}
              allocations={allocations}
              envsByAsset={envsByAsset}
              initialExpanded={focusHid && byHid.get(focusHid)?.typeName.includes("Asset") ? focusHid : null}
              commit={commit.mutate}
              autoGenOps={autoGenOps}
            />
          )}
          {view === "regimes" && (
            <RegimeView assets={assets} nodes={nodes} masters={masterNodes} commit={commit.mutate} />
          )}
          {view === "validation" && <ValidationView assets={assets} byHid={byHid} />}
        </>
      )}
    </div>
  );
}

/** New-Asset dialog (§6.5.7.8): type, Criticality/Assurance, plus optional
 *  Regime assignment (clone of a Master Regime) and Environment association
 *  (applied to the auto-generated Loss nodes via [:HAS_ENVIRONMENT]). */
function NewAssetDialog({
  ctx,
  assets,
  masters,
  environments,
  commit,
}: {
  ctx: ToolLaunchContext;
  assets: SoINode[];
  masters: NodeResponse[];
  environments: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"PRIMARY" | "DERIVED">("PRIMARY");
  const [derivedFrom, setDerivedFrom] = useState("");
  const [crit, setCrit] = useState<Record<string, boolean>>({});
  const [assr, setAssr] = useState<Record<string, boolean>>({});
  const [masterHid, setMasterHid] = useState("");
  const [envHid, setEnvHid] = useState("");

  const primaries = assets.filter((a) => a.typeName === "Asset" && a.properties.AssetType !== "DERIVED");

  const reset = () => {
    setOpen(false);
    setName("");
    setType("PRIMARY");
    setDerivedFrom("");
    setCrit({});
    setAssr({});
    setMasterHid("");
    setEnvHid("");
  };

  const create = () => {
    const soiHid = ctx.soiHid;
    if (!soiHid) return;
    if (type === "DERIVED") {
      // (:DerivedAsset) per I-12: the schema authorizes [:DERIVED_FROM] to the
      // PRIMARY (:Asset); Criticality is inherited (displayed from the
      // referenced PRIMARY — the schema defines no Criticality/Assurance
      // properties on (:DerivedAsset)). SoI membership comes from the commit
      // scope's SoIIndex.
      commit([
        { op: "createNode", tempId: "ast", label: "DerivedAsset", properties: { Name: name } },
        { op: "createRelationship", type: "DERIVED_FROM", sourceHid: "$ast", targetHid: derivedFrom },
      ]);
      reset();
      return;
    }
    const props: Record<string, unknown> = { Name: name, AssetType: "PRIMARY", ...crit, ...assr };
    const ops: CommitOperation[] = [
      { op: "createNode", tempId: "ast", label: "Asset", properties: props },
      { op: "createRelationship", type: "HAS_ASSET", sourceHid: soiHid, targetHid: "$ast" },
    ];
    // Optional Regime assignment (§6.5.7.8 step 3): clone the selected Master
    // Regime into an Asset-specific (:Regime) in the same transaction.
    if (masterHid) {
      const m = masters.find((x) => x.hid === masterHid);
      if (m) {
        ops.push(
          {
            op: "createNode",
            tempId: "reg",
            label: "Regime",
            properties: {
              Name: m.properties.Name,
              ShortDescription: m.properties.ShortDescription,
              LongDescription: m.properties.LongDescription,
            },
          },
          { op: "createRelationship", type: "HAS_REGIME", sourceHid: "$ast", targetHid: "$reg" },
        );
      }
    }
    // Loss/Goal auto-generation in the same transaction (§6.5.7.9); the
    // optional Environment association (§6.5.7.8 step 4) completes each Loss
    // via [:HAS_ENVIRONMENT] immediately.
    let i = 0;
    for (const c of CRITICALITIES) {
      if (props[c] !== true) continue;
      for (const s of ASSURANCES) {
        if (props[s] !== true) continue;
        i++;
        const lossProps: Record<string, unknown> = {
          Name: `Compromise ${name} ${c} ${s}`,
          ShortDescription: `Pending Environment assignment. Created from new Asset.`,
          AttackTreeStatus: "NOT_BUILT",
          TreeIsValid: false,
          TreeHasRVs: false,
        };
        for (const cc of CRITICALITIES) lossProps[cc] = cc === c;
        for (const ss of ASSURANCES) lossProps[ss] = ss === s;
        ops.push(
          { op: "createNode", tempId: `l${i}`, label: "Loss", properties: lossProps },
          { op: "createRelationship", type: "HAS_LOSS", sourceHid: "$ast", targetHid: `$l${i}` },
          {
            op: "createNode",
            tempId: `g${i}`,
            label: "GsnGoal",
            properties: {
              Name: `${name} ${c} ${s} acceptable`,
              GoalStatement: `The ${c} of ${s} of ${name} is acceptable.`,
            },
          },
          { op: "createRelationship", type: "HAS_GOAL", sourceHid: "$ast", targetHid: `$g${i}` },
        );
        if (envHid) {
          ops.push({ op: "createRelationship", type: "HAS_ENVIRONMENT", sourceHid: `$l${i}`, targetHid: envHid });
        }
      }
    }
    commit(ops);
    reset();
  };

  if (!open) {
    return (
      <button className="sstpa-button" onClick={() => setOpen(true)}>
        + New Asset
      </button>
    );
  }
  return (
    <div className="sstpa-dialog-overlay" onClick={() => setOpen(false)}>
      <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Asset</h2>
        <label style={{ display: "block", fontSize: "0.82rem" }}>
          Name
          <input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
          Asset Type
          <select className="sstpa-input" value={type} onChange={(e) => setType(e.target.value as "PRIMARY" | "DERIVED")}>
            <option>PRIMARY</option>
            <option>DERIVED</option>
          </select>
        </label>
        {type === "DERIVED" && (
          <>
            <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
              Derived from (PRIMARY Asset; Criticality is inherited, §6.5.7.12)
              <select className="sstpa-input" value={derivedFrom} onChange={(e) => setDerivedFrom(e.target.value)}>
                <option value="">Select…</option>
                {primaries.map((p) => (
                  <option key={p.hid} value={p.hid}>
                    {String(p.properties.Name ?? p.hid)}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
              Created as (:DerivedAsset) with [:DERIVED_FROM]. The schema defines
              no Criticality/Assurance properties on (:DerivedAsset); Criticality
              displays inherited from the referenced PRIMARY.
            </p>
          </>
        )}
        {type === "PRIMARY" && (
          <>
            <fieldset style={{ marginTop: 8, border: "var(--sstpa-border-soft)", fontSize: "0.8rem" }}>
              <legend>Criticality</legend>
              {CRITICALITIES.map((c) => (
                <label key={c} style={{ marginRight: 10 }}>
                  <input
                    type="checkbox"
                    checked={crit[c] ?? false}
                    onChange={(e) => setCrit((x) => ({ ...x, [c]: e.target.checked }))}
                  />{" "}
                  {c.replace("Critical", "")}
                </label>
              ))}
            </fieldset>
            <fieldset style={{ marginTop: 8, border: "var(--sstpa-border-soft)", fontSize: "0.8rem" }}>
              <legend>Assurance</legend>
              {ASSURANCES.map((s) => (
                <label key={s} style={{ marginRight: 10 }}>
                  <input
                    type="checkbox"
                    checked={assr[s] ?? false}
                    onChange={(e) => setAssr((x) => ({ ...x, [s]: e.target.checked }))}
                  />{" "}
                  {s}
                </label>
              ))}
            </fieldset>
            <label style={{ display: "block", fontSize: "0.82rem", marginTop: 8 }}>
              Regime (optional — clones the Master Regime for this Asset, §6.5.7.8)
              <select className="sstpa-input" value={masterHid} onChange={(e) => setMasterHid(e.target.value)}>
                <option value="">None yet</option>
                {masters.map((m) => (
                  <option key={m.hid} value={m.hid}>
                    {String(m.properties.Name ?? m.hid)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
              Environment (optional — assigned to the generated Loss nodes)
              <select className="sstpa-input" value={envHid} onChange={(e) => setEnvHid(e.target.value)}>
                <option value="">Assign later via Context Tool</option>
                {environments.map((env) => (
                  <option key={env.hid} value={env.hid}>
                    {String(env.properties.Name ?? env.hid)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={reset}>
            Cancel
          </button>
          <button
            className="sstpa-button"
            disabled={!name || (type === "DERIVED" && !derivedFrom)}
            onClick={create}
          >
            {type === "PRIMARY" ? "Create (Losses & Goals auto-generate)" : "Create Derived Asset"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Row {
  asset: SoINode;
  hid: string;
  name: string;
  type: string;
  crit: string;
  assr: string;
  regimes: string;
  elements: number;
  functions: number;
  interfaces: number;
  states: number;
  envs: number;
  derivedFrom: string;
  losses: number;
  goals: number;
  goalStatus: string;
  status: string;
}

const COLUMNS: { key: keyof Row & string; label: string }[] = [
  { key: "hid", label: "HID" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "crit", label: "Criticality" },
  { key: "assr", label: "Assurance" },
  { key: "regimes", label: "Regimes" },
  { key: "elements", label: "Elements" },
  { key: "functions", label: "Functions" },
  { key: "interfaces", label: "Interfaces" },
  { key: "states", label: "States" },
  { key: "envs", label: "Environments" },
  { key: "derivedFrom", label: "Derived From" },
  { key: "losses", label: "Losses" },
  { key: "goalStatus", label: "Goals" },
  { key: "status", label: "Status" },
];

/** Asset Table View (§6.5.7.7): association/derivation/goal columns, sorting,
 *  column visibility, search, and expandable quick-edit rows. */
function AssetTable({
  assets,
  nodes,
  byHid,
  allocations,
  envsByAsset,
  initialExpanded,
  commit,
  autoGenOps,
}: {
  assets: SoINode[];
  nodes: SoINode[];
  byHid: Map<string, SoINode>;
  allocations: Map<string, AllocEntry[]>;
  envsByAsset: Map<string, Set<string>>;
  initialExpanded: string | null;
  commit: (ops: CommitOperation[]) => void;
  autoGenOps: (hid: string, name: string, props: Record<string, unknown>) => CommitOperation[];
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);
  const [sortKey, setSortKey] = useState<string>("hid");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(["states", "envs", "derivedFrom"]),
  );
  const [colMenu, setColMenu] = useState(false);
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);

  const trueList = (a: SoINode, keys: readonly string[]) =>
    keys.filter((k) => a.properties[k] === true).map((k) => k.replace("Critical", ""));

  const rows = useMemo<Row[]>(
    () =>
      assets.map((a) => {
        const rels = a.relationships ?? [];
        const allocs = allocations.get(a.hid) ?? [];
        const count = (t: string) => new Set(allocs.filter((e) => e.entityType === t).map((e) => e.entityHid)).size;
        const stateCtx = new Set(allocs.map((e) => e.stateHid).filter(Boolean));
        for (const e of allocs) if (e.entityType === "State") stateCtx.add(e.entityHid);
        const losses = rels.filter((r) => r.type === "HAS_LOSS").length;
        const goals = rels.filter((r) => r.type === "HAS_GOAL").length;
        const derivedFromNames = rels
          .filter((r) => r.type === "DERIVED_FROM")
          .map((r) => String(byHid.get(r.targetHID)?.properties.Name ?? r.targetHID));
        const critSource =
          isDerived(a) && derivedFromNames.length > 0
            ? byHid.get(rels.find((r) => r.type === "DERIVED_FROM")!.targetHID)
            : a;
        const problems: string[] = [];
        if (isDerived(a) && derivedFromNames.length === 0) problems.push("no PRIMARY reference");
        if (a.typeName === "Asset") {
          const lossNodes = rels
            .filter((r) => r.type === "HAS_LOSS")
            .map((r) => byHid.get(r.targetHID))
            .filter((l): l is SoINode => !!l);
          outer: for (const c of CRITICALITIES) {
            if (a.properties[c] !== true) continue;
            for (const s of ASSURANCES) {
              if (a.properties[s] !== true) continue;
              if (!lossNodes.some((l) => l.properties[c] === true && l.properties[s] === true)) {
                problems.push("missing Loss coverage");
                break outer;
              }
            }
          }
        }
        return {
          asset: a,
          hid: a.hid,
          name: String(a.properties.Name ?? ""),
          type: isDerived(a) ? "DERIVED" : "PRIMARY",
          crit: (critSource ? trueList(critSource, CRITICALITIES) : []).join(", "),
          assr: trueList(a, ASSURANCES).join(", "),
          regimes: rels
            .filter((r) => r.type === "HAS_REGIME")
            .map((r) => String(byHid.get(r.targetHID)?.properties.Name ?? r.targetHID))
            .join(", "),
          elements: count("Component"),
          functions: count("SystemFunction"),
          interfaces: count("Interface"),
          states: stateCtx.size,
          envs: envsByAsset.get(a.hid)?.size ?? 0,
          derivedFrom: derivedFromNames.join(", "),
          losses,
          goals,
          goalStatus: losses === 0 ? (goals > 0 ? `${goals}` : "—") : `${goals}/${losses}${goals >= losses ? " ✓" : ""}`,
          status: problems.length === 0 ? "✓" : `⚠ ${problems.join("; ")}`,
        };
      }),
    [assets, allocations, envsByAsset, byHid],
  );

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.hid.toLowerCase().includes(s) ||
      r.name.toLowerCase().includes(s) ||
      String(r.asset.properties.ShortDescription ?? "").toLowerCase().includes(s)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortKey as keyof Row];
    const vb = b[sortKey as keyof Row];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });

  const visibleCols = COLUMNS.filter((c) => !hiddenCols.has(c.key));
  const colSpan = visibleCols.length + 2;

  const clickSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-2)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
        <input
          className="sstpa-input"
          style={{ maxWidth: 320, margin: "4px 8px" }}
          placeholder="Search HID / Name / description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="icon-button" onClick={() => setColMenu((v) => !v)}>
          Columns ▾
        </button>
        {colMenu && (
          <div
            className="sstpa-frame"
            style={{
              position: "absolute",
              top: "100%",
              left: 340,
              zIndex: 5,
              padding: 10,
              fontSize: "0.76rem",
              background: "var(--sstpa-surface)",
            }}
          >
            {COLUMNS.map((c) => (
              <label key={c.key} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={!hiddenCols.has(c.key)}
                  onChange={(e) =>
                    setHiddenCols((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    })
                  }
                />{" "}
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th></th>
            {visibleCols.map((c) => (
              <th
                key={c.key}
                style={{ padding: "4px 6px", cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={() => clickSort(c.key)}
                title="Sort"
              >
                {c.label}
                {sortKey === c.key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const a = r.asset;
            const isOpen = expanded === a.hid;
            return (
              <ExpandableRow
                key={a.hid}
                isOpen={isOpen}
                colSpan={colSpan}
                onToggle={() => setExpanded(isOpen ? null : a.hid)}
                mainRow={
                  <>
                    {visibleCols.map((c) => {
                      if (c.key === "hid") {
                        return (
                          <td key={c.key} className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>
                            {r.hid}
                          </td>
                        );
                      }
                      if (c.key === "name") {
                        return (
                          <td key={c.key} style={{ fontWeight: 600 }}>
                            {r.name}
                          </td>
                        );
                      }
                      if (c.key === "type") {
                        return (
                          <td key={c.key}>
                            <span
                              className="type-badge"
                              style={{
                                background:
                                  r.type === "DERIVED" ? "var(--sstpa-node-muted)" : "var(--sstpa-node-asset)",
                              }}
                            >
                              {r.type}
                            </span>
                          </td>
                        );
                      }
                      const v = r[c.key as keyof Row];
                      return (
                        <td key={c.key} style={{ fontSize: "0.7rem" }}>
                          {typeof v === "number" || typeof v === "string" ? (v === "" ? "—" : v) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="icon-button"
                        title="Full editing in Data Drawer"
                        disabled={drawerOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer({ mode: "edit", hid: a.hid });
                        }}
                      >
                        ✎
                      </button>
                    </td>
                  </>
                }
                expandedContent={
                  <QuickEdit
                    asset={a}
                    byHid={byHid}
                    nodes={nodes}
                    allocs={allocations.get(a.hid) ?? []}
                    envs={envsByAsset.get(a.hid) ?? new Set()}
                    commit={commit}
                    onCommitProps={(props) => {
                      commit([
                        { op: "updateNode", hid: a.hid, properties: props },
                        ...autoGenOps(a.hid, String(a.properties.Name ?? a.hid), {
                          ...a.properties,
                          ...props,
                        }),
                      ]);
                    }}
                  />
                }
              />
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ padding: 14, color: "var(--sstpa-muted)" }}>
                No Assets{search ? " matching the search" : " in this SoI yet"}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExpandableRow({
  isOpen,
  colSpan,
  onToggle,
  mainRow,
  expandedContent,
}: {
  isOpen: boolean;
  colSpan: number;
  onToggle: () => void;
  mainRow: React.ReactNode;
  expandedContent: React.ReactNode;
}) {
  return (
    <>
      <tr
        style={{ borderBottom: "1px solid var(--sstpa-line-soft)", cursor: "pointer" }}
        onClick={onToggle}
      >
        <td style={{ width: 20, textAlign: "center" }}>{isOpen ? "▾" : "▸"}</td>
        {mainRow}
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={colSpan} style={{ background: "var(--sstpa-inset)", padding: 10 }}>
            {expandedContent}
          </td>
        </tr>
      )}
    </>
  );
}

/** Level-2 quick edit (§6.5.7.7 progressive disclosure): Criticality &
 *  Assurance with removal warning (§6.5.7.9), Loss list with per-Loss detail
 *  (§6.5.7.13), trace allocation (§6.5.7.11), and cross-tool launches. */
function QuickEdit({
  asset,
  byHid,
  nodes,
  allocs,
  envs,
  commit,
  onCommitProps,
}: {
  asset: SoINode;
  byHid: Map<string, SoINode>;
  nodes: SoINode[];
  allocs: AllocEntry[];
  envs: Set<string>;
  commit: (ops: CommitOperation[]) => void;
  onCommitProps: (props: Record<string, unknown>) => void;
}) {
  const [staged, setStaged] = useState<Record<string, unknown>>({});
  const [warn, setWarn] = useState<{ staged: Record<string, unknown>; affected: SoINode[] } | null>(null);
  const openTool = useToolWindows((s) => s.openTool);
  const derived = isDerived(asset);
  const derivedLabel = asset.typeName === "DerivedAsset";
  const primary = derived
    ? byHid.get((asset.relationships ?? []).find((r) => r.type === "DERIVED_FROM")?.targetHID ?? "")
    : undefined;
  const critSource = derived && primary ? primary : asset;
  const val = (source: SoINode, k: string) =>
    k in staged && source === asset ? staged[k] === true : source.properties[k] === true;

  const losses = (asset.relationships ?? [])
    .filter((r) => r.type === "HAS_LOSS")
    .map((r) => byHid.get(r.targetHID))
    .filter((l): l is SoINode => !!l);
  const goals = (asset.relationships ?? [])
    .filter((r) => r.type === "HAS_GOAL")
    .map((r) => byHid.get(r.targetHID))
    .filter((g): g is SoINode => !!g);

  const goalFor = (l: SoINode) => {
    const { c, s } = lossCS(l);
    if (!c || !s) return undefined;
    return goals.find((g) => {
      const text = `${String(g.properties.GoalStatement ?? "")} ${String(g.properties.Name ?? "")}`;
      return text.includes(c) && text.includes(s);
    });
  };

  // §6.5.7.9: unchecking a Criticality/Assurance flag lists the Loss nodes
  // left analytically unsupported and requires confirmation — never deletes.
  const requestCommit = () => {
    const next: Record<string, unknown> = { ...asset.properties, ...staged };
    const affected = losses.filter((l) => {
      const { c, s } = lossCS(l);
      if (!c || !s) return false;
      const wasSupported = asset.properties[c] === true && asset.properties[s] === true;
      const stillSupported = next[c] === true && next[s] === true;
      return wasSupported && !stillSupported;
    });
    if (affected.length > 0) {
      setWarn({ staged, affected });
    } else {
      onCommitProps(staged);
      setStaged({});
    }
  };

  return (
    <div style={{ display: "flex", gap: 24, fontSize: "0.78rem", flexWrap: "wrap" }}>
      {warn && (
        <div className="sstpa-dialog-overlay" onClick={() => setWarn(null)}>
          <div className="sstpa-frame sstpa-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Removal warning (§6.5.7.9)</h2>
            <p style={{ fontSize: "0.8rem" }}>
              The unchecked Criticality/Assurance flags leave these Loss nodes
              analytically unsupported by the Asset's properties. They will NOT
              be deleted — deletion is an explicit User action.
            </p>
            {warn.affected.map((l) => (
              <div key={l.hid} className="prop-row">
                <span className="mono" style={{ fontSize: "0.68rem" }}>
                  {l.hid}
                </span>
                <span style={{ fontSize: "0.72rem" }}>{String(l.properties.Name ?? "")}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="sstpa-button secondary" onClick={() => setWarn(null)}>
                Cancel
              </button>
              <button
                className="sstpa-button"
                onClick={() => {
                  onCommitProps(warn.staged);
                  setStaged({});
                  setWarn(null);
                }}
              >
                Commit anyway (keep Loss nodes)
              </button>
            </div>
          </div>
        </div>
      )}
      <div>
        <strong>Criticality</strong>
        {derived && (
          <span style={{ color: "var(--sstpa-muted)" }}>
            {" "}
            (inherited from {primary ? String(primary.properties.Name ?? primary.hid) : "PRIMARY"})
          </span>
        )}
        <div>
          {CRITICALITIES.map((c) => (
            <label key={c} style={{ display: "block" }}>
              <input
                type="checkbox"
                disabled={derived}
                checked={val(critSource, c)}
                onChange={(e) => setStaged((s) => ({ ...s, [c]: e.target.checked }))}
              />{" "}
              {c}
            </label>
          ))}
        </div>
      </div>
      <div>
        <strong>Assurance</strong>
        <div>
          {ASSURANCES.map((s) => (
            <label key={s} style={{ display: "block" }}>
              <input
                type="checkbox"
                disabled={derivedLabel}
                checked={val(asset, s)}
                onChange={(e) => setStaged((x) => ({ ...x, [s]: e.target.checked }))}
              />{" "}
              {s}
            </label>
          ))}
        </div>
        {derivedLabel ? (
          <p style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)", maxWidth: 220 }}>
            The schema defines no Assurance properties on (:DerivedAsset);
            additional Assurance is managed on the referenced PRIMARY.
          </p>
        ) : (
          <button
            className="sstpa-button"
            style={{ marginTop: 6 }}
            disabled={Object.keys(staged).length === 0}
            onClick={requestCommit}
          >
            Commit (auto-generates Losses/Goals)
          </button>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 300 }}>
        <strong>Loss nodes ({losses.length})</strong>
        {losses.map((l) => {
          const envRel = (l.relationships ?? []).find((r) => r.type === "HAS_ENVIRONMENT");
          const status = String(l.properties.AttackTreeStatus ?? "NOT_BUILT");
          const valid = l.properties.TreeIsValid === true;
          const { c, s } = lossCS(l);
          const pathCount = l.properties.PathCount;
          const goal = goalFor(l);
          const nFindings = findingsCount(l);
          return (
            <div key={l.hid} className="prop-row" style={{ alignItems: "flex-start" }}>
              <span>
                <span className="mono" style={{ fontSize: "0.66rem" }}>
                  {l.hid}
                </span>{" "}
                <span style={{ fontSize: "0.64rem", color: "var(--sstpa-muted)" }}>
                  {c.replace("Critical", "")}/{s}
                </span>
                <br />
                <span className={valid ? "state-ok" : "state-error"}>{valid ? "✓" : "✗"}</span>{" "}
                <span className="mono" style={{ fontSize: "0.62rem" }}>
                  {status}
                </span>{" "}
                {pathCount != null && (
                  <span style={{ fontSize: "0.62rem" }}>paths: {String(pathCount)}</span>
                )}{" "}
                {nFindings > 0 && (
                  <span className="state-warn" style={{ fontSize: "0.62rem" }}>
                    findings: {nFindings}
                  </span>
                )}{" "}
                <span className={goal ? "state-ok" : "state-warn"} style={{ fontSize: "0.64rem" }}>
                  {goal ? "Goal ✓" : "Goal —"}
                </span>{" "}
                {envRel ? (
                  <span className="state-ok" style={{ fontSize: "0.66rem" }}>
                    Env: {String(byHid.get(envRel.targetHID)?.properties.Name ?? envRel.targetHID)}
                  </span>
                ) : (
                  <span className="state-warn" style={{ fontSize: "0.66rem" }}>
                    Env unassigned
                  </span>
                )}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                <button
                  className="icon-button"
                  title="Open in Loss Tool"
                  onClick={() => openTool("sstpa.loss", { focusHid: l.hid, focusType: "Loss" })}
                >
                  Loss
                </button>
                {!envRel && (
                  <button
                    className="icon-button"
                    title="Launch Context Tool to assign an Environment"
                    onClick={() => openTool("sstpa.context", { focusHid: l.hid, focusType: "Loss" })}
                  >
                    Context
                  </button>
                )}
                {goal && (
                  <button
                    className="icon-button"
                    title="Open the root Goal in Goal Keeper"
                    onClick={() => openTool("sstpa.goalkeeper", { focusHid: goal.hid, focusType: "GsnGoal" })}
                  >
                    Goal
                  </button>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            className="icon-button"
            onClick={() => openTool("sstpa.loss", { focusHid: asset.hid, focusType: asset.typeName })}
          >
            Open in Loss Tool
          </button>
          <button className="icon-button" onClick={() => openTool("sstpa.context")}>
            Launch Context Tool
          </button>
          <button
            className="icon-button"
            onClick={() =>
              openTool(
                "sstpa.goalkeeper",
                goals.length > 0 ? { focusHid: goals[0].hid, focusType: "GsnGoal" } : undefined,
              )
            }
          >
            Goal Keeper
          </button>
        </div>
      </div>
      <AllocationPanel asset={asset} nodes={nodes} byHid={byHid} allocs={allocs} envs={envs} commit={commit} />
    </div>
  );
}

/** Asset Relationship Allocation (§6.5.7.11): allocate the Asset to
 *  Elements/Functions/Interfaces/States through the schema's trace
 *  relationships (entity)-[:HOLDS|TRANSPORTS|USES {TraceStateHID}]->(Asset)
 *  with batch multi-select. Environment association is derived from the
 *  Asset's Losses ([:HAS_ENVIRONMENT], Context Tool responsibility). */
function AllocationPanel({
  asset,
  nodes,
  byHid,
  allocs,
  envs,
  commit,
}: {
  asset: SoINode;
  nodes: SoINode[];
  byHid: Map<string, SoINode>;
  allocs: AllocEntry[];
  envs: Set<string>;
  commit: (ops: CommitOperation[]) => void;
}) {
  const [relType, setRelType] = useState<string>("HOLDS");
  const [stateHid, setStateHid] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const openTool = useToolWindows((s) => s.openTool);
  const states = nodes.filter((n) => n.typeName === "State");
  const nameOf = (hid: string) => String(byHid.get(hid)?.properties.Name ?? hid);

  if (asset.typeName === "DerivedAsset") {
    return (
      <div style={{ minWidth: 260 }}>
        <strong>Allocation (§6.5.7.11)</strong>
        <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
          Trace relationships (HOLDS/TRANSPORTS/USES) target (:Asset); the
          schema does not authorize them to (:DerivedAsset). Allocate the
          referenced PRIMARY Asset instead.
        </p>
      </div>
    );
  }

  const byType = (t: string) => nodes.filter((n) => n.typeName === t);
  const groups: { label: string; type: string }[] = [
    { label: "Elements", type: "Component" },
    { label: "Functions", type: "SystemFunction" },
    { label: "Interfaces", type: "Interface" },
    { label: "States", type: "State" },
  ];

  return (
    <div style={{ minWidth: 280, maxWidth: 360 }}>
      <strong>Allocation (§6.5.7.11)</strong>
      {allocs.length > 0 ? (
        allocs.map((e) => (
          <div key={`${e.relType}-${e.entityHid}-${e.stateHid}`} className="prop-row">
            <span style={{ fontSize: "0.68rem" }}>
              <span className="mono">[:{e.relType}]</span> {nameOf(e.entityHid)}
              {e.stateHid && (
                <span style={{ color: "var(--sstpa-muted)" }}> @ {nameOf(e.stateHid)}</span>
              )}
            </span>
            <button
              className="icon-button danger"
              title="Supersede this trace allocation"
              onClick={() =>
                commit([
                  {
                    op: "deleteRelationship",
                    type: e.relType,
                    sourceHid: e.entityHid,
                    targetHid: asset.hid,
                    properties: e.stateHid ? { TraceStateHID: e.stateHid } : undefined,
                  },
                ])
              }
            >
              ✕
            </button>
          </div>
        ))
      ) : (
        <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
          No current trace allocations.
        </p>
      )}
      {states.length === 0 ? (
        <p style={{ fontSize: "0.72rem", color: "var(--sstpa-muted)" }}>
          Trace allocation requires a State context (TraceStateHID,
          §3.3.4.6.1) — create States in the State Tool first.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              title="Trace relationship type"
            >
              {TRACE_RELS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              className="sstpa-input"
              style={{ width: "auto", flex: 1 }}
              value={stateHid}
              onChange={(e) => setStateHid(e.target.value)}
              title="State context (TraceStateHID)"
            >
              <option value="">State context…</option>
              {states.map((st) => (
                <option key={st.hid} value={st.hid}>
                  {String(st.properties.Name ?? st.hid)}
                </option>
              ))}
            </select>
          </div>
          <select
            className="sstpa-input"
            multiple
            size={6}
            value={picked}
            onChange={(e) => setPicked(Array.from(e.target.selectedOptions, (o) => o.value))}
            title="Multi-select entities to allocate"
          >
            {groups.map((g) => (
              <optgroup key={g.type} label={g.label}>
                {byType(g.type).map((n) => (
                  <option key={n.hid} value={n.hid}>
                    {String(n.properties.Name ?? n.hid)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="sstpa-button"
            disabled={!stateHid || picked.length === 0}
            onClick={() => {
              commit(
                picked.map((hid) => ({
                  op: "createRelationship" as const,
                  type: relType,
                  sourceHid: hid,
                  targetHid: asset.hid,
                  properties: { TraceStateHID: stateHid },
                })),
              );
              setPicked([]);
            }}
          >
            Allocate ({picked.length})
          </button>
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: "0.7rem" }}>
        <strong>Environments</strong>{" "}
        <span style={{ color: "var(--sstpa-muted)" }}>(via Losses; Context Tool)</span>
        <div>
          {envs.size > 0 ? Array.from(envs).map(nameOf).join(", ") : "—"}{" "}
          <button className="icon-button" onClick={() => openTool("sstpa.context")}>
            Context Tool
          </button>
        </div>
      </div>
    </div>
  );
}

/** Regime View (§6.5.7.10): Master Regime templates (with Description and
 *  Certification Scope), per-row cloning into Asset-specific (:Regime)
 *  nodes, and inline editing of existing clones. */
function RegimeView({
  assets,
  nodes,
  masters,
  commit,
}: {
  assets: SoINode[];
  nodes: SoINode[];
  masters: NodeResponse[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [name, setName] = useState("");
  const [authority, setAuthority] = useState("");
  const [standard, setStandard] = useState("");
  const [description, setDescription] = useState("");
  const [certScope, setCertScope] = useState("");

  const regimeOwner = useMemo(() => {
    const map = new Map<string, SoINode>();
    for (const a of assets) {
      for (const r of a.relationships ?? []) {
        if (r.type === "HAS_REGIME") map.set(r.targetHID, a);
      }
    }
    return map;
  }, [assets]);
  const clones = nodes.filter((n) => n.typeName === "Regime");

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      <h3 style={{ fontFamily: "var(--sstpa-font-ui)" }}>Master Regimes (templates)</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 6px" }}>Name</th>
            <th>Authority</th>
            <th>Standard</th>
            <th>Description</th>
            <th>Certification Scope</th>
            <th>Clone to Asset</th>
          </tr>
        </thead>
        <tbody>
          {masters.map((m) => (
            <MasterRegimeRow key={m.hid} master={m} assets={assets} commit={commit} />
          ))}
          {masters.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 12, color: "var(--sstpa-muted)" }}>
                No Master Regimes yet — create one below.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ fontFamily: "var(--sstpa-font-ui)", marginTop: 18 }}>Create New Master Regime</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>
          Name
          <input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Authority
          <input className="sstpa-input" value={authority} onChange={(e) => setAuthority(e.target.value)} />
        </label>
        <label>
          Standard
          <input className="sstpa-input" value={standard} onChange={(e) => setStandard(e.target.value)} />
        </label>
        <label>
          Description
          <input className="sstpa-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Certification Scope
          <input className="sstpa-input" value={certScope} onChange={(e) => setCertScope(e.target.value)} />
        </label>
        <button
          className="sstpa-button"
          disabled={!name}
          onClick={() => {
            commit([
              {
                op: "createNode",
                tempId: "mr",
                label: "MasterRegime",
                properties: {
                  Name: name,
                  ShortDescription: description,
                  LongDescription: JSON.stringify({
                    Authority: authority,
                    Standard: standard,
                    CertificationScope: certScope,
                  }),
                },
              },
            ]);
            setName("");
            setAuthority("");
            setStandard("");
            setDescription("");
            setCertScope("");
          }}
        >
          Create Master Regime
        </button>
      </div>

      <h3 style={{ fontFamily: "var(--sstpa-font-ui)", marginTop: 18 }}>
        Asset Regimes (cloned, editable)
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 6px" }}>HID</th>
            <th>Asset</th>
            <th>Name</th>
            <th>Authority</th>
            <th>Standard</th>
            <th>Certification Scope</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clones.map((r) => (
            <RegimeCloneRow key={r.hid} regime={r} owner={regimeOwner.get(r.hid)} commit={commit} />
          ))}
          {clones.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 12, color: "var(--sstpa-muted)" }}>
                No Asset-specific Regimes yet — clone a Master Regime above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One Master Regime row with a per-row clone target (state is local so
 *  selections never bleed across rows). */
function MasterRegimeRow({
  master,
  assets,
  commit,
}: {
  master: NodeResponse;
  assets: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [cloneTarget, setCloneTarget] = useState("");
  const meta = regimeMeta(master);
  // [:HAS_REGIME] is authorized from (:Asset) only.
  const eligible = assets.filter((a) => a.typeName === "Asset");
  return (
    <tr style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
      <td style={{ padding: "4px 6px", fontWeight: 600 }}>{String(master.properties.Name ?? "")}</td>
      <td>{meta.Authority ?? ""}</td>
      <td>{meta.Standard ?? ""}</td>
      <td style={{ fontSize: "0.72rem" }}>{String(master.properties.ShortDescription ?? "")}</td>
      <td style={{ fontSize: "0.72rem" }}>{meta.CertificationScope ?? ""}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={cloneTarget}
          onChange={(e) => setCloneTarget(e.target.value)}
        >
          <option value="">Select Asset…</option>
          {eligible.map((a) => (
            <option key={a.hid} value={a.hid}>
              {String(a.properties.Name ?? a.hid)}
            </option>
          ))}
        </select>{" "}
        <button
          className="icon-button"
          disabled={!cloneTarget}
          onClick={() => {
            // Clone Regime (§6.5.7.10): copy properties, new HID/uuid,
            // associate with the Asset.
            commit([
              {
                op: "createNode",
                tempId: "reg",
                label: "Regime",
                properties: {
                  Name: String(master.properties.Name ?? ""),
                  ShortDescription: master.properties.ShortDescription,
                  LongDescription: master.properties.LongDescription,
                },
              },
              { op: "createRelationship", type: "HAS_REGIME", sourceHid: cloneTarget, targetHid: "$reg" },
            ]);
            setCloneTarget("");
          }}
        >
          Clone Regime
        </button>
      </td>
    </tr>
  );
}

/** Inline editing of a cloned per-Asset (:Regime) (§6.5.7.10 UX). */
function RegimeCloneRow({
  regime,
  owner,
  commit,
}: {
  regime: SoINode;
  owner: SoINode | undefined;
  commit: (ops: CommitOperation[]) => void;
}) {
  const meta = regimeMeta(regime);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(String(regime.properties.Name ?? ""));
  const [authority, setAuthority] = useState(meta.Authority ?? "");
  const [standard, setStandard] = useState(meta.Standard ?? "");
  const [certScope, setCertScope] = useState(meta.CertificationScope ?? "");

  if (!editing) {
    return (
      <tr style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
        <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>
          {regime.hid}
        </td>
        <td>{owner ? String(owner.properties.Name ?? owner.hid) : "—"}</td>
        <td style={{ fontWeight: 600 }}>{String(regime.properties.Name ?? "")}</td>
        <td>{meta.Authority ?? ""}</td>
        <td>{meta.Standard ?? ""}</td>
        <td style={{ fontSize: "0.72rem" }}>{meta.CertificationScope ?? ""}</td>
        <td>
          <button className="icon-button" onClick={() => setEditing(true)}>
            ✎ Edit
          </button>
        </td>
      </tr>
    );
  }
  return (
    <tr style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
      <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>
        {regime.hid}
      </td>
      <td>{owner ? String(owner.properties.Name ?? owner.hid) : "—"}</td>
      <td>
        <input className="sstpa-input" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input className="sstpa-input" value={authority} onChange={(e) => setAuthority(e.target.value)} />
      </td>
      <td>
        <input className="sstpa-input" value={standard} onChange={(e) => setStandard(e.target.value)} />
      </td>
      <td>
        <input className="sstpa-input" value={certScope} onChange={(e) => setCertScope(e.target.value)} />
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button
          className="icon-button"
          disabled={!name}
          onClick={() => {
            commit([
              {
                op: "updateNode",
                hid: regime.hid,
                properties: {
                  Name: name,
                  LongDescription: JSON.stringify({
                    Authority: authority,
                    Standard: standard,
                    CertificationScope: certScope,
                  }),
                },
              },
            ]);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button className="icon-button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

/** Validation View (§6.5.7.5d, §6.5.7.14). */
function ValidationView({
  assets,
  byHid,
}: {
  assets: SoINode[];
  byHid: Map<string, SoINode>;
}) {
  const openTool = useToolWindows((s) => s.openTool);
  const findings: {
    level: "ERROR" | "WARNING" | "INFO";
    text: string;
    tool?: string;
    toolLabel?: string;
    focusHid?: string;
    focusType?: string;
  }[] = [];

  for (const a of assets) {
    const name = String(a.properties.Name ?? a.hid);
    const derived = isDerived(a);
    const losses = (a.relationships ?? [])
      .filter((r) => r.type === "HAS_LOSS")
      .map((r) => byHid.get(r.targetHID))
      .filter((l): l is SoINode => !!l);
    const goals = (a.relationships ?? []).filter((r) => r.type === "HAS_GOAL");
    const regimes = (a.relationships ?? []).filter((r) => r.type === "HAS_REGIME");
    const derivedFrom = (a.relationships ?? []).filter((r) => r.type === "DERIVED_FROM");

    if (derived && derivedFrom.length === 0) {
      findings.push({ level: "ERROR", text: `${name}: DERIVED Asset must reference a PRIMARY Asset (§6.5.7.12).` });
    }
    for (const df of derivedFrom) {
      const target = byHid.get(df.targetHID);
      if (target && isDerived(target)) {
        findings.push({ level: "ERROR", text: `${name}: DERIVED_FROM target ${df.targetHID} is not PRIMARY.` });
      }
    }
    if (a.typeName === "DerivedAsset") {
      // Schema authorizes HAS_LOSS/HAS_GOAL/HAS_REGIME only from (:Asset);
      // Loss coverage validation does not apply to (:DerivedAsset).
      continue;
    }
    for (const c of CRITICALITIES) {
      if (a.properties[c] !== true) continue;
      if (regimes.length === 0) {
        findings.push({ level: "WARNING", text: `${name}: no Regime for criticality ${c} (§6.5.7.10).` });
      }
      for (const s of ASSURANCES) {
        if (a.properties[s] !== true) continue;
        const covered = losses.some((l) => l.properties[c] === true && l.properties[s] === true);
        if (!covered) {
          findings.push({
            level: "WARNING",
            text: `${name}: no Loss node for (${c}, ${s}) — commit the Asset to regenerate (§6.5.7.9).`,
          });
        }
      }
    }
    if (losses.length > goals.length) {
      findings.push({ level: "WARNING", text: `${name}: ${losses.length} Losses but ${goals.length} root Goals.` });
    }
    for (const l of losses) {
      if (!(l.relationships ?? []).some((r) => r.type === "HAS_ENVIRONMENT")) {
        findings.push({
          level: "INFO",
          text: `${name}: Loss ${l.hid} has no Environment — assign in the Context Tool.`,
          tool: "sstpa.context",
          toolLabel: "Launch Context Tool",
          focusHid: l.hid,
          focusType: "Loss",
        });
      }
      if (l.properties.AttackTreeStatus === "INVALIDATED") {
        const summary = findingsSummary(l);
        findings.push({
          level: "WARNING",
          text: `${name}: Loss ${l.hid} attack tree INVALIDATED${summary ? ` — ${summary}` : ""}.`,
          tool: "sstpa.loss",
          toolLabel: "Open in Loss Tool",
          focusHid: l.hid,
          focusType: "Loss",
        });
      }
    }
  }

  const color = { ERROR: "state-error", WARNING: "state-warn", INFO: "state-info" } as const;
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.82rem" }}>
      {findings.length === 0 && <p className="state-ok">No findings — Asset space is consistent.</p>}
      {findings.map((f, i) => (
        <div key={i} className="prop-row">
          <span className={color[f.level]}>
            [{f.level}] {f.text}
          </span>
          {f.tool && (
            <button
              className="icon-button"
              onClick={() =>
                openTool(
                  f.tool!,
                  f.focusHid ? { focusHid: f.focusHid, focusType: f.focusType } : undefined,
                )
              }
            >
              {f.toolLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
