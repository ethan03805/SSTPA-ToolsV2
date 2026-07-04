// GUI style selection (SRS §6.2.1): the default style plus alternates are
// token overrides applied via a root attribute; the choice persists per
// machine and is exposed to Add-on Tools through the Tool Launch Context.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

export type StyleName = "default" | "nocturne";

export const availableStyles: { name: StyleName; label: string }[] = [
  { name: "default", label: "SSTPA Default (ivory)" },
  { name: "nocturne", label: "Nocturne (dark)" },
];

const STORAGE_KEY = "sstpa.style";

export function activeStyle(): StyleName {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "nocturne" ? "nocturne" : "default";
}

export function applyStyle(name: StyleName) {
  document.documentElement.setAttribute("data-sstpa-style", name);
  localStorage.setItem(STORAGE_KEY, name);
}

/** Apply the persisted style at startup (called from main.tsx). */
export function initStyle() {
  document.documentElement.setAttribute("data-sstpa-style", activeStyle());
}
