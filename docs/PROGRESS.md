# SSTPA Tools Progress Log

This file records implementation checkpoints and verification status while the
application is completed against `SSTPA Tool SRS V7.md`.

## 2026-07-04 — Production-readiness pass

Full-codebase audit against the SRS followed by fixes across every segment.

Backend (§3, §5):
- Closed a Cypher-injection vector in `deleteRelationship` (unknown relationship
  types are now rejected before interpolation).
- HID/uuid/UserName uniqueness enforced with database constraints (concurrent
  commits can no longer mint duplicate identities).
- Fixed protection-Requirement generation (§3.3.4.6.3): the previous `LIMIT 1`
  collapsed each batch to one Requirement and duplicated HIDs; now one
  Requirement per qualifying (entity, Asset) pair with distinct identities.
- Trace derivation recompute runs for every SoI whose trace edges moved,
  including scopeless commits and traced-entity deletions.
- Reference-clone notifications verify creation and roll back on missing mailbox
  (§5.6.6.8.1); Prometheus counters moved outside the managed transaction.
- Session tokens expire; `POST /api/auth/logout`, `GET /api/auth/status`, and
  `GET /api/auth/me` added; internal Neo4j URI no longer leaked from capability.
- `transferOwnership` commit op (§5.6.6.8.2); structured owner-change fields on
  notifications; per-user message deletion (§6.5.14.11); full Admin account
  lifecycle (§6.5.15: suspend/reinstate/disenroll-with-retention, two-step
  ADMIN authorization, roster counts).
- Model Translation API (§5.6.6.12, §3.7): G2M SysML/KerML projection, SSTPA
  Profile Library, M2G property-edit subset — see I-14/I-15.

Deploy/installer (§2, §5.7, §9):
- Removed the public `/metrics-proxy`; disabled Grafana anonymous access;
  compose requires explicit passwords.
- Portable, robust `load-reference-data.sh` (+ Windows `.ps1`).
- Installer redone: prerequisite checks, secrets never packaged, fresh
  per-install credentials, always-staged release binaries, uninstallers.
- Reference-data pipeline validated end to end (6,897 REF nodes loaded).

Startup/Frontend launch chain (§4):
- Fixed the dead 8543 backend port → Caddy 443 edge; health gate polls a
  proxied endpoint; first-run RootAdmin bootstrap; single sign-on handover to
  the GUI; CSP added to the Tauri webview.

GUI shell (§6.2–6.4):
- Data Drawer Add/Associate actions, safe drawer replacement, orphan
  assessment, staged-state clearing, keyboard-accessible dialogs.
- Main Panel schema-driven Add/Associate, Analysis section for all node types,
  error/retry states.
- Manifest-driven Branding-panel tools, working style switching (Nocturne dark
  style), Admin-hidden-from-users, per-tool Model Text Panel with highlighting
  and export.

Verification: `go test ./...`, backend integration suite (throwaway Neo4j:
auth, commit+trace derivation, ownership transfer, per-user message delete,
admin lifecycle, model translation) all green; `npm run build`; both Tauri
shells `cargo check`; live Docker stack exercised end to end with a seeded
FireSat project (trace inheritance and six protection Requirements verified,
Loss auto-build, G2M model text); GUI screenshotted via headless browser.

## 2026-07-04 — Loss Tool Integration

- Wired backend Loss Tool endpoints for attack-tree load, auto-build/rebuild,
  and bounded path enumeration.
- Scoped `[:AT_RELATES_TO]` deletes by `LossHID` in the commit pipeline and added
  Loss ownership/default-property validation for new attack-tree edges.
- Corrected attack-path enumeration so environment-only and other non-terminal
  leaves do not count as valid paths.
- Replaced the frontend Loss Tool scaffold with a working tool surface:
  Loss selection, trace coverage, tiered tree view, edge detail edits, path/RV
  analysis, metric definition editing, CSV export, and Markdown RV report export.
- Added backend unit tests for terminal path handling, Allowed RV classification,
  metric extraction, and TailoredOut path exclusion.

Verification:

- `cd backend && go test ./...`
- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Attack Tool Implementation

- Replaced the Attack Tool scaffold with a working SRS-shaped tool surface:
  entity roster, entity Attack associations, Attack creation, existing Attack
  association/removal, hierarchy management using `[:SUBORDINATE_TO]`, catalog
  view, asset-scope filtering based on CURRENT trace coverage, editable Attack
  details, `MetricsJSON` validation, `TARGETS_LOSS` scoping, and CSV/Markdown
  exports.
- Kept Attack Tool mutations on canonical Core Data (`(:Attack)`,
  `[:EXPLOITS]`, `[:SUBORDINATE_TO]`, `[:TARGETS_LOSS]`) and did not create
  Loss Tool-owned `[:AT_RELATES_TO]` edges.

Verification:

- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Goal Keeper Tool Implementation

