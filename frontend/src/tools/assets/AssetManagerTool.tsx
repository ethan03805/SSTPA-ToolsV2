// Asset Manager Tool (SRS §6.5.7): table-oriented management of (:Asset),
// (:Regime)/(:MasterRegime), auto-generated (:Loss) and root (:GsnGoal) nodes
// covering the Criticality×Assurance space (§6.5.7.9), DERIVED asset
// handling, and validation view. Progressive disclosure: table row →
// expanded quick-edit → Data Drawer for full editing.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";

const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;

type View = "table" | "regimes" | "validation";

export default function AssetManagerTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const [view, setView] = useState<View>("table");
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);
  const assets = nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset");

  const refresh = () => void qc.invalidateQueries({ queryKey: ["soi"] });

  const commit = useMutation({
    mutationFn: (ops: CommitOperation[]) =>
      api.commit({ soiHid: ctx.soiHid ?? undefined, toolId: "sstpa.assets", operations: ops }),
    onSuccess: (res) => {
      refresh();
      if (res.nodesChanged > 1) {
        setNotice(
          "Loss nodes created without Environment assignment. Use the Context Tool to assign Environments and complete Loss definitions (SRS §6.5.7.9).",
        );
      }
    },
    onError: (e) => setNotice(String(e)),
  });

  /** Auto-generation ops (§6.5.7.9): for each true (C, S) pair on the asset
   *  with no existing environment-less Loss for that tuple, create Loss +
   *  root Goal in the same transaction. */
  const autoGenOps = (
    assetHid: string,
    assetName: string,
    props: Record<string, unknown>,
  ): CommitOperation[] => {
    const asset = byHid.get(assetHid);
    const existingLosses = (asset?.relationships ?? [])
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
        {view === "table" && <NewAssetButton ctx={ctx} assets={assets} commit={commit.mutate} />}
      </div>
      {notice && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          {notice}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      {view === "table" && (
        <AssetTable assets={assets} byHid={byHid} commit={commit.mutate} autoGenOps={autoGenOps} />
      )}
      {view === "regimes" && <RegimeView ctx={ctx} assets={assets} commit={commit.mutate} />}
      {view === "validation" && <ValidationView assets={assets} byHid={byHid} />}
    </div>
  );
}

