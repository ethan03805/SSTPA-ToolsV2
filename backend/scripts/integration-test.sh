#!/usr/bin/env bash
# Backend integration tests against a throwaway Neo4j container.
# Usage: ./backend/scripts/integration-test.sh [extra go test args]
#
# 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="sstpa-backend-it-neo4j"
BOLT_PORT="${SSTPA_IT_BOLT_PORT:-17699}"
PASSWORD="sstpa-it-password"
IMAGE="neo4j:2026.05.0-community"

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }

docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
echo "==> Starting throwaway Neo4j (${IMAGE}) on bolt port ${BOLT_PORT}"
docker run -d --name "${CONTAINER}" \
  -e NEO4J_AUTH="neo4j/${PASSWORD}" \
  -p "127.0.0.1:${BOLT_PORT}:7687" \
  "${IMAGE}" >/dev/null

cleanup() { docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Waiting for Neo4j to accept connections"
deadline=$(( $(date +%s) + 180 ))
until docker exec "${CONTAINER}" cypher-shell -u neo4j -p "${PASSWORD}" "RETURN 1;" >/dev/null 2>&1; do
  if [ "$(date +%s)" -gt "${deadline}" ]; then
    echo "Neo4j did not start within 180 s" >&2
    docker logs "${CONTAINER}" | tail -20 >&2
    exit 1
  fi
  sleep 2
done

echo "==> Running integration tests"
cd "${ROOT_DIR}/backend"
SSTPA_TEST_BOLT="bolt://localhost:${BOLT_PORT}" \
SSTPA_TEST_NEO4J_PASSWORD="${PASSWORD}" \
  go test -tags integration -count=1 ./internal/api/ -run TestIntegration -v "$@"

echo "==> Integration tests passed"
