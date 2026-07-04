#!/usr/bin/env bash
# SSTPA Tools — trust (or untrust) Caddy's local root CA on this host.
#
# The Backend terminates TLS at Caddy with an internal ("local_certs") CA
# (SRS §5.4, §5.6.6.1). A production desktop GUI connects its webview to
# https://localhost and validates that certificate directly, so the host must
# trust Caddy's local root CA. (The Startup Software's own probes use `curl -k`
# and do not need this; only the GUI webview does — WKWebView / WebView2 /
# WebKitGTK have no bypass for an untrusted localhost certificate.)
#
# Caddy generates the root CA the first time it starts, so this helper brings
# the Backend up (unless --no-start) to obtain the certificate, then installs it
# into the platform trust store. It is idempotent (re-running is a no-op once
# trusted) and reversible (--remove).
#
#   trust-ca.sh [--deploy-dir DIR] [--no-start]   # trust the CA (default)
#   trust-ca.sh --check   [--deploy-dir DIR]       # report status only
#   trust-ca.sh --remove  [--deploy-dir DIR]       # untrust the CA
#
# 2025 Nicholas Triska. All rights reserved.
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${SELF_DIR}/deploy"
MODE="install"     # install | check | remove
START_STACK=1

usage() {
  cat <<'USAGE'
Usage: trust-ca.sh [--deploy-dir DIR] [--check|--remove] [--no-start]

Trusts Caddy's local root CA so the SSTPA Tools desktop GUI can reach the
Backend over https://localhost.

  --deploy-dir DIR  Path to the deploy/ directory (default: ./deploy next to
                    this script).
  --check           Report whether the CA is present and trusted; change nothing.
  --remove          Remove the CA from the host trust store.
  --no-start        Do not start the Backend to obtain the CA; use only a
                    running stack or a previously stored certificate.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy-dir) DEPLOY_DIR="${2:?--deploy-dir requires a value}"; shift 2 ;;
    --check)  MODE="check";  shift ;;
    --remove) MODE="remove"; shift ;;
    --no-start) START_STACK=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

DEPLOY_DIR="$(cd "${DEPLOY_DIR}" 2>/dev/null && pwd || echo "${DEPLOY_DIR}")"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
STORED_CA="${DEPLOY_DIR}/caddy-root-ca.crt"
CA_IN_CONTAINER="/data/caddy/pki/authorities/local/root.crt"
OS="$(uname -s)"

have_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# Write the live Caddy root CA (PEM) to $1. Returns non-zero if unavailable.
extract_ca() {
  local out="$1"
  have_docker || return 1
  ( cd "${DEPLOY_DIR}" && docker compose exec -T caddy cat "${CA_IN_CONTAINER}" ) \
    > "${out}" 2>/dev/null || return 1
  [[ -s "${out}" ]] && head -1 "${out}" | grep -q "BEGIN CERTIFICATE"
}

# Ensure a usable CA PEM at $1: try the running stack, then start it (unless
# --no-start), then fall back to a previously stored copy.
obtain_ca() {
  local out="$1"
  if extract_ca "${out}"; then return 0; fi
  if [[ "${START_STACK}" -eq 1 ]] && have_docker && [[ -f "${COMPOSE_FILE}" ]]; then
    echo "==> Starting the Backend to generate Caddy's local root CA"
    ( cd "${DEPLOY_DIR}" && docker compose up -d ) >/dev/null 2>&1 || true
    local i
    for i in $(seq 1 30); do
      if extract_ca "${out}"; then return 0; fi
      sleep 2
    done
  fi
  if [[ -s "${STORED_CA}" ]]; then cp "${STORED_CA}" "${out}"; return 0; fi
  return 1
}

ca_sha1() { openssl x509 -in "$1" -noout -fingerprint -sha1 2>/dev/null | sed 's/.*=//; s/://g'; }

# ---- macOS (Security framework keychains) -------------------------------
macos_keychains() {
  echo "/Library/Keychains/System.keychain"
  [[ -e "${HOME}/Library/Keychains/login.keychain-db" ]] && echo "${HOME}/Library/Keychains/login.keychain-db"
}
macos_is_trusted() {
  local sha1="$1" kc
  while IFS= read -r kc; do
    [[ -e "${kc}" ]] || continue
    if security find-certificate -a -Z "${kc}" 2>/dev/null | grep -qi "${sha1}"; then return 0; fi
  done < <(macos_keychains)
  return 1
}
macos_install() {
  local crt="$1" sha1; sha1="$(ca_sha1 "${crt}")"
  if [[ -n "${sha1}" ]] && macos_is_trusted "${sha1}"; then
    echo "Caddy local root CA already trusted (SHA-1 ${sha1})."; return 0
  fi
  if [[ "$(id -u)" -eq 0 ]]; then
    security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${crt}"
    echo "Trusted Caddy local root CA in the System keychain."
  else
    echo "==> A macOS authorization dialog will ask you to allow this change."
    security add-trusted-cert -r trustRoot -k "${HOME}/Library/Keychains/login.keychain-db" "${crt}"
    echo "Trusted Caddy local root CA in your login keychain."
  fi
}
macos_remove() {
  local sha1="$1" kc
  [[ -n "${sha1}" ]] || return 0
  while IFS= read -r kc; do
    [[ -e "${kc}" ]] || continue
    while security find-certificate -Z "${kc}" 2>/dev/null | grep -qi "${sha1}"; do
      security delete-certificate -Z "${sha1}" "${kc}" >/dev/null 2>&1 || break
    done
  done < <(macos_keychains)
  echo "Removed Caddy local root CA from the keychain(s)."
}

