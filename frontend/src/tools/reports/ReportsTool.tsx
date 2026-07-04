// Reports Tool (SRS §6.5.3): general text-based reports — System Description,
// System Specification, Requirement-Traceability Gap Analysis, Controls List.
// Output as plain text, Markdown, HTML (Word-compatible / print-to-PDF), and
// CSV for the Controls List; optional G2M model-text appendix (§6.5.3.9);
// see docs/REQUIREMENTS-NOTES.md I-11.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, apiBase } from "../../api/client";
import type { SoINode } from "../../api/types";
import { displayName } from "../../components/NodeTypeBadge";
import { useSession } from "../../state/stores";
import type { ToolLaunchContext, ToolManifest } from "../manifest";
import { downloadText, errorText, ToolStatus } from "../shared";

type ReportKind =
  | "system-description"
  | "system-specification"
  | "gap-analysis"
  | "controls-list";

const REPORTS: { id: ReportKind; label: string }[] = [
  { id: "system-description", label: "System Description" },
  { id: "system-specification", label: "System Specification" },
  { id: "gap-analysis", label: "Requirement-Traceability Gap Analysis" },
  { id: "controls-list", label: "Controls List" },
];

/** Primary node type ordering for report sections (§6.3.4.2 order). */
const SECTION_ORDER = [
  "Environment",
  "Connection",
  "Interface",
  "SystemFunction",
  "Component",
  "Purpose",
  "State",
  "Asset",
  "SecurityControl",
  "Countermeasure",
];

interface Notice {
  kind: "success" | "error" | "warning";
  text: string;
}

const NOTICE_CLASS: Record<Notice["kind"], string> = {
  success: "sstpa-alert-success",
  error: "sstpa-alert-error",
  warning: "sstpa-alert-warning",
};