function NewAssetButton({
  ctx,
  assets,
  commit,
}: {
  ctx: ToolLaunchContext;
  assets: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"PRIMARY" | "DERIVED">("PRIMARY");
  const [derivedFrom, setDerivedFrom] = useState("");
  const [crit, setCrit] = useState<Record<string, boolean>>({});
  const [assr, setAssr] = useState<Record<string, boolean>>({});

  const primaries = assets.filter((a) => a.properties.AssetType !== "DERIVED");

  const create = () => {
    const props: Record<string, unknown> = { Name: name, AssetType: type, ...crit, ...assr };
    // DERIVED inherits Criticality from the referenced PRIMARY (§6.5.7.12).
    if (type === "DERIVED" && derivedFrom) {
      const p = primaries.find((a) => a.hid === derivedFrom);
      for (const c of CRITICALITIES) props[c] = p?.properties[c] === true;
    }
    const ops: CommitOperation[] = [
      { op: "createNode", tempId: "ast", label: "Asset", properties: props },
      { op: "createRelationship", type: "HAS_ASSET", sourceHid: ctx.soiHid!, targetHid: "$ast" },
    ];
    if (type === "DERIVED" && derivedFrom) {
      ops.push({ op: "createRelationship", type: "DERIVED_FROM", sourceHid: "$ast", targetHid: derivedFrom });
    }
    // Loss/Goal auto-generation in the same transaction (§6.5.7.9): tempIds
    // can't reference the not-yet-known asset HID, so generate against $ast.
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
      }
    }
    commit(ops);
    setOpen(false);
    setName("");
    setCrit({});
    setAssr({});
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
          <label style={{ display: "block", fontSize: "0.82rem", marginTop: 6 }}>
            Derived from (PRIMARY Asset; Criticality is inherited)
            <select className="sstpa-input" value={derivedFrom} onChange={(e) => setDerivedFrom(e.target.value)}>
              <option value="">Select…</option>
              {primaries.map((p) => (
                <option key={p.hid} value={p.hid}>
                  {String(p.properties.Name ?? p.hid)}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === "PRIMARY" && (
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
        )}
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="sstpa-button secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            className="sstpa-button"
            disabled={!name || (type === "DERIVED" && !derivedFrom)}
            onClick={create}
          >
            Create (Losses & Goals auto-generate)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Asset Table View (§6.5.7.7) with expandable quick-edit rows. */
function AssetTable({
  assets,
  byHid,
  commit,
  autoGenOps,
}: {
  assets: SoINode[];
  byHid: Map<string, SoINode>;
  commit: (ops: CommitOperation[]) => void;
  autoGenOps: (hid: string, name: string, props: Record<string, unknown>) => CommitOperation[];
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const openDrawer = useDrawer((s) => s.openDrawer);
  const drawerOpen = useDrawer((s) => s.open);
  const openTool = useToolWindows((s) => s.openTool);

  const filtered = assets.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      a.hid.toLowerCase().includes(s) ||
      String(a.properties.Name ?? "").toLowerCase().includes(s) ||
      String(a.properties.ShortDescription ?? "").toLowerCase().includes(s)
    );
  });

  const relNames = (a: SoINode, type: string) =>
    (a.relationships ?? [])
      .filter((r) => r.type === type)
      .map((r) => String(byHid.get(r.targetHID)?.properties.Name ?? r.targetHID));

  const trueList = (a: SoINode, keys: readonly string[]) =>
    keys.filter((k) => a.properties[k] === true).map((k) => k.replace("Critical", ""));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-2)" }}>
      <input
        className="sstpa-input"
        style={{ maxWidth: 320, margin: "4px 8px" }}
        placeholder="Search HID / Name / description…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
            <th></th>
            <th style={{ padding: "4px 6px" }}>HID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Criticality</th>
            <th>Assurance</th>
            <th>Regimes</th>
            <th>Losses</th>
            <th>Goals</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => {
            const losses = (a.relationships ?? []).filter((r) => r.type === "HAS_LOSS");
            const goals = (a.relationships ?? []).filter((r) => r.type === "HAS_GOAL");
            const isOpen = expanded === a.hid;
            const type = String(a.properties.AssetType ?? "PRIMARY");
            return (
              <ExpandableRow
                key={a.hid}
                isOpen={isOpen}
                onToggle={() => setExpanded(isOpen ? null : a.hid)}
                mainRow={
                  <>
                    <td className="mono" style={{ padding: "4px 6px", fontSize: "0.68rem" }}>
                      {a.hid}
                    </td>
                    <td style={{ fontWeight: 600 }}>{String(a.properties.Name ?? "")}</td>
                    <td>
                      <span
                        className="type-badge"
                        style={{
                          background: type === "DERIVED" ? "var(--sstpa-node-muted)" : "var(--sstpa-node-asset)",
                        }}
                      >
                        {type}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.7rem" }}>{trueList(a, CRITICALITIES).join(", ") || "—"}</td>
                    <td style={{ fontSize: "0.7rem" }}>{trueList(a, ASSURANCES).join(", ") || "—"}</td>
                    <td style={{ fontSize: "0.7rem" }}>{relNames(a, "HAS_REGIME").join(", ") || "—"}</td>
                    <td>{losses.length}</td>
                    <td>{goals.length}</td>
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
                    onCommit={(props) => {
                      const ops: CommitOperation[] = [
                        { op: "updateNode", hid: a.hid, properties: props },
                        ...autoGenOps(a.hid, String(a.properties.Name ?? a.hid), {
                          ...a.properties,
                          ...props,
                        }),
                      ];
                      commit(ops);
                    }}
                    onOpenLossTool={() => openTool("sstpa.loss")}
                    onOpenGoalKeeper={() => openTool("sstpa.goalkeeper")}
                    onOpenContextTool={() => openTool("sstpa.context")}
                  />
                }
              />
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={10} style={{ padding: 14, color: "var(--sstpa-navy-muted)" }}>
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
  onToggle,
  mainRow,
  expandedContent,
}: {
  isOpen: boolean;
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
          <td colSpan={10} style={{ background: "var(--sstpa-ivory-sunken)", padding: 10 }}>
            {expandedContent}
          </td>
        </tr>
      )}
    </>
  );
}

