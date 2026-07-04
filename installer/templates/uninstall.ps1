# SSTPA Tools uninstaller (Windows PowerShell).
#
# Stops the Backend stack, optionally removes its Docker volumes (the model
# database!), and deletes the installation directory.
#
# 2025 Nicholas Triska. All rights reserved.
param(
  [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
$Prefix = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $Prefix "deploy\docker-compose.yml"))) {
  throw "$Prefix does not look like an SSTPA Tools installation (no deploy\docker-compose.yml)."
}

$Docker = Get-Command docker -ErrorAction SilentlyContinue
if ($Docker) {
  & docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "==> Stopping the SSTPA Backend"
    Push-Location (Join-Path $Prefix "deploy")
    try {
      if ($PurgeData) {
        & docker compose down -v --remove-orphans
      } else {
        & docker compose down --remove-orphans
      }
    } finally {
      Pop-Location
    }
  } else {
    Write-Warning "Docker daemon unreachable; skipping backend shutdown."
  }
} else {
  Write-Warning "Docker unavailable; skipping backend shutdown."
}

if ($PurgeData) {
  Write-Host "==> Data volumes removed (model database and telemetry deleted)."
} else {
  Write-Host "==> Data volumes kept. Remove later with: docker volume ls --filter name=sstpa-backend"
}

$TrustHelper = Join-Path $Prefix "trust-ca.ps1"
if (Test-Path $TrustHelper) {
  Write-Host "==> Removing Caddy's local root CA from the trust store"
  try {
    & powershell -ExecutionPolicy Bypass -File $TrustHelper -Remove -NoStart
  } catch {
    Write-Warning "Could not remove the Caddy CA; remove 'Caddy Local Authority' from Cert:\CurrentUser\Root manually if desired."
  }
}

Write-Host "==> Removing $Prefix"
Set-Location $env:TEMP
Remove-Item -Recurse -Force $Prefix
Write-Host "SSTPA Tools uninstalled."
