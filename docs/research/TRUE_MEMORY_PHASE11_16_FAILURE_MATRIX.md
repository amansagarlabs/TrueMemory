# TrueMemory Phase 11.16 — Failure Matrix

Status: **PARTIAL**. Missing evidence is recorded as pending/skipped rather
than being converted into a pass.

| Failure | Affected functionality | Retryable | Recovery/data safety | Evidence |
|---|---|---|---|---|
| PostgreSQL unavailable | Durable memory/jobs/readiness | No blind replay | Readiness fails; no durable success | pending |
| PostgreSQL transaction failure | Current mutation | Caller-dependent | Mutation and job roll back together | disposable runner |
| PostgreSQL restart | Requests during restart | Bounded reconnect only | Durable rows remain truth | pending |
| Redis unavailable | Optional dispatch acceleration | Transport retry only | Job remains in PostgreSQL | skipped when unconfigured |
| Worker unavailable | Async completion | Lease recovery | Pending jobs remain recoverable | pending |
| Worker crash after claim | One running job | Lease expiry/reclaim | No permanent RUNNING row | disposable runner |
| Duplicate delivery | Worker processing | No blind duplicate effect | Idempotency must collapse outcome | pending handler injection |
| FastAPI crash after commit | Response delivery | Client retry with key | One semantic mutation | pending process supervisor |
| 408/429/502/503/504 | Safe/idempotent HTTP operation | Yes | Bounded retry and typed final error | policy tests |
| 400/401/403/404/409/422 | Invalid/auth/conflict request | No by default | Typed controlled error | policy tests |
| Stream before first token | Chat answer | Explicit only | Controlled error | pending |
| Stream after partial output | Chat answer | No full replay | No duplicated assistant output | pending |
| LLM/Milvus/network timeout | Upstream operation | Boundary-specific | Correlated timeout; no false durable success | pending |

No claim is made about HA, zero downtime, automatic failover, production
readiness, or production root cause.
