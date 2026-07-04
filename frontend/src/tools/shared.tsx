// Shared Add-on Tool building blocks: uniform loading/error/empty states,
// diagram export (PNG + SVG per the §6.5.x export SHALLs), text download,
// and a styled prompt dialog replacing window.prompt.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import type { Core } from "cytoscape";
import cytoscape from "cytoscape";
// @ts-expect-error cytoscape-svg ships no type declarations
import svg from "cytoscape-svg";
import { useState, type ReactNode } from "react";
import { ApiError } from "../api/client";

let svgRegistered = false;
function ensureSvg() {
  if (!svgRegistered) {
    cytoscape.use(svg);
    svgRegistered = true;
  }
}

/** Export a cytoscape canvas as PNG (full graph or current viewport). */
export function exportPng(cy: Core, filename: string, full = true) {
  const uri = cy.png({ full, scale: 2, bg: "#ffffff" });
  const a = document.createElement("a");
  a.href = uri;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
}

/** Export a cytoscape canvas as SVG (full graph or current viewport). */
export function exportSvg(cy: Core, filename: string, full = true) {
  ensureSvg();
  const svgText = (
    cy as unknown as { svg: (o: { full: boolean; scale: number; bg: string }) => string }
  ).svg({ full, scale: 1, bg: "#ffffff" });
  downloadText(
    filename.endsWith(".svg") ? filename : `${filename}.svg`,
    svgText,
    "image/svg+xml",
  );
}

/** Download text content as a file. */
export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Uniform error message extraction. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    return e.detail ? `${e.message}: ${e.detail}` : e.message;
  }
  return String(e);
}

/** Uniform tool status surface: loading / error(+retry) / SoI-missing /
 *  empty. Render it instead of the tool body while the condition holds. */
export function ToolStatus({
  loading,
  error,
  onRetry,
  needsSoI,
  empty,
  emptyHint,
}: {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  needsSoI?: boolean;
  empty?: string | false;
  emptyHint?: ReactNode;
}) {
  if (needsSoI) {
    return (
      <div style={{ padding: 24, color: "var(--sstpa-navy-muted)", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--sstpa-font-brand)", fontSize: "1.05rem" }}>
          Select a System of Interest first
        </p>
        <p style={{ fontSize: "0.82rem" }}>
          Use the System of Interest Panel or the Navigator Tool, then reopen
          this tool.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--sstpa-navy-muted)" }}>Loading…</div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div className="sstpa-alert-error">
          {errorText(error)}
          {onRetry && (
            <button
              className="sstpa-button secondary"
              style={{ marginLeft: 12, padding: "2px 10px" }}
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }
  if (empty) {
    return (
      <div style={{ padding: 24, color: "var(--sstpa-navy-muted)", textAlign: "center" }}>
        <p>{empty}</p>
        {emptyHint && <div style={{ fontSize: "0.82rem" }}>{emptyHint}</div>}
      </div>
    );
  }
  return null;
}

/** Styled replacement for window.prompt: a small modal with one text input.
 *  Usage: const prompt = usePrompt(); … prompt.ask("New State name", (v) => …);
 *  Render {prompt.element} once in the tool. */
export function usePrompt() {
  const [state, setState] = useState<{
    title: string;
    placeholder?: string;
    initial?: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [value, setValue] = useState("");

  const ask = (
    title: string,
    onSubmit: (value: string) => void,
    opts?: { placeholder?: string; initial?: string },
  ) => {
    setValue(opts?.initial ?? "");
    setState({ title, onSubmit, ...opts });
  };

  const element = state ? (
    <div className="sstpa-dialog-overlay" onClick={() => setState(null)}>
      <div
        className="sstpa-frame sstpa-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={state.title}
      >
        <h2 style={{ fontSize: "1rem" }}>{state.title}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (v) {
              state.onSubmit(v);
              setState(null);
            }
          }}
        >
          <input
            className="sstpa-input"
            autoFocus
            value={value}
            placeholder={state.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setState(null);
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 12,
            }}
          >
            <button
              type="button"
              className="sstpa-button secondary"
              onClick={() => setState(null)}
            >
              Cancel
            </button>
            <button className="sstpa-button" disabled={!value.trim()}>
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return { ask, element };
}
