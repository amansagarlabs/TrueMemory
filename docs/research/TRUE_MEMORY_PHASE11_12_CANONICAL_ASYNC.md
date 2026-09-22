# TrueMemory Phase 11.12 — Canonical Durable Async

Status: **PARTIAL**.

Phase 11.13 audited the write paths and confirmed that only source ingestion currently has a durable async job coupled to its operation contract. General memory mutation plus follow-up job atomicity remains an implementation gap; the existing job table is still the required target for that future coupling.

## Canonical decision

The existing PostgreSQL `memory_ingestion_jobs` table is the durable async job/outbox substrate. The existing worker polls and claims rows with PostgreSQL locking and leases. A separate dispatcher state machine was not introduced because the current polling path already provides durable discovery, safe claiming, retry scheduling, checkpoints and crash recovery.

`MemoryCore` remains the domain authority. Workers execute existing services. Redis remains optional dispatch acceleration and is never required for synchronous memory correctness or durable job recovery. Cloudflare and Convex are not implemented.

## Job status

`GET /v1/jobs/{job_id}` returns authenticated, scope-safe lifecycle metadata without raw payloads or worker secrets. The response is backed by the existing ingestion job row.

## Atomicity boundary

The ingestion creation path persists a PostgreSQL job with an idempotency constraint. A general atomic transaction joining every MemoryCore mutation to a follow-up job is not yet wired across all write paths. No false transactional-outbox completion is claimed.

## Failure semantics

Existing leases recover worker crashes, retries are bounded by `max_attempts`, duplicate job creation is constrained by idempotency, and PostgreSQL remains recoverable when Redis is unavailable. Disposable PostgreSQL rollback, concurrent-claim, Redis outage, and worker crash E2E were not executed in this environment.

## Security

Job status is authenticated and looked up by both job ID and authenticated user ID. Responses include only lifecycle and scope metadata. Workspace/agent binding enforcement for every generalized async handler remains a required follow-up.
