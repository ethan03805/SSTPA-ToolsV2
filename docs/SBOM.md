# SSTPA Tools — Software Bill of Materials (SBOM)

This SBOM enumerates all software components, libraries, container images, fonts, and
data sets integrated into or shipped with SSTPA Tools, with sufficient information for
a software audit. It is maintained continuously as components are added.

**Product**: SSTPA Tools
**Supplier / IP owner**: Nicholas Triska (nihlo2025@proton.me)
**SBOM format**: human-readable Markdown (this file). Machine-readable manifests:
`backend/go.mod`/`go.sum`, `frontend/package.json`/`package-lock.json`,
`frontend/src-tauri/Cargo.toml`/`Cargo.lock`,
`startup/src-tauri/Cargo.toml`/`Cargo.lock`, `sustainment/requirements.txt`.

> Status legend: **planned** = specified, not yet integrated; **integrated** = in use in the codebase.

## 1. Languages & Toolchains

| Component | Version | Source | License | Use | Status |
|---|---|---|---|---|---|
| Go | 1.25.0 | https://go.dev | BSD-3-Clause | Backend language (§5.6) | integrated |
| Node.js | 25.6.1 | https://nodejs.org | MIT | Frontend build tooling | integrated |
| Rust | 1.94.1 | https://rust-lang.org | MIT/Apache-2.0 | Tauri shell for Frontend & Startup | integrated |
| Python | 3.14.3 | https://python.org | PSF-2.0 | Sustainment pipeline (§9.6; SRS requires ≥3.12) | integrated |
| TypeScript | (see package-lock.json) | https://typescriptlang.org | Apache-2.0 | Frontend language | integrated |
| Tauri CLI | 2.11.4 | https://tauri.app | MIT/Apache-2.0 | Native desktop bundle build tooling; pinned by `frontend/package-lock.json`, optionally installed via Cargo on build hosts | integrated |

## 2. Backend (Go) — `backend/go.mod`

| Component | Version | Source | License | Use | Status |
|---|---|---|---|---|---|
| github.com/go-chi/chi/v5 | see go.sum | https://github.com/go-chi/chi | MIT | HTTP router (§5) | integrated |
| github.com/neo4j/neo4j-go-driver/v5 | see go.sum | https://github.com/neo4j/neo4j-go-driver | Apache-2.0 | Neo4j Bolt driver (§5.6) | integrated |
| github.com/prometheus/client_golang | see go.sum | https://github.com/prometheus/client_golang | Apache-2.0 | /metrics endpoint (§5.6.3) | integrated |
| go.opentelemetry.io/otel (+ SDK, OTLP exporters) | see go.sum | https://opentelemetry.io | Apache-2.0 | Traces/metrics emission (§5.6.2) | integrated |
| github.com/google/uuid | see go.sum | https://github.com/google/uuid | BSD-3-Clause | uuid property generation (§3.3.8) | integrated |

Transitive Go dependencies are pinned and checksummed in `backend/go.sum`.

## 3. Frontend (npm) — `frontend/package.json`

