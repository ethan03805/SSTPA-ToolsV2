# SSTPA Tools — developer guide

Model-Based System Security Engineering application implementing the SSTPA
methodology. The authoritative specification is `SSTPA Tool SRS V7.md`; every
interpretation or best-judgement deviation is recorded in
`docs/REQUIREMENTS-NOTES.md` (items I-1 … I-15). Read that file before changing
behavior that seems to contradict the SRS — the contradiction is probably
already resolved there.

## Architecture (four independently operable segments, SRS §2)

- `backend/` — Go REST API (chi router, neo4j-go-driver), the single source of
  truth for the Core Data Model. All mutations flow through `POST /api/commit`
  as a staged delta executed in one ACID transaction (`internal/api/commit.go`).
  The canonical schema is embedded machine-readable JSON in
  `internal/schema/data/`.
- `frontend/` — Tauri + React + TypeScript desktop GUI. Main window
  (`src/components/`) plus manifest-driven Add-on Tools (`src/tools/`, one dir
  per tool, registered in `src/tools/manifest.ts` and `ToolShell.tsx`).
- `startup/` — Tauri launcher: starts the Backend, authenticates (first-run
  RootAdmin bootstrap), hands the session to the GUI, stops the Backend on exit.
- `installer/` — packaging + install/uninstall helpers (Linux/macOS/Windows).

Supporting: `deploy/` (Docker Compose: Caddy edge on 443, Neo4j, backend, OTel
Collector → Tempo, Prometheus, Grafana), `sustainment/` (offline Python pipeline
that builds the validated Reference Data artifact), `docs/`.

## Key model concepts

- **HID** (`internal/schema/hid.go`): `TYPE_INDEX_SEQUENCE`, e.g. `SYS_1_0`,
  `EL_1.2_4`. The middle segment is the SoI (sub-graph) index; every node in a
  sub-graph shares it. Uniqueness is enforced by DB constraints.
- **SoI** = one System's sub-graph. The Main Panel and most tools operate on the
  current SoI (`useSoI` store).
- **Trace** relationships (`HOLDS`/`TRANSPORTS`/`USES`) are State-scoped and
  never deleted — they are superseded (audit trail). Committing them triggers
  server-side derivation: criticality/assurance inheritance and protection
  Requirement generation (`recomputeTraceDerivations`).
- **Tool authority**: `[:AT_RELATES_TO]` (Attack Tree edges) may be mutated only
  from the Loss Tool (`toolId: "sstpa.loss"`); the commit pipeline enforces it.

## Build & test

```bash
# Backend
cd backend && go test ./...                      # unit tests (hermetic)
./scripts/integration-test.sh                    # full stack vs throwaway Neo4j

# Frontend
cd frontend && npm run build                     # tsc + vite
npm run lint                                      # oxlint

# Tauri shells
(cd frontend/src-tauri && cargo check)
(cd startup/src-tauri && cargo check)

# Model translation (G2M/M2G) unit tests
cd backend && go test ./internal/model/

# Stack
cd deploy && docker compose up -d
./load-reference-data.sh ../sustainment/artifacts/sstpa-ref-data-*.tar.gz
```

Shared Add-on Tool helpers live in `frontend/src/tools/shared.tsx`
(`ToolStatus` for loading/error/empty, `exportPng`/`exportSvg`, `downloadText`,
`usePrompt`) — use them instead of hand-rolling states or `window.prompt`.

## Conventions

- Never widen `systemManagedProps` from the client — those are Backend-assigned.
- New Add-on Tool = a manifest entry + a lazy component + a registry line; no
  other wiring. Tools receive a `ToolLaunchContext` (current SoI, invoking node,
  cross-tool `focusHid`).
- Design language: the minimalist "Instrument" system — see `docs/DESIGN.md`.
  Reuse `sstpa-*` CSS classes and `var(--sstpa-*)` tokens
  (`src/styles/sstpa-default.css`); no per-component stylesheets; SVG glyphs from
  `src/components/Icon.tsx` (never emoji). The GUI ships Light (default) and
  Dark ("nocturne") styles, switchable from the gear menu.
- Commit to git often; keep `docs/PROGRESS.md` current.
