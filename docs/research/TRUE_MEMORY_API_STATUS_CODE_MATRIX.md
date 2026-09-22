# TrueMemory API Status-Code Matrix

| Endpoint family | Success | Client errors | Transient/server errors | Retry policy |
|---|---:|---:|---:|---|
| health/readiness | 200 | 405 | 503 when not ready | GET may retry bounded |
| memory reads/status | 200 | 401/403/404/422/429 | 503 | GET/POST read retries only when safe |
| memory writes/forget | 200/201 by route contract | 400/401/403/409/422/429 | 503 | mutation retry requires idempotency |
| consolidation preview | 200 | 401/403/422/429 | 503 | explicit request retry only when safe |
| consolidation commit | 200 | 401/403/409/422/429 | 503 | candidate ID/current-state revalidation required |
| chat stream | 200 before stream | 400/401/403/409/422 | 502/503/504 | no transparent replay after output begins |

All structured errors retain the existing top-level `error`, `message`, and `request_id` fields and now include `code` and `retryable` where the global handler is used.
