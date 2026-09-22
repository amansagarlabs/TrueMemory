# TrueMemory Phase 11.15 — Runtime Reliability Evidence

Status: **PARTIAL**, with a completed disposable PostgreSQL + FastAPI + worker smoke/E2E run.

## Environment

- Compose project: `truememory-phase11-15`
- PostgreSQL 16: disposable `truememory_test` database
- FastAPI: real `main:app` container on `http://127.0.0.1:18000`
- Existing `memory_ingestion_worker` container
- PostgreSQL polling mode; Redis/Upstash disabled
- Test-only identities and tokens; no production database, queue, cookies, or provider keys
- Safety guard rejects non-local API/database hosts and hosted production markers

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\run_phase11_15_e2e.ps1
```

The runner builds the containers, initializes the disposable schema, seeds temporary identities, executes real HTTP requests, writes a JSON evidence artifact, and tears the stack down.

## Disposable runtime result

**18 passed, 0 failed**.

Verified over real HTTP:

| Area | Result |
|---|---|
| Liveness `/health` | PASS — 200 |
| Readiness `/readiness` with PostgreSQL and worker present | PASS — 200 |
| Memory health | PASS — 200 |
| Missing authentication | PASS — 401 |
| Pydantic validation and structured error contract | PASS — 422 with `code`, `retryable`, `request_id` |
| Memory write/list/search/get | PASS |
| Cross-user memory isolation | PASS — user B received 404 |
| Durable ingestion job creation | PASS — PostgreSQL row created |
| Concurrent same-key job requests | PASS — one logical job |
| Same key with changed payload | PASS — 409 conflict |
| Existing worker processing | PASS — `candidate_ready` |
| Performance endpoint | PASS — 200 |

Disposable HTTP latency samples: p50 **30.76 ms**, p95 **43.28 ms**, p99 **55.56 ms** across 15 samples. These are test-environment measurements, not production performance.

## Fixes proven by the run

- Framework-generated validation errors now use the public structured error contract.
- Ingestion idempotency keys reject changed payloads instead of silently reusing the original job.
- Workspace-bound tokens reject an explicitly different workspace with 403.
- Metrics snapshots no longer deadlock when histogram data exists; the performance endpoint is responsive.
- The test compose file no longer imports the local `.env`; it uses explicit disposable settings and an isolated project name.

## Not verified in this phase

- Real HTTP failure injection for 408/429/502/503/504, Retry-After, backoff, and retry exhaustion
- Python and TypeScript SDK against the disposable HTTP stack
- PostgreSQL rollback/crash transaction tests
- Worker termination, lease expiry, reclaim, transient retry, and permanent failure paths
- Redis healthy/outage/transient-failure comparison
- FastAPI/worker process restart persistence
- Streaming failure before/after first token
- Full API status matrix, full backend regression, frontend production build
- Production 502/503/504 root cause

No production readiness, HA, zero-downtime, or production root-cause claim is made. Production evidence remains **NOT VERIFIED**.

## Evidence artifact

The machine-readable result is [TRUE_MEMORY_PHASE11_15_RUNTIME_RELIABILITY_EVIDENCE.json](./TRUE_MEMORY_PHASE11_15_RUNTIME_RELIABILITY_EVIDENCE.json).
