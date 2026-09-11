# Phase 9.8 Results

Disposable test topology added: isolated PostgreSQL, API, and MCP health probe.
External MCP smoke client now requires canonical tools and skips legacy-only
optional tools. Live lifecycle result is NOT VERIFIED until the opt-in stack is
run with generated credentials. No production data or credentials are used.

## Windows workflow

Compose file is canonical at repository root. From either repository root or
`backend`, run:

```powershell
$env:TRUEMEMORY_TEST_DB_PASSWORD="temporary-test-password"
powershell -ExecutionPolicy Bypass -File .\scripts\memory-e2e.ps1 config
powershell -ExecutionPolicy Bypass -File .\scripts\memory-e2e.ps1 up
powershell -ExecutionPolicy Bypass -File .\scripts\memory-e2e.ps1 ps
powershell -ExecutionPolicy Bypass -File .\scripts\memory-e2e.ps1 down
```

When started from `backend`, use `..\scripts\memory-e2e.ps1`.
