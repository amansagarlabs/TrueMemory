param(
    [switch]$KeepStack
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
$composeFile = Join-Path $repoRoot "docker-compose.test.yml"
$projectName = "truememory-phase11-16"
$apiPort = if ($env:TRUEMEMORY_TEST_API_PORT) { $env:TRUEMEMORY_TEST_API_PORT } else { "18016" }
$dbPort = if ($env:TRUEMORY_TEST_DB_PORT) { $env:TRUEMORY_TEST_DB_PORT } else { "55448" }
$baseUrl = "http://127.0.0.1:$apiPort"
$testPassword = if ($env:TRUEMEMORY_TEST_DB_PASSWORD) { $env:TRUEMORY_TEST_DB_PASSWORD } else { "truememory-test-only" }

if ($testPassword -match "(?i)(prod|supabase|render|upstash|neon)") {
    throw "Refusing a non-disposable test password/configuration marker."
}
$env:TRUEMEMORY_TEST_DB_PASSWORD = $testPassword
$env:TRUEMEMORY_TEST_MODE = "1"
$env:TRUEMORY_RUNTIME_ENV = "disposable-test"
$env:TRUEMEMORY_E2E_BASE_URL = $baseUrl
$env:TRUEMEMORY_E2E_DATABASE_URL = "postgresql://truememory_test:$testPassword@127.0.0.1:$dbPort/truememory_test"

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
    $env:TRUEMEMORY_E2E_USER_ID = $identity.user_a_id
    $env:TRUEMEMORY_E2E_WORKSPACE_ID = $identity.workspace_a_id

    $reportPath = Join-Path $repoRoot "docs\research\TRUE_MEMORY_PHASE11_16_FAILURE_RECOVERY_EVIDENCE.json"
    python (Join-Path $repoRoot "backend\scripts\phase11_16_failure_recovery.py") --base-url $baseUrl --report-path $reportPath --disposable-test
    if ($LASTEXITCODE -ne 0) { throw "Phase 11.16 runner reported a hard failure." }
} finally {
    if (-not $KeepStack) { Invoke-Compose "down" "--remove-orphans" }
}
