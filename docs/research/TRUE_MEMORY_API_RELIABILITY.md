# TrueMemory API Reliability

Status: **PARTIAL**.

`backend/services/retry_policy.py` centralizes safe status classification, bounded exponential backoff with jitter, and `Retry-After` parsing for seconds or HTTP-date values. GET/HEAD/OPTIONS may retry transient statuses 408/429/502/503/504. Mutating methods require an idempotency key before the same policy allows retry. 4xx authentication, authorization, validation and not-found errors are not retried.

HTTP client retry and PostgreSQL worker retry remain separate owners. The worker owns durable job retries/leases; an HTTP client must not multiply those retries blindly. Streaming chat cannot safely replay after partial output.

The actual source of observed 502/503/504 responses was not established from production headers/logs in this environment. No claim is made that Cloudflare, Render, PostgreSQL, Redis, or a provider is the cause. Redis remains optional; PostgreSQL/readiness remains the durable dependency.

Errors do not expose secrets, tokens, credentials, private memory, or stack traces. Full endpoint contract and disposable failure-injection E2E remain pending.
