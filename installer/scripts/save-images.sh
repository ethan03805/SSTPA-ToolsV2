#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/installer/out/images"
PULL=1

usage() {
  cat <<'USAGE'
Usage: save-images.sh [options]

Options:
  --out PATH   Directory for image tar files.
  --no-pull    Do not pull external images before saving.
  -h, --help   Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="${2:?--out requires a value}"
      shift 2
      ;;
    --no-pull)
      PULL=0
      shift
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

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing required command: docker" >&2
  exit 1
fi

IMAGES=(
  "sstpa-backend:latest"
  "caddy:2.11.4"
  "neo4j:2026.05.0-community"
  "otel/opentelemetry-collector-contrib:0.155.0"
  "prom/prometheus:v3.13.0"
  "grafana/tempo:2.9.3"
  "grafana/grafana:13.0.3"
)

mkdir -p "${OUT_DIR}"
: > "${OUT_DIR}/images.txt"

if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_CMD=(shasum -a 256)
else
  echo "Missing required command: sha256sum or shasum" >&2
  exit 1
fi

for image in "${IMAGES[@]}"; do
  if [[ "${PULL}" -eq 1 && "${image}" != "sstpa-backend:latest" ]]; then
    docker pull "${image}"
  fi
  safe_name="$(echo "${image}" | tr '/:' '__')"
  docker image inspect "${image}" >/dev/null
  docker save "${image}" -o "${OUT_DIR}/${safe_name}.tar"
  echo "${image} ${safe_name}.tar" >> "${OUT_DIR}/images.txt"
done

(cd "${OUT_DIR}" && "${CHECKSUM_CMD[@]}" *.tar > image-SHA256SUMS)
echo "Saved images to ${OUT_DIR}"
