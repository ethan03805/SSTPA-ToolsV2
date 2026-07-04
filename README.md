# SSTPA Tools

**Systems Security-Theoretic Process Analysis (SSTPA) Tool** — a Model-Based System
Security Engineering application that scales the SSTPA methodology (derived from
MIT's STPA by Nicholas Triska, 2025) to large, complex, hierarchical engineered systems.

SSTPA Tools models a system as a hierarchy of **Systems of Interest (SoI)** stored in a
Neo4j graph, and provides a desktop GUI plus a suite of Add-on Tools for security
analysis: asset/loss analysis with attack trees, STPA control structures, requirements
management, state analysis, use cases, NIST 800-53 / MITRE ATT&CK / ATLAS / EMB3D
reference integration, GSN assurance cases, and SysML 2.0 / KerML 1.0 interchange.

The authoritative specification is [`SSTPA Tool SRS V7.md`](SSTPA%20Tool%20SRS%20V7.md).

## Repository Layout

| Path | Contents |
|---|---|
| `backend/` | Go backend: REST API, Neo4j access, schema validation, telemetry |
| `frontend/` | Tauri + React + TypeScript desktop GUI and Add-on Tools |
| `startup/` | Startup Software: authenticates the user, starts Backend then Frontend |
| `installer/` | Installer build scripts (Windows / macOS / Linux) |
| `sustainment/` | Python reference-data pipeline (acquire → normalize → transform → validate → package) |
| `deploy/` | Docker Compose, Caddy, OTel Collector, Prometheus, Tempo, Grafana configuration |
| `docs/` | Architecture, SBOM, schema extracts, developer documentation |
| `Assets/` | SSTPA Tools logo artwork |

## Architecture (summary)

Four independently operable segments (SRS §2):

1. **Startup Software** — desktop launcher; authenticates the user against the Backend,
   starts the Backend (Docker Compose) and then the Frontend; coordinates clean shutdown.
2. **Backend** — Go service (chi router, neo4j driver, OpenTelemetry/Prometheus
   instrumentation) fronted by Caddy, persisting to Neo4j Community Edition, with
   telemetry via OTel Collector → Tempo and Prometheus → Grafana. Two Docker networks:
   `edge` (Caddy, Grafana dashboards) and `backend` (everything else).
3. **Frontend** — Tauri desktop application; React + TypeScript + Vite + Tailwind CSS;
   single-window GUI (Branding / Control / SoI / Main panels + Data Drawer) with
   manifest-driven Add-on Tools in popup windows.
4. **Installer** — ships all of the above for Windows, macOS, and Linux.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details and
[`docs/SBOM.md`](docs/SBOM.md) for the software bill of materials.

## Quick start (development)

```bash
# Backend stack (Neo4j, API, telemetry)
cd deploy && docker compose up -d

# Frontend (dev mode)
cd frontend && npm install && npm run tauri dev
```

## Installer Package

```bash
./installer/scripts/build-package.sh --save-images
```

Use `--skip-tauri --skip-docker` for a fast staging/checksum validation run.
Packages are written to `installer/out/`.

## Copyright

2025 Nicholas Triska. All rights reserved.

The SSTPA Tools software and all associated modules, binaries, and source code are
proprietary intellectual property of Nicholas Triska. Unauthorized reproduction,
modification, or distribution is strictly prohibited. Licensed copies may be used
under specific contractual terms provided by the author.

Users retain ownership of data and reports generated during legitimate use of the
software, except for embedded proprietary schemas and templates.
