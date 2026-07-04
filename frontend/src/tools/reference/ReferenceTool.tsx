// Reference Tool (SRS §6.5.4): browse the read-only Reference Data set
// (ATT&CK / ATLAS / NIST 800-53 / EMB3D) in Research Mode, and assign
// [:REFERENCES] to a valid Core node in Assignment Mode. Cloning copies
// select properties per SRS §3.4.6.
//
// Hierarchy navigation (§6.5.4.9): the Backend exposes framework roots,
// search, and per-node outgoing relationships but no parent/child hierarchy
// query, so the hierarchy pane derives family/control/enhancement (NIST) and
// technique/sub-technique (ATT&CK) grouping client-side from the ExternalID
// structure of the current result set (approximation noted in the pane).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type { ReferenceSearchResult } from "../../api/types";
import { useToolWindows } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { errorText, ToolStatus } from "../shared";

/** Authorized clone sources by Core node type (SRS §3.4.6.1). */
const CLONE_SOURCES: Record<string, string[]> = {
  Attack: ["AK_Technique", "AT_Technique"],
  Countermeasure: [
    "AK_Mitigation",
    "AK_DetectionStrategy",
    "AK_Analytic",
    "AT_Mitigation",
    "EMB3D_CourseOfAction",
  ],
  SecurityControl: ["NIST_Control", "NIST_Enhancement"],
  Component: ["AK_Software", "AK_Asset", "EMB3D_Device"],
  Hazard: ["AK_Technique", "AT_Technique", "EMB3D_Vulnerability"],
  System: ["AK_Group", "AK_Campaign"],
};

const VALID_SOURCE_PREFIXES: Record<string, string> = {
  CTRL: "SecurityControl",
  EL: "Component",
  SYS: "System",
  HAZ: "Hazard",
  ATK: "Attack",
  CM: "Countermeasure",
};

/** A selected reference item; search results are complete, selections made
 *  from related items or derived hierarchy carry only uuid/id/name and the
 *  inspector query fills in the rest. */
interface SelectedRef {
  uuid: string;
  externalId: string;
  name: string;
  labels: string[];
  frameworkName?: string;
  frameworkVersion?: string;
  shortDescription?: string;
  isDeprecated?: boolean;
  isRevoked?: boolean;
}

/** Ancestor chain derived from ExternalID structure (§6.5.4.9 approximation):
 *  NIST AC-2(3) → [AC, AC-2, AC-2(3)]; ATT&CK T1005.001 → [T1005, T1005.001];
 *  EMB3D TID-101 → [TID, TID-101]. */
function parentChain(eid: string, labels: string[]): string[] {
  if (!eid) return [];
  if (labels.some((l) => l.startsWith("NIST_"))) {
    const family = eid.split("-")[0];
    const base = eid.replace(/\(\d+\)$/, "");
    const chain = [family];
    if (base !== family) chain.push(base);
    if (eid !== base) chain.push(eid);
    return chain;
  }
  if (/^T\d{4}(\.\d{3})?$/.test(eid)) {
    const base = eid.split(".")[0];
    return base === eid ? [eid] : [base, eid];
  }
  const dash = eid.indexOf("-");
  if (dash > 0) return [eid.slice(0, dash), eid];
  return [eid];
}

interface HierNode {
  key: string;
  item?: ReferenceSearchResult;
  children: Map<string, HierNode>;
}