- Replaced the Goal Keeper scaffold with a working GSN assurance-case tool:
  Asset/Loss/Root Goal structure selection, rooted GSN DAG display, evidence
  view, validation view, export view, search, GSN node editing, GSN node
  creation, existing-node linking, relationship removal, Solution evidence
  association, layout snapshot persistence, and Markdown/JSON exports.
- Uses canonical Core graph relationships: `[:SUPPORTED_BY]`,
  `[:IN_CONTEXT_OF]`, `[:HAS_VALIDATION]`, `[:HAS_VERIFICATION]`, and
  `[:HAS_LOSS]`.

Verification:

- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Use-Case Tool Implementation

- Replaced the Use-Case Tool scaffold with a working SysML-style Use Case tool:
  Use Case creation under Purpose, selection/search, actor list management,
  Interface and SystemFunction association/removal, inter-UseCase
  `[:INCLUDES_UC]` and `[:EXTENDS]` relationships with Extension Point capture,
  requirement allocation through participating Interfaces/Functions, validation,
  diagram snapshot persistence, and Markdown/JSON exports.
- Kept Requirements attached to participating `(:Interface)` and
  `(:SystemFunction)` nodes via `[:HAS_REQUIREMENT]`, matching the schema rule
  that Requirements are not directly related to `(:UseCase)`.

Verification:

- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Connection Tool Implementation

- Replaced the Connection Tool scaffold with a working graph-analysis tool:
  Connection creation, System ownership assignment/reassignment, Interface
  participant association/removal through `[:PARTICIPATES_IN]`, relationship
  edge-property editing, direct Connection requirements, selection/filter/display
  modes, validation, and Markdown/SysML/JSON exports.
- Implemented filters for owner System, System tier, OSI layer, directionality,
  participating Interface, and free-text Connection/participant search.

Verification:

- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Controls Tool Implementation

- Completed the missing `(:ControlsBaseline)` schema support in the embedded
  backend schema and mirrored docs schema, including `[:HAS_CONTROLS_BASELINE]`,
  categorization properties, analytical selection fields, `ControlsBaselineJSON`,
  lifecycle status, and active-baseline flag.
- Replaced the Controls Tool scaffold with a working table-first RMF baseline
  workflow: SoI baseline creation, C/I/A categorization, overlay capture, Cyber
  Resilience entries, Cyber Survivability Attribute entries with traceability,
  baseline control import/add/search, tailoring, mapping to Core
  `(:SecurityControl)` nodes, Requirement creation/allocation, Countermeasure
  creation/satisfaction/scope, validation, and CSV/KerML/JSON exports.

Verification:

- `cd backend && go test ./...`
- `cd frontend && npm run build`

SBOM impact: none. No software applications or libraries were added.

## 2026-07-04 — Installer Segment Implementation

- Added the `installer/` segment with package staging, optional Backend image
  build, optional Tauri bundle builds, optional Docker image archive capture,
  POSIX shell and Windows PowerShell install helpers, package manifests, and
  SHA-256 checksum generation.
- Added Tauri project ignore files and installer fallback behavior so package
  staging still emits release binaries on hosts where the Tauri CLI native
  bundler panics before bundling.
- Hardened the installer package manifest to report native bundle status per
  Tauri app and added a Linux inotify-capacity preflight so watcher-exhausted
  hosts use the release-binary fallback without a noisy CLI panic.
- Added validated Reference Data artifact packaging: the newest
  `sustainment/artifacts/sstpa-ref-data-*.tar.gz` is checksum-verified, staged
  under `payload/reference-data/`, recorded in `package.properties`, and surfaced
  by the install helpers with the load command.
- Updated Startup Software Frontend discovery so release-binary fallback
  packages launch the GUI from the installed `bundles/frontend/bin` directory.
- Updated `FloorPlan.md` for the new installer subdirectories and documented the
  installer path in README and architecture notes.
- Verified the lightweight package path with
  `./installer/scripts/build-package.sh --skip-tauri --skip-docker --version 0.1.0-test`.
  Verified the Tauri-enabled package path with
  `./installer/scripts/build-package.sh --skip-docker --version 0.1.0-tauri-smoke`.

Verification:

- `./installer/scripts/build-package.sh --skip-tauri --skip-docker --version 0.1.0-test`
- `./installer/scripts/build-package.sh --skip-docker --version 0.1.0-tauri-smoke`
- `cargo tauri build --no-bundle --ci` (observed host inotify instance exhaustion;
  release-binary fallback remains the supported package path on this host)
- Reference Data artifact verification through package staging:
  `sustainment/artifacts/sstpa-ref-data-2026-07-04-v1.tar.gz.sha256`
- `cd startup/src-tauri && cargo check`

SBOM impact: documented the Tauri CLI build tool version and the packaged
Reference Data artifact versions; container image tag entries were aligned to
`deploy/docker-compose.yml`.
