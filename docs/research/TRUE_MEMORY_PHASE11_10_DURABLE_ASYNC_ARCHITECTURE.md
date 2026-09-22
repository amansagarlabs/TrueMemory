# TrueMemory Phase 11.10 — Durable Async Architecture

Status: **PARTIAL — durable PostgreSQL job foundation exists; adapter contract added**.

Phase 11.11 audit confirms that the existing `memory_ingestion_jobs`/`memory_ingestion_worker` path is the canonical durable substrate. It should be generalized rather than replaced; see `TRUE_MEMORY_PHASE11_11_DURABLE_OUTBOX.md`.

## Source of truth

The existing `memory_ingestion_jobs` PostgreSQL table and `memory_ingestion_worker` provide durable job state, idempotency keys, attempts, leases, retries, checkpoints and cancellation. MemoryCore/FastAPI/PostgreSQL remain authoritative. No second job database was introduced.

## Queue boundary

`backend/services/job_queue.py` defines `JobEnvelope` and provider-neutral `JobQueue`. `UpstashRedisQueue` is an optional transport for publishing references after durable state exists. `InMemoryJobQueue` is test-only. Missing Redis configuration returns PostgreSQL-only recovery mode; synchronous memory operations do not depend on Redis.

Workers must invoke existing extraction, Governor, ConflictResolver, consolidation and MemoryCore services. They do not own memory semantics. Job payloads use references such as event/candidate IDs and avoid copying raw memory into transport logs.

## Failure matrix

| Failure | Affected | Unaffected | Recovery |
|---|---|---|---|
| Redis unavailable | dispatch/worker throughput | committed memory and durable job row | dispatcher retries pending PostgreSQL jobs |
| Worker unavailable | async completion | synchronous API correctness | lease expiry/retry and worker restart |
| duplicate delivery | one transport delivery | semantic state | idempotency key/candidate ID |
| PostgreSQL unavailable | durable operation | no false success | return explicit failure; restore database |
| vector index unavailable | derived retrieval | canonical PostgreSQL memory | rebuild derived index |

## Sync/async boundary

Synchronous: authentication, authorization, response-critical retrieval, correctness-critical memory writes, Governor/ConflictResolver checks and streaming responses. Async candidates: non-critical extraction, optional embeddings, consolidation, compression, relationship enrichment, source processing and telemetry aggregation.

## Cloudflare

Cloudflare remains an optional thin edge/router/WAF layer. It is not the queue, memory engine or source of truth. Cloudflare Workers and Queues are not implemented in this phase.

## Safety and limitations

Production HA, zero downtime, external worker deployment, transactional memory-plus-job writes for every operation, and end-to-end Redis/worker failure tests remain unverified. Production consolidation remains disabled and Convex is not introduced.
