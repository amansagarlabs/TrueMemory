# TrueMemory API Reliability

Status: **PARTIAL**.

`backend/services/retry_policy.py` centralizes safe status classification, bounded exponential backoff with jitter, and `Retry-After` parsing for seconds or HTTP-date values. GET/HEAD/OPTIONS may retry transient statuses 408/429/502/503/504. Mutating methods require an idempotency key before the same policy allows retry. 4xx authentication, authorization, validation and not-found errors are not retried.

HTTP client retry and PostgreSQL worker retry remain separate owners. The worker owns durable job retries/leases; an HTTP client must not multiply those retries blindly. Streaming chat cannot safely replay after partial output.

The actual source of observed 502/503/504 responses was not established from production headers/logs in this environment. No claim is made that Cloudflare, Render, PostgreSQL, Redis, or a provider is the cause. Redis remains optional; PostgreSQL/readiness remains the durable dependency.

Errors do not expose secrets, tokens, credentials, private memory, or stack traces. Full endpoint contract and disposable failure-injection E2E remain pending.

## Phase 11.15 runtime evidence

The disposable PostgreSQL + FastAPI + existing worker stack now has a reproducible real-HTTP runner. Its first complete run passed 18 checks, including readiness, structured validation errors, memory isolation, concurrent durable-job idempotency, changed-payload 409 handling, worker completion, and performance latency. Failure injection for 408/429/502/503/504, SDK live retries, Redis outage, crash/lease recovery, and streaming failures remain separate unverified work. See `TRUE_MEMORY_PHASE11_15_RUNTIME_RELIABILITY_EVIDENCE.md`.