# ---- Linux (system CA bundle) -------------------------------------------
linux_anchor() {
  if command -v update-ca-trust >/dev/null 2>&1; then
    echo "/etc/pki/ca-trust/source/anchors/sstpa-caddy-root.crt"
  elif command -v update-ca-certificates >/dev/null 2>&1; then
    echo "/usr/local/share/ca-certificates/sstpa-caddy-root.crt"
  fi
}
linux_refresh() {
  if command -v update-ca-trust >/dev/null 2>&1; then update-ca-trust >/dev/null 2>&1
  elif command -v update-ca-certificates >/dev/null 2>&1; then update-ca-certificates >/dev/null 2>&1; fi
}
linux_install() {
  local crt="$1" anchor; anchor="$(linux_anchor)"
  if [[ -z "${anchor}" ]]; then
    echo "No supported CA trust tool (update-ca-trust / update-ca-certificates)." >&2; return 1
  fi
  if [[ -f "${anchor}" ]] && cmp -s "${crt}" "${anchor}"; then
    echo "Caddy local root CA already installed at ${anchor}."; return 0
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Root privileges are required to update the system trust store." >&2
    echo "Re-run with sudo:  sudo '$0' --deploy-dir '${DEPLOY_DIR}' --no-start" >&2
    return 1
  fi
  install -m 0644 "${crt}" "${anchor}"
  linux_refresh
  echo "Trusted Caddy local root CA in the system CA store (${anchor})."
  echo "Note: browsers/apps using their own NSS store (~/.pki/nssdb) may need a restart."
}
linux_remove() {
  local anchor; anchor="$(linux_anchor)"
  [[ -n "${anchor}" && -f "${anchor}" ]] || { echo "No SSTPA CA anchor to remove."; return 0; }
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Root privileges are required to remove the system trust anchor (skipping)." >&2; return 0
  fi
  rm -f "${anchor}"; linux_refresh
  echo "Removed Caddy local root CA from the system CA store."
}

# ---- dispatch -----------------------------------------------------------
TMP_CA="$(mktemp)"; trap 'rm -f "${TMP_CA}"' EXIT

case "${MODE}" in
  check)
    if obtain_ca "${TMP_CA}"; then
      sha1="$(ca_sha1 "${TMP_CA}")"
      case "${OS}" in
        Darwin) macos_is_trusted "${sha1}" && echo "TRUSTED (SHA-1 ${sha1})" || echo "NOT trusted (SHA-1 ${sha1})" ;;
        Linux)  anchor="$(linux_anchor)"; { [[ -n "${anchor}" && -f "${anchor}" ]] && echo "TRUSTED (${anchor})"; } || echo "NOT trusted" ;;
        *)      echo "Unsupported platform for --check: ${OS}" ;;
      esac
    else
      echo "Caddy local root CA is not available (is the Backend running?)." >&2; exit 1
    fi
    ;;
  install)
    if ! obtain_ca "${TMP_CA}"; then
      echo "FAIL: could not obtain Caddy's local root CA." >&2
      echo "      Start the Backend first (cd '${DEPLOY_DIR}' && docker compose up -d), then re-run." >&2
      exit 1
    fi
    install -m 0644 "${TMP_CA}" "${STORED_CA}" 2>/dev/null || cp "${TMP_CA}" "${STORED_CA}"
    case "${OS}" in
      Darwin) macos_install "${TMP_CA}" ;;
      Linux)  linux_install "${TMP_CA}" ;;
      *) echo "Unsupported platform: ${OS}. Trust ${STORED_CA} manually." >&2; exit 1 ;;
    esac
    ;;
  remove)
    sha1=""
    if obtain_ca "${TMP_CA}" 2>/dev/null; then sha1="$(ca_sha1 "${TMP_CA}")"; fi
    case "${OS}" in
      Darwin) macos_remove "${sha1}" ;;
      Linux)  linux_remove ;;
      *) echo "Unsupported platform: ${OS}." >&2 ;;
    esac
    rm -f "${STORED_CA}" 2>/dev/null || true
    ;;
esac
