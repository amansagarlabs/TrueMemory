# TrueMemory Phase 11.16 — Retry Ownership

Status: **PARTIAL — ownership audited; disposable failure execution pending**.

| Boundary | Owner | Policy | Idempotency rule |
|---|---|---|---|
| Python SDK | SDK client | 408/429/502/503/504, bounded backoff with jitter | Mutations retry only with an idempotency key |
| TypeScript SDK | SDK client | Same status set, bounded backoff, capped Retry-After | Mutations retry only with `idempotencyKey` |
| FastAPI request | Application | No replay of partial streams | One logical stream per request |
| Provider call | Provider adapter | No generic second retry loop | Avoid nested provider retries |
| Durable ingestion | PostgreSQL worker | Lease reclaim and bounded job attempts | Job idempotency key is unique per user |
| Optional Redis | Transport only | Dispatch failure does not delete PostgreSQL job | PostgreSQL polling remains recovery |

The SDK preserves one `X-Request-ID` across retries, promotes mutation
`idempotency_key` values to the `Idempotency-Key` header, caps `Retry-After` at
30 seconds, parses seconds and HTTP-date values, and applies bounded jittered
backoff. A mutation without an idempotency key is one attempt.

Production 502/503/504 cause remains **NOT VERIFIED**. No production root cause
or high-availability claim is made.