function tokenHeader(): Record<string, string> {
  const token = useSession.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ReportsTool({
  ctx,
}: {
  ctx: ToolLaunchContext;
  manifest: ToolManifest;
}) {
  const [kind, setKind] = useState<ReportKind>("system-description");
  const [generated, setGenerated] = useState<string | null>(null); // markdown
  const [generatedKind, setGeneratedKind] = useState<ReportKind | null>(null);
  const [appendModelText, setAppendModelText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const soi = useQuery({
    queryKey: ["soi", ctx.soiHid],
    queryFn: () => api.soi(ctx.soiHid!),
    enabled: !!ctx.soiHid,
  });

  const nodes = useMemo(() => soi.data?.nodes ?? [], [soi.data]);
  const byHid = useMemo(() => new Map(nodes.map((n) => [n.hid, n])), [nodes]);

  const generate = async () => {
    // Generation is guarded until the SoI query has resolved so reports never
    // run against a partial node set.
    if (!ctx.soiHid || !soi.data) return;
    setBusy(true);
    setNotice(null);
    const warnings: string[] = [];
    try {
      let md: string;
      switch (kind) {
        case "system-description":
          md = systemDescription(ctx.soiHid, nodes, byHid);
          break;
        case "system-specification":
          md = systemSpecification(ctx.soiHid, nodes, byHid);
          break;
        case "gap-analysis": {
          const res = await gapAnalysis(ctx, nodes, byHid);
          md = res.md;
          warnings.push(...res.warnings);
          break;
        }
        case "controls-list":
          md = controlsList(ctx.soiHid, nodes, byHid);
          break;
      }
      // Optional model-text appendix (§6.5.3.9) for the two report kinds
      // that embed it.
      if (
        appendModelText &&
        (kind === "system-description" || kind === "system-specification")
      ) {
        for (const lang of ["sysml", "kerml"] as const) {
          try {
            const text = await fetchModelText(lang, ctx.soiHid);
            md +=
              `\n---\n\n## Appendix: G2M ${lang === "sysml" ? "SysML 2.0" : "KerML 1.0"} Model Text\n\n` +
              `Profile: G2M (SRS §3.7). Read-only translation of the report scope.\n\n` +
              "```\n" +
              text +
              "\n```\n";
          } catch (e) {
            warnings.push(
              `Model text appendix (${lang.toUpperCase()}) unavailable: ${errorText(e)}`,
            );
          }
        }
      }
      setGenerated(md);
      setGeneratedKind(kind);
      if (warnings.length > 0) {
        setNotice({ kind: "warning", text: warnings.join(" · ") });
      } else if (kind === "gap-analysis") {
        setNotice({
          kind: "success",
          text: "Report generated; Orphan and Barren properties were computed and committed (SRS §6.5.3.8).",
        });
      } else {
        setNotice({ kind: "success", text: "Report generated." });
      }
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const download = (format: "md" | "txt" | "html") => {
    if (!generated) return;
    let content = generated;
    let mime = "text/markdown";
    if (format === "txt") {
      content = generated
        .replace(/^```.*$/gm, "")
        .replace(/^#+\s*/gm, "")
        .replace(/\*\*/g, "");
      mime = "text/plain";
    } else if (format === "html") {
      content = mdToHtml(generated);
      mime = "text/html";
    }
    downloadText(`sstpa-${generatedKind ?? kind}-${ctx.soiHid}.${format}`, content, mime);
  };

  const downloadCsv = () => {
    if (generatedKind !== "controls-list") return;
    downloadText(
      `sstpa-controls-list-${ctx.soiHid}.csv`,
      controlsCsv(nodes, byHid),
      "text/csv",
    );
  };

  const printPdf = () => {
    if (!generated) return;
    const html = mdToHtml(generated);
    const win = window.open("", "_blank");
    if (!win) {
      // Popup blocked — fall back to an HTML download the user can print.
      downloadText(`sstpa-${generatedKind ?? kind}-${ctx.soiHid}.html`, html, "text/html");
      setNotice({
        kind: "warning",
        text: "Popup blocked by the browser — the HTML report was downloaded instead; open it and print to PDF.",
      });
      return;
    }
    win.document.write(html);
    win.document.close();
    win.print();
  };

  if (!ctx.soiHid) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus needsSoI />
      </div>
    );
  }
  if (soi.isLoading || soi.isError) {
    return (
      <div className="tool-shell" style={{ height: "100%" }}>
        <ToolStatus
          loading={soi.isLoading}
          error={soi.isError ? soi.error : undefined}
          onRetry={() => void soi.refetch()}
        />
      </div>
    );
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
          style={{ width: "auto" }}
          value={kind}
          onChange={(e) => setKind(e.target.value as ReportKind)}
        >
          {REPORTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {(kind === "system-description" || kind === "system-specification") && (
          <label style={{ fontSize: "0.74rem" }} title="Embed the G2M SysML 2.0 / KerML 1.0 text for the report scope (§6.5.3.9)">
            <input
              type="checkbox"
              checked={appendModelText}
              onChange={(e) => setAppendModelText(e.target.checked)}
            />{" "}
            Model text appendix
          </label>
        )}
        <button
          className="sstpa-button"
          disabled={!soi.data || busy}
          onClick={() => void generate()}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-button" disabled={!generated} onClick={() => download("md")}>
          Markdown
        </button>
        <button className="icon-button" disabled={!generated} onClick={() => download("txt")}>
          Text
        </button>
        <button className="icon-button" disabled={!generated} onClick={() => download("html")}>
          HTML (Word)
        </button>
        <button
          className="icon-button"
          disabled={generatedKind !== "controls-list"}
          title="Comma-separated controls list (generate the Controls List report first)"
          onClick={downloadCsv}
        >
          CSV
        </button>
        <button className="icon-button" disabled={!generated} onClick={printPdf}>
          Print / PDF
        </button>
      </div>
      {notice && (
        <div className={NOTICE_CLASS[notice.kind]} style={{ margin: "6px 12px" }}>
          {notice.text}{" "}
          <button className="icon-button" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sstpa-sp-4)" }}>
        {generated ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "var(--sstpa-font-mono)",
              fontSize: "0.78rem",
              background: "var(--sstpa-ivory-raised)",
              border: "var(--sstpa-border-soft)",
              borderRadius: 4,
              padding: "var(--sstpa-sp-4)",
            }}
          >
            {generated}
          </pre>
        ) : (
          <p style={{ color: "var(--sstpa-navy-muted)" }}>
            Choose a report and press Generate.
          </p>
        )}
      </div>
    </div>
  );
}

/** Fetch G2M model text for the SoI (§6.5.3.9), same endpoint contract as the
 *  Model Text Panel. */
async function fetchModelText(lang: "sysml" | "kerml", soiHid: string): Promise<string> {
  const res = await fetch(
    `${apiBase()}/api/model/${lang}?scope=SOI&soi=${encodeURIComponent(soiHid)}`,
    { headers: tokenHeader() },
  );
  if (!res.ok) throw new Error(`translator unavailable (${res.status})`);
  return res.text();
}

function prop(n: SoINode | undefined, key: string): string {
  const v = n?.properties?.[key];
  if (v == null || v === "null") return "";
  return String(v);
}

function header(soiHid: string, title: string, byHid: Map<string, SoINode>): string {
  const sys = byHid.get(soiHid);
  return [
    `# ${title}`,
    "",
    `**System of Interest:** ${prop(sys, "Name")} (${soiHid})`,
    `**Description:** ${prop(sys, "ShortDescription") || prop(sys, "LongDescription") || "—"}`,
    `**Generated:** ${new Date().toISOString()} by SSTPA Tools`,
    "",
    "---",
    "",
  ].join("\n");
}

/** System Description (§6.5.3.6): hierarchical description of the SoI, its
 *  primary nodes and relationships, then secondary nodes and relationships. */
function systemDescription(
  soiHid: string,
  nodes: SoINode[],
  byHid: Map<string, SoINode>,
): string {
  let md = header(soiHid, "System Description", byHid);
  for (const type of SECTION_ORDER) {
    const group = nodes.filter((n) => n.typeName === type);
    if (group.length === 0) continue;
    md += `## ${displayName(type)} (${group.length})\n\n`;
    for (const n of group) {
      md += `### ${n.hid} — ${prop(n, "Name")}\n\n`;
      const desc = prop(n, "LongDescription") || prop(n, "ShortDescription");
      if (desc) md += `${desc}\n\n`;
      const rels = (n.relationships ?? []).filter((r) => r.targetHID);
      if (rels.length > 0) {
        md += "Relationships:\n\n";
        for (const r of rels) {
          const target = byHid.get(r.targetHID);
          md += `- \`[:${r.type}]\` → ${r.targetHID}${target ? ` (${prop(target, "Name")})` : ""}\n`;
        }
        md += "\n";
      }
    }
  }
  return md;
}

/** System Specification (§6.5.3.7): requirements organized by the bearer node
 *  they relate to, one section per primary type with [:HAS_REQUIREMENT]. */
function systemSpecification(
  soiHid: string,
  nodes: SoINode[],
  byHid: Map<string, SoINode>,
): string {
  let md = header(soiHid, "System Specification", byHid);
  for (const type of ["Purpose", "Connection", "Interface", "SystemFunction", "Component", "Constraint", "Countermeasure", "SecurityControl"]) {
    const bearers = nodes.filter(
      (n) =>
        n.typeName === type &&
        (n.relationships ?? []).some((r) => r.type === "HAS_REQUIREMENT"),
    );
    if (bearers.length === 0) continue;
    md += `## Requirements on ${displayName(type)} nodes\n\n`;
    for (const b of bearers) {
      md += `### ${b.hid} — ${prop(b, "Name")}\n\n`;
      const reqs = (b.relationships ?? [])
        .filter((r) => r.type === "HAS_REQUIREMENT")
        .map((r) => byHid.get(r.targetHID))
        .filter((r): r is SoINode => !!r)
        .sort((a, b2) => a.hid.localeCompare(b2.hid));
      let i = 1;
      for (const rq of reqs) {
        md += `${i}. \`${rq.uuid}\` ${prop(rq, "RStatement") || prop(rq, "Name")}\n`;
        i++;
      }
      md += "\n";
    }
  }
  return md;
}

interface GapRow {
  hid: string;
  uuid: string;
  name: string;
  baseline: string;
  orphan: boolean;
  barren: boolean;
}

interface BackendReqRecord {
  hid: string;
  uuid: string;
  name: string;
  bearers: { hid: string; name: string; typeName: string }[];
  parents: string[] | null;
  childCount: number;
  verificationCount: number;
}

/** Gap Analysis (§6.5.3.8): identifies problematic requirements; computes and
 *  COMMITS Orphan/Barren per the §6.5.3.8 definitions (see note I-10).
 *
 *  Parentage is evaluated against the Backend requirements endpoint, whose
 *  [:PARENTS] query is graph-wide, so cross-SoI parents (§6.5.2.6) do not
 *  produce false orphans. If the endpoint is unavailable the analysis falls
 *  back to SoI-local data and says so in the report. */
async function gapAnalysis(
  ctx: ToolLaunchContext,
  nodes: SoINode[],
  byHid: Map<string, SoINode>,
): Promise<{ md: string; warnings: string[] }> {
  const warnings: string[] = [];
  let rows: GapRow[];
  let crossSoIEvaluated = true;

  const soiIndex = ctx.soiHid ? ctx.soiHid.split("_")[1] ?? "" : "";
  try {
    const res = await fetch(
      `${apiBase()}/api/requirements/soi/${encodeURIComponent(soiIndex)}`,
      { headers: tokenHeader() },
    );
    if (!res.ok) throw new Error(`requirements query failed (${res.status})`);
    const data = (await res.json()) as { requirements: BackendReqRecord[] | null };
    rows = (data.requirements ?? []).map((r) => {
      const nonPurpose = r.bearers.filter((b) => b.typeName !== "Purpose");
      return {
        hid: r.hid,
        uuid: r.uuid,
        name: r.name,
        baseline: prop(byHid.get(r.hid), "Baseline"),
        // §6.5.3.8 Orphan: no parent (:Requirement) — graph-wide parents.
        orphan: (r.parents ?? []).length === 0,
        // §6.5.3.8 Barren: no child, or no non-(:Purpose) [:HAS_REQUIREMENT].
        barren: r.childCount === 0 || nonPurpose.length === 0,
      };
    });
  } catch (e) {
    crossSoIEvaluated = false;
    warnings.push(
      `Backend requirements endpoint unavailable (${errorText(e)}) — analysis fell back to SoI-local relationships.`,
    );
    const requirements = nodes.filter((n) => n.typeName === "Requirement");
    const incomingBearers = new Map<string, string[]>();
    const hasParent = new Map<string, boolean>();
    const hasChild = new Map<string, boolean>();
    for (const n of nodes) {
      for (const r of n.relationships ?? []) {
        if (r.type === "HAS_REQUIREMENT" && byHid.get(r.targetHID)?.typeName === "Requirement") {
          incomingBearers.set(r.targetHID, [
            ...(incomingBearers.get(r.targetHID) ?? []),
            n.typeName,
          ]);
        }
        if (r.type === "PARENTS" && n.typeName === "Requirement") {
          hasChild.set(n.hid, true);
          hasParent.set(r.targetHID, true);
        }
      }
    }
    rows = requirements.map((rq) => {
      const bearers = incomingBearers.get(rq.hid) ?? [];
      const nonPurpose = bearers.filter((b) => b !== "Purpose");
      return {
        hid: rq.hid,
        uuid: rq.uuid,
        name: prop(rq, "Name"),
        baseline: prop(rq, "Baseline"),
        orphan: !hasParent.get(rq.hid),
        barren: !hasChild.get(rq.hid) || nonPurpose.length === 0,
      };
    });
  }

  // Persist the computed flags (report generation SHALL set them, §6.5.3.8).
  const ops = rows
    .filter((row) => {
      const node = byHid.get(row.hid);
      return (
        node &&
        (node.properties.Orphan !== row.orphan || node.properties.Barren !== row.barren)
      );
    })
    .map((row) => ({
      op: "updateNode" as const,
      hid: row.hid,
      properties: { Orphan: row.orphan, Barren: row.barren },
    }));
  if (ops.length > 0) {
    try {
      await api.commit({
        soiHid: ctx.soiHid ?? undefined,
        toolId: "sstpa.reports",
        operations: ops,
      });
    } catch (e) {
      warnings.push(`Orphan/Barren flags could not be persisted: ${errorText(e)}`);
    }
  }

  let md = header(ctx.soiHid!, "Requirement-Traceability Gap Analysis", byHid);
  if (!crossSoIEvaluated) {
    md +=
      "> **Note:** cross-SoI parentage was not evaluated (Backend requirements endpoint unavailable); requirements with parents in another SoI may be flagged as false orphans.\n\n";
  }
  const problems = rows.filter((r) => r.orphan || r.barren);
  md += `**${problems.length} of ${rows.length} requirements need remediation.**\n\n`;
  md += "| UUID | HID | Baseline | Orphan | Barren | Remediation |\n";
  md += "|---|---|---|---|---|---|\n";
  for (const { hid, uuid, baseline, orphan, barren } of rows) {
    if (!orphan && !barren) continue;
    const fixes = [];
    if (orphan) fixes.push("re-parent or remove");
    if (barren) fixes.push("allocate to Interface/Function/Element or add child");
    md += `| \`${uuid}\` | ${hid} | ${baseline || "—"} | ${orphan} | ${barren} | ${fixes.join("; ")} |\n`;
  }
  md += "\n## Compliant requirements\n\n";
  for (const { hid, uuid, name, orphan, barren } of rows) {
    if (orphan || barren) continue;
    md += `- \`${uuid}\` ${hid} ${name}\n`;
  }
  return { md, warnings };
}

/** Satisfying (:Countermeasure) HIDs per (:SecurityControl). */
function satisfiesMap(nodes: SoINode[]): Map<string, string[]> {
  const satisfies = new Map<string, string[]>();
  for (const cm of nodes.filter((n) => n.typeName === "Countermeasure")) {
    for (const r of cm.relationships ?? []) {
      if (r.type === "SATISFIES") {
        satisfies.set(r.targetHID, [...(satisfies.get(r.targetHID) ?? []), cm.hid]);
      }
    }
  }
  return satisfies;
}

/** Controls List: (:SecurityControl) nodes with satisfying countermeasures. */
function controlsList(
  soiHid: string,
  nodes: SoINode[],
  byHid: Map<string, SoINode>,
): string {
  let md = header(soiHid, "Controls List", byHid);
  const controls = nodes.filter((n) => n.typeName === "SecurityControl");
  const satisfies = satisfiesMap(nodes);
  md += `**${controls.length} control(s) in this SoI.**\n\n`;
  for (const c of controls) {
    md += `## ${c.hid} — ${prop(c, "Name")}\n\n`;
    const ref = prop(c, "ReferenceID");
    if (ref) md += `Reference: ${ref} (${prop(c, "ReferenceFramework")})\n\n`;
    const desc = prop(c, "LongDescription") || prop(c, "ShortDescription");
    if (desc) md += `${desc}\n\n`;
    const cms = satisfies.get(c.hid) ?? [];
    md += cms.length
      ? `Satisfied by: ${cms.map((h) => `${h} (${prop(byHid.get(h), "Name")})`).join(", ")}\n\n`
      : `**Not yet satisfied by any Countermeasure.**\n\n`;
  }
  return md;
}

/** Controls List CSV export (manifest SupportedExportFormats includes CSV). */
function controlsCsv(nodes: SoINode[], byHid: Map<string, SoINode>): string {
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const satisfies = satisfiesMap(nodes);
  const lines = [
    [
      "HID",
      "Name",
      "ReferenceID",
      "ReferenceFramework",
      "ShortDescription",
      "SatisfiedBy",
    ].join(","),
  ];
  for (const c of nodes.filter((n) => n.typeName === "SecurityControl")) {
    const cms = (satisfies.get(c.hid) ?? [])
      .map((h) => `${h} (${prop(byHid.get(h), "Name")})`)
      .join("; ");
    lines.push(
      [
        esc(c.hid),
        esc(prop(c, "Name")),
        esc(prop(c, "ReferenceID")),
        esc(prop(c, "ReferenceFramework")),
        esc(prop(c, "ShortDescription") || prop(c, "LongDescription")),
        esc(cms),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Minimal Markdown → HTML for Word/print output. */
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  let html = "";
  let inTable = false;
  let inList = false;
  let inPre = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      // Fenced code blocks (model text appendix) render monospace (§6.5.3.9).
      html += inPre ? "</pre>" : "<pre>";
      inPre = !inPre;
      continue;
    }
    if (inPre) {
      html += esc(line) + "\n";
      continue;
    }
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!inTable) {
        html += "<table border='1' cellspacing='0' cellpadding='4'>";
        inTable = true;
        html += "<tr>" + cells.map((c) => `<th>${esc(c)}</th>`).join("") + "</tr>";
        continue;
      }
      html += "<tr>" + cells.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>";
      continue;
    }
    if (inTable) {
      html += "</table>";
      inTable = false;
    }
    const listItem = /^[-*] (.*)/.exec(line) || /^\d+\. (.*)/.exec(line);
    if (listItem) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(esc(listItem[1]))}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    const h = /^(#{1,4}) (.*)/.exec(line);
    if (h) {
      const lvl = h[1].length;
      html += `<h${lvl}>${inline(esc(h[2]))}</h${lvl}>`;
    } else if (line.trim() === "---") {
      html += "<hr/>";
    } else if (line.trim() !== "") {
      html += `<p>${inline(esc(line))}</p>`;
    }
  }
  if (inTable) html += "</table>";
  if (inList) html += "</ul>";
  if (inPre) html += "</pre>";
  return `<!doctype html><html><head><meta charset="utf-8"><title>SSTPA Report</title>
<style>body{font-family:Georgia,serif;color:#1b2a4a;max-width:900px;margin:2em auto;line-height:1.5}
table{border-collapse:collapse;font-size:0.9em}th{background:#f0ece0}
pre{font-family:monospace;background:#f4f1e8;padding:1em;overflow-x:auto;font-size:0.85em}
code{font-family:monospace;background:#f4f1e8;padding:0 3px}</style></head><body>${html}</body></html>`;

  function inline(s: string): string {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}
