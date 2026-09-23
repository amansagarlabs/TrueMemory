param(
    [string]$OutputDirectory = "backend/policies/bundle"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command opa -ErrorAction SilentlyContinue)) {
    throw "OPA CLI is required to compile Rego policies; no OPA server is started."
}

$bundle = Join-Path $OutputDirectory "policy-bundle.tar.gz"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
opa build -t wasm -e truememory/decision backend/policies/decision.rego -o $bundle

$extract = Join-Path $OutputDirectory "_extract"
if (Test-Path $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extract | Out-Null
tar -xzf $bundle -C $extract
$wasm = Get-ChildItem -LiteralPath $extract -Filter policy.wasm -Recurse | Select-Object -First 1
if (-not $wasm) { throw "OPA bundle did not contain policy.wasm" }
Copy-Item -LiteralPath $wasm.FullName -Destination (Join-Path $OutputDirectory "policy.wasm") -Force
Remove-Item -LiteralPath $extract -Recurse -Force
Write-Output "Built $OutputDirectory/policy.wasm"
