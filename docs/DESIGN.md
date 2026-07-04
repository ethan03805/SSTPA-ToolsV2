# SSTPA Tools — UI design system ("Instrument")

This document is the authoritative description of the redesigned GUI visual
language introduced on the `ui-redesign` branch. It replaces the former
Art Nouveau / drafting-card identity everywhere (GUI, Add-on Tools, Startup
launcher, app icons). The SRS §6.2/§6.3 visual-identity clauses are
deliberately deviated from; see `REQUIREMENTS-NOTES.md` I-17.

## Brief

SSTPA Tools is a desktop workbench for model-based system security
engineering. Its users are systems/security engineers spending long sessions
reading and editing a large typed graph. The UI's single job is to make that
graph legible and its editing fast. The design target is a **precision
instrument**: one unified, clean, minimalist language — no ornament, no
gradients, no decorative borders, no emoji glyphs.

## Principles

1. **Hierarchy from spacing and weight, not decoration.** Hairline borders
   and background steps are the only separators. Shadows exist only under
   true overlays (dialogs, tool windows, menus).
2. **Ink acts, indigo points.** Buttons and controls are ink-colored
   (neutral). The indigo accent is reserved exclusively for *state*:
   selection, focus, the active thing. If something is indigo, it is where
   you are — never mere decoration.
3. **The HID is the signature.** The app's most characteristic artifact is
   the hierarchical identifier (`SYS_1_0`, `EL_1.2_4`). It is always set in
   the mono face inside a quiet chip. The HID chip + node-type color tick is
   the one memorable visual device, and it encodes real information.
4. **The logo is ceremonial.** The heritage Art Nouveau logo appears only in
   the Product & License dialog. All chrome uses the new geometric
   control-loop mark, used sparingly and small.

## Tokens

Semantic names (all `--sstpa-*`); values per style. Light is default; Dark
("nocturne") is the alternate selected from the gear menu.

### Surfaces & ink

| Token | Light | Dark |
|---|---|---|
| `bg` (app background) | `#F4F5F7` | `#14161A` |
| `surface` (cards, panels) | `#FFFFFF` | `#1D2026` |
| `inset` (wells, chips) | `#ECEEF1` | `#101216` |
| `text` | `#1A1D23` | `#E6E8EC` |
| `text-strong` | `#0E1013` | `#FFFFFF` |
| `muted` | `#5D6674` | `#9AA3B0` |
| `line` (border) | `#D9DCE1` | `#333842` |
| `line-soft` (hairline) | `#E9EBEE` | `#262A31` |

### Accent & status

| Token | Light | Dark |
|---|---|---|
| `accent` (selection/focus/active) | `#3B4FD8` | `#7C90F0` |
| `accent-soft` | `#AAB5EE` | `#3A4467` |
| `accent-alt` (secondary/meta) | `#0F8577` | `#3FB3A2` |
| `status-ok` | `#1B7F4B` | `#4CC38A` |
| `status-warn` | `#9A6700` | `#D9A54A` |
| `status-error` | `#BE3536` | `#E5726B` |
| `status-info` | `#2270C4` | `#6CA9E8` |

### Node-type categorical palette

Validated with the dataviz palette validator (all checks pass; light on
`#FFFFFF`, dark on `#1D2026`; dark worst adjacent CVD ΔE 9.0 is floor-band
legal because every badge and graph node carries its type name as text).
System/Element are deliberately recessive structural slates (scaffolding, not
series) and sit outside the validated categorical set.

| Type token | Light | Dark |
|---|---|---|
| `node-system` | `#3D4E80` | `#94A5CE` |
| `node-element` | `#5F6B78` | `#94A0AD` |
| `node-function` | `#2276C7` | `#4A8FE0` |
| `node-interface` | `#128A65` | `#23997A` |
| `node-state` | `#7048B6` | `#9678E2` |
| `node-asset` | `#96660A` | `#B8891F` |
| `node-security` | `#C13434` | `#E2685F` |
| `node-purpose` | `#A0446E` | `#CE6E9C` |
| `node-environment` | `#5A7A28` | `#7CA13C` |
| `node-connection` | `#1E7CAB` | `#3E97CA` |
| `node-muted` | `#8B94A1` | `#6B7683` |

Badges are tinted chips (12% type color background, type-color text), not
solid blocks — color identifies, text names.

### Type

- **UI face:** IBM Plex Sans 400/500/600 (OFL-1.1, bundled woff2). Chosen for
  its engineering heritage and small-size clarity; deliberately not the
  ubiquitous default sans.
- **Data face:** JetBrains Mono 400/700 (OFL-1.1, bundled) — HIDs, hosts,
  versions, model text.
- **No display face.** Headings are the UI face at 600 with tight sizes.
  The former Cormorant SC small-caps serif is removed.
- Base 14px/1.5; section eyebrows 11px/600/0.08em uppercase in `muted`.

### Geometry & motion

- Radius: 6px controls, 10px overlays. Borders 1px.
- Spacing scale unchanged (`sp-1..8`).
- Motion: 140/220ms, `cubic-bezier(0.2, 0, 0, 1)`; reduced-motion respected.
- Focus: 2px `accent` outline, offset 1px.

## Layout (unchanged IA, SRS §6.3)

Branding Panel → slim 48px bar: mark + wordmark left, status/user/icon
buttons right. Control Panel → 56px toolbar of icon+label buttons (SVG line
icons, 1.6px stroke — no emoji). SoI Panel → context strip with HID chips.
Main Panel → flat cards, hairline separation. Data Drawer → right sheet,
hairline + overlay shadow. Tool windows → floating surfaces, radius 10,
overlay shadow.

## Iconography

Single inline SVG set (`src/components/Icon.tsx`), 20×20 viewBox, stroke
`currentColor` 1.6, round caps/joins. Tool manifests reference icons by name.
The app/taskbar icon is a new flat mark: white control-loop glyph (controller
and process blocks joined by a circulating feedback loop — the STPA core) on
an indigo `#3B4FD8` rounded square.

## Self-critique (recorded per design process)

Against the generic-default failure modes: not warm-cream + serif +
terracotta (that was the *old* theme; fully removed), not near-black + acid
accent (dark mode is layered cool grays with a restrained periwinkle accent),
not broadsheet hairline-brutalism (radius, tinted chips, and a single accent
keep it soft). The deliberate risk: retiring the client's logo from all
chrome in favor of a drafted control-loop mark — justified because the brief
demands the Art Nouveau identity gone and the logo is that identity.
