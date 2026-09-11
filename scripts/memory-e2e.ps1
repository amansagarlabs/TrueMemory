param(
  [ValidateSet('config','up','ps','down')]
  [string]$Action = 'config'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $repoRoot 'docker-compose.test.yml'
if (-not (Test-Path -LiteralPath $compose)) { throw "Missing compose file: $compose" }
if (-not $env:TRUEMEMORY_TEST_DB_PASSWORD) { throw 'TRUEMEMORY_TEST_DB_PASSWORD is required (test-only value)' }

Push-Location $repoRoot
try {
  switch ($Action) {
    'config' { docker compose -f $compose config --quiet }
    'up' { docker compose -f $compose up -d --build }
    'ps' { docker compose -f $compose ps }
    'down' { docker compose -f $compose down -v }
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
