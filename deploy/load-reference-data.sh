#!/usr/bin/env bash
# SSTPA Reference Data load step (SRS §9.7): verify the artifact SHA-256,
# extract the Cypher load script, execute it against the deployment Neo4j via
# cypher-shell, and verify the post-load node count. Idempotent (MERGE).
#
# Usage: ./load-reference-data.sh <sstpa-ref-data-*.tar.gz> [compose-project-dir]
#
# 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
set -euo pipefail

ARTIFACT="${1:?usage: load-reference-data.sh <artifact.tar.gz> [deploy-dir]}"
DEPLOY_DIR="${2:-$(cd "$(dirname "$0")" && pwd)}"

# Neo4j password: from environment, else from the deploy .env file.
PASSWORD="${SSTPA_NEO4J_PASSWORD:-}"
if [ -z "${PASSWORD}" ] && [ -f "${DEPLOY_DIR}/.env" ]; then
  PASSWORD="$(sed -n 's/^SSTPA_NEO4J_PASSWORD=//p' "${DEPLOY_DIR}/.env" | tail -1)"
fi
if [ -z "${PASSWORD}" ]; then
  echo "FAIL: SSTPA_NEO4J_PASSWORD is not set and ${DEPLOY_DIR}/.env does not define it." >&2
  exit 1
fi

# Portable SHA-256 verification (Linux: sha256sum, macOS: shasum -a 256).
if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_CMD=(shasum -a 256)
else
  echo "FAIL: need sha256sum or shasum on PATH" >&2
  exit 1
fi

echo "==> Verifying artifact checksum"
(cd "$(dirname "${ARTIFACT}")" && "${CHECKSUM_CMD[@]}" -c "$(basename "${ARTIFACT}").sha256")

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARTIFACT" -C "$WORK"

SCRIPT=$(ls "$WORK"/sstpa-ref-load-*.cypher)
echo "==> Load script: $(basename "$SCRIPT")"

cd "$DEPLOY_DIR"
NEO4J_CONTAINER=$(docker compose ps -q neo4j)
if [ -z "${NEO4J_CONTAINER}" ]; then
  echo "FAIL: the neo4j service is not running. Start the Backend first: (cd ${DEPLOY_DIR} && docker compose up -d)" >&2
  exit 1
fi

echo "==> Copying into neo4j container and executing (this takes a few minutes)"
docker cp "$SCRIPT" "$NEO4J_CONTAINER:/tmp/ref-load.cypher"
docker compose exec -T neo4j cypher-shell -u neo4j -p "$PASSWORD" -f /tmp/ref-load.cypher > /dev/null
docker compose exec -T neo4j rm -f /tmp/ref-load.cypher

echo "==> Verifying post-load counts against the load script header"
EXPECTED=$(grep -o 'Expected reference node count[^0-9]*[0-9]*' "$SCRIPT" | grep -o '[0-9]*$' || true)
ACTUAL=$(docker compose exec -T neo4j cypher-shell -u neo4j -p "$PASSWORD" --format plain \
  "MATCH (n:REF) WHERE coalesce(n.IsFrameworkRoot, false) = false RETURN count(n);" | tail -1 | tr -d '[:space:]"')
if [ -z "${EXPECTED}" ]; then
  echo "WARN: load script has no 'Expected reference node count' header; loaded ${ACTUAL} reference nodes (count check skipped)." >&2
else
  echo "    expected=$EXPECTED actual=$ACTUAL"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "FAIL: reference node count mismatch" >&2
    exit 1
  fi
fi
echo "==> Reference data loaded and verified."
