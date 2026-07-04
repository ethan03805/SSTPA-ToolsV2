#!/usr/bin/env bash
# SSTPA Tools uninstaller (Linux / macOS).
#
# Stops the Backend stack, optionally removes its Docker volumes (the model
# database!), and deletes the installation directory.
#
# 2025 Nicholas Triska. All rights reserved.
set -euo pipefail

PREFIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PURGE_DATA=0

usage() {
  cat <<'USAGE'
Usage: uninstall.sh [--purge-data]

Stops the SSTPA Backend and removes the installation directory.
--purge-data additionally deletes the Docker volumes holding the model
database and telemetry history. Without it, the data volumes survive and a
reinstall reuses them (keep the old deploy/.env in that case: Neo4j retains
the password baked into its volume).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-data) PURGE_DATA=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ! -f "${PREFIX}/deploy/docker-compose.yml" ]]; then
  echo "FAIL: ${PREFIX} does not look like an SSTPA Tools installation (no deploy/docker-compose.yml)." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "==> Stopping the SSTPA Backend"
  if [[ "${PURGE_DATA}" -eq 1 ]]; then
    (cd "${PREFIX}/deploy" && docker compose down -v --remove-orphans) || true
  else
    (cd "${PREFIX}/deploy" && docker compose down --remove-orphans) || true
  fi
else
  echo "WARN: Docker unavailable; skipping backend shutdown." >&2
fi

if [[ "${PURGE_DATA}" -eq 1 ]]; then
  echo "==> Data volumes removed (model database and telemetry deleted)."
else
  echo "==> Data volumes kept. Remove later with:"
  echo "    docker volume ls --filter name=sstpa-backend"
fi

echo "==> Removing ${PREFIX}"
cd /
rm -rf "${PREFIX}"
echo "SSTPA Tools uninstalled."
