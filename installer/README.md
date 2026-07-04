# SSTPA Tools Installer

This directory contains packaging scripts for the Installer segment described by
SRS section 7. The scripts do not add a new installer framework; they stage the
existing product segments into a release payload:

- Backend Docker Compose topology and backend image build context.
- Frontend Tauri bundle outputs when built on the host platform.
- Startup Software Tauri bundle outputs when built on the host platform.
- Documentation, schema, SBOM, NOTICE, README, and visual assets.
- Latest validated `sstpa-ref-data-*.tar.gz` Reference Data artifact.
- Optional Docker image archives for air-gapped installation.

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
falls back to `npm run build` plus `cargo build --release` and stages the
release binaries under `payload/bundles/*/bin`. On Linux, the script also checks
the visible inotify instance count before invoking the Tauri CLI; if the host is
at or near `/proc/sys/fs/inotify/max_user_instances`, it skips the native bundle
attempt to avoid the Tauri CLI watcher panic and uses the release-binary path.

The generated `manifests/package.properties` records `tauriRequested`,
`tauriBuilt`, `frontendBundleStatus`, and `startupBundleStatus` so release
audits can tell native bundles from fallback binaries.

By default, `build-package.sh` verifies and stages the newest validated
`sustainment/artifacts/sstpa-ref-data-*.tar.gz` bundle under
`payload/reference-data/`. Use `--skip-reference-data` only for fast source
staging checks where Reference Tool data is intentionally omitted.

Output is written to `installer/out/` and ignored by Git.

## Install From A Package

Linux/macOS:

```bash
./install.sh --prefix "$HOME/.local/share/sstpa-tools"
```

Windows PowerShell:

```powershell
.\install.ps1 -Prefix "$env:LOCALAPPDATA\SSTPA-Tools"
```

The install helpers copy the staged payload and load any bundled Docker images.
They do not start the Backend automatically; Startup Software remains the normal
user entry point. When a Reference Data artifact is included, the helpers print
the `deploy/load-reference-data.sh` command to run after the Backend is healthy.
