# TrueMemory Phase 11.16 — Failure Recovery Evidence

## Status

**PARTIAL.** Existing retry and durable-job boundaries were hardened and a
guarded disposable runner was added. Process supervision, worker fault
injection, Redis comparison, live SDK HTTP tests, and controlled streaming
termination still need execution.

## Safety and command

The runner requires `--disposable-test`,
`TRUEMEMORY_RUNTIME_ENV=disposable-test`, and a loopback API URL. It rejects
Render, Supabase, Neon, Upstash, production, and other hosted markers.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\run_phase11_16_failure_recovery.ps1
```

It writes `docs/research/TRUE_MEMORY_PHASE11_16_FAILURE_RECOVERY_EVIDENCE.json`.
No production data is touched.

## Implemented

- Retry classification for 408, 429, 502, 503, and 504.
- Safe methods retry; mutations require an idempotency key.
- 400, 401, 403, 404, 409, and 422 do not retry by default.
- Bounded jittered backoff and capped Retry-After seconds/HTTP-date parsing.
- Python and TypeScript typed errors preserve status and request correlation.
- TypeScript preserves one request ID across retries.
- Python promotes mutation idempotency to the request header.
- Existing PostgreSQL lease query uses `FOR UPDATE SKIP LOCKED`.

## Disposable checks

When disposable database identity variables are supplied, the runner executes
real PostgreSQL rollback/commit checks and expires/reclaims a real ingestion
lease. Without them it records `SKIPPED`; it never substitutes an in-memory
transaction.

## Not verified

Process crash after commit, duplicate worker delivery, transient/permanent
handler failures, Redis outage/restoration, live 408/429/502/503/504 injection,
FastAPI/PostgreSQL/worker restarts, provider/database/Milvus timeout injection,
streaming termination, and production 502/503/504 root cause.
