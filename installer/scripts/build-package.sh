#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/installer/out"
VERSION="0.1.0"
BUILD_TAURI=1
BUILD_DOCKER=1
SAVE_IMAGES=0
STAGE_REFERENCE_DATA=1
REFERENCE_ARTIFACT=""
FRONTEND_BUNDLE_STATUS="skipped"
STARTUP_BUNDLE_STATUS="skipped"
REFERENCE_DATA_STATUS="skipped"
REFERENCE_DATA_ARTIFACT_NAME=""

usage() {
  cat <<'USAGE'
Usage: build-package.sh [options]

Options:
  --skip-tauri      Skip Tauri desktop bundle builds.
  --skip-docker     Skip backend Docker image build.
  --skip-reference-data
                    Skip validated Reference Data artifact packaging.
  --reference-artifact PATH
                    Package a specific sstpa-ref-data-*.tar.gz artifact.
  --save-images     Save required Docker images into the package.
  --version VALUE   Package version (default: 0.1.0).
  --out PATH        Output directory (default: installer/out).
  -h, --help        Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tauri)
      BUILD_TAURI=0
      shift
      ;;
    --skip-docker)
      BUILD_DOCKER=0
      shift
      ;;
    --skip-reference-data)
      STAGE_REFERENCE_DATA=0
      shift
      ;;
    --reference-artifact)
      REFERENCE_ARTIFACT="${2:?--reference-artifact requires a value}"
      shift 2
      ;;
    --save-images)
      SAVE_IMAGES=1
      shift
      ;;
    --version)
      VERSION="${2:?--version requires a value}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:?--out requires a value}"
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

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

count_visible_inotify_instances() {
  local proc count total=0

  if [[ ! -d /proc ]]; then
    echo 0
    return 0
  fi

  for proc in /proc/[0-9]*; do
    [[ -d "${proc}/fd" ]] || continue
    count="$(find "${proc}/fd" -maxdepth 1 -lname 'anon_inode:inotify' 2>/dev/null | wc -l)"
    total=$((total + count))
  done

  echo "${total}"
}

