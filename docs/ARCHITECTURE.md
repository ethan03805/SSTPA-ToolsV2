# SSTPA Tools — Architecture

This document records the implemented architecture and the design decisions taken
where the SRS (SSTPA Tool SRS V7) grants discretion. SRS section references are given
throughout as (§n).

## 1. Segments (§2)

SSTPA Tools is implemented as four independently operable segments:

| Segment | Directory | Technology |
|---|---|---|
| Startup Software | `startup/` | Tauri (Rust + web UI) launcher |
| Backend | `backend/`, `deploy/` | Go + Neo4j + Docker Compose |
| Frontend | `frontend/` | Tauri + React + TypeScript |
| Installer | `installer/` | Platform bundling scripts |

The Sustainment Environment (§9) lives in `sustainment/` and runs only on the
development system — never on a deployed SSTPA Tools installation.

## 2. Backend (§5)

```
Client ──HTTPS:443──▶ Caddy ──HTTP:8080──▶ Go backend (chi + neo4j driver)
                                              │            │
                                        Bolt:7687     OTLP:4317/4318
                                              ▼            ▼
                                           Neo4j     OTel Collector ──▶ Tempo
                                        Community           │
                                                       Prometheus ◀─scrape─ /metrics
                                                            │
                                                        Grafana (via Caddy)
```

- **Language**: Go (latest stable; see SBOM). Router: `chi`. Driver: official
  `neo4j-go-driver`. Instrumentation: OpenTelemetry SDK + Prometheus client.
- **Database**: Neo4j Community Edition, latest stable, executing CYPHER 25 (§5, §5.6.1).
  Bolt is internal-only.
- **Networks**: Docker networks `edge` (Caddy + Grafana exposure) and `backend`
  (all services). Only Caddy is internet-facing (§5.1, §5.2, §5.7).
- **Telemetry**: OTel Collector receives OTLP from the backend and exports traces to
  Tempo; Prometheus scrapes `backend:8080/metrics`; Grafana dashboards proxied by
  Caddy (§5.6.2–5.6.5).
- **API**: REST, JSON over HTTPS; all mutations transactional (ACID) with
  validation-before-commit; ownership change notifications generated in the same
  transaction as data mutations (§5.6.6).
- **Loss Tool API**: authenticated endpoints expose scoped attack-tree load,
  auto-build/rebuild, and bounded path enumeration (`/api/loss/{lossHid}/tree`,
  `/api/loss/{lossHid}/auto-build`, `/api/loss/{lossHid}/paths`). Attack Tree
  structure remains authoritative in `[:AT_RELATES_TO]` graph edges; layout and
  validation snapshots remain persisted on `(:Loss).AttackTreeJSON` (§6.5.10).
- **Schema enforcement**: the Backend is authoritative for node labels, relationship
  types/direction/cardinality, SoI membership (HID Index), recursive traversal bounds,
  duplicate-relationship prevention, HID/uuid assignment, ownership and notification
  (§3.3, §6.4). Canonical machine-readable schema extracts generated from the SRS live
  in `docs/schema/` and are compiled into the backend.

## 3. Core Data Model (§3.3)

- Graph of SoI sub-graphs; each SoI rooted at exactly one `(:System)`; SoI membership
  keyed by **HID Index**. HID format `{TYPE}_{INDEX}_{SEQUENCE}` (e.g. `SYS_1.2.3_0`);
  each node also carries a `uuid` (§3.3.8).
- Child systems are created via `(:Component)-[:PARENTS]->(:System)` with prescribed
  default-node creation and requirement/asset cloning behavior (§3.3.7).
- Every node has Owner/Creator (email-backed); commits by non-owners generate
  CHANGE_NOTIFICATION messages to the owner's mailbox inside the same transaction
  (§3.2, §3.3.9.1, §5.6.6.8.1).
- Asset trace relationships `[:HOLDS] [:TRANSPORTS] [:USES]` carry trace metadata
  (TraceStateHID, TraceVersion, TraceStatus …); criticality/assurance inheritance is
  computed OR-union across CURRENT relationships; protection requirements are
  auto-generated per true assurance property (§3.3.4.6.x).
- Attack trees are `[:AT_RELATES_TO]` DAGs scoped by `LossHID`, managed exclusively by
  the Loss Tool (§3.3.4.11).

## 4. Reference Data (§3.4, §9)

Read-only framework graphs, partitioned from Core data, loaded from a versioned
Cypher artifact produced by the Sustainment pipeline (`sustainment/`):

- MITRE ATT&CK (Enterprise / ICS / Mobile) — STIX 2.1 → `(:AK_*)` nodes
- MITRE ATLAS — ATLAS.yaml → `(:AT_*)` nodes
- NIST SP 800-53 Rev 5 — OSCAL JSON → `(:NIST_*)` nodes
- MITRE EMB3D — STIX → `(:EMB3D_*)` nodes
- Cyber Resiliency (CREF) & Cyber Survivability Attributes data (§9.6)

