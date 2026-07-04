// Model Text Panel (SRS §6.4.2): docked right, collapsible to a labeled tab,
// resizable; shows G2M output for the tool's scope with keyword highlighting,
// Copy, and Export (.sysml/.kerml). Read-only until the Backend advertises
// model.translate.write (M2G editing lands with the translator, SRS §3.7).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { apiBase } from "../api/client";
import { useSession } from "../state/stores";
import type { ModelTextLanguage } from "./manifest";

/** SysML v2 / KerML keywords for display highlighting (§6.4.2). */
const KEYWORDS = new Set([
  "package", "part", "def", "attribute", "port", "item", "action", "state",
  "transition", "requirement", "constraint", "connection", "interface",
  "allocate", "satisfy", "verify", "import", "specializes", "subsets",
  "redefines", "comment", "doc", "metadata", "about", "classifier",
  "feature", "type", "struct", "connector", "binding", "succession",
  "first", "then", "accept", "entry", "exit", "do", "use", "case",
  "include", "actor", "objective", "subject", "ref", "in", "out", "inout",
  "abstract", "readonly", "derived", "end", "private", "protected", "public",
]);

/** Lightweight tokenizer: strings, line comments, keywords, and metadata
 *  annotations get the stylesheet's .str/.meta/.kw classes. */
function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern =
    /("(?:[^"\\]|\\.)*")|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(@[A-Za-z_][\w:]*)|([A-Za-z_][\w]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [tok, str, comment, meta, word] = m;
    if (str) out.push(<span key={key++} className="str">{tok}</span>);
    else if (comment) out.push(<span key={key++} className="meta">{tok}</span>);
    else if (meta) out.push(<span key={key++} className="meta">{tok}</span>);
    else if (word && KEYWORDS.has(word))
      out.push(<span key={key++} className="kw">{tok}</span>);
    else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ModelTextPanel({
  toolId,
  languages,
  soiHid,
}: {
  toolId: string;
  languages: ModelTextLanguage[];
  soiHid: string | null;
}) {
  // Collapse/width persist per tool per machine (SRS §6.4.2).
  const collapsedKey = `sstpa.modeltext.${toolId}.collapsed`;
  const widthKey = `sstpa.modeltext.${toolId}.width`;
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(collapsedKey) === "true",
  );
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem(widthKey)) || 340,
  );
  const widthRef = useRef(width);
  widthRef.current = width;
  const [language, setLanguage] = useState<ModelTextLanguage>(languages[0]);
  const { token } = useSession();

  const modelText = useQuery({
    queryKey: ["model-text", language, soiHid],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase()}/api/model/${language.toLowerCase()}?scope=SOI&soi=${encodeURIComponent(soiHid ?? "")}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`translator unavailable (${res.status})`);
      return res.text();
    },
    enabled: !collapsed && !!soiHid,
    retry: false,
  });

  const persist = (c: boolean, w: number) => {
    localStorage.setItem(collapsedKey, String(c));
    localStorage.setItem(widthKey, String(w));
  };

  const highlighted = useMemo(
    () => (modelText.data ? highlight(modelText.data) : null),
    [modelText.data],
  );

  const exportFile = () => {
    if (!modelText.data) return;
    const ext = language === "KERML" ? "kerml" : "sysml";
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([modelText.data], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(soiHid ?? "model").replaceAll("_", "-")}-${stamp}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (collapsed) {
    return (
      <button
        className="model-text-panel"
        style={{
          width: 28,
          cursor: "pointer",
          border: "none",
          borderLeft: "var(--sstpa-border)",
          writingMode: "vertical-rl",
          fontFamily: "var(--sstpa-font-mono)",
          fontSize: "0.7rem",
          color: "var(--sstpa-muted)",
          background: "var(--sstpa-surface)",
        }}
        onClick={() => {
          setCollapsed(false);
          persist(false, width);
        }}
        title="Expand Model Text Panel"
      >
        MODEL TEXT ▸
      </button>
    );
  }

  return (
    <div className="model-text-panel" style={{ width }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderBottom: "var(--sstpa-border-soft)",
        }}
      >
        <div
          style={{ cursor: "ew-resize", padding: "0 4px", userSelect: "none" }}
          title="Drag to resize"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = widthRef.current;
            const onMove = (ev: MouseEvent) => {
              const w = Math.max(140, startW - (ev.clientX - startX));
              setWidth(w);
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              // widthRef carries the live drag value; `width` from this
              // render's closure would persist the pre-drag width.
              persist(false, widthRef.current);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          ⋮
        </div>
        <span className="mono" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
          MODEL TEXT
        </span>
        {languages.length > 1 && (
          <select
            className="sstpa-input"
            style={{ width: "auto", fontSize: "0.7rem", padding: "1px 4px" }}
            value={language}
            onChange={(e) => setLanguage(e.target.value as ModelTextLanguage)}
          >
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        )}
        <span style={{ flex: 1 }} />
        <button
          className="icon-button"
          style={{ fontSize: "0.68rem" }}
          title="Copy model text"
          disabled={!modelText.data}
          onClick={() => {
            if (modelText.data) void navigator.clipboard.writeText(modelText.data);
          }}
        >
          Copy
        </button>
        <button
          className="icon-button"
          style={{ fontSize: "0.68rem" }}
          title={`Export .${language === "KERML" ? "kerml" : "sysml"} file`}
          disabled={!modelText.data}
          onClick={exportFile}
        >
          Export
        </button>
        <button
          className="icon-button"
          style={{ fontSize: "0.68rem" }}
          title="Collapse"
          onClick={() => {
            setCollapsed(true);
            persist(true, width);
          }}
        >
          ▸
        </button>
      </div>
      <div className="model-text-content">
        {!soiHid && "// Select a System of Interest."}
        {modelText.isLoading && "// Translating…"}
        {modelText.isError &&
          `// Model translator not yet available on this Backend.\n// (${String(modelText.error)})`}
        {highlighted}
      </div>
    </div>
  );
}