has_tauri_watcher_capacity() {
  local limit current

  if [[ ! -r /proc/sys/fs/inotify/max_user_instances ]]; then
    return 0
  fi

  limit="$(cat /proc/sys/fs/inotify/max_user_instances)"
  if [[ ! "${limit}" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  current="$(count_visible_inotify_instances)"
  if [[ ! "${current}" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  if (( current + 2 >= limit )); then
    echo "Host inotify watcher instances are near/exceeding the limit (${current}/${limit}); skipping Tauri CLI bundle attempt." >&2
    return 1
  fi

  return 0
}

build_tauri_or_release() {
  local app_dir="$1"
  local label="$2"
  local status_var="$3"
  shift 3

  if has_tauri_watcher_capacity; then
    if (cd "${app_dir}" && "$@"); then
      echo "${label}: Tauri bundle build completed."
      printf -v "${status_var}" "%s" "bundle"
      return 0
    fi

    echo "${label}: Tauri bundle build failed; falling back to release binary build." >&2
  else
    echo "${label}: falling back to release binary build." >&2
  fi

  if [[ -f "${app_dir}/package.json" ]]; then
    (cd "${app_dir}" && npm run build)
  fi
  (cd "${app_dir}/src-tauri" && cargo build --release)
  printf -v "${status_var}" "%s" "release-binary"
}

latest_reference_artifact() {
  local artifact newest=""

  shopt -s nullglob
  for artifact in "${ROOT_DIR}/sustainment/artifacts"/sstpa-ref-data-*.tar.gz; do
    if [[ -z "${newest}" || "${artifact}" -nt "${newest}" ]]; then
      newest="${artifact}"
    fi
  done
  shopt -u nullglob

  echo "${newest}"
}

stage_reference_data() {
  local artifact="$1"
  local checksum release_note target_dir

  if [[ -z "${artifact}" ]]; then
    artifact="$(latest_reference_artifact)"
  fi
  if [[ -z "${artifact}" || ! -f "${artifact}" ]]; then
    echo "Missing Reference Data artifact. Run the sustainment pipeline or pass --skip-reference-data." >&2
    exit 1
  fi

  checksum="${artifact}.sha256"
  if [[ ! -f "${checksum}" ]]; then
    echo "Missing Reference Data checksum: ${checksum}" >&2
    exit 1
  fi

  (cd "$(dirname "${artifact}")" && "${CHECKSUM_CMD[@]}" -c "$(basename "${checksum}")")

  target_dir="${PACKAGE_DIR}/payload/reference-data"
  mkdir -p "${target_dir}"
  install -m 0644 "${artifact}" "${target_dir}/"
  install -m 0644 "${checksum}" "${target_dir}/"

  release_note="${artifact%.tar.gz}-RELEASE-NOTE.txt"
  if [[ -f "${release_note}" ]]; then
    install -m 0644 "${release_note}" "${target_dir}/"
  fi

  REFERENCE_DATA_STATUS="packaged"
  REFERENCE_DATA_ARTIFACT_NAME="$(basename "${artifact}")"
}

require_cmd tar
require_cmd git

if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_CMD=(shasum -a 256)
else
  echo "Missing required command: sha256sum or shasum" >&2
  exit 1
fi

PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"
PACKAGE_NAME="sstpa-tools-${VERSION}-${PLATFORM}"
PACKAGE_DIR="${OUT_DIR}/${PACKAGE_NAME}"
ARCHIVE="${OUT_DIR}/${PACKAGE_NAME}.tar.gz"

mkdir -p "${OUT_DIR}"

if [[ "${BUILD_DOCKER}" -eq 1 ]]; then
  require_cmd docker
  docker compose -f "${ROOT_DIR}/deploy/docker-compose.yml" build backend
fi

if [[ "${BUILD_TAURI}" -eq 1 ]]; then
  require_cmd npm
  require_cmd cargo
  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    (cd "${ROOT_DIR}/frontend" && npm ci)
  fi
  build_tauri_or_release "${ROOT_DIR}/frontend" "Frontend" FRONTEND_BUNDLE_STATUS npx tauri build
  build_tauri_or_release "${ROOT_DIR}/startup" "Startup" STARTUP_BUNDLE_STATUS "${ROOT_DIR}/frontend/node_modules/.bin/tauri" build
fi

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/payload" "${PACKAGE_DIR}/manifests"

# deploy/.env and docker-compose.override.yml are LOCAL files (dev
# credentials / Neo4j host exposure) and must never ship in a package;
# install.sh / install.ps1 generate a fresh .env with random passwords.
tar \
  --exclude='.git' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='frontend/src-tauri/target' \
  --exclude='startup/src-tauri/target' \
  --exclude='deploy/.env' \
  --exclude='deploy/docker-compose.override.yml' \
  --exclude='deploy/neo4j/import' \
  --exclude='installer/out' \
  --exclude='sustainment/.venv' \
  --exclude='sustainment/ref-archive' \
  --exclude='sustainment/inf' \
  --exclude='sustainment/graph' \
  --exclude='sustainment/validation' \
  --exclude='sustainment/artifacts' \
  --exclude='sustainment/logs' \
  -C "${ROOT_DIR}" \
  -cf - \
  README.md NOTICE "SSTPA Tool SRS V7.md" FloorPlan.md Assets backend deploy docs frontend startup sustainment installer/README.md \
  | tar -C "${PACKAGE_DIR}/payload" -xf -

# The raw release binaries are ALWAYS staged under bundles/*/bin when they
# exist — the Startup Software's frontend discovery and the documented
# launch path rely on that layout regardless of native-bundle success.
stage_app_binaries() {
  local app="$1" bin_name="$2" target_dir="$3"

  if [[ -x "${ROOT_DIR}/${app}/src-tauri/target/release/${bin_name}" ]]; then
    mkdir -p "${PACKAGE_DIR}/payload/bundles/${target_dir}/bin"
    cp "${ROOT_DIR}/${app}/src-tauri/target/release/${bin_name}" \
       "${PACKAGE_DIR}/payload/bundles/${target_dir}/bin/"
  fi
  if [[ -d "${ROOT_DIR}/${app}/src-tauri/target/release/bundle" ]]; then
    mkdir -p "${PACKAGE_DIR}/payload/bundles/${target_dir}"
    tar -C "${ROOT_DIR}/${app}/src-tauri/target/release/bundle" -cf - . \
      | tar -C "${PACKAGE_DIR}/payload/bundles/${target_dir}" -xf -
  fi
}

if [[ "${FRONTEND_BUNDLE_STATUS}" != "skipped" ]]; then
  stage_app_binaries frontend sstpa-tools-gui frontend
fi
if [[ "${STARTUP_BUNDLE_STATUS}" != "skipped" ]]; then
  stage_app_binaries startup sstpa-startup startup
fi

install -m 0755 "${ROOT_DIR}/installer/templates/install.sh" "${PACKAGE_DIR}/install.sh"
install -m 0644 "${ROOT_DIR}/installer/templates/install.ps1" "${PACKAGE_DIR}/install.ps1"
install -m 0755 "${ROOT_DIR}/installer/templates/uninstall.sh" "${PACKAGE_DIR}/uninstall.sh"
install -m 0644 "${ROOT_DIR}/installer/templates/uninstall.ps1" "${PACKAGE_DIR}/uninstall.ps1"
install -m 0644 "${ROOT_DIR}/installer/templates/load-reference-data.ps1" "${PACKAGE_DIR}/load-reference-data.ps1"

if [[ "${SAVE_IMAGES}" -eq 1 ]]; then
  "${ROOT_DIR}/installer/scripts/save-images.sh" --out "${PACKAGE_DIR}/payload/images"
fi

if [[ "${STAGE_REFERENCE_DATA}" -eq 1 ]]; then
  stage_reference_data "${REFERENCE_ARTIFACT}"
fi

COMMIT="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
TAURI_BUILT=0
if [[ "${FRONTEND_BUNDLE_STATUS}" == "bundle" && "${STARTUP_BUNDLE_STATUS}" == "bundle" ]]; then
  TAURI_BUILT=1
fi
{
  echo "product=SSTPA Tools"
  echo "version=${VERSION}"
  echo "platform=${PLATFORM}"
  echo "gitCommit=${COMMIT}"
  echo "createdUtc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tauriRequested=${BUILD_TAURI}"
  echo "tauriBuilt=${TAURI_BUILT}"
  echo "tauriNativeBundles=${TAURI_BUILT}"
  echo "frontendBundleStatus=${FRONTEND_BUNDLE_STATUS}"
  echo "startupBundleStatus=${STARTUP_BUNDLE_STATUS}"
  echo "referenceDataStatus=${REFERENCE_DATA_STATUS}"
  echo "referenceDataArtifact=${REFERENCE_DATA_ARTIFACT_NAME}"
  echo "dockerBuilt=${BUILD_DOCKER}"
  echo "imagesSaved=${SAVE_IMAGES}"
} > "${PACKAGE_DIR}/manifests/package.properties"

(
  cd "${PACKAGE_DIR}"
  files=()
  while IFS= read -r -d '' file; do
    files+=("${file#./}")
  done < <(find . -type f ! -name SHA256SUMS -print0)
  if [[ "${#files[@]}" -gt 0 ]]; then
    sorted=()
    while IFS= read -r file; do
      sorted+=("${file}")
    done < <(printf '%s\n' "${files[@]}" | LC_ALL=C sort)
    "${CHECKSUM_CMD[@]}" "${sorted[@]}" > SHA256SUMS
  else
    : > SHA256SUMS
  fi
)
tar -C "${OUT_DIR}" -czf "${ARCHIVE}" "${PACKAGE_NAME}"

echo "Package staged: ${PACKAGE_DIR}"
echo "Archive created: ${ARCHIVE}"
echo "Checksums: ${PACKAGE_DIR}/SHA256SUMS"
