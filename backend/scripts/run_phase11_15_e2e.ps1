param(
    [switch]$KeepStack
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
$composeFile = Join-Path $repoRoot "docker-compose.test.yml"
$projectName = "truememory-phase11-15"
$apiPort = if ($env:TRUEMEMORY_TEST_API_PORT) { $env:TRUEMORY_TEST_API_PORT } else { "18000" }
$dbPort = if ($env:TRUEMEMORY_TEST_DB_PORT) { $env:TRUEMORY_TEST_DB_PORT } else { "55432" }
$baseUrl = "http://127.0.0.1:$apiPort"
$testPassword = if ($env:TRUEMORY_TEST_DB_PASSWORD) { $env:TRUEMORY_TEST_DB_PASSWORD } else { "truememory-test-only" }

if ($testPassword -match "(?i)(prod|supabase|render|upstash|neon)") {
    throw "Refusing a non-disposable test password/configuration marker."
}

$env:TRUEMEMORY_TEST_DB_PASSWORD = $testPassword
$env:TRUEMORY_TEST_MODE = "1"
$env:TRUEMORY_RUNTIME_ENV = "disposable-test"
$env:TRUEMORY_E2E_BASE_URL = "http://127.0.0.1:$apiPort"
$env:TRUEMORY_E2E_DATABASE_URL = "postgresql://truememory_test:$testPassword@127.0.0.1:$dbPort/truememory_test"

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
    & docker compose -p $projectName -f $composeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed with exit code $LASTEXITCODE" }
}

function Wait-Http {
    param([string]$Uri)
    $deadline = (Get-Date).AddMinutes(3)
    do {
        & curl.exe --fail --silent --show-error --max-time 5 $Uri 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $Uri"
}

try {
    Invoke-Compose "down" "--volumes" "--remove-orphans"
    Invoke-Compose "up" "--detach" "--build" "postgres-test" "api-test" "memory-ingestion-worker-test"
    Wait-Http "$baseUrl/health"

    $seedOutput = (& docker compose -p $projectName -f $composeFile exec -T api-test python scripts/seed_e2e_identities.py | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Disposable identity seeding failed." }
    $identity = $seedOutput | ConvertFrom-Json
    $env:TRUEMEMORY_E2E_TOKEN = $identity.tokens.token_a_ws
    $env:TRUEMEMORY_E2E_TOKEN_B = $identity.tokens.token_b_ws
    $reportPath = Join-Path $repoRoot "docs\research\TRUE_MEMORY_PHASE11_15_RUNTIME_RELIABILITY_EVIDENCE.json"
    python (Join-Path $repoRoot "backend\scripts\phase11_15_runtime_e2e.py") --base-url $baseUrl --report-path $reportPath --disposable-test
    if ($LASTEXITCODE -ne 0) { throw "Runtime E2E reported failures." }
} finally {
    if (-not $KeepStack) {
        Invoke-Compose "down" "--remove-orphans"
    }
}