/** Level-2 quick edit (§6.5.7.7 progressive disclosure): criticality &
 *  assurance checkboxes, Loss list with statuses, tool launch buttons. */
function QuickEdit({
  asset,
  byHid,
  onCommit,
  onOpenLossTool,
  onOpenGoalKeeper,
  onOpenContextTool,
}: {
  asset: SoINode;
  byHid: Map<string, SoINode>;
  onCommit: (props: Record<string, unknown>) => void;
  onOpenLossTool: () => void;
  onOpenGoalKeeper: () => void;
  onOpenContextTool: () => void;
}) {
  const [staged, setStaged] = useState<Record<string, unknown>>({});
  const isDerived = asset.properties.AssetType === "DERIVED";
  const val = (k: string) => (k in staged ? staged[k] === true : asset.properties[k] === true);

  const losses = (asset.relationships ?? [])
    .filter((r) => r.type === "HAS_LOSS")
    .map((r) => byHid.get(r.targetHID))
    .filter((l): l is SoINode => !!l);

  return (
    <div style={{ display: "flex", gap: 24, fontSize: "0.78rem", flexWrap: "wrap" }}>
      <div>
        <strong>Criticality</strong>
        {isDerived && (
          <span style={{ color: "var(--sstpa-navy-muted)" }}> (inherited from PRIMARY)</span>
        )}
        <div>
          {CRITICALITIES.map((c) => (
            <label key={c} style={{ display: "block" }}>
              <input
                type="checkbox"
                disabled={isDerived}
                checked={val(c)}
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
                checked={val(s)}
                onChange={(e) => setStaged((x) => ({ ...x, [s]: e.target.checked }))}
              />{" "}
              {s}
            </label>
          ))}
        </div>
        <button
          className="sstpa-button"
          style={{ marginTop: 6 }}
          disabled={Object.keys(staged).length === 0}
          onClick={() => {
            onCommit(staged);
            setStaged({});
          }}
        >
          Commit (auto-generates Losses/Goals)
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        <strong>Loss nodes ({losses.length})</strong>
        {losses.map((l) => {
          const envRel = (l.relationships ?? []).find((r) => r.type === "HAS_ENVIRONMENT");
          const status = String(l.properties.AttackTreeStatus ?? "NOT_BUILT");
          const valid = l.properties.TreeIsValid === true;
          return (
            <div key={l.hid} className="prop-row">
              <span className="mono" style={{ fontSize: "0.66rem" }}>
                {l.hid}
              </span>
              <span>
                <span className={valid ? "state-ok" : "state-error"}>{valid ? "✓" : "✗"}</span>{" "}
                <span className="mono" style={{ fontSize: "0.62rem" }}>
                  {status}
                </span>{" "}
                {envRel ? (
                  <span className="state-ok" style={{ fontSize: "0.66rem" }}>
                    Assigned: {String(byHid.get(envRel.targetHID)?.properties.Name ?? envRel.targetHID)}
                  </span>
                ) : (
                  <span className="state-warn" style={{ fontSize: "0.66rem" }}>
                    Unassigned
                  </span>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="icon-button" onClick={onOpenLossTool}>
            Open in Loss Tool
          </button>
          <button className="icon-button" onClick={onOpenContextTool}>
            Launch Context Tool
          </button>
          <button className="icon-button" onClick={onOpenGoalKeeper}>
            Goal Keeper
          </button>
        </div>
      </div>
    </div>
  );
}

/** Regime View (§6.5.7.10): Master Regime templates + clone into
 *  Asset-specific (:Regime) nodes. */
function RegimeView({
  ctx,
  assets,
  commit,
}: {
  ctx: ToolLaunchContext;
  assets: SoINode[];
  commit: (ops: CommitOperation[]) => void;
}) {
  const mastersList = useQuery({
    queryKey: ["master-regimes-list"],
    queryFn: () => api.nodesByType("MasterRegime"),
  });
  const [name, setName] = useState("");
  const [authority, setAuthority] = useState("");
  const [standard, setStandard] = useState("");
  const [cloneTarget, setCloneTarget] = useState("");
  void ctx;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      <h3 style={{ fontFamily: "var(--sstpa-font-brand)" }}>Master Regimes (templates)</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
            <th style={{ padding: "4px 6px" }}>Name</th>
            <th>Authority</th>
            <th>Standard</th>
            <th>Clone to Asset</th>
          </tr>
        </thead>
        <tbody>
          {(mastersList.data?.nodes ?? []).map((m) => (
            <tr key={m.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
              <td style={{ padding: "4px 6px", fontWeight: 600 }}>{String(m.properties.Name ?? "")}</td>
              <td>{String(m.properties.Authority ?? "")}</td>
              <td>{String(m.properties.Standard ?? "")}</td>
              <td>
                <select className="sstpa-input" style={{ width: "auto" }} value={cloneTarget} onChange={(e) => setCloneTarget(e.target.value)}>
                  <option value="">Select Asset…</option>
                  {assets.map((a) => (
                    <option key={a.hid} value={a.hid}>
                      {String(a.properties.Name ?? a.hid)}
                    </option>
                  ))}
                </select>{" "}
                <button
                  className="icon-button"
                  disabled={!cloneTarget}
                  onClick={() =>
                    // Clone Regime (§6.5.7.10): copy properties, new HID/uuid,
                    // associate with the Asset.
                    commit([
                      {
                        op: "createNode",
                        tempId: "reg",
                        label: "Regime",
                        properties: {
                          Name: String(m.properties.Name ?? ""),
                          Authority: m.properties.Authority,
                          Standard: m.properties.Standard,
                          ShortDescription: m.properties.ShortDescription,
                          CertificationScope: m.properties.CertificationScope,
                        },
                      },
                      { op: "createRelationship", type: "HAS_REGIME", sourceHid: cloneTarget, targetHid: "$reg" },
                    ])
                  }
                >
                  Clone Regime
                </button>
              </td>
            </tr>
          ))}
          {(mastersList.data?.nodes ?? []).length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 12, color: "var(--sstpa-navy-muted)" }}>
                No Master Regimes yet — create one below.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ fontFamily: "var(--sstpa-font-brand)", marginTop: 18 }}>Create New Master Regime</h3>
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
        <button
          className="sstpa-button"
          disabled={!name}
          onClick={() => {
            commit([
              {
                op: "createNode",
                tempId: "mr",
                label: "MasterRegime",
                properties: { Name: name, Authority: authority, Standard: standard },
              },
            ]);
            setName("");
            setAuthority("");
            setStandard("");
            setTimeout(() => void mastersList.refetch(), 800);
          }}
        >
          Create Master Regime
        </button>
      </div>
    </div>
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
  const findings: { level: "ERROR" | "WARNING" | "INFO"; text: string; tool?: string }[] = [];

  for (const a of assets) {
    const name = String(a.properties.Name ?? a.hid);
    const isDerived = a.properties.AssetType === "DERIVED";
    const losses = (a.relationships ?? [])
      .filter((r) => r.type === "HAS_LOSS")
      .map((r) => byHid.get(r.targetHID))
      .filter((l): l is SoINode => !!l);
    const goals = (a.relationships ?? []).filter((r) => r.type === "HAS_GOAL");
    const regimes = (a.relationships ?? []).filter((r) => r.type === "HAS_REGIME");
    const derivedFrom = (a.relationships ?? []).filter((r) => r.type === "DERIVED_FROM");

    if (isDerived && derivedFrom.length === 0) {
      findings.push({ level: "ERROR", text: `${name}: DERIVED Asset must reference a PRIMARY Asset (§6.5.7.12).` });
    }
    for (const df of derivedFrom) {
      const target = byHid.get(df.targetHID);
      if (target?.properties.AssetType === "DERIVED") {
        findings.push({ level: "ERROR", text: `${name}: DERIVED_FROM target ${df.targetHID} is not PRIMARY.` });
      }
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
        });
      }
      if (l.properties.AttackTreeStatus === "INVALIDATED") {
        findings.push({
          level: "WARNING",
          text: `${name}: Loss ${l.hid} attack tree INVALIDATED — review in the Loss Tool.`,
          tool: "sstpa.loss",
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
            <button className="icon-button" onClick={() => openTool(f.tool!)}>
              {f.tool === "sstpa.loss" ? "Open in Loss Tool" : "Launch Context Tool"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
