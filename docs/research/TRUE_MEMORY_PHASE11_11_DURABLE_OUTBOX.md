# TrueMemory Phase 11.11 — Unified Durable Jobs and Outbox

Status: **PARTIAL — existing durable ingestion jobs audited; generic unification not yet complete**.

Phase 11.12 adds the minimal authenticated `GET /v1/jobs/{job_id}` status contract over the same existing job table. It does not add another repository or lifecycle.

## Canonical existing substrate

The canonical durable job system is `memory_ingestion_jobs` in `backend/services/memory_ingestion.py` and `backend/db/init/017_memory_ingestion.sql`. `create_ingestion_job` persists scoped jobs with a unique `(user_id, idempotency_key)` constraint. `claim_next_ingestion_job` uses PostgreSQL row locking and lease expiry. `update_job`, `schedule_ingestion_retry`, `renew_ingestion_lease`, checkpoints, item uniqueness and worker heartbeats provide the existing lifecycle and crash-recovery primitives. `backend/worker/memory_ingestion_worker.py` is the current consumer and invokes existing ingestion/memory services.

This is the substrate to generalize. No second job table, lease system, retry engine, or worker state machine was introduced.

## Current mapping

`JobEnvelope` is a transport-level reference envelope. PostgreSQL job rows remain authoritative; `UpstashRedisQueue` is optional dispatch transport only. The current worker polls PostgreSQL directly, so Redis failure cannot erase a durable job. A future dispatcher may publish existing job IDs after commit, but must not claim a job in a way that prevents the existing worker from processing it.

## Transaction boundary

The existing ingestion creation path has durable PostgreSQL job creation and idempotency. A general atomic “arbitrary MemoryCore mutation plus follow-up job” transaction is not yet wired across every memory write path. That remains an explicit gap; this phase does not claim transactional outbox coverage for all writes.

## Failure behavior

| Failure | Durable result | Recovery |
|---|---|---|
| Redis unavailable | PostgreSQL job remains queued | existing worker polling or later dispatcher |
| worker crash after claim | lease expires | another worker can reclaim |
| transient processing failure | bounded retry with `next_attempt_at` | worker retry loop |
| duplicate creation | idempotency constraint | existing row returned |
| PostgreSQL unavailable | durable operation fails | no false success |

## Security

Jobs carry user/workspace/agent scope and references. Worker access is bounded by the persisted job context; raw secrets and large memory payloads should not be sent through Redis or logs. Production/test database separation remains required before database E2E.

## Remaining work

Generalize the existing ingestion schema/handlers for extraction, embeddings and approved consolidation; add a safe dispatcher state distinct from worker leases; prove atomic memory-plus-job transactions; run disposable PostgreSQL/Redis/worker failure tests; and measure outbox overhead. Cloudflare remains outside the domain and is not implemented.