export default function ReferenceTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  // Assignment Mode when the Data Drawer holds a valid node type (§6.5.4.1).
  const drawerPrefix = ctx.drawerNodeHid?.split("_")[0] ?? "";
  const sourceType = VALID_SOURCE_PREFIXES[drawerPrefix];
  const canAssign = !!sourceType && !!ctx.drawerNodeHid;
  const [mode, setMode] = useState<"research" | "assignment">(
    canAssign ? "assignment" : "research",
  );

  const [framework, setFramework] = useState("");
  const [version, setVersion] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [queryText, setQueryText] = useState("");
  const [externalId, setExternalId] = useState("");
  const [selected, setSelected] = useState<SelectedRef | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const closeTool = useToolWindows((s) => s.closeTool);
  const qc = useQueryClient();

  const frameworks = useQuery({
    queryKey: ["ref-frameworks"],
    queryFn: api.referenceFrameworks,
  });
  const frameworkEntries = useMemo(
    () => frameworks.data?.frameworks ?? [],
    [frameworks.data],
  );
  const frameworkNames = useMemo(
    () => [...new Set(frameworkEntries.map((f) => String(f.frameworkName)))],
    [frameworkEntries],
  );
  // Independent framework-version filter (§6.5.4.7). The Backend search API
  // has no version parameter, so versions filter the results client-side.
  const versionsForFramework = useMemo(
    () =>
      [
        ...new Set(
          frameworkEntries
            .filter((f) => !framework || String(f.frameworkName) === framework)
            .map((f) => String(f.frameworkVersion)),
        ),
      ].filter((v) => v && v !== "undefined"),
    [frameworkEntries, framework],
  );

  const allowedLabels =
    mode === "assignment" && sourceType ? CLONE_SOURCES[sourceType] : null;

  const search = useQuery({
    queryKey: ["ref-search", framework, typeFilter, queryText, externalId],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (externalId) params.externalId = externalId;
      else if (queryText) params.text = queryText;
      if (framework) params.framework = framework;
      if (typeFilter) params.label = typeFilter;
      params.limit = "100";
      return api.referenceSearch(params);
    },
    enabled: !!(externalId || queryText.length >= 2),
  });

  const detail = useQuery({
    queryKey: ["ref-node", selected?.uuid],
    queryFn: () => api.referenceNode(selected!.uuid),
    enabled: !!selected,
  });

  const assign = async (overwrite: boolean) => {
    if (!selected || !ctx.drawerNodeHid) return;
    setNotice(null);
    try {
      await api.referenceClone({
        coreHid: ctx.drawerNodeHid,
        referenceUuid: selected.uuid,
        overwrite,
      });
      setNotice({
        kind: "success",
        text: `Assigned ${selected.externalId} to ${ctx.drawerNodeHid} via [:REFERENCES]; shared properties cloned (SRS §3.4.6.2).`,
      });
      void qc.invalidateQueries({ queryKey: ["soi"] });
      void qc.invalidateQueries({ queryKey: ["node"] });
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    }
  };

  const results = useMemo(() => {
    let r = search.data?.results ?? [];
    if (version) r = r.filter((x) => x.frameworkVersion === version);
    if (allowedLabels) {
      // Invalid item types for the source node are muted, not hidden here —
      // we sort valid first and disable assignment on invalid (§6.5.4.7).
      r = [...r].sort((a, b) => {
        const av = a.labels.some((l) => allowedLabels.includes(l)) ? 0 : 1;
        const bv = b.labels.some((l) => allowedLabels.includes(l)) ? 0 : 1;
        return av - bv;
      });
    }
    return r;
  }, [search.data, allowedLabels, version]);

  // Hierarchy pane (§6.5.4.9) grouped framework → derived ancestor chain.
  const hierarchy = useMemo(() => {
    const roots = new Map<string, HierNode>();
    for (const r of results) {
      const fw = r.frameworkName || "—";
      let root = roots.get(fw);
      if (!root) {
        root = { key: fw, children: new Map() };
        roots.set(fw, root);
      }
      let cur: HierNode = root;
      for (const key of parentChain(r.externalId, r.labels)) {
        let child: HierNode | undefined = cur.children.get(key);
        if (!child) {
          child = { key, children: new Map() };
          cur.children.set(key, child);
        }
        cur = child;
      }
      cur.item = r;
    }
    return roots;
  }, [results]);

  const select = (r: SelectedRef) => {
    setSelected(r);
    setNotice(null); // clear stale assignment notices (§6.5.4.12)
  };
  const selectResult = (r: ReferenceSearchResult) => select({ ...r });

  const toggleExpand = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Browse actions (§6.5.4.11): Expand/Collapse the selected hierarchy node,
  // Center on Selected, Close.
  const selectedChainKeys = useMemo(() => {
    if (!selected) return [] as string[];
    const fw = selected.frameworkName;
    const chain = parentChain(selected.externalId, selected.labels);
    return fw ? [fw, ...chain] : chain;
  }, [selected]);
  const expandSelected = () =>
    setExpanded((s) => new Set([...s, ...selectedChainKeys]));
  const collapseSelected = () =>
    setExpanded((s) => {
      const next = new Set(s);
      for (const k of selectedChainKeys) next.delete(k);
      return next;
    });
  const centerOnSelected = () => {
    if (!selected) return;
    rowRefs.current.get(selected.uuid)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const props = (detail.data?.props ?? {}) as Record<string, unknown>;
  const detailLabels = (detail.data?.labels ?? null) as string[] | null;
  const effectiveLabels = detailLabels ?? selected?.labels ?? [];
  const relationships = (detail.data?.relationships ?? []) as {
    type: string;
    targetUuid: string;
    targetExternalId: string;
    targetName: string;
  }[];

  const selectedValid =
    !allowedLabels || effectiveLabels.some((l) => allowedLabels.includes(l));

  const renderHier = (node: HierNode, depth: number): ReactNode => {
    const open = expanded.has(node.key);
    const hasChildren = node.children.size > 0;
    return (
      <li key={node.key} style={{ listStyle: "none" }}>
        <div
          style={{
            display: "flex",
            gap: 4,
            alignItems: "baseline",
            paddingLeft: depth * 10,
            fontSize: "0.72rem",
            cursor: "pointer",
            background:
              selected && node.item?.uuid === selected.uuid
                ? "var(--sstpa-ivory-sunken)"
                : undefined,
          }}
          onClick={() => {
            if (node.item) selectResult(node.item);
            else if (hasChildren) toggleExpand(node.key);
          }}
        >
          {hasChildren ? (
            <button
              className="icon-button"
              style={{ padding: "0 4px" }}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.key);
              }}
              aria-label={open ? "Collapse" : "Expand"}
            >
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span style={{ width: 18 }} />
          )}
          <span className="mono">{node.key}</span>
          {node.item ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.item.name}
            </span>
          ) : (
            <span style={{ color: "var(--sstpa-navy-muted)" }}>(derived)</span>
          )}
        </div>
        {open && hasChildren && (
          <ul style={{ margin: 0, padding: 0 }}>
            {[...node.children.values()].map((c) => renderHier(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="tool-shell" style={{ height: "100%" }}>
      {/* Header: mode + source context (§6.5.4.3) + action bar (§6.5.4.11) */}
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
        <button
          className={`sstpa-button ${mode === "research" ? "" : "secondary"}`}
          onClick={() => setMode("research")}
        >
          Research Mode
        </button>
        <button
          className={`sstpa-button ${mode === "assignment" ? "" : "secondary"}`}
          disabled={!canAssign}
          title={canAssign ? "" : "Open a valid node in the Data Drawer first (§6.5.4.1)"}
          onClick={() => setMode("assignment")}
        >
          Assignment Mode
        </button>
        {mode === "assignment" && (
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
            Source: {ctx.drawerNodeHid} ({sourceType}) · SoI {ctx.soiHid ?? "—"} · allowed:{" "}
            {allowedLabels?.join(", ")}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="icon-button" disabled={!selected} onClick={expandSelected}>
          Expand Selected
        </button>
        <button className="icon-button" disabled={!selected} onClick={collapseSelected}>
          Collapse Selected
        </button>
        <button className="icon-button" disabled={!selected} onClick={centerOnSelected}>
          Center on Selected
        </button>
        <button className="icon-button" onClick={() => closeTool("sstpa.reference")}>
          Close
        </button>
      </div>

      {/* Framework / version selectors, type filter, search (§6.5.4.6–§6.5.4.8) */}
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
          style={{ width: "auto" }}
          value={framework}
          onChange={(e) => {
            setFramework(e.target.value);
            setVersion("");
          }}
        >
          <option value="">All frameworks</option>
          {frameworkNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="sstpa-input"
          style={{ width: "auto" }}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          title="Framework version (§6.5.4.7)"
        >
          <option value="">All versions</option>
          {versionsForFramework.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="sstpa-input"
          style={{ width: 160 }}
          placeholder="Type filter (e.g. AK_Technique)"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          list="ref-type-suggestions"
        />
        <datalist id="ref-type-suggestions">
          {[
            "AK_Tactic", "AK_Technique", "AK_Mitigation", "AK_Group", "AK_Software",
            "AK_Campaign", "AK_DetectionStrategy", "AK_Analytic", "AK_DataComponent",
            "AT_Tactic", "AT_Technique", "AT_Mitigation", "AT_CaseStudy",
            "NIST_Family", "NIST_Control", "NIST_Enhancement",
            "EMB3D_Vulnerability", "EMB3D_CourseOfAction", "EMB3D_Device",
          ].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <input
          className="sstpa-input"
          style={{ width: 140 }}
          placeholder="Exact ExternalID"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value.trim())}
        />
        <input
          className="sstpa-input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Search name / description (incremental)…"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
        />
      </div>

      {notice && (
        <div
          className={notice.kind === "success" ? "sstpa-alert-success" : "sstpa-alert-error"}
          style={{ margin: "6px 12px", display: "flex", gap: 10, alignItems: "center" }}
        >
          <span style={{ flex: 1 }}>{notice.text}</span>
          {notice.kind === "success" && mode === "assignment" && (
            <button
              className="sstpa-button secondary"
              style={{ padding: "2px 10px" }}
              title="Close the Reference Tool and return to the calling Data Drawer (§6.5.4.12)"
              onClick={() => closeTool("sstpa.reference")}
            >
              Return to Data Drawer
            </button>
          )}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Hierarchy pane (§6.5.4.9) */}
        <div
          style={{
            width: 230,
            overflow: "auto",
            borderRight: "var(--sstpa-border-soft)",
            padding: "var(--sstpa-sp-2)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--sstpa-navy-muted)",
              marginBottom: 4,
            }}
          >
            Hierarchy (derived from ExternalID structure of the current
            results; the Backend exposes no parent/child query)
          </div>
          {hierarchy.size === 0 ? (
            <p style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
              Search to populate the hierarchy.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0 }}>
              {[...hierarchy.values()].map((n) => renderHier(n, 0))}
            </ul>
          )}
        </div>

        {/* Results grid (§6.5.4.8): error state distinct from empty */}
        <div style={{ flex: 1, overflow: "auto", borderRight: "var(--sstpa-border-soft)" }}>
          {search.isError ? (
            <ToolStatus error={search.error} onRetry={() => void search.refetch()} />
          ) : search.isFetching && !search.data ? (
            <ToolStatus loading />
          ) : results.length === 0 && (externalId || queryText.length >= 2) && search.data ? (
            <ToolStatus
              empty="No reference items match this search."
              emptyHint="Adjust the framework, version, type, or search text."
            />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sstpa-navy)" }}>
                  <th style={{ padding: "4px 8px" }}>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Framework</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const valid =
                    !allowedLabels || r.labels.some((l) => allowedLabels.includes(l));
                  return (
                    <tr
                      key={r.uuid}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.uuid, el);
                        else rowRefs.current.delete(r.uuid);
                      }}
                      onClick={() => selectResult(r)}
                      style={{
                        borderBottom: "1px solid var(--sstpa-line-soft)",
                        cursor: "pointer",
                        opacity: valid ? 1 : 0.45,
                        background:
                          selected?.uuid === r.uuid ? "var(--sstpa-ivory-sunken)" : undefined,
                      }}
                    >
                      <td className="mono" style={{ padding: "4px 8px", fontSize: "0.7rem" }}>
                        {r.externalId}
                      </td>
                      <td>{r.name}</td>
                      <td className="mono" style={{ fontSize: "0.66rem" }}>
                        {r.labels.join(",")}
                      </td>
                      <td style={{ fontSize: "0.7rem" }}>
                        {r.frameworkName} {r.frameworkVersion}
                      </td>
                    </tr>
                  );
                })}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: "var(--sstpa-navy-muted)" }}>
                      Enter an ExternalID or at least two characters of text to
                      search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Read-only inspector (§6.5.4.10) */}
        <div
          style={{
            width: 380,
            overflow: "auto",
            padding: "var(--sstpa-sp-3)",
            background: "var(--sstpa-ivory-raised)",
            fontSize: "0.8rem",
          }}
        >
          {!selected && <p style={{ color: "var(--sstpa-navy-muted)" }}>Select a reference item.</p>}
          {selected && (
            <>
              {detail.isError && (
                <div className="sstpa-alert-error">{errorText(detail.error)}</div>
              )}
              <div className="mono" style={{ fontSize: "0.72rem", color: "var(--sstpa-navy-muted)" }}>
                {String(props.FrameworkName ?? selected.frameworkName ?? "")}{" "}
                {String(props.FrameworkVersion ?? selected.frameworkVersion ?? "")} ·{" "}
                {effectiveLabels.join(", ") || (detail.isFetching ? "loading…" : "—")}
              </div>
              <h3 style={{ margin: "4px 0", fontFamily: "var(--sstpa-font-brand)" }}>
                {String(props.ExternalID ?? selected.externalId)} —{" "}
                {String(props.Name ?? selected.name)}
              </h3>
              {(selected.isDeprecated || props.IsDeprecated === true) && (
                <span className="state-warn">deprecated </span>
              )}
              {(selected.isRevoked || props.IsRevoked === true) && (
                <span className="state-error">revoked</span>
              )}
              <p style={{ whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto" }}>
                {String(props.LongDescription ?? props.ShortDescription ?? selected.shortDescription ?? "")}
              </p>
              <p className="mono" style={{ fontSize: "0.66rem" }}>
                Source: {String(props.SourceURI ?? "")}
              </p>
              {relationships.filter((r) => r.targetExternalId).length > 0 && (
                <>
                  <h4 style={{ margin: "8px 0 4px" }}>Related items</h4>
                  <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 170, overflow: "auto" }}>
                    {relationships
                      .filter((r) => r.targetExternalId)
                      .slice(0, 40)
                      .map((r, i) => (
                        <li key={i} style={{ fontSize: "0.72rem" }}>
                          {/* Related items are navigable (§6.5.4.5b): selecting
                              one loads it in the inspector, and in Assignment
                              Mode it may be assigned when its type is valid. */}
                          <button
                            className="icon-button"
                            style={{ padding: "0 4px", fontSize: "0.72rem" }}
                            onClick={() =>
                              select({
                                uuid: r.targetUuid,
                                externalId: r.targetExternalId ?? "",
                                name: r.targetName ?? "",
                                labels: [],
                              })
                            }
                          >
                            <span className="mono">[{r.type}]</span> {r.targetExternalId}{" "}
                            {r.targetName}
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              )}
              {/* Action bar (§6.5.4.11) */}
              {mode === "assignment" && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexDirection: "column" }}>
                  {!selectedValid && effectiveLabels.length > 0 && (
                    <div className="sstpa-alert-warning">
                      (:{sourceType}) may not clone from {effectiveLabels.join(", ")} (SRS
                      §3.4.6.1).
                    </div>
                  )}
                  <button
                    className="sstpa-button"
                    disabled={!selectedValid || detail.isFetching}
                    onClick={() => void assign(false)}
                  >
                    Assign Selected Reference
                  </button>
                  <button
                    className="sstpa-button secondary"
                    disabled={!selectedValid || detail.isFetching}
                    title="Also overwrite non-default Name/Description on the Core node"
                    onClick={() => void assign(true)}
                  >
                    Assign + overwrite properties
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
