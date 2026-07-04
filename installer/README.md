# SSTPA Tools Installer

This directory contains the packaging scripts for the Installer segment
(SRS §2: SSTPA Tools ships as four independently operable segments; the
Installer delivers the other three). `build-package.sh` stages the product
into a release payload:

- Backend Docker Compose topology and backend image build context.
- Frontend and Startup release binaries under `payload/bundles/*/bin`
  (plus native Tauri bundles when the host platform produced them).
- Documentation, schema, SBOM, NOTICE, README, and visual assets.
- Latest validated `sstpa-ref-data-*.tar.gz` Reference Data artifact.
- Optional Docker image archives for air-gapped installation.
- Install/uninstall helpers for Linux/macOS (`install.sh`, `uninstall.sh`)
  and Windows (`install.ps1`, `uninstall.ps1`, `load-reference-data.ps1`).
- Caddy local-CA trust helpers (`trust-ca.sh`, `trust-ca.ps1`).

Local deployment secrets are **never packaged**: `deploy/.env` and
`deploy/docker-compose.override.yml` are excluded from the payload, and the
install helpers generate a fresh `.env` with random passwords per
installation.

## Build A Package

```bash
./installer/scripts/build-package.sh --save-images
```

Useful options:

- `--skip-tauri`: skip desktop bundle builds and stage source/config only.
- `--skip-docker`: skip `docker compose build backend`.
- `--skip-reference-data`: skip Reference Data artifact packaging.
- `--reference-artifact PATH`: package a specific validated Reference Data artifact.
- `--save-images`: save required container images into the package.
- `--version X.Y.Z`: override the package version.
- `--out PATH`: override the output directory.

When the host Tauri CLI cannot produce native bundles, `build-package.sh`
falls back to `npm run build` plus `cargo build --release`. In every case the
raw release binaries are staged under `payload/bundles/*/bin` — the layout
the Startup Software's frontend discovery uses. On Linux, the script also
checks the visible inotify instance count before invoking the Tauri CLI; if
the host is at or near `/proc/sys/fs/inotify/max_user_instances`, it skips
the native bundle attempt to avoid the Tauri CLI watcher panic.

The generated `manifests/package.properties` records `tauriRequested`,
`tauriBuilt`, `frontendBundleStatus`, `startupBundleStatus`, and
`referenceDataStatus` so release audits can tell native bundles from
fallback binaries.

Output is written to `installer/out/` and ignored by Git.

## Install From A Package

Linux/macOS:

```bash
./install.sh                      # /opt/sstpa-tools (root) or ~/.local/share/sstpa-tools
./install.sh --prefix /some/path
```

Windows PowerShell:

```powershell
.\install.ps1                     # %LOCALAPPDATA%\SSTPA-Tools
.\install.ps1 -Prefix "D:\SSTPA-Tools"
```

The installers verify Docker Engine/Desktop with Compose v2, copy the
payload, generate `deploy/.env` with fresh random credentials (kept on
re-install), and load any bundled Docker images. Apart from the CA-trust step
below they do not start the Backend: the **Startup Software**
(`bundles/startup/bin/sstpa-startup`) is the user entry point (SRS §4). On
first launch it starts the Backend, walks the user through creating the
**RootAdmin** account (SRS §3.2 "the Installer becomes the RootAdmin"), and
opens the GUI.

When a Reference Data artifact is included, the installers print the exact
load command (`deploy/load-reference-data.sh` on Linux/macOS,
`load-reference-data.ps1` on Windows) to run once the Backend is healthy.

### Trusting Caddy's local root CA

The Backend terminates TLS at Caddy with an internal (`local_certs`) CA
(SRS §5.4). The desktop GUI's webview connects to `https://localhost` and, in a
production build, validates that certificate directly — so the host must trust
Caddy's local root CA, or the GUI's first connection fails on an untrusted
certificate. (The Startup Software's own health/auth probes use `curl -k` and
do not need this; only the GUI webview does.)

Caddy mints the root CA on first startup, so the installers bring the stack up
once (when Docker is reachable) and run the trust helper automatically. Pass
`--skip-ca-trust` (`-SkipCaTrust` on Windows) to opt out, then run it yourself
later:

```bash
<prefix>/trust-ca.sh            # trust (starts the Backend to mint the CA if needed)
<prefix>/trust-ca.sh --check    # report trust status, change nothing
<prefix>/trust-ca.sh --remove   # untrust
```

```powershell
powershell -File "<prefix>\trust-ca.ps1"          # trust
powershell -File "<prefix>\trust-ca.ps1" -Check   # status only
powershell -File "<prefix>\trust-ca.ps1" -Remove  # untrust
```

Trust store per platform: macOS System keychain when run as root, otherwise
your login keychain (a macOS authorization dialog confirms the change); Linux
`update-ca-trust`/`update-ca-certificates` anchors (needs root); Windows
`CurrentUser\Root`, which WebView2 trusts and which needs **no** elevation. The
uninstallers reverse the trust automatically.

## Uninstall

```bash
<prefix>/uninstall.sh              # keeps the model database volumes
<prefix>/uninstall.sh --purge-data # deletes them
```

```powershell
powershell -File "<prefix>\uninstall.ps1" [-PurgeData]
```
