// Single inline SVG icon set for the GUI and Add-on Tool chrome
// (docs/DESIGN.md): 20×20 grid, 1.6px stroke, round caps, currentColor.
// Tool Manifests reference these glyphs by name (manifest Icon field).
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import type { CSSProperties } from "react";

const PATHS: Record<string, React.ReactNode> = {
  // Tool glyphs (Control Panel / tool windows)
  compass: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M12.8 7.2 11.2 11.2 7.2 12.8 8.8 8.8Z" />
    </>
  ),
  "list-checks": (
    <>
      <path d="m3.2 5.4 1.3 1.3 2.1-2.4" />
      <path d="m3.2 11.4 1.3 1.3 2.1-2.4" />
      <path d="M9.6 5.8h7.2M9.6 11.8h7.2M3.4 17h13.4" />
    </>
  ),
  "file-text": (
    <>
      <path d="M5 2.8h6.4L15.4 6.8v10.4H5Z" />
      <path d="M11.2 3v4h4" />
      <path d="M7.4 10.4h5.2M7.4 13.4h5.2" />
    </>
  ),
  book: (
    <>
      <path d="M10 5.2c-1.5-1.3-3.6-1.7-6.4-1.6v11.6c2.8-.1 4.9.3 6.4 1.6 1.5-1.3 3.6-1.7 6.4-1.6V3.6c-2.8-.1-4.9.3-6.4 1.6Z" />
      <path d="M10 5.2v11.6" />
    </>
  ),
  transition: (
    <>
      <circle cx="5.4" cy="6" r="2.6" />
      <circle cx="14.6" cy="14" r="2.6" />
      <path d="M5.4 8.6v2.2a3 3 0 0 0 3 3h3.4" />
      <path d="m10 11.2 2.4 2.6-2.4 2.6" />
    </>
  ),
  flow: (
    <>
      <path d="M3 5.6h7.6a3 3 0 0 1 3 3v2.8a3 3 0 0 0 3 3h.4" />
      <path d="m14.4 11.6 2.8 2.8-2.8 2.8" />
      <circle cx="4.6" cy="5.6" r="1.7" />
    </>
  ),
  layers: (
    <>
      <path d="m10 3 7 3.8-7 3.8-7-3.8Z" />
      <path d="m3.6 10.8 6.4 3.5 6.4-3.5" />
      <path d="m3.6 14 6.4 3.5 6.4-3.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M2.6 10h14.8M10 2.6c-4.3 4.4-4.3 10.4 0 14.8 4.3-4.4 4.3-10.4 0-14.8Z" />
    </>
  ),
  route: (
    <>
      <circle cx="4.8" cy="15.2" r="2.1" />
      <circle cx="15.2" cy="4.8" r="2.1" />
      <path d="M6.9 15.2h4.3a3 3 0 0 0 3-3V9.9a3 3 0 0 0-3-3h-.9" strokeDasharray="2.6 2.2" />
    </>
  ),
  tree: (
    <>
      <rect x="6.8" y="2.8" width="6.4" height="4" rx="1" />
      <rect x="2.4" y="13.2" width="6.4" height="4" rx="1" />
      <rect x="11.2" y="13.2" width="6.4" height="4" rx="1" />
      <path d="M10 6.8v3.2M10 10H5.6v3.2M10 10h4.4v3.2" />
    </>
  ),
  target: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <circle cx="10" cy="10" r="4" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="6.6" r="3.4" />
      <path d="M3.8 17.2c.7-3 3.2-4.6 6.2-4.6s5.5 1.6 6.2 4.6" />
    </>
  ),
  link: (
    <>
      <path d="M8.4 11.6a3.6 3.6 0 0 0 5.1 0l2.4-2.4a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3" />
      <path d="M11.6 8.4a3.6 3.6 0 0 0-5.1 0l-2.4 2.4a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3" />
    </>
  ),
  mail: (
    <>
      <rect x="2.8" y="4.4" width="14.4" height="11.2" rx="1.6" />
      <path d="m3.4 5.6 6.6 5.2 6.6-5.2" />
    </>
  ),
  shield: (
    <>
      <path d="M10 2.6 16.4 5v5.2c0 4-2.7 6.4-6.4 7.8-3.7-1.4-6.4-3.8-6.4-7.8V5Z" />
      <path d="m7.2 9.8 2 2 3.6-3.8" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="10" cy="10" r="6.2" />
      <path d="M10 1.8v3.4M10 14.8v3.4M1.8 10h3.4M14.8 10h3.4" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 6h4.4M11 6h6M3 14h6M12.6 14h4.4" />
      <circle cx="9.2" cy="6" r="1.9" />
      <circle cx="10.8" cy="14" r="1.9" />
    </>
  ),

  // Chrome glyphs
  gear: (
    <>
      <circle cx="10" cy="10" r="3.1" />
      <path d="M10 2.4v2.2M10 15.4v2.2M2.4 10h2.2M15.4 10h2.2M4.6 4.6l1.6 1.6M13.8 13.8l1.6 1.6M15.4 4.6l-1.6 1.6M6.2 13.8l-1.6 1.6" />
    </>
  ),
  power: (
    <>
      <path d="M10 2.8v6.4" />
      <path d="M13.9 5.2a6.6 6.6 0 1 1-7.8 0" />
    </>
  ),
  trash: (
    <>
      <path d="M3.6 5.6h12.8M8 5.4V3.6h4v1.8M5.2 5.8l.8 10.6h8l.8-10.6" />
      <path d="M8.4 8.6v4.8M11.6 8.6v4.8" />
    </>
  ),
  pencil: (
    <>
      <path d="m3.4 16.6.7-3.2 9.3-9.3a1.7 1.7 0 0 1 2.5 0 1.7 1.7 0 0 1 0 2.5l-9.3 9.3Z" />
      <path d="m12.2 5.3 2.5 2.5" />
    </>
  ),
  x: <path d="m5.2 5.2 9.6 9.6M14.8 5.2l-9.6 9.6" />,
  "arrow-up": <path d="M10 16.4V3.8M5.4 8.2 10 3.6l4.6 4.6" />,
  wrench: (
    <>
      <path d="M12.6 2.9a4.4 4.4 0 0 0-4.9 6L3 13.6a2 2 0 1 0 2.9 2.9l4.7-4.7a4.4 4.4 0 0 0 6-4.9l-2.9 2.9-2.6-.5-.5-2.6Z" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      {glyph}
    </svg>
  );
}
