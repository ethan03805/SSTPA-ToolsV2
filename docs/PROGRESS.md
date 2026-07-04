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
