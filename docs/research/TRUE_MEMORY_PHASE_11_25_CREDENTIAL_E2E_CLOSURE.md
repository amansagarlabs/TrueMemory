# TrueMemory Phase 11.25 — Credential and E2E Closure

Date: 2026-09-24

Status: PARTIAL — local disposable E2E and regression are verified; credential rotation and production-platform verification remain user actions.

## Summary

The local OpenRouter credential values found in ignored environment files were cleared. No long OpenRouter-token-shaped value was found in tracked Git history. Configuration examples now use placeholders. The exposed key must still be revoked and replaced in the provider dashboard; that external rotation was not performed, and no replacement secret was requested or recorded.

Disposable Docker E2E verified the PostgreSQL-backed API, background ingestion worker, recovery after worker termination and lease expiry, and authenticated MCP operations with workspace/agent isolation. The full backend suite passed. The tests surfaced and this phase fixed ingestion scope duplication, MCP mutation scope normalization, and Decimal serialization in MCP JSON responses.

## Credential handling

- Cleared populated OPENROUTER_API_KEY values from local root and backend environment files, including commented copies.
- Checked tracked Git history for long sk-or-v1 token-shaped values; none found.
- Replaced credential-looking sample values in tracked documentation/config examples with a placeholder.
- Frontend references are confined to server-side API routes; no NEXT_PUBLIC key reference was found.
- Rotation status: USER ACTION REQUIRED. Revoke the exposed key and create a replacement in OpenRouter, then set it only in the intended secret store. Do not paste it into chat or commit it.

## Reproducible disposable E2E

The test stack is defined in docker-compose.test.yml and uses its dedicated PostgreSQL test database. It does not use Render, production credentials, or provider API keys.

Start the services:

    docker compose -f docker-compose.test.yml up -d --build postgres-test api-test memory-ingestion-worker-test
    docker compose -f docker-compose.test.yml ps

The API health and readiness endpoints returned HTTP 200; readiness reported PostgreSQL and the memory ingestion worker ready.

Run the deterministic worker/API flow:

    docker compose -f docker-compose.test.yml exec -T api-test python scripts/phase11_25_disposable_e2e.py

Run the authenticated MCP release matrix:

    docker compose -f docker-compose.test.yml exec -T api-test pytest tests/test_mcp_release_matrix.py -q

Run worker-termination and recovery (the script uses a short disposable lease, terminates a worker after claim, waits for expiry, and starts a replacement):

    docker compose -f docker-compose.test.yml stop memory-ingestion-worker-test
    docker compose -f docker-compose.test.yml exec -T api-test python scripts/phase11_25_disposable_e2e.py --recovery
    docker compose -f docker-compose.test.yml start memory-ingestion-worker-test

The full-suite command below includes a container-only compatibility symlink because these legacy tests expect a backend/ path while the image workdir already is /app:

    docker compose -f docker-compose.test.yml exec -T api-test sh -c "ln -s /app /app/backend && pytest tests -q --tb=short"

## Results

Normal ingestion completed job 6b099949-4fa4-40d4-8690-fa3e6a70fe61 on attempt 1. It moved from queued to completed; created, started, and completed timestamps were 2026-09-24T06:29:04.107912Z, 2026-09-24T06:29:04.887458Z, and 2026-09-24T06:29:05.028765Z. Replaying the same idempotency key returned the same job with created=false. The resulting memory had revision 1 and exactly one matching record was found.

Recovery job 1eac6a83-e26f-4892-afa9-ed3599c276ab completed on attempt 2 after the first worker was terminated and the lease expired. Exactly one final memory record was found.

The MCP release matrix passed (1 test). It exercised missing, invalid, expired, and revoked credentials (401); insufficient scope (403); valid profile search/store/update/forget; current-state, timeline, and related-memory tools backed by PostgreSQL records; user/workspace/agent isolation; REST-to-MCP state consistency; allowed origins; and rate limiting.

Test results:

- Full backend suite: 549 passed, 15 skipped, 7 warnings.
- Focused ingestion, queue, MCP, provider-independence, and OpenRouter-provider tests: 36 passed, 5 warnings.
- OPA policy compilation to Wasm: passed using OPA 1.20.2.
- OPA Wasm runtime evaluation: not verified. The bundled Python Wasmer runtime reported that Wasmer is unavailable on this system. The deterministic policy fallback remains covered by the backend suite.
- Live Groq/provider call: not verified; no provider credential was used.

## Changes made

- Normalize workspace-bound MCP update and forget scopes through the authenticated effective-scope resolver, aligning mutations with REST storage semantics.
- Stop pre-embedding workspace/agent labels into ingestion job scope, preventing duplicate scope dimensions when the worker constructs the MemoryClient.
- Implement the advertised memory_related MCP tool using related-memory lookup for bound memory IDs, with search fallback.
- JSON-encode MCP payloads so PostgreSQL Decimal values serialize correctly rather than being misreported as invalid tool arguments.
- Add pytest-asyncio to backend development requirements and extend the MCP live release matrix with durable PostgreSQL-backed operation and isolation coverage.
- Add the reproducible disposable E2E runner at backend/scripts/phase11_25_disposable_e2e.py.

## Remaining readiness gates

- Revoke and rotate the exposed OpenRouter credential; update the appropriate secret store without disclosing the replacement.
- Verify deployment configuration and worker health on the production platform. No production dashboard/API access was used.
- Run the same authenticated MCP and cross-process isolation checks against the intended production deployment. Local REST/MCP shared-state behavior is verified; an independent production-process proof is not.
- Re-run OPA Wasm evaluation in an environment with a supported Wasm runtime if Wasm execution is a production requirement.

Accordingly, Phase 11.25 is PARTIAL rather than production-ready. Local disposable worker, recovery, MCP authentication/isolation, and backend regression gates are complete.
