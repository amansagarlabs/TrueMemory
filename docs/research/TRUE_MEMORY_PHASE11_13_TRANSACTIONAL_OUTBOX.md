# TrueMemory Phase 11.13 — Transactional Memory Outbox

Status: **PARTIAL — write-path audit complete; general atomic mutation + job coupling not yet implemented**.

## Write-path audit

| Path | Durable owner | Job behavior | Classification | Current boundary |
|---|---|---|---|---|
| REST `/v1/memories` | `MemoryClient.remember` → `MemoryCore` repository | no follow-up job | synchronous | memory authorization/storage transaction only |
| REST forget | `MemoryClient.forget` → repository | no job | synchronous | memory mutation only |
| Memory Notes save | notes route → `MemoryClient.remember` per candidate | no job | synchronous | each write handled independently |
| consolidation commit | consolidation route → `MemoryClient.remember` | no job | synchronous experimental commit | candidate revalidation/Governor/ConflictResolver before write |
| source ingestion | `create_ingestion_job` → `memory_ingestion_jobs` | existing durable job | sync request + async worker | PostgreSQL job transaction is canonical |
| ingestion worker | `claim_next_ingestion_job` → `process_ingestion_job` | existing lease/retry/checkpoints | async | worker owns lifecycle; services own domain behavior |
| profile/workspace managed memory | profile/workspace store helpers | no generalized job | synchronous | separate repository paths; not transactionally coupled to jobs |

The existing ingestion path is the only audited path that currently combines durable async job state with its operation contract. No route writes Redis directly.

## Canonical job system

`memory_ingestion_jobs` remains the durable job/outbox substrate. Its idempotency constraint, PostgreSQL claim/lease, retry scheduling, checkpoint, and worker heartbeat behavior are reused. No second outbox table, retry system, lease system, or worker was introduced.

## Atomicity result

The general invariant “memory mutation and required async job commit or roll back together” is **not yet proven for all memory writes**. Implementing it safely requires selecting specific writes that genuinely need follow-up work and threading one PostgreSQL connection through the existing repository and job insert. Redis cannot participate in this correctness boundary.

## Failure and safety matrix

| Component | Failure | Sync memory | Durable job | Recovery |
|---|---|---|---|---|
| PostgreSQL | unavailable/rollback | explicit failure; no false success | no durable job | restore PostgreSQL and retry safely |
| Redis | unavailable | unaffected where async dispatch is optional | remains in PostgreSQL | worker polling/re-dispatch |
| worker | crash after claim | prior API result unaffected | lease expiry makes job reclaimable | another worker claims |
| LLM/provider | transient | current sync contract decides | bounded worker retry where job-backed | retry limit then failed |
| Milvus/vector | unavailable | PostgreSQL memory remains authoritative | derived work can retry/rebuild | structured fallback where supported |
| FastAPI process | crash after DB commit | client may see timeout | durable job remains | later worker recovery |
| network | timeout/reset | classified by retry policy | durable state unchanged | bounded retry with idempotency |
| lease expiry | worker disappeared | unrelated sync state unaffected | queued/reclaimable | claim by another worker |

## Not verified

Disposable PostgreSQL rollback, concurrent idempotent writes, concurrent worker claims, crash-after-commit, Redis failure, and outbox overhead measurements were not executed because the disposable database/worker environment was unavailable. No production readiness, HA, zero-downtime, or automatic-failover claim is made.