| Component | Source | License | Use | Status |
|---|---|---|---|---|
| react, react-dom | https://react.dev | MIT | UI framework (§6.1) | integrated |
| vite | https://vitejs.dev | MIT | Build tool (§6.1) | integrated |
| tailwindcss | https://tailwindcss.com | MIT | Styling (§6.1) | integrated |
| @tauri-apps/api, @tauri-apps/cli | https://tauri.app | MIT/Apache-2.0 | Desktop shell (§6.1) | integrated |
| @radix-ui/* primitives | https://radix-ui.com | MIT | Headless UI components (§6.1) | integrated |
| framer-motion | https://framer.com/motion | MIT | Drawer/expand animations (§6.1) | integrated |
| zustand | https://github.com/pmndrs/zustand | MIT | UI state (§6.1) | integrated |
| @tanstack/react-query | https://tanstack.com/query | MIT | Backend fetch/mutate/cache (§6.1) | integrated |
| @tanstack/react-virtual | https://tanstack.com/virtual | MIT | Large-list virtualization (§6.1) | integrated |
| cytoscape, react-cytoscapejs, cytoscape-fcose, cytoscape-svg | https://js.cytoscape.org | MIT | SoI graph popups + PNG/SVG diagram export (§6.1, §6.5.x) | integrated |
| ag-grid-community, ag-grid-react | https://ag-grid.com | MIT | RTM / search / report tables (§6.1) | integrated |

Exact versions pinned in `frontend/package-lock.json`.

## 4. Tauri (Rust crates) — `frontend/src-tauri/Cargo.toml`, `startup/src-tauri/Cargo.toml`

| Component | Source | License | Use | Status |
|---|---|---|---|---|
| tauri (v2) | https://tauri.app | MIT/Apache-2.0 | Desktop application shell | integrated |
| serde, serde_json | https://serde.rs | MIT/Apache-2.0 | Serialization | integrated |

Exact versions pinned in `Cargo.lock`.

## 5. Container Images (Docker Compose) — `deploy/`

| Image | Tag | Source | License | Use | Status |
|---|---|---|---|---|---|
| neo4j | 2026.05.0-community | https://hub.docker.com/_/neo4j | GPL-3.0 (Community Ed.) | Graph database (§5.6.1) | integrated |
| caddy | 2.11.4 | https://hub.docker.com/_/caddy | Apache-2.0 | Reverse proxy / TLS (§5.4) | integrated |
| otel/opentelemetry-collector-contrib | 0.155.0 | https://opentelemetry.io | Apache-2.0 | Telemetry pipeline (§5.6.2) | integrated |
| prom/prometheus | v3.13.0 | https://prometheus.io | Apache-2.0 | Metrics store (§5.6.3) | integrated |
| grafana/tempo | 2.9.3 | https://grafana.com/oss/tempo | AGPL-3.0 | Trace store (§5.6.4) | integrated |
| grafana/grafana | 13.0.3 | https://grafana.com/oss/grafana | AGPL-3.0 | Dashboards (§5.6.5) | integrated |

Note: Neo4j Community (GPLv3), Tempo and Grafana (AGPLv3) are used as unmodified,
separate services accessed over network protocols; SSTPA proprietary code links to
none of them. Neo4j access is via the Apache-2.0 Bolt driver.

## 6. Fonts (§6.2.2.1)

| Font | Source | License | Use | Status |
|---|---|---|---|---|
| IBM Plex Sans | https://github.com/IBM/plex | OFL-1.1 | Primary UI text & headings | integrated |
| JetBrains Mono | https://github.com/JetBrains/JetBrainsMono | OFL-1.1 | Technical identifiers, model text | integrated |

Fonts are bundled with the application for air-gapped deployment.

## 7. Sustainment Pipeline (Python) — `sustainment/requirements.txt`

| Component | Source | License | Use | Status |
|---|---|---|---|---|
| stix2 | https://github.com/oasis-open/cti-python-stix2 | BSD-3-Clause | ATT&CK/EMB3D STIX parsing (§9.6) | integrated |
| PyYAML | https://pyyaml.org | MIT | ATLAS YAML parsing (§9.6) | integrated |
| jsonschema | https://github.com/python-jsonschema/jsonschema | MIT | INF validation (§9.6) | integrated |
| neo4j (Python driver) | https://github.com/neo4j/neo4j-python-driver | Apache-2.0 | Stage-4 validation DB (§9.6) | integrated |

## 8. Reference Data Sets (§3.4, §9.5)

| Data set | Version | Source | License / attribution | Status |
|---|---|---|---|---|
| MITRE ATT&CK (Enterprise, ICS, Mobile) | v19.1 in `sstpa-ref-data-2026-07-04-v1.tar.gz` | https://github.com/mitre-attack/attack-stix-data | "This product uses the MITRE ATT&CK framework. ATT&CK is a registered trademark and copyright of The MITRE Corporation. Licensed under CC BY 4.0." | integrated |
| MITRE ATLAS | v5.4.0 in `sstpa-ref-data-2026-07-04-v1.tar.gz` | https://github.com/mitre-atlas/atlas-data | "This product uses MITRE ATLAS. Copyright 2023-2026 The MITRE Corporation. Licensed under Apache 2.0." | integrated |
| NIST SP 800-53 | Rev 5 catalog commit `78650f02ad9321bb7b817846f8fbd4f2bcd620de` in `sstpa-ref-data-2026-07-04-v1.tar.gz` | https://github.com/usnistgov/oscal-content | "This product incorporates NIST SP 800-53 Rev 5 content. NIST-authored material is in the public domain. Attribution: National Institute of Standards and Technology, U.S. Department of Commerce." | integrated |
| MITRE EMB3D | STIX 2.0.1 commit `0d7c25bb4e2928c516fb5811aaab9ff8bab2896c` in `sstpa-ref-data-2026-07-04-v1.tar.gz` | https://github.com/mitre/emb3d | "This product uses MITRE EMB3D. Copyright 2024 The MITRE Corporation. Licensed under Apache 2.0." | integrated |
| MITRE CREF / CNSSI / Cyber Survivability Attributes | Requires authorized machine-readable source bundle | MITRE publications / CNSSI tables | Attribution to be recorded with the supplied source bundle | planned |

All reference node properties are preserved verbatim (`RawData`) per §9.5.
The packaged Reference Data artifact and companion SHA-256 file are staged under
`payload/reference-data/` by the installer package script.
