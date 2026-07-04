// Gear menu (SRS §6.3.1, §3.1): style selection, product/license info,
// example-data reset.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useUnderConstruction } from "../state/stores";
import {
  activeStyle,
  applyStyle,
  availableStyles,
  type StyleName,
} from "../styles/styles";

export function GearMenu({ onClose }: { onClose: () => void }) {
  const [showProduct, setShowProduct] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const underConstruction = useUnderConstruction((s) => s.show);
  const qc = useQueryClient();

  const reset = useMutation({
    mutationFn: () => api.resetExample("FireSat"),
    onSuccess: () => {
      setResetMsg("FireSat example reset to defaults.");
      void qc.invalidateQueries();
    },
    onError: (e) => setResetMsg(`Reset failed: ${String(e)}`),
  });

  const item = (label: string, onClick: () => void) => (
    <button
      className="icon-button"
      style={{ display: "block", width: "100%", textAlign: "left", border: "none" }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
        onClick={onClose}
      />
      <div
        className="sstpa-frame"
        style={{
          position: "absolute",
          right: 0,
          top: "110%",
          zIndex: 50,
          minWidth: 240,
          padding: "var(--sstpa-sp-3)",
          boxShadow: "var(--sstpa-shadow-popup)",
        }}
      >
        {item("Product & license information", () => {
          setShowProduct(true);
        })}
        {item("Select style…", () => {
          underConstruction("Alternate styles");
          onClose();
        })}
        {item("Hover help & definitions…", () => {
          setShowHelp(true);
        })}
        {item(
          reset.isPending ? "Resetting FireSat…" : "Reset FireSat example",
          () => reset.mutate(),
        )}
        {resetMsg && (
          <div className="sstpa-alert-warning" style={{ marginTop: 6, fontSize: "0.72rem" }}>
            {resetMsg}
          </div>
        )}
      </div>
      {showHelp && (
        <HelpDialog
          onClose={() => {
            setShowHelp(false);
            onClose();
          }}
        />
      )}
      {showProduct && (
        <ProductDialog
          onClose={() => {
            setShowProduct(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

function ProductDialog({ onClose }: { onClose: () => void }) {
  const product = useQuery({ queryKey: ["product"], queryFn: api.product });
  const p = (product.data?.product ?? {}) as Record<string, unknown>;
  const components = (product.data?.components ?? []) as Record<
    string,
    unknown
  >[];

  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div
        className="sstpa-frame sstpa-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>SSTPA Tools</h2>
        <p className="mono" style={{ fontSize: "0.78rem" }}>
          Version {String(p.Version ?? "—")} · Build{" "}
          {String(p.BuildNumber ?? "—")}
        </p>
        <p style={{ fontSize: "0.82rem" }}>
          2025 Nicholas Triska. All rights reserved. The SSTPA Tools software
          and all associated modules, binaries, and source code are proprietary
          intellectual property of Nicholas Triska. Unauthorized reproduction,
          modification, or distribution is strictly prohibited. Licensed copies
          may be used under specific contractual terms provided by the author.
        </p>
        <p style={{ fontSize: "0.82rem" }}>
          Users retain ownership of data and reports generated during
          legitimate use of the software, except for embedded proprietary
          schemas and templates.
        </p>
        {components.length > 0 && (
          <>
            <h2 style={{ fontSize: "1rem" }}>Open-source components</h2>
            <ul style={{ fontSize: "0.78rem" }}>
              {components.map((c, i) => (
                <li key={i} className="mono">
                  {String(c.Name)} {String(c.Version)} — {String(c.License)}
                </li>
              ))}
            </ul>
          </>
        )}
        <div style={{ textAlign: "right" }}>
          <button className="sstpa-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hover Help & definitions viewer (SRS §3.5). */
function HelpDialog({ onClose }: { onClose: () => void }) {
  const help = useQuery({ queryKey: ["help"], queryFn: api.help });
  const [filter, setFilter] = useState("");
  const entries = (help.data?.help ?? []).filter(
    (e) =>
      !filter ||
      e.term.toLowerCase().includes(filter.toLowerCase()) ||
      e.definition.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="sstpa-dialog-overlay" onClick={onClose}>
      <div
        className="sstpa-frame sstpa-dialog"
        style={{ minWidth: 560, maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>SSTPA Help & Definitions</h2>
        <input
          className="sstpa-input"
          placeholder="Search terms…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        <div style={{ maxHeight: "56vh", overflow: "auto", marginTop: 10 }}>
          {entries.map((e) => (
            <div key={e.term} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: "var(--sstpa-navy)" }}>
                {e.term}{" "}
                <span
                  className="type-badge"
                  style={{ background: "var(--sstpa-node-muted)", fontSize: "0.6rem" }}
                >
                  {e.category}
                </span>
              </div>
              <div style={{ fontSize: "0.84rem" }}>{e.definition}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button className="sstpa-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
