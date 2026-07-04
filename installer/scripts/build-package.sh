#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/installer/out"
VERSION="0.1.0"
BUILD_TAURI=1
BUILD_DOCKER=1
SAVE_IMAGES=0
FRONTEND_BUNDLE_STATUS="skipped"
STARTUP_BUNDLE_STATUS="skipped"

usage() {
  cat <<'USAGE'
Usage: build-package.sh [options]

Options:
  --skip-tauri      Skip Tauri desktop bundle builds.
  --skip-docker     Skip backend Docker image build.
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

tar \
  --exclude='.git' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='frontend/src-tauri/target' \
  --exclude='startup/src-tauri/target' \
  --exclude='deploy/neo4j/import' \
  --exclude='installer/out' \
  --exclude='sustainment/.venv' \
  --exclude='sustainment/ref-archive' \
  --exclude='sustainment/inf' \
  --exclude='sustainment/graph' \
  --exclude='sustainment/validation' \
  --exclude='sustainment/artifacts' \
  -C "${ROOT_DIR}" \
  -cf - \
  README.md NOTICE "SSTPA Tool SRS V7.md" FloorPlan.md Assets backend deploy docs frontend startup sustainment installer/README.md \
  | tar -C "${PACKAGE_DIR}/payload" -xf -

if [[ "${FRONTEND_BUNDLE_STATUS}" == "bundle" && -d "${ROOT_DIR}/frontend/src-tauri/target/release/bundle" ]]; then
  mkdir -p "${PACKAGE_DIR}/payload/bundles/frontend"
  tar -C "${ROOT_DIR}/frontend/src-tauri/target/release/bundle" -cf - . | tar -C "${PACKAGE_DIR}/payload/bundles/frontend" -xf -
elif [[ "${FRONTEND_BUNDLE_STATUS}" != "skipped" && -x "${ROOT_DIR}/frontend/src-tauri/target/release/sstpa-tools-gui" ]]; then
  mkdir -p "${PACKAGE_DIR}/payload/bundles/frontend/bin"
  cp "${ROOT_DIR}/frontend/src-tauri/target/release/sstpa-tools-gui" "${PACKAGE_DIR}/payload/bundles/frontend/bin/"
fi

if [[ "${STARTUP_BUNDLE_STATUS}" == "bundle" && -d "${ROOT_DIR}/startup/src-tauri/target/release/bundle" ]]; then
  mkdir -p "${PACKAGE_DIR}/payload/bundles/startup"
  tar -C "${ROOT_DIR}/startup/src-tauri/target/release/bundle" -cf - . | tar -C "${PACKAGE_DIR}/payload/bundles/startup" -xf -
elif [[ "${STARTUP_BUNDLE_STATUS}" != "skipped" && -x "${ROOT_DIR}/startup/src-tauri/target/release/sstpa-startup" ]]; then
  mkdir -p "${PACKAGE_DIR}/payload/bundles/startup/bin"
  cp "${ROOT_DIR}/startup/src-tauri/target/release/sstpa-startup" "${PACKAGE_DIR}/payload/bundles/startup/bin/"
fi

install -m 0755 "${ROOT_DIR}/installer/templates/install.sh" "${PACKAGE_DIR}/install.sh"
install -m 0644 "${ROOT_DIR}/installer/templates/install.ps1" "${PACKAGE_DIR}/install.ps1"

if [[ "${SAVE_IMAGES}" -eq 1 ]]; then
  "${ROOT_DIR}/installer/scripts/save-images.sh" --out "${PACKAGE_DIR}/payload/images"
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
