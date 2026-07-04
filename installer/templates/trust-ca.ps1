# SSTPA Tools - trust (or untrust) Caddy's local root CA on this host (Windows).
#
# The Backend terminates TLS at Caddy with an internal ("local_certs") CA
# (SRS 5.4, 5.6.6.1). A production desktop GUI connects its WebView2 control to
# https://localhost and validates that certificate directly, so the host must
# trust Caddy's local root CA. (The Startup Software's own probes use `curl -k`
# and do not need this; only the GUI WebView2 does.)
#
# The certificate is installed into the CurrentUser Root store, which WebView2
# (Edge/Chromium) trusts and which requires NO administrator elevation. Caddy
# generates the root CA on first startup, so this helper brings the Backend up
# (unless -NoStart) to obtain it. Idempotent and reversible (-Remove).
#
#   trust-ca.ps1 [-DeployDir DIR] [-NoStart]   # trust the CA (default)
#   trust-ca.ps1 -Check   [-DeployDir DIR]     # report status only
#   trust-ca.ps1 -Remove  [-DeployDir DIR]     # untrust the CA
#
# 2025 Nicholas Triska. All rights reserved.
param(
  [string]$DeployDir,
  [switch]$Check,
  [switch]$Remove,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$SelfDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DeployDir) { $DeployDir = Join-Path $SelfDir "deploy" }
$ComposeFile = Join-Path $DeployDir "docker-compose.yml"
$StoredCa = Join-Path $DeployDir "caddy-root-ca.crt"
$CaInContainer = "/data/caddy/pki/authorities/local/root.crt"
$StoreLocation = "Cert:\CurrentUser\Root"

function Test-Docker {
  $d = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $d) { return $false }
  & docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

# Write the live Caddy root CA (PEM) to $OutFile. Returns $true on success.
function Get-LiveCa([string]$OutFile) {
  if (-not (Test-Docker)) { return $false }
  Push-Location $DeployDir
  try {
    $pem = & docker compose exec -T caddy cat $CaInContainer 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $pem) { return $false }
  } finally { Pop-Location }
  Set-Content -Path $OutFile -Value $pem -Encoding ascii
  return (Select-String -Path $OutFile -Pattern "BEGIN CERTIFICATE" -Quiet)
}

# Ensure a usable CA PEM at $OutFile: running stack, then start it, then stored copy.
function Get-Ca([string]$OutFile) {
  if (Get-LiveCa $OutFile) { return $true }
  if (-not $NoStart -and (Test-Docker) -and (Test-Path $ComposeFile)) {
    Write-Host "==> Starting the Backend to generate Caddy's local root CA"
    Push-Location $DeployDir
    try { & docker compose up -d *> $null } finally { Pop-Location }
    for ($i = 0; $i -lt 30; $i++) {
      if (Get-LiveCa $OutFile) { return $true }
      Start-Sleep -Seconds 2
    }
  }
  if (Test-Path $StoredCa) { Copy-Item $StoredCa $OutFile -Force; return $true }
  return $false
}

function Get-Thumbprint([string]$CrtFile) {
  $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $CrtFile
  return $c.Thumbprint
}

$Tmp = Join-Path $env:TEMP ("sstpa-caddy-root-{0}.crt" -f $PID)
try {
  if ($Check) {
    if (Get-Ca $Tmp) {
      $tp = Get-Thumbprint $Tmp
      if (Test-Path (Join-Path $StoreLocation $tp)) { Write-Host "TRUSTED (thumbprint $tp)" }
      else { Write-Host "NOT trusted (thumbprint $tp)" }
    } else {
      Write-Error "Caddy local root CA is not available (is the Backend running?)."
      exit 1
    }
  }
  elseif ($Remove) {
    $tp = $null
    if (Get-Ca $Tmp) { $tp = Get-Thumbprint $Tmp }
    if ($tp -and (Test-Path (Join-Path $StoreLocation $tp))) {
      Remove-Item (Join-Path $StoreLocation $tp) -Force
      Write-Host "Removed Caddy local root CA from $StoreLocation."
    } else {
      Write-Host "No trusted Caddy local root CA to remove."
    }
    if (Test-Path $StoredCa) { Remove-Item $StoredCa -Force -ErrorAction SilentlyContinue }
  }
  else {
    if (-not (Get-Ca $Tmp)) {
      Write-Error "Could not obtain Caddy's local root CA. Start the Backend first (docker compose up -d) and re-run."
      exit 1
    }
    Copy-Item $Tmp $StoredCa -Force
    $tp = Get-Thumbprint $Tmp
    if (Test-Path (Join-Path $StoreLocation $tp)) {
      Write-Host "Caddy local root CA already trusted (thumbprint $tp)."
    } else {
      Import-Certificate -FilePath $Tmp -CertStoreLocation $StoreLocation | Out-Null
      Write-Host "Trusted Caddy local root CA in $StoreLocation (no elevation required)."
    }
  }
} finally {
  if (Test-Path $Tmp) { Remove-Item $Tmp -Force -ErrorAction SilentlyContinue }
}
