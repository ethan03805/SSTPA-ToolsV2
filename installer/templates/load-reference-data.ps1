# SSTPA Reference Data load step for Windows (SRS §9.7): verify the artifact
# SHA-256, extract the Cypher load script, execute it against the deployment
# Neo4j via cypher-shell, and verify the post-load node count.
#
# 2025 Nicholas Triska. All rights reserved.
param(
  [Parameter(Mandatory = $true)][string]$Artifact,
  [string]$DeployDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $DeployDir) {
  $DeployDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "deploy"
}
if (-not (Test-Path (Join-Path $DeployDir "docker-compose.yml"))) {
  throw "DeployDir $DeployDir does not contain docker-compose.yml"
}

# Neo4j password: environment override, else deploy\.env.
$Password = $env:SSTPA_NEO4J_PASSWORD
if (-not $Password) {
  $EnvFile = Join-Path $DeployDir ".env"
  if (Test-Path $EnvFile) {
    $line = Select-String -Path $EnvFile -Pattern '^SSTPA_NEO4J_PASSWORD=(.*)$' | Select-Object -Last 1
    if ($line) { $Password = $line.Matches[0].Groups[1].Value.Trim() }
  }
}
if (-not $Password) {
  throw "SSTPA_NEO4J_PASSWORD is not set and $DeployDir\.env does not define it."
}

Write-Host "==> Verifying artifact checksum"
$ChecksumFile = "$Artifact.sha256"
if (-not (Test-Path $ChecksumFile)) { throw "Missing checksum file: $ChecksumFile" }
$Expected = ((Get-Content $ChecksumFile -Raw).Trim() -split '\s+')[0].ToLower()
$Actual = (Get-FileHash -Algorithm SHA256 -Path $Artifact).Hash.ToLower()
if ($Expected -ne $Actual) {
  throw "Checksum mismatch for $Artifact (expected $Expected, got $Actual)"
}
Write-Host "    OK"

$Work = Join-Path ([System.IO.Path]::GetTempPath()) ("sstpa-ref-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $Work | Out-Null
try {
  tar -xzf $Artifact -C $Work
  $Script = Get-ChildItem -Path $Work -Filter "sstpa-ref-load-*.cypher" | Select-Object -First 1
  if (-not $Script) { throw "No sstpa-ref-load-*.cypher found in the artifact" }
  Write-Host "==> Load script: $($Script.Name)"

  Push-Location $DeployDir
  try {
    $Container = (& docker compose ps -q neo4j).Trim()
    if (-not $Container) {
      throw "The neo4j service is not running. Start the Backend first: cd `"$DeployDir`"; docker compose up -d"
    }
    Write-Host "==> Copying into neo4j container and executing (this takes a few minutes)"
    & docker cp $Script.FullName "${Container}:/tmp/ref-load.cypher"
    & docker compose exec -T neo4j cypher-shell -u neo4j -p $Password -f /tmp/ref-load.cypher | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "cypher-shell load failed" }
    & docker compose exec -T neo4j rm -f /tmp/ref-load.cypher

    Write-Host "==> Verifying post-load counts against the load script header"
    $HeaderMatch = Select-String -Path $Script.FullName -Pattern 'Expected reference node count\D*(\d+)' | Select-Object -First 1
    $CountQuery = "MATCH (n:REF) WHERE coalesce(n.IsFrameworkRoot, false) = false RETURN count(n);"
    $ActualCount = (& docker compose exec -T neo4j cypher-shell -u neo4j -p $Password --format plain $CountQuery |
      Select-Object -Last 1).Trim().Trim('"')
    if ($HeaderMatch) {
      $ExpectedCount = $HeaderMatch.Matches[0].Groups[1].Value
      Write-Host "    expected=$ExpectedCount actual=$ActualCount"
      if ($ExpectedCount -ne $ActualCount) { throw "Reference node count mismatch" }
    } else {
      Write-Warning "Load script has no 'Expected reference node count' header; loaded $ActualCount reference nodes (count check skipped)."
    }
    Write-Host "==> Reference data loaded and verified."
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
}
