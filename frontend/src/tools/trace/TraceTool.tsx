// Trace Tool (SRS §6.5.9): Asset Trace Analysis matrix — States as columns,
// Interfaces/Functions/Elements as rows; each cell assigns [:HOLDS]/
// [:TRANSPORTS]/[:USES] between the entity and the selected Asset in that
// State's context. Staged cells commit as one ACID transaction; the Backend
// executes supersession, inheritance, Connection inheritance, protection
// Requirement generation, and orphan detection (§6.5.9.6 phases 1–6).
//
// Commit contract (backend/internal/api/commit.go + commit_helpers.go):
// - createRelationship on a trace type auto-supersedes any CURRENT
//   relationship for the same (entity, State, Asset) cell — a TYPE CHANGE
//   therefore stages only the create; the old edge is superseded server-side.
// - deleteRelationship on a trace type SUPERSEDES (never deletes), scoped to
//   one cell by properties.TraceStateHID.
// - Criticality/assurance inheritance and Requirement generation/orphaning
//   recompute server-side after every trace commit.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import type { CommitOperation, SoINode } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDrawer, useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { downloadText, errorText, ToolStatus } from "../shared";

type RelType = "HOLDS" | "TRANSPORTS" | "USES";
const TRACE_TYPES = ["HOLDS", "TRANSPORTS", "USES"];
const CYCLE: (RelType | null)[] = [null, "HOLDS", "TRANSPORTS", "USES"];
const REL_STYLE: Record<RelType, { label: string; color: string }> = {
  HOLDS: { label: "H", color: "#33567e" },
  TRANSPORTS: { label: "T", color: "#4a7a6f" },
  USES: { label: "U", color: "#a8853a" },
};
const CRITICALITIES = ["SafetyCritical", "MissionCritical", "FlightCritical", "SecurityCritical"] as const;
const ASSURANCES = ["Confidentiality", "Availability", "Authenticity", "NonRepudiation", "Certifiable", "Privacy", "Trustworthy"] as const;

/** Cell display precedence: CURRENT wins, then INVALIDATED, then SUPERSEDED. */
const STATUS_RANK: Record<string, number> = { CURRENT: 2, INVALIDATED: 1, SUPERSEDED: 0 };

interface CellState {
  current?: { type: RelType; status: string; version: number; date?: string };
  staged?: RelType | null; // null = staged clear; undefined = untouched
}

type Mode = "entry" | "validation" | "criticality";
type EntityKind = "Interface" | "SystemFunction" | "Component" | "State";
/** New Entity Mode membership relationships from the SoI root (§6.5.9.5d). */
const MEMBERSHIP: Record<EntityKind, string> = {
  Interface: "HAS_INTERFACE",
  SystemFunction: "HAS_FUNCTION",
  Component: "HAS_ELEMENT",
  State: "EXHIBITS",
};

type Notice = { kind: "success" | "error"; text: string };
const nodeName = (n: SoINode | undefined) => String(n?.properties.Name ?? n?.hid ?? "");
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

