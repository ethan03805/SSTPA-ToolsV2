# SSTPA Tools Progress Log

This file records implementation checkpoints and verification status while the
application is completed against `SSTPA Tool SRS V7.md`.

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

## 2026-07-04 — SysML 2.0 / KerML 1.0 model display (G2M translator)

New standing directive: every model-displaying Add-on Tool except the Message
Center must display its model from SysML 2.0 / KerML 1.0-transformed data.

- Implemented the G2M translator (`backend/internal/model`): Core Data Model
  graph → SysML 2.0 / KerML 1.0 textual notation per §3.7.5/§3.7.6, plus the
  SSTPA Profile Library (§3.7.3). Deterministic and idempotent (§3.7.8):
  ordered by HID type-identifier then sequence; unrestricted names for HIDs
  and reserved words.
- Exposed `/api/model/sysml`, `/api/model/kerml`, `/api/model/profile`,
  `/api/model/validate`, `/api/model/commit` (§5.6.6.12); capability discovery
  advertises `model.translate.read` and `model.profile.read`.
- Wired the Model Text Panel (§6.4.2) to live G2M with SysML/KerML keyword
  highlighting. Verified in the running app (Requirements Tool shows the live
  SysML projection of the SoI). SysML notation sourced from the SysML_Vault.
- Corrected three tool manifests to match their SRS Model Text Panel sections
  (Reports, Reference, Context) so all model tools declare SysML/KerML.
- Fixed a pre-existing `handleRequirementsBySoI` Cypher bug (ORDER BY after an
  aggregating RETURN) surfaced during verification.
- Added G2M unit tests (determinism, SysML/KerML mappings, domain
  classification, unrestricted names). `go test ./internal/model/` passes.
- M2G text-commit deferred (read-only panel); recorded in REQUIREMENTS-NOTES
  M-4. Editing remains on the canvas/Data Drawer staged-commit path.

Verification:
- `cd backend && go test ./internal/model/ ./internal/schema/`
- Live G2M: `GET /api/model/sysml?scope=SOI&soi=SYS_1_0` returns valid SysML 2.0.
- Playwright: Model Text Panel renders highlighted SysML in the Requirements Tool.

SBOM impact: none (no new libraries; G2M is pure Go stdlib).

## 2026-07-04 — FireSat example data (§3.6) + Help data (§3.5)

- FireSat exemplar (`backend/internal/api/example.go`): a 3-tier-deep example
  Project (FireSat Capability → FireSat → Satellite Bus → Infrared Sensor) with
  environments, states + transitions, components, functions, interfaces, a
  connection, primary + derived assets, trace relationships, a hazard→control→
  countermeasure→attack chain, a Loss + root Goal, and requirements. Owned by
  "SSTPA Tools" (immutable ownership); IsExampleData/ExampleProject markers.
- Namespaced HID indices (FS1, FS1.1, FS1.1.1) partition the exemplar from the
  working Capability; HID grammar relaxed to accept alphanumeric index segments
  (REQUIREMENTS-NOTES I-13). Seeded on startup if absent.
- Reset endpoint (`POST /api/examples/reset`) + `GET /api/examples`; wired to
  the gear-menu "Reset FireSat example" action (§3.6).
- Help Data (`backend/internal/api/help.go`): 24-entry SSTPA terminology/field/
  tutorial catalog at `GET /api/help`, shown in the gear-menu "Hover help &
  definitions" dialog (§3.5, REQUIREMENTS-NOTES I-14).
- End-to-end verified on FireSat:
  - Navigator renders the full 3-tier hierarchy (Playwright shot 11).
  - G2M SysML/KerML projects every FireSat SoI including the deepest.
  - Loss Tool auto-build on LOS_FS1_1 produced an 8-node attack tree, 1 path:
    "Compromise FireSat Authenticity → Downlinking → Downlink Radio →
    RF Alert Spoofing → Digital Signature of Alerts [BLOCKED]" — the full
    trace→loss→attack-tree→path-analysis workflow working on real example data.

Verification:
- `cd backend && go test ./...` (all pass)
- Live: startup seeds FireSat; `POST /api/examples/reset` reloads; `/api/help`
  returns 24 entries; Loss auto-build + path enumeration succeed on FireSat.

SBOM impact: none.
