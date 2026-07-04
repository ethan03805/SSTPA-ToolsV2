// Gear menu (SRS §6.3.1, §3.1): style selection, product/license info,
// example-data reset.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useQuery } from "@tanstack/react-query";
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
  const [style, setStyle] = useState<StyleName>(activeStyle());
  const underConstruction = useUnderConstruction((s) => s.show);

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
        <div
          style={{
            padding: "6px 8px",
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Style</span>
          <select
            className="sstpa-input"
            style={{ flex: 1 }}
            value={style}
            onChange={(e) => {
              const next = e.target.value as StyleName;
              setStyle(next);
              applyStyle(next);
            }}
          >
            {availableStyles.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {item("Reset example data…", () => {
          underConstruction("Example data reset");
          onClose();
        })}
      </div>
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
        {/* The heritage logo's one ceremonial home (docs/DESIGN.md). */}
        <img
          src="/sstpa-logo-large.png"
          alt=""
          style={{ maxWidth: 200, display: "block", margin: "0 auto var(--sstpa-sp-3)" }}
        />
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
