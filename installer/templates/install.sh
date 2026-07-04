#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX=""

usage() {
  cat <<'USAGE'
Usage: install.sh [--prefix PATH]

Copies the packaged SSTPA Tools payload to PATH and loads bundled Docker images
when present.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      PREFIX="${2:?--prefix requires a value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${PREFIX}" ]]; then
  if [[ "$(id -u)" -eq 0 ]]; then
    PREFIX="/opt/sstpa-tools"
  else
    PREFIX="${HOME}/.local/share/sstpa-tools"
  fi
fi

mkdir -p "${PREFIX}"
tar -C "${SCRIPT_DIR}/payload" -cf - . | tar -C "${PREFIX}" -xf -

if [[ -d "${SCRIPT_DIR}/payload/images" ]] && command -v docker >/dev/null 2>&1; then
  while IFS= read -r tarball; do
    docker load -i "${tarball}"
  done < <(find "${SCRIPT_DIR}/payload/images" -maxdepth 1 -type f -name '*.tar' | sort)
fi

echo "SSTPA Tools installed to ${PREFIX}"
echo "Backend stack: cd ${PREFIX}/deploy && docker compose up -d"
if [[ -d "${PREFIX}/reference-data" ]]; then
  REF_ARTIFACT="$(find "${PREFIX}/reference-data" -maxdepth 1 -type f -name 'sstpa-ref-data-*.tar.gz' | sort | tail -n 1 || true)"
  if [[ -n "${REF_ARTIFACT}" ]]; then
    echo "Reference data artifact: ${REF_ARTIFACT}"
    echo "Load Reference Data after the Backend is healthy: ${PREFIX}/deploy/load-reference-data.sh ${REF_ARTIFACT} ${PREFIX}/deploy"
  fi
fi
echo "Startup bundles, when built for this platform, are under ${PREFIX}/bundles/startup"
