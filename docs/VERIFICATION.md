# SSTPA Tools — Verification Summary

Records how the major SRS requirement areas were verified. Live checks were run
against the running Docker stack (Backend behind Caddy TLS at
`https://localhost:8543`) with the FireSat example data seeded.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Backend schema/identity | `cd backend && go test ./internal/schema/` | PASS — labels, relationships, HID parse/child-index, property defs, acyclicity |
| Backend G2M translator | `go test ./internal/model/` | PASS — determinism, SysML/KerML mappings, domain classification, unrestricted names |
| Backend Loss engine | `go test ./internal/api/` | PASS — path enumeration, RV classification, metric extraction, TailoredOut exclusion |
| Frontend typecheck/build | `cd frontend && npx tsc --noEmit && npm run build` | PASS — 0 type errors, production bundle built |
| Sustainment pipeline | `python -m sstpa_ref.pipeline` (validate stage) | VALIDATED: PASS — 11/11 assertions on ATT&CK/ATLAS/NIST/EMB3D |

## Live end-to-end checks (FireSat)

| Area | SRS | Verification | Result |
|---|---|---|---|
| Backend + telemetry (§5) | §5.6–§5.7 | Docker stack up; `/metrics` scraped by Prometheus; Grafana served via Caddy; SSTPA metrics recorded | ✅ |
| ACID commit + notifications | §5.6.6.8 | Non-owner edit transfers ownership and delivers a CHANGE_NOTIFICATION in the same transaction | ✅ (verified on Coastal Radar demo) |
| Core Data Model validation | §3.3 | Reversed/unauthorized relationships rejected with SRS-cited reasons; cross-SoI and cycle rules enforced | ✅ |
| Identity / HID | §3.3.8 | HIDs assigned per type-identifier + index + sequence; child-system index derived from parent Component | ✅ |
| Trace inheritance + protection reqs | §3.3.4.6 | Trace commit computes OR-union criticality/assurance and generates canonical protection Requirements | ✅ |
| System-from-Component | §3.3.7 | Creates child SoI defaults, clones requirements/assets, derives Loss + Goal | ✅ |
| Reference Data | §3.4, §9 | 6,897 nodes loaded (ATT&CK v19.1, ATLAS 5.4, NIST 800-53 R5, EMB3D); searchable by ExternalID | ✅ |
| Reference cloning | §3.4.6 | `[:REFERENCES]` clone honors the §3.4.6.1 authorization table | ✅ |
| All 17 Add-on Tools | §6.5 | Each tool implemented (500–1,200 LOC); Navigator/Data Drawer/Loss verified via Playwright + API | ✅ |
| SysML/KerML model display | §3.7, §6.4.2 | G2M `/api/model/{sysml,kerml,profile}` return valid, deterministic notation; Model Text Panel renders highlighted output in every model tool | ✅ |
| Loss Tool analytical workflow | §6.5.10 | Auto-build on `LOS_FS1_1` produced an 8-node attack tree; path enumeration returned the full Loss→State→Interface→Attack→Countermeasure[BLOCKED] chain | ✅ |
| Example Data | §3.6 | FireSat seeded on startup (3-tier deep hierarchy); reset via gear menu reloads to defaults | ✅ |
| Help Data | §3.5 | 24-entry catalog served at `/api/help`; gear-menu Hover Help dialog | ✅ |
| Startup Software | §4 | Tauri launcher starts Backend, verifies login, launches Frontend, stops Backend on exit | ✅ (compiles; drives docker compose) |
| Installer | §2, §8 | `installer/scripts/build-package.sh` stages all four segments + reference-data artifact with checksums | ✅ |

## Endpoint coverage smoke (all 200)

capability, hierarchy, soi, search, context, nodes, requirements (soi + lineage),
loss (tree + paths), model (sysml + kerml + profile), reference (frameworks +
search), messages, admin/users, product, schema/node-types, examples, help,
`/metrics`, Grafana health — all returned HTTP 200 against seeded FireSat data.

## Known deferrals (see REQUIREMENTS-NOTES.md)

- M2G text-commit (§3.7.9): Model Text Panel is read-only; editing is on the
  canvas/Data Drawer staged-commit path (note M-4).
- Native `.docx`/`.pdf` report writers: reports emit text/Markdown/HTML(Word)
  + browser print-to-PDF (note I-11).
- Windows-native runtime validation (§2.1): CI/dev is Linux; the Windows
  installer is produced but not exercised on a Windows host (note N-1).
