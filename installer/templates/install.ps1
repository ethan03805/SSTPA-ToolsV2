param(
  [string]$Prefix = "$env:LOCALAPPDATA\SSTPA-Tools"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $ScriptDir "payload"

if (-not (Test-Path $Payload)) {
  throw "Payload directory not found: $Payload"
}

New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
Copy-Item -Path (Join-Path $Payload "*") -Destination $Prefix -Recurse -Force

$ImagesDir = Join-Path $Payload "images"
if (Test-Path $ImagesDir) {
  $Docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($Docker) {
    Get-ChildItem -Path $ImagesDir -Filter "*.tar" | Sort-Object Name | ForEach-Object {
      docker load -i $_.FullName
    }
  }
}

Write-Host "SSTPA Tools installed to $Prefix"
Write-Host "Backend stack: cd `"$Prefix\deploy`"; docker compose up -d"
Write-Host "Startup bundles, when built for this platform, are under $Prefix\bundles\startup"
