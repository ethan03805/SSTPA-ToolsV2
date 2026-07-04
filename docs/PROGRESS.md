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