// Acknowledgments for INVALIDATED findings are stored in localStorage keyed by
// relationship identity: the schema defines AcknowledgedInvalidation on the
// trace relationships (§6.5.9.7) but the commit API exposes no
// update-relationship-properties operation, so no server-side persistence
// path exists yet.
const ACK_STORE = "sstpa.trace.acknowledgedInvalidations";
function loadAcks(): Set<string> {
  try {
    const raw = localStorage.getItem(ACK_STORE);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

interface Finding {
  type: string;
  text: string;
  fix?: "entry" | "context";
  /** Present when the finding is acknowledgeable (invalidated relationships). */
  ackKey?: string;
}

/** Validation Mode findings (§6.5.9.5b). Pure so exports reuse it. */
function computeFindings(args: {
  assetHid: string;
  entities: SoINode[];
  states: SoINode[];
  byHid: Map<string, SoINode>;
  acks: Set<string>;
}): { findings: Finding[]; suppressed: number } {
  const { assetHid, entities, states, byHid, acks } = args;
  const findings: Finding[] = [];
  let suppressed = 0;
  const assetName = nodeName(byHid.get(assetHid));

  const relsToAsset = (e: SoINode) =>
    (e.relationships ?? []).filter((r) => TRACE_TYPES.includes(r.type) && r.targetHID === assetHid);

  for (const e of entities) {
    const rels = relsToAsset(e);
    if (rels.length === 0) {
      findings.push({
        type: "Unassigned Entity",
        text: `${e.hid} has no relationship to ${assetName} in any State.`,
        fix: "entry",
      });
    } else {
      const superseded = rels.filter((r) => r.props?.TraceStatus === "SUPERSEDED");
      if (superseded.length > 0) {
        findings.push({
          type: "Superseded Relationships",
          text: `${e.hid} has ${superseded.length} SUPERSEDED relationship(s) to ${assetName} (prior trace history).`,
        });
      }
      for (const r of rels) {
        if (r.props?.TraceStatus !== "INVALIDATED") continue;
        if (r.props?.AcknowledgedInvalidation === true) {
          suppressed++;
          continue;
        }
        const key = `${assetHid}|${e.hid}|${r.type}|${String(r.props?.TraceStateHID ?? "")}|v${String(r.props?.TraceVersion ?? "")}`;
        if (acks.has(key)) {
          suppressed++;
          continue;
        }
        findings.push({
          type: "Invalidated Relationship",
          text: `${e.hid} -[:${r.type}]-> ${assetHid} (state ${String(r.props?.TraceStateHID)}) is INVALIDATED.`,
          fix: "entry",
          ackKey: key,
        });
      }
      const current = rels.filter((r) => r.props?.TraceStatus === "CURRENT");
      if (current.length > 0) {
        const hasProtection = (e.relationships ?? []).some((r) => {
          if (r.type !== "HAS_REQUIREMENT") return false;
          const rq = byHid.get(r.targetHID);
          return String(rq?.properties.RStatement ?? "").includes(` of ${assetName}.`);
        });
        if (!hasProtection) {
          findings.push({
            type: "Entity Without Requirements",
            text: `${e.hid} relates to ${assetName} but has no protection Requirement (commit a trace to generate).`,
          });
        }
      }
    }

    // Criticality Inconsistency (§6.5.9.5b): stored entity flags vs the
    // OR-union computed from CURRENT relationships across ALL Assets.
    const sources = new Map<string, string[]>();
    for (const rel of e.relationships ?? []) {
      if (!TRACE_TYPES.includes(rel.type) || rel.props?.TraceStatus !== "CURRENT") continue;
      const a = byHid.get(rel.targetHID);
      if (!a || (a.typeName !== "Asset" && a.typeName !== "DerivedAsset")) continue;
      for (const c of CRITICALITIES) {
        if (a.properties[c] === true) sources.set(c, [...(sources.get(c) ?? []), a.hid]);
      }
    }
    for (const c of CRITICALITIES) {
      const stored = e.properties[c] === true;
      const computed = (sources.get(c) ?? []).length > 0;
      if (stored && !computed) {
        findings.push({
          type: "Criticality Inconsistency",
          text: `${e.hid} has ${c} = True but no CURRENT trace to an Asset with that flag — stale prior trace.`,
          fix: "entry",
        });
      } else if (!stored && computed) {
        findings.push({
          type: "Criticality Inconsistency",
          text: `${e.hid} has ${c} = False but CURRENT trace(s) to flagged Asset(s) (${[...new Set(sources.get(c))].join(", ")}) — re-commit to recompute.`,
          fix: "entry",
        });
      }
    }

    // Orphaned + duplicate protection Requirements (§6.5.9.5b).
    const reqs = (e.relationships ?? [])
      .filter((r) => r.type === "HAS_REQUIREMENT")
      .map((r) => byHid.get(r.targetHID))
      .filter((rq): rq is SoINode => !!rq);
    const protection = reqs.filter((rq) => String(rq.properties.RStatement ?? "").includes("SHALL protect the"));
    for (const rq of protection) {
      if (rq.properties.Orphan === true) {
        findings.push({
          type: "Orphaned Requirement",
          text: `${rq.hid} on ${e.hid} is Orphan = True — its entity no longer has a CURRENT relationship to the sourcing Asset.`,
        });
      }
    }
    const byText = new Map<string, SoINode[]>();
    for (const rq of protection) {
      const t = String(rq.properties.RStatement ?? "");
      byText.set(t, [...(byText.get(t) ?? []), rq]);
    }
    for (const [text, group] of byText) {
      if (group.length > 1) {
        findings.push({
          type: "Duplicate Protection Requirements",
          text: `${e.hid} has ${group.length} Requirements with identical RStatement "${text}" (${group.map((g) => g.hid).join(", ")}).`,
        });
      }
    }
  }

  for (const s of states) {
    if (!(s.relationships ?? []).some((r) => r.type === "VALID_IN")) {
      findings.push({
        type: "State Not Assigned to Any Environment",
        text: `${s.hid} has no [:VALID_IN]; entities in this State appear in no Attack Tree.`,
        fix: "context",
      });
    }
  }

  // Loss trees with no trace data for this asset (§6.5.9.5b).
  const asset = byHid.get(assetHid);
  const anyCurrent = entities.some((e) => relsToAsset(e).some((r) => r.props?.TraceStatus === "CURRENT"));
  if (!anyCurrent) {
    for (const r of asset?.relationships ?? []) {
      if (r.type === "HAS_LOSS") {
        findings.push({
          type: "Loss Tree With No Trace Data",
          text: `Loss ${r.targetHID} cannot be built — ${assetName} has no CURRENT trace relationships.`,
          fix: "entry",
        });
      }
    }
  }

  return { findings, suppressed };
}

export default function TraceTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const focusHid = ctx.focusHid ?? ctx.drawerNodeHid ?? null;
  const focusPrefix = focusHid?.split("_")[0] ?? "";
  const [assetHid, setAssetHid] = useState<string | null>(
    ["AST", "DA"].includes(focusPrefix) ? focusHid : null,
  );
  const highlightEntity = ["INT", "FUN", "EL"].includes(focusPrefix) ? focusHid : null;
  const highlightState = focusPrefix === "ST" ? focusHid : null;
  const [mode, setMode] = useState<Mode>("entry");
  const [staged, setStaged] = useState<Map<string, RelType | null>>(new Map());
  const [selectedCell, setSelectedCell] = useState<{ entity: string; state: string } | null>(null);
  const [rowFilter, setRowFilter] = useState<"all" | "assigned" | "unassigned" | "invalidated">("all");
  const [rowSort, setRowSort] = useState<"type" | "hid" | "name" | "count">("type");
  const [colFilter, setColFilter] = useState<"all" | "assigned">("all");
  const [showReadiness, setShowReadiness] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cellMenu, setCellMenu] = useState<{ entity: string; state: string; x: number; y: number } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ state: string; x: number; y: number } | null>(null);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newEntity, setNewEntity] = useState<{ kind: EntityKind; name: string; desc: string } | null>(null);
  const [acks, setAcks] = useState<Set<string>>(loadAcks);
  const qc = useQueryClient();
  const requestOpenDrawer = useDrawer((s) => s.requestOpenDrawer);
  const openTool = useToolWindows((s) => s.openTool);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });
  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);

  const assets = useMemo(
    () => nodes.filter((n) => n.typeName === "Asset" || n.typeName === "DerivedAsset"),
    [nodes],
  );
  const states = useMemo(() => nodes.filter((n) => n.typeName === "State"), [nodes]);
  const entities = useMemo(
    () => [
      ...nodes.filter((n) => n.typeName === "Interface"),
      ...nodes.filter((n) => n.typeName === "SystemFunction"),
      ...nodes.filter((n) => n.typeName === "Component"),
    ],
    [nodes],
  );
  const asset = assetHid ? byHid.get(assetHid) : undefined;

  // Cell map: entityHid|stateHid → CellState (from current graph + staging).
  const cells = useMemo(() => {
    const m = new Map<string, CellState>();
    if (!assetHid) return m;
    for (const e of entities) {
      for (const rel of e.relationships ?? []) {
        if (!TRACE_TYPES.includes(rel.type)) continue;
        if (rel.targetHID !== assetHid) continue;
        const stateHid = String(rel.props?.TraceStateHID ?? "");
        const status = String(rel.props?.TraceStatus ?? "CURRENT");
        const key = `${e.hid}|${stateHid}`;
        const existing = m.get(key);
        if (!existing?.current || (STATUS_RANK[status] ?? 0) > (STATUS_RANK[existing.current.status] ?? 0)) {
          m.set(key, {
            current: {
              type: rel.type as RelType,
              status,
              version: Number(rel.props?.TraceVersion ?? 1),
              date: rel.props?.TraceDate ? String(rel.props.TraceDate) : undefined,
            },
          });
        }
      }
    }
    for (const [key, val] of staged) {
      m.set(key, { ...(m.get(key) ?? {}), staged: val });
    }
    return m;
  }, [entities, assetHid, staged]);

  const effectiveType = (key: string): RelType | null => {
    const c = cells.get(key);
    if (!c) return null;
    if (c.staged !== undefined) return c.staged;
    if (c.current?.status === "CURRENT") return c.current.type;
    return null;
  };

  const cycleCell = (entityHid: string, stateHid: string) => {
    const key = `${entityHid}|${stateHid}`;
    const cur = effectiveType(key);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setCell(entityHid, stateHid, next);
  };

  const setCell = (entityHid: string, stateHid: string, next: RelType | null) => {
    const key = `${entityHid}|${stateHid}`;
    const c = cells.get(key);
    const persisted = c?.current?.status === "CURRENT" ? c.current.type : null;
    setStaged((prev) => {
      const m = new Map(prev);
      if (next === persisted) {
        m.delete(key); // back to persisted value — nothing staged
      } else {
        m.set(key, next);
      }
      return m;
    });
    setSelectedCell({ entity: entityHid, state: stateHid });
  };

  // Pre-commit plan (§6.5.9.16): new / type-changed / cleared cell counts.
  const commitPlan = useMemo(() => {
    let created = 0;
    let typeChanged = 0;
    const clearedKeys: string[] = [];
    for (const [key, next] of staged) {
      const c = cells.get(key);
      const persisted = c?.current?.status === "CURRENT" ? c.current.type : null;
      if (next === null && persisted) clearedKeys.push(key);
      else if (next && persisted && next !== persisted) typeChanged++;
      else if (next && !persisted) created++;
    }
    return { created, typeChanged, clearedKeys };
  }, [staged, cells]);

  const commit = useMutation({
    mutationFn: () => {
      const ops: CommitOperation[] = [];
      for (const [key, next] of staged) {
        const [entityHid, stateHid] = key.split("|");
        const c = cells.get(key);
        const persisted = c?.current?.status === "CURRENT" ? c.current.type : null;
        if (next === null && persisted) {
          // Cleared cell → supersede (Phase 1), scoped by TraceStateHID.
          ops.push({
            op: "deleteRelationship",
            type: persisted,
            sourceHid: entityHid,
            targetHid: assetHid!,
            properties: { TraceStateHID: stateHid },
          });
        } else if (next) {
          // New assignment or TYPE CHANGE: one create suffices — the Backend
          // supersedes the prior CURRENT relationship for the same cell inside
          // the same transaction (commit_helpers.go prepareTraceRel).
          ops.push({
            op: "createRelationship",
            type: next,
            sourceHid: entityHid,
            targetHid: assetHid!,
            properties: { TraceStateHID: stateHid },
          });
        }
      }
      return api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.trace",
        operations: ops,
      });
    },
    onSuccess: (res) => {
      setStaged(new Map());
      setConfirmCommit(false);
      setNotice({
        kind: "success",
        text: `Trace commit ${res.commitId.slice(0, 8)}: ${res.relationshipsChanged} relationship(s); criticality inheritance and protection Requirements recomputed server-side (§6.5.9.6).`,
      });
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => {
      setConfirmCommit(false);
      setNotice({ kind: "error", text: errorText(e) });
    },
  });

  // New Entity Mode (§6.5.9.5d): separate ACID transaction; the entity joins
  // the matrix on the SoI refetch.
  const createEntity = useMutation({
    mutationFn: (v: { kind: EntityKind; name: string; desc: string }) =>
      api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.trace",
        operations: [
          {
            op: "createNode",
            tempId: "n",
            label: v.kind,
            properties: { Name: v.name.trim(), ShortDescription: v.desc.trim() },
          },
          { op: "createRelationship", type: MEMBERSHIP[v.kind], sourceHid: ctx.soiHid!, targetHid: "$n" },
        ],
      }),
    onSuccess: (res, v) => {
      setNewEntity(null);
      setNotice({
        kind: "success",
        text: `${v.kind} ${res.createdNodes?.n ?? ""} created with [:${MEMBERSHIP[v.kind]}] membership; it now appears in the matrix (§6.5.9.5d).`,
      });
      void qc.invalidateQueries({ queryKey: ["soi"] });
    },
    onError: (e) => setNotice({ kind: "error", text: errorText(e) }),
  });

  const acknowledge = (key: string) => {
    setAcks((prev) => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem(ACK_STORE, JSON.stringify([...next]));
      } catch {
        /* localStorage unavailable — acknowledgment lasts for the session */
      }
      return next;
    });
  };

  // Loss Tool readiness per entity (§6.5.9.2/§6.5.9.8).
  const rowStats = (e: SoINode) => {
    let cur = 0;
    let stale = 0;
    for (const rel of e.relationships ?? []) {
      if (!TRACE_TYPES.includes(rel.type)) continue;
      if (rel.targetHID !== assetHid) continue;
      const st = String(rel.props?.TraceStatus ?? "CURRENT");
      if (st === "CURRENT") cur++;
      else stale++;
    }
    return { cur, stale };
  };
  const readiness = (e: SoINode): "Ready" | "Partial" | "Not Traced" => {
    const { cur, stale } = rowStats(e);
    if (cur > 0 && stale === 0) return "Ready";
    if (cur > 0 || stale > 0) return "Partial";
    return "Not Traced";
  };
  const readinessCounts = useMemo(() => {
    const counts = { Ready: 0, Partial: 0, "Not Traced": 0 };
    for (const e of entities) counts[readiness(e)]++;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, assetHid]);

  const visibleEntities = entities.filter((e) => {
    if (rowFilter === "all") return true;
    const r = readiness(e);
    if (rowFilter === "assigned") return r !== "Not Traced";
    if (rowFilter === "unassigned") return r === "Not Traced";
    return r === "Partial";
  });
  const sortedEntities = useMemo(() => {
    if (rowSort === "type") return visibleEntities; // already grouped by type
    const arr = [...visibleEntities];
    if (rowSort === "hid") arr.sort((a, b) => a.hid.localeCompare(b.hid));
    else if (rowSort === "name") arr.sort((a, b) => nodeName(a).localeCompare(nodeName(b)));
    else arr.sort((a, b) => rowStats(b).cur - rowStats(a).cur || a.hid.localeCompare(b.hid));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntities, rowSort, assetHid]);

  // Column filter (§6.5.9.5a): all States / only States with ≥1 assignment.
  const stateHasAssignment = (s: SoINode) => entities.some((e) => effectiveType(`${e.hid}|${s.hid}`) !== null);
  const visibleStates = colFilter === "assigned" ? states.filter(stateHasAssignment) : states;
  const colCurrentCount = (stateHid: string) =>
    entities.filter((e) => cells.get(`${e.hid}|${stateHid}`)?.current?.status === "CURRENT").length;

  const sessionStatus = (() => {
    let any = false;
    let invalid = false;
    for (const e of entities) {
      for (const rel of e.relationships ?? []) {
        if (!TRACE_TYPES.includes(rel.type) || rel.targetHID !== assetHid) continue;
        any = true;
        if (rel.props?.TraceStatus === "INVALIDATED") invalid = true;
      }
    }
    if (invalid) return "CONTAINS INVALIDATIONS";
    if (any) return "PRIOR TRACE EXISTS";
    return "NEW SESSION";
  })();

  // "Launch Loss Tool" (§6.5.9.2): first unbuilt Loss for the selected Asset.
  const unbuiltLosses = (asset?.relationships ?? [])
    .filter((r) => r.type === "HAS_LOSS")
    .map((r) => byHid.get(r.targetHID))
    .filter((l): l is SoINode => !!l)
    .filter((l) => ["NOT_BUILT", "INVALIDATED"].includes(String(l.properties.AttackTreeStatus ?? "NOT_BUILT")));

  const validation = useMemo(
    () =>
      assetHid
        ? computeFindings({ assetHid, entities, states, byHid, acks })
        : { findings: [], suppressed: 0 },
    [assetHid, entities, states, byHid, acks],
  );

  // ---------------------------------------------------------------- exports
  const latestTraceDate = (() => {
    let max = "";
    for (const e of entities) {
      for (const rel of e.relationships ?? []) {
        if (!TRACE_TYPES.includes(rel.type) || rel.targetHID !== assetHid) continue;
        const d = String(rel.props?.TraceDate ?? "");
        if (d > max) max = d;
      }
    }
    return max || "—";
  })();

  /** Matrix cell text for exports; "*" marks staged (uncommitted) values. */
  const exportCellText = (key: string): string => {
    const c = cells.get(key);
    if (!c) return "";
    if (c.staged !== undefined) return c.staged ? `${REL_STYLE[c.staged].label}*` : "*";
    if (c.current?.status === "CURRENT") return REL_STYLE[c.current.type].label;
    if (c.current?.status === "INVALIDATED") return "!";
    if (c.current?.status === "SUPERSEDED") return "S";
    return "";
  };

  const exportMatrix = (format: "csv" | "md") => {
    // Honors the active row and column filters (§6.5.9.12).
    const meta = [
      ["Asset", `${assetHid} — ${nodeName(asset)}`],
      ["SoI", `${ctx.soiHid} — ${nodeName(byHid.get(ctx.soiHid ?? ""))}`],
      ["LastTraceDate", latestTraceDate],
      ["Legend", "H/T/U committed CURRENT · * staged (uncommitted) · S superseded · ! invalidated"],
    ];
    const header = ["Entity HID", "Name", "Type", ...visibleStates.map((s) => s.hid), "Readiness"];
    const rows = (rowSort === "type" ? visibleEntities : sortedEntities).map((e) => [
      e.hid,
      nodeName(e),
      e.typeName,
      ...visibleStates.map((s) => exportCellText(`${e.hid}|${s.hid}`)),
      readiness(e),
    ]);
    if (format === "csv") {
      const csv = [...meta.map((m) => m.map(csvCell).join(",")), "", [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")].join("\n");
      downloadText(`sstpa-trace-${assetHid}.csv`, csv, "text/csv");
    } else {
      const lines = [
        "# Trace Matrix",
        "",
        ...meta.map((m) => `- ${m[0]}: ${m[1]}`),
        "",
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...rows.map((r) => `| ${r.join(" | ")} |`),
        "",
      ];
      downloadText(`sstpa-trace-${assetHid}.md`, lines.join("\n"), "text/markdown");
    }
    setExportOpen(false);
  };

  /** Criticality/assurance sources per entity across ALL Assets (§6.5.9.10). */
  const critSources = (e: SoINode) => {
    const sources = new Map<string, string[]>();
    for (const rel of e.relationships ?? []) {
      if (!TRACE_TYPES.includes(rel.type) || rel.props?.TraceStatus !== "CURRENT") continue;
      const a = byHid.get(rel.targetHID);
      if (!a || (a.typeName !== "Asset" && a.typeName !== "DerivedAsset")) continue;
      for (const f of [...CRITICALITIES, ...ASSURANCES]) {
        if (a.properties[f] === true) sources.set(f, [...new Set([...(sources.get(f) ?? []), a.hid])]);
      }
    }
    return sources;
  };

  const exportAnalysis = (format: "md" | "json") => {
    if (!assetHid) return;
    const report = {
      report: "Trace Analysis Report (SRS §6.5.9.12)",
      generated: new Date().toISOString(),
      soi: ctx.soiHid,
      asset: {
        hid: assetHid,
        name: nodeName(asset),
        criticality: asset ? CRITICALITIES.filter((c) => asset.properties[c] === true) : [],
        assurance: asset ? ASSURANCES.filter((a) => asset.properties[a] === true) : [],
      },
      lastTraceDate: latestTraceDate,
      coverage: {
        entities: entities.length,
        ready: readinessCounts.Ready,
        partial: readinessCounts.Partial,
        notTraced: readinessCounts["Not Traced"],
        states: states.length,
        statesWithAssignments: states.filter(stateHasAssignment).length,
      },
      entities: entities.map((e) => ({
        hid: e.hid,
        name: nodeName(e),
        type: e.typeName,
        readiness: readiness(e),
        currentRelationships: (e.relationships ?? [])
          .filter(
            (r) => TRACE_TYPES.includes(r.type) && r.targetHID === assetHid && r.props?.TraceStatus === "CURRENT",
          )
          .map((r) => ({
            type: r.type,
            stateHid: String(r.props?.TraceStateHID ?? ""),
            traceDate: String(r.props?.TraceDate ?? ""),
            traceVersion: Number(r.props?.TraceVersion ?? 1),
          })),
        criticalitySources: Object.fromEntries(critSources(e)),
      })),
      protectionRequirements: entities.flatMap((e) =>
        (e.relationships ?? [])
          .filter((r) => r.type === "HAS_REQUIREMENT")
          .map((r) => byHid.get(r.targetHID))
          .filter(
            (rq): rq is SoINode =>
              !!rq && String(rq.properties.RStatement ?? "").includes("SHALL protect the"),
          )
          .map((rq) => ({
            entityHid: e.hid,
            requirementHid: rq.hid,
            rStatement: String(rq.properties.RStatement ?? ""),
            orphan: rq.properties.Orphan === true,
          })),
      ),
      validationFindings: validation.findings.map((f) => ({ type: f.type, text: f.text })),
    };
    if (format === "json") {
      downloadText(`sstpa-trace-analysis-${assetHid}.json`, JSON.stringify(report, null, 2), "application/json");
    } else {
      const lines: string[] = [
        "# Trace Analysis Report",
        "",
        `- Generated: ${report.generated}`,
        `- SoI: ${report.soi}`,
        `- Asset: ${report.asset.hid} — ${report.asset.name}`,
        `- Criticality: ${report.asset.criticality.join(", ") || "—"}`,
        `- Assurance: ${report.asset.assurance.join(", ") || "—"}`,
        `- Last trace commit: ${report.lastTraceDate}`,
        "",
        "## Coverage",
        "",
        `- Entities: ${report.coverage.entities} (Ready ${report.coverage.ready} · Partial ${report.coverage.partial} · Not Traced ${report.coverage.notTraced})`,
        `- States with assignments: ${report.coverage.statesWithAssignments} of ${report.coverage.states}`,
        "",
        "## Entities",
        "",
      ];
      for (const e of report.entities) {
        lines.push(`### ${e.hid} — ${e.name} (${e.type}, ${e.readiness})`, "");
        if (e.currentRelationships.length === 0) {
          lines.push("_No CURRENT relationships._", "");
        } else {
          lines.push("| Type | State | TraceDate | Version |", "| --- | --- | --- | --- |");
          for (const r of e.currentRelationships) {
            lines.push(`| ${r.type} | ${r.stateHid} | ${r.traceDate} | ${r.traceVersion} |`);
          }
          lines.push("");
        }
        const src = Object.entries(e.criticalitySources);
        if (src.length > 0) {
          lines.push(`Criticality/assurance sources: ${src.map(([f, a]) => `${f} ← ${(a as string[]).join(", ")}`).join("; ")}`, "");
        }
      }
      lines.push("## Protection Requirements", "");
      if (report.protectionRequirements.length === 0) lines.push("_None generated yet._", "");
      else {
        lines.push("| Entity | Requirement | Orphan | RStatement |", "| --- | --- | --- | --- |");
        for (const r of report.protectionRequirements) {
          lines.push(`| ${r.entityHid} | ${r.requirementHid} | ${r.orphan ? "Yes" : "No"} | ${r.rStatement} |`);
        }
        lines.push("");
      }
      lines.push("## Validation Findings", "");
      if (report.validationFindings.length === 0) lines.push("_No findings._", "");
      else for (const f of report.validationFindings) lines.push(`- **${f.type}**: ${f.text}`);
      downloadText(`sstpa-trace-analysis-${assetHid}.md`, lines.join("\n"), "text/markdown");
    }
    setExportOpen(false);
  };

  const exportCritSourceReport = (format: "csv" | "md") => {
    const rows: string[][] = [];
    for (const e of entities) {
      const sources = critSources(e);
      for (const f of [...CRITICALITIES, ...ASSURANCES]) {
        const contributing = sources.get(f) ?? [];
        if (e.properties[f] !== true && contributing.length === 0) continue;
        rows.push([
          e.hid,
          nodeName(e),
          e.typeName,
          f,
          e.properties[f] === true ? "True" : "False",
          contributing.join("; "),
          contributing.length === 1 ? "sole source" : contributing.length > 1 ? "multiply sourced" : "no CURRENT source",
        ]);
      }
    }
    const header = ["EntityHID", "EntityName", "EntityType", "Flag", "Value", "ContributingAssets", "Sourcing"];
    if (format === "csv") {
      const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
      downloadText("sstpa-criticality-sources.csv", csv, "text/csv");
    } else {
      const lines = [
        "# Criticality Source Report",
        "",
        `- SoI: ${ctx.soiHid}`,
        `- Generated: ${new Date().toISOString()}`,
        "",
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...rows.map((r) => `| ${r.join(" | ")} |`),
        "",
      ];
      downloadText("sstpa-criticality-sources.md", lines.join("\n"), "text/markdown");
    }
    setExportOpen(false);
  };

  // ----------------------------------------------------------------- render
  if (!ctx.soiHid) return <ToolStatus needsSoI />;
  if (soi.isLoading || soi.error) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus loading={soi.isLoading} error={soi.error} onRetry={() => void soi.refetch()} />
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus
          empty="No (:Asset) nodes in this SoI yet."
          emptyHint={
            <button className="sstpa-button" onClick={() => openTool("sstpa.assets")}>
              Open Asset Manager Tool
            </button>
          }
        />
      </div>
    );
  }

  const renderRow = (e: SoINode) => {
    const r = readiness(e);
    const { cur, stale } = rowStats(e);
    return (
      <tr
        key={e.hid}
        style={{
          borderBottom: "1px solid var(--sstpa-line-soft)",
          background: highlightEntity === e.hid ? "var(--sstpa-inset)" : undefined,
        }}
      >
        <td
          style={{
            padding: "3px 8px",
            cursor: "pointer",
            position: "sticky",
            left: 0,
            background: "var(--sstpa-surface)",
            whiteSpace: "nowrap",
          }}
          title="Open in Data Drawer"
          onClick={() => requestOpenDrawer({ mode: "edit", hid: e.hid })}
        >
          <span className="mono" style={{ fontSize: "0.62rem" }}>
            {e.hid}
          </span>{" "}
          {nodeName(e)}{" "}
          {/* Per-row summary badge (§6.5.9.8): CURRENT count + stale flag. */}
          <span
            className="type-badge"
            title={`${cur} CURRENT cell(s)${stale ? `; ${stale} SUPERSEDED/INVALIDATED relationship(s)` : ""}`}
            style={{ background: cur > 0 ? "var(--sstpa-text)" : "var(--sstpa-node-muted)" }}
          >
            {cur}
          </span>
          {stale > 0 && (
            <span className="state-warn" title={`${stale} SUPERSEDED/INVALIDATED relationship(s)`}>
              {" "}
              ⚠{stale}
            </span>
          )}
        </td>
        {visibleStates.map((s) => {
          const key = `${e.hid}|${s.hid}`;
          const c = cells.get(key);
          const eff = effectiveType(key);
          const isStaged = c?.staged !== undefined;
          const stale2 = c?.current && c.current.status !== "CURRENT" && c.staged === undefined;
          const invalidated = stale2 && c?.current?.status === "INVALIDATED";
          const superseded = stale2 && c?.current?.status === "SUPERSEDED";
          return (
            <td
              key={s.hid}
              onClick={() => cycleCell(e.hid, s.hid)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setCellMenu({ entity: e.hid, state: s.hid, x: ev.clientX, y: ev.clientY });
              }}
              style={{
                width: 46,
                textAlign: "center",
                cursor: "pointer",
                userSelect: "none",
                fontWeight: 700,
                color: eff
                  ? REL_STYLE[eff].color
                  : invalidated
                    ? "var(--sstpa-status-error)"
                    : superseded
                      ? "var(--sstpa-muted)"
                      : "var(--sstpa-line-soft)",
                outline: isStaged ? "2px solid var(--sstpa-accent)" : undefined,
                outlineOffset: -2,
                fontStyle: isStaged ? "italic" : undefined,
                textDecoration: superseded ? "line-through" : undefined,
              }}
              title={
                stale2
                  ? `${c?.current?.type} (${c?.current?.status}) v${c?.current?.version} — right-click for options`
                  : `${eff ?? "empty"} — click to cycle, right-click for menu`
              }
            >
              {/* INVALIDATED shows "!" only; SUPERSEDED shows "S" only (§6.5.9.16). */}
              {eff ? REL_STYLE[eff].label : invalidated ? "!" : superseded ? "S" : "·"}
            </td>
          );
        })}
        {showReadiness && (
          <td style={{ textAlign: "center" }}>
            <span
              className="type-badge"
              style={{
                background:
                  r === "Ready"
                    ? "var(--sstpa-status-ok)"
                    : r === "Partial"
                      ? "var(--sstpa-status-warn)"
                      : "var(--sstpa-node-muted)",
              }}
            >
              {r}
            </span>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      {/* Top bar (§6.5.9.2) */}
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
          style={{ width: "auto" }}
          value={assetHid ?? ""}
          onChange={(e) => {
            setAssetHid(e.target.value || null);
            setStaged(new Map());
            setSelectedCell(null);
          }}
        >
          <option value="">Select Asset to trace…</option>
          {assets.map((a) => (
            <option key={a.hid} value={a.hid}>
              {a.hid} — {nodeName(a)}
            </option>
          ))}
        </select>
        {assetHid && (
          <>
            <span
              className="type-badge"
              style={{
                background:
                  sessionStatus === "CONTAINS INVALIDATIONS"
                    ? "var(--sstpa-status-error)"
                    : sessionStatus === "PRIOR TRACE EXISTS"
                      ? "var(--sstpa-status-info)"
                      : "var(--sstpa-node-muted)",
              }}
            >
              {sessionStatus}
            </span>
            {/* Asset-level readiness badge (§6.5.9.2). */}
            <span
              className="type-badge"
              title="Loss Tool Readiness for this Asset: Ready / Partial / Not Traced entity counts"
              style={{
                background:
                  readinessCounts.Ready > 0 && readinessCounts["Not Traced"] === 0 && readinessCounts.Partial === 0
                    ? "var(--sstpa-status-ok)"
                    : readinessCounts.Ready > 0 || readinessCounts.Partial > 0
                      ? "var(--sstpa-status-warn)"
                      : "var(--sstpa-node-muted)",
              }}
            >
              R:{readinessCounts.Ready} P:{readinessCounts.Partial} N:{readinessCounts["Not Traced"]}
            </span>
            <button
              className="sstpa-button secondary"
              disabled={unbuiltLosses.length === 0}
              title={
                unbuiltLosses.length > 0
                  ? `Open the Loss Tool for ${unbuiltLosses[0].hid}${unbuiltLosses.length > 1 ? ` (+${unbuiltLosses.length - 1} more unbuilt)` : ""}`
                  : "Enabled when a Loss for this Asset has AttackTreeStatus NOT_BUILT or INVALIDATED (§6.5.9.2)"
              }
              onClick={() => openTool("sstpa.loss", { focusHid: unbuiltLosses[0].hid, focusType: "Loss" })}
            >
              Launch Loss Tool
            </button>
            {(["entry", "validation", "criticality"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`sstpa-button ${mode === m ? "" : "secondary"}`}
                onClick={() => setMode(m)}
              >
                {m === "entry" ? "Trace Entry" : m === "validation" ? "Validation" : "Criticality Review"}
                {m === "validation" && validation.findings.length > 0 && ` (${validation.findings.length})`}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: "0.74rem" }}>
              <input type="checkbox" checked={showReadiness} onChange={(e) => setShowReadiness(e.target.checked)} />{" "}
              Loss Tool Readiness
            </label>
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              title="Row sort (§6.5.9.5a)"
              value={rowSort}
              onChange={(e) => setRowSort(e.target.value as typeof rowSort)}
            >
              <option value="type">Group by type</option>
              <option value="hid">Sort by HID</option>
              <option value="name">Sort by Name</option>
              <option value="count">Sort by # relationships</option>
            </select>
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              value={rowFilter}
              onChange={(e) => setRowFilter(e.target.value as typeof rowFilter)}
            >
              <option value="all">All entities</option>
              <option value="assigned">Only assigned</option>
              <option value="unassigned">Only unassigned</option>
              <option value="invalidated">Only partial/invalidated</option>
            </select>
            <select
              className="sstpa-input"
              style={{ width: "auto" }}
              title="Column filter (§6.5.9.5a)"
              value={colFilter}
              onChange={(e) => setColFilter(e.target.value as typeof colFilter)}
            >
              <option value="all">All States</option>
              <option value="assigned">States with ≥1 assignment</option>
            </select>
            <button className="icon-button" title="New Interface / Function / Element / State (§6.5.9.5d)" onClick={() => setNewEntity({ kind: "Interface", name: "", desc: "" })}>
              + New Entity
            </button>
            <button
              className="sstpa-button"
              disabled={staged.size === 0 || commit.isPending}
              onClick={() => setConfirmCommit(true)}
            >
              Commit ({staged.size})
            </button>
            <button className="sstpa-button secondary" disabled={staged.size === 0 || commit.isPending} onClick={() => setStaged(new Map())}>
              Revert
            </button>
            <span style={{ position: "relative" }}>
              <button className="icon-button" title="Exports (§6.5.9.12)" onClick={() => setExportOpen((v) => !v)}>
                Export ▾
              </button>
              {exportOpen && (
                <span
                  className="sstpa-frame"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    zIndex: 30,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 220,
                    padding: 4,
                    boxShadow: "var(--sstpa-shadow-popup)",
                  }}
                >
                  <button className="icon-button" onClick={() => exportMatrix("csv")}>
                    Trace Matrix (CSV)
                  </button>
                  <button className="icon-button" onClick={() => exportMatrix("md")}>
                    Trace Matrix (Markdown)
                  </button>
                  <button className="icon-button" onClick={() => exportAnalysis("md")}>
                    Trace Analysis Report (Markdown)
                  </button>
                  <button className="icon-button" onClick={() => exportAnalysis("json")}>
                    Trace Analysis Report (JSON)
                  </button>
                  <button className="icon-button" onClick={() => exportCritSourceReport("csv")}>
                    Criticality Source Report (CSV)
                  </button>
                  <button className="icon-button" onClick={() => exportCritSourceReport("md")}>
                    Criticality Source Report (Markdown)
                  </button>
                </span>
              )}
            </span>
          </>
        )}
      </div>

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
      {commit.isPending && (
        <div className="sstpa-alert-warning" style={{ margin: "6px 12px" }}>
          Committing trace session — the Backend is executing supersession, inheritance, and Requirement
          generation (§6.5.9.6)…
        </div>
      )}

      {assetHid && mode === "entry" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.74rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--sstpa-text)", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px", position: "sticky", left: 0, background: "var(--sstpa-bg)" }}>
                    Entity \ State
                  </th>
                  {visibleStates.map((s) => (
                    <th
                      key={s.hid}
                      style={{
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: highlightState === s.hid ? "var(--sstpa-inset)" : undefined,
                      }}
                      title={`${s.hid} — click to open in Data Drawer; right-click for options`}
                      onClick={() => requestOpenDrawer({ mode: "edit", hid: s.hid })}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        setHeaderMenu({ state: s.hid, x: ev.clientX, y: ev.clientY });
                      }}
                    >
                      <span className="mono" style={{ fontSize: "0.62rem", display: "block" }}>
                        {s.hid}
                      </span>
                      {nodeName(s)}{" "}
                      {/* Per-column summary badge (§6.5.9.8). */}
                      <span
                        className="type-badge"
                        title={`${colCurrentCount(s.hid)} entity(ies) with a CURRENT relationship in this State`}
                        style={{
                          background: colCurrentCount(s.hid) > 0 ? "var(--sstpa-text)" : "var(--sstpa-node-muted)",
                        }}
                      >
                        {colCurrentCount(s.hid)}
                      </span>
                    </th>
                  ))}
                  {showReadiness && <th style={{ padding: "4px 8px" }}>Loss Readiness</th>}
                </tr>
              </thead>
              <tbody>
                {rowSort === "type"
                  ? ["Interface", "SystemFunction", "Component"].map((type) => {
                      const group = visibleEntities.filter((e) => e.typeName === type);
                      if (group.length === 0) return null;
                      return [
                        <tr key={`hdr-${type}`}>
                          <td
                            colSpan={visibleStates.length + (showReadiness ? 2 : 1)}
                            style={{
                              fontFamily: "var(--sstpa-font-ui)",
                              fontWeight: 600,
                              padding: "6px 8px",
                              borderBottom: "1px solid var(--sstpa-line)",
                              position: "sticky",
                              left: 0,
                            }}
                          >
                            {type === "Component" ? "Elements" : type === "SystemFunction" ? "Functions" : "Interfaces"}
                          </td>
                        </tr>,
                        ...group.map(renderRow),
                      ];
                    })
                  : sortedEntities.map(renderRow)}
              </tbody>
            </table>
          </div>

          {/* Right detail panel (§6.5.9.2) */}
          <aside
            style={{
              width: 280,
              borderLeft: "var(--sstpa-border)",
              overflow: "auto",
              background: "var(--sstpa-surface)",
              padding: "var(--sstpa-sp-3)",
              fontSize: "0.78rem",
              flexShrink: 0,
            }}
          >
            <h4 style={{ margin: "0 0 4px" }}>Asset</h4>
            <div className="mono" style={{ fontSize: "0.68rem" }}>
              {asset?.hid}
            </div>
            <div style={{ fontWeight: 700 }}>{nodeName(asset)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
              Criticality:{" "}
              {[...CRITICALITIES]
                .filter((c) => asset?.properties[c] === true)
                .map((c) => c.replace("Critical", ""))
                .join(", ") || "—"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
              Assurance: {[...ASSURANCES].filter((a) => asset?.properties[a] === true).join(", ") || "—"}
            </div>
            {selectedCell && (
              <>
                <h4 style={{ margin: "12px 0 4px" }}>Selected cell</h4>
                <div className="mono" style={{ fontSize: "0.68rem" }}>
                  {selectedCell.entity} × {selectedCell.state}
                </div>
                <div style={{ fontSize: "0.72rem" }}>
                  {nodeName(byHid.get(selectedCell.entity))} × {nodeName(byHid.get(selectedCell.state))}
                </div>
                {(() => {
                  const c = cells.get(`${selectedCell.entity}|${selectedCell.state}`);
                  return (
                    <div>
                      <div>
                        Current:{" "}
                        {c?.current
                          ? `${c.current.type} (${c.current.status}, v${c.current.version})`
                          : "none"}
                      </div>
                      {c?.current?.date && (
                        <div style={{ fontSize: "0.7rem", color: "var(--sstpa-muted)" }}>
                          TraceDate: {c.current.date}
                        </div>
                      )}
                      {c?.staged !== undefined && (
                        <div className="state-warn">Staged: {c.staged ?? "clear"}</div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
            <h4 style={{ margin: "12px 0 4px" }}>Staged changes ({staged.size})</h4>
            {[...staged.entries()].slice(0, 20).map(([key, v]) => (
              <div key={key} className="mono" style={{ fontSize: "0.64rem" }}>
                {key.replace("|", " × ")} → {v ?? "clear"}
              </div>
            ))}
            {staged.size > 20 && (
              <div style={{ fontSize: "0.64rem", color: "var(--sstpa-muted)" }}>
                … and {staged.size - 20} more
              </div>
            )}
          </aside>
        </div>
      )}

      {assetHid && mode === "validation" && (
        <ValidationMode
          findings={validation.findings}
          suppressed={validation.suppressed}
          onFix={() => setMode("entry")}
          onContextTool={(stateHid) =>
            openTool("sstpa.context", stateHid ? { focusHid: stateHid, focusType: "State" } : undefined)
          }
          onAcknowledge={acknowledge}
        />
      )}

      {assetHid && mode === "criticality" && <CriticalityReview entities={entities} assets={assets} />}

      {/* Right-click cell menu (§6.5.9.5a) — explicit H/T/U/Clear picker. */}
      {cellMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setCellMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCellMenu(null);
            }}
          />
          <div
            className="sstpa-frame"
            role="menu"
            style={{
              position: "fixed",
              left: Math.min(cellMenu.x, window.innerWidth - 190),
              top: Math.min(cellMenu.y, window.innerHeight - 190),
              zIndex: 41,
              display: "flex",
              flexDirection: "column",
              minWidth: 170,
              padding: 4,
              boxShadow: "var(--sstpa-shadow-popup)",
            }}
          >
            <div className="mono" style={{ fontSize: "0.62rem", padding: "2px 6px", color: "var(--sstpa-muted)" }}>
              {cellMenu.entity} × {cellMenu.state}
            </div>
            {(["HOLDS", "TRANSPORTS", "USES"] as RelType[]).map((t) => (
              <button
                key={t}
                className="icon-button"
                style={{ textAlign: "left", color: REL_STYLE[t].color, fontWeight: 700 }}
                onClick={() => {
                  setCell(cellMenu.entity, cellMenu.state, t);
                  setCellMenu(null);
                }}
              >
                Set to {t}
              </button>
            ))}
            <button
              className="icon-button danger"
              style={{ textAlign: "left" }}
              onClick={() => {
                setCell(cellMenu.entity, cellMenu.state, null);
                setCellMenu(null);
              }}
            >
              Clear
            </button>
            <button className="icon-button" style={{ textAlign: "left" }} onClick={() => setCellMenu(null)}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Right-click State column header menu (§6.5.9.5a). */}
      {headerMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setHeaderMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setHeaderMenu(null);
            }}
          />
          <div
            className="sstpa-frame"
            role="menu"
            style={{
              position: "fixed",
              left: Math.min(headerMenu.x, window.innerWidth - 230),
              top: Math.min(headerMenu.y, window.innerHeight - 110),
              zIndex: 41,
              display: "flex",
              flexDirection: "column",
              minWidth: 210,
              padding: 4,
              boxShadow: "var(--sstpa-shadow-popup)",
            }}
          >
            <button
              className="icon-button"
              style={{ textAlign: "left" }}
              onClick={() => {
                openTool("sstpa.context", { focusHid: headerMenu.state, focusType: "State" });
                setHeaderMenu(null);
              }}
            >
              View in Context Tool
            </button>
            <button
              className="icon-button"
              style={{ textAlign: "left" }}
              onClick={() => {
                requestOpenDrawer({ mode: "edit", hid: headerMenu.state });
                setHeaderMenu(null);
              }}
            >
              Open in Data Drawer
            </button>
            <button className="icon-button" style={{ textAlign: "left" }} onClick={() => setHeaderMenu(null)}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Pre-commit summary dialog (§6.5.9.16). */}
      {confirmCommit && (
        <ConfirmDialog
          title="Commit trace session?"
          confirmLabel={commit.isPending ? "Committing…" : "Commit"}
          confirmDisabled={commit.isPending}
          danger={commitPlan.clearedKeys.length > 0}
          onCancel={() => {
            if (!commit.isPending) setConfirmCommit(false);
          }}
          onConfirm={() => commit.mutate()}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <tbody>
              <tr>
                <td style={{ padding: "2px 6px" }}>New relationships</td>
                <td>{commitPlan.created}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 6px" }}>Type changes (old edge superseded server-side)</td>
                <td>{commitPlan.typeChanged}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 6px" }}>Cleared cells (superseded, no replacement)</td>
                <td>{commitPlan.clearedKeys.length}</td>
              </tr>
            </tbody>
          </table>
          {commitPlan.clearedKeys.length > 0 && (
            <p className="state-warn" style={{ marginTop: 8 }}>
              Warning: clearing {commitPlan.clearedKeys.length} cell(s) supersedes those relationships. Entities
              that lose their last CURRENT relationship to {nodeName(asset)} will have their protection
              Requirements flagged Orphan by the Backend recompute (§6.5.9.6 Phase 6):
              <span className="mono" style={{ display: "block", fontSize: "0.66rem" }}>
                {commitPlan.clearedKeys.slice(0, 8).map((k) => k.replace("|", " × ")).join(", ")}
                {commitPlan.clearedKeys.length > 8 ? ", …" : ""}
              </span>
            </p>
          )}
          <p style={{ fontSize: "0.76rem", color: "var(--sstpa-muted)" }}>
            Criticality/assurance inheritance, Connection inheritance, and protection Requirement generation
            execute server-side in the same ACID transaction (§6.5.9.6).
          </p>
          {commit.isPending && <p className="state-info">Committing — please wait…</p>}
        </ConfirmDialog>
      )}

      {/* New Entity Mode dialog (§6.5.9.5d / §6.5.9.11). */}
      {newEntity && (
        <ConfirmDialog
          title="Create new entity"
          confirmLabel={createEntity.isPending ? "Creating…" : "Create"}
          confirmDisabled={!newEntity.name.trim() || !newEntity.desc.trim() || createEntity.isPending}
          onCancel={() => {
            if (!createEntity.isPending) setNewEntity(null);
          }}
          onConfirm={() => createEntity.mutate(newEntity)}
        >
          <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>
            Type{" "}
            <select
              className="sstpa-input"
              value={newEntity.kind}
              onChange={(e) => setNewEntity({ ...newEntity, kind: e.target.value as EntityKind })}
            >
              {(Object.keys(MEMBERSHIP) as EntityKind[]).map((k) => (
                <option key={k} value={k}>
                  {k} (via [:{MEMBERSHIP[k]}])
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>
            Name{" "}
            <input
              className="sstpa-input"
              value={newEntity.name}
              onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
            />
          </label>
          <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem" }}>
            ShortDescription{" "}
            <input
              className="sstpa-input"
              value={newEntity.desc}
              onChange={(e) => setNewEntity({ ...newEntity, desc: e.target.value })}
            />
          </label>
          <p style={{ fontSize: "0.74rem", color: "var(--sstpa-muted)" }}>
            Created as a separate ACID transaction; the entity immediately joins the matrix as a{" "}
            {newEntity.kind === "State" ? "column" : "row"} (§6.5.9.11).
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Validation Mode (§6.5.9.5b): findings list with recommended actions and
 *  acknowledgment for invalidated relationships. */
function ValidationMode({
  findings,
  suppressed,
  onFix,
  onContextTool,
  onAcknowledge,
}: {
  findings: Finding[];
  suppressed: number;
  onFix: () => void;
  onContextTool: (stateHid?: string) => void;
  onAcknowledge: (key: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.8rem" }}>
      {suppressed > 0 && (
        <p style={{ color: "var(--sstpa-muted)", fontSize: "0.74rem" }}>
          {suppressed} acknowledged invalidation(s) suppressed. Acknowledgments are stored locally (no
          Backend API exists yet to set AcknowledgedInvalidation on the relationship).
        </p>
      )}
      {findings.length === 0 && <p className="state-ok">No findings — trace data is consistent.</p>}
      {findings.map((f, i) => (
        <div key={`${f.type}-${i}`} className="prop-row">
          <span>
            <strong>{f.type}:</strong> {f.text}
          </span>
          <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {f.fix === "entry" && (
              <button className="icon-button" onClick={onFix}>
                Fix in Trace Entry Mode
              </button>
            )}
            {f.fix === "context" && (
              <button className="icon-button" onClick={() => onContextTool(f.text.split(" ")[0])}>
                Fix in Context Tool
              </button>
            )}
            {f.ackKey && (
              <button
                className="icon-button"
                title="Suppress this invalidated finding from future validation reports (stored locally)"
                onClick={() => onAcknowledge(f.ackKey!)}
              >
                Acknowledge
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Criticality Review Mode (§6.5.9.5c / §6.5.9.10). */
function CriticalityReview({
  entities,
  assets,
}: {
  entities: SoINode[];
  assets: SoINode[];
}) {
  const byHid = new Map(assets.map((a) => [a.hid, a]));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-3)", fontSize: "0.78rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-text)" }}>
            <th style={{ padding: "4px 8px" }}>Entity</th>
            {CRITICALITIES.map((c) => (
              <th key={c}>{c.replace("Critical", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => {
            const contributing = new Map<string, string[]>();
            for (const rel of e.relationships ?? []) {
              if (!TRACE_TYPES.includes(rel.type)) continue;
              if (rel.props?.TraceStatus !== "CURRENT") continue;
              const a = byHid.get(rel.targetHID);
              if (!a) continue;
              for (const c of CRITICALITIES) {
                if (a.properties[c] === true) {
                  contributing.set(c, [...(contributing.get(c) ?? []), a.hid]);
                }
              }
            }
            return (
              <tr key={e.hid} style={{ borderBottom: "1px solid var(--sstpa-line-soft)" }}>
                <td style={{ padding: "3px 8px" }}>
                  <span className="mono" style={{ fontSize: "0.64rem" }}>
                    {e.hid}
                  </span>{" "}
                  {nodeName(e)}
                </td>
                {CRITICALITIES.map((c) => {
                  const sources = [...new Set(contributing.get(c) ?? [])];
                  const value = e.properties[c] === true;
                  const stale = value !== sources.length > 0;
                  return (
                    <td key={c}>
                      <span className={value ? "state-error" : "state-ok"}>{value ? "True" : "False"}</span>
                      {sources.length > 0 && (
                        <span className="mono" style={{ fontSize: "0.6rem", display: "block" }}>
                          ← {sources.join(", ")}
                          {sources.length === 1 && " (sole source)"}
                        </span>
                      )}
                      {stale && (
                        <span className="state-warn" style={{ fontSize: "0.62rem", display: "block" }}>
                          stale — re-commit trace
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