Users clone reference properties into owned Core nodes via `[:REFERENCES]` (§3.4.6).

## 5. Frontend (§6)

- **Stack** (§6.1): Tauri, React, TypeScript, Vite, Tailwind CSS; Radix-style headless
  primitives; Framer Motion; Zustand (UI state); TanStack Query (server state);
  react-virtual (large lists); Cytoscape.js + fcose (graph popups); AG Grid (RTM,
  search results, report tables).
- **Main window** (§6.3): Branding Panel, Control Panel (tool icons + red Shutdown),
  SoI Panel (hierarchy navigation), Main Panel (collapsible node-type sections →
  entity cards → relationship groups, progressive disclosure), and a right-side
  Data Drawer as the single edit surface with staged edits and Commit confirmation.
- **Style** (§6.2): `sstpa-default.css` design tokens; ivory surfaces, deep navy
  typography, restrained Art Nouveau framing, drafting-card aesthetic. Fonts:
  Source Sans 3 (UI), Cormorant SC (branding/headings), JetBrains Mono (identifiers) —
  all open-source, bundled for air-gapped deployment.
- **Add-on Tools** (§6.4): manifest-driven extension architecture; tools run in popup
  windows using a common shell (header, SoI display, Commit/Cancel/Close, validation
  display, Model Text Panel when the manifest declares model languages). Tools access
  data only through the staged-edit/Commit model backed by Backend validation.
- **Use-Case Tool** (§6.5.12): manages `(:UseCase)` definitions under
  `(:Purpose)-[:HAS_USECASE]->(:UseCase)`, actor lists, `[:INVOLVES]`
  Interface links, `[:INCLUDES]` SystemFunction links, inter-use-case
  `[:INCLUDES_UC]`/`[:EXTENDS]` links, requirement allocation through
  participating Interfaces/Functions, validation findings, diagram snapshots, and
  Markdown/JSON exports.
- **Connection Tool** (§6.5.13): manages System-owned `(:Connection)` nodes via
  `(:System)-[:HAS_CONNECTION]->(:Connection)`, participating Interface ends via
  `(:Interface)-[:PARTICIPATES_IN]->(:Connection)` including edge properties,
  owner reassignment, Connection-authored requirements, schema validation,
  System/tier/property filters, canvas visualization, and Markdown/SysML/JSON
  exports.
- **Controls Tool** (§6.5.17): manages the active SoI `(:ControlsBaseline)` via
  `(:System)-[:HAS_CONTROLS_BASELINE]->(:ControlsBaseline)`, C/I/A
  categorization, overlays, Cyber Resilience entries, Cyber Survivability
  Attribute entries, `ControlsBaselineJSON`, control tailoring, mapping to
  Core `(:SecurityControl)` nodes, Countermeasure satisfaction, Requirement
  generation/allocation, validation, and CSV/KerML/JSON exports.

## 6. SysML 2.0 / KerML 1.0 Interchange (§3.7)

Backend-resident translators: **G2M** (graph → SysML/KerML text) and **M2G**
(text → staged graph mutations), with the SSTPA Profile Library (KerML package)
shipped with the product. Deterministic, idempotent output; round-trip conformance
tests (`M2G(G2M(g)) = ∅`) run in the development pipeline. Exposed via
`/api/model/*` endpoints (§5.6.6.12).

## 7. Decisions Taken Where the SRS Grants Discretion

| # | Decision | Rationale |
|---|---|---|
| D-1 | Monorepo with all four segments plus sustainment | Single-source-of-truth versioning; the Installer is built from one tree. |
| D-2 | Startup Software implemented as a small Tauri app sharing the frontend design system | Meets "typical desktop application with icon" (§4) without introducing a new UI toolkit (§2 minimum-complexity rule). |
| D-3 | Backend container image built from a multi-stage Dockerfile; Neo4j runs as its own service in the compose file | Matches §5.7.4 topology sketch. §5.5's "single container" for DB + non-user-facing apps is interpreted as the private `backend` network grouping, since process-per-container is required for the named images (Neo4j, Prometheus, Tempo, OTel) to operate per §5.7.4. |
| D-4 | User passwords stored as SHA-384 hash (§3.2) — implemented exactly as specified | SRS explicitly prescribes SHA-384; noted as a security placeholder consistent with §5.6.6.9. |
| D-5 | Schema extracts (`docs/schema/*.json`) generated from the SRS are embedded in the Go backend at build time | Keeps the SRS the single source of truth while making validation data-driven. |
| D-6 | The GUI popup "windows" for Add-on Tools are Tauri WebviewWindows | Native multi-window support in Tauri; satisfies resizable popup requirement (§6.3.2). |

## 8. Requirement Deviations / Notifications

Tracked in `docs/REQUIREMENTS-NOTES.md` (deviations, "Will"-statement risks, and
justifications requiring permission per §1.1 imperative rules).
