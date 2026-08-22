# KONTEXT Session Handoff — 2026-08-21

## Completed in this session

- MemoryCore and MemoryClient provider boundary
- Scoped authorization and API-token security
- L0 shared hot memory with TTL, bounded size, invalidation, and stampede protection
- L1 structured retrieval
- L2 hybrid retrieval with lexical, exact-key, semantic, and RRF fusion
- Temporal filtering, supersession handling, confidence/revision ordering, and deduplication
- User, workspace, and agent namespace isolation
- Shared rate limiting and audit/request-ID handling
- Memory REST API and local stdio MCP adapter
- Admin metrics, evaluator, router experiments, and interaction tests
- Frontend research module resolution and Next.js 16 route typing fixes

## Validation completed

- Backend tests: `274 passed`
- Frontend TypeScript: passed
- Frontend ESLint: passed with warnings only
- Next.js production build: passed
- Backend Docker build: passed
- Memory health smoke test: `200`
- Unauthorized memory request: `401`
- L2 warm p50: approximately `7.4 ms`
- L2 cold retrieval: approximately `836 ms`
- Benchmark recall: `1.0`
- Temporal accuracy: `1.0`
- Ruff: unavailable locally (`No module named ruff`)

## Remaining work

### 1. Hosted remote Memory MCP

Build a separate Streamable HTTP Memory MCP boundary at:

`https://memory.kontext.dev/mcp`

Keep local stdio support. REST and MCP must call the same chain:

`MCP → MemoryCore → MemoryRepository → Storage`

Expose strict typed tools:

- `memory_search`
- `memory_retrieve`
- `memory_store`
- `memory_update`
- `memory_forget`
- `memory_context`
- `memory_profile`
- `memory_entities`

Required security:

- Bearer token validation
- Expiry and revocation checks
- Tenant, user, workspace, and agent binding
- Resource audience validation
- Permission checks before retrieval
- Origin validation
- Shared rate limits and quotas
- Request IDs and audit logging
- Safe errors without secrets or raw memory content in logs

Required tests:

- Actual MCP client connect/authenticate/list-tools flow
- Store/search/retrieve/update/forget/context flow
- Disconnect/reconnect
- Expired and revoked tokens
- Cross-user/workspace/agent isolation
- Two independent server instances with consistent behavior
- REST/MCP authorization and semantic parity
- External-agent client that imports no Assistant code

### 2. Profile L2 cold retrieval

Measure the cold path before optimizing. Break it into:

- Query parsing
- Database connection
- Lexical retrieval
- Exact retrieval
- Embedding generation
- Vector retrieval
- Fusion
- Reranking
- Serialization
- Network

Do not remove semantic retrieval or claim a speed multiplier without measured evidence.

### 3. After MCP stability

Implement in this order:

1. TypeScript SDK
2. Python SDK
3. External HTTP client tests
4. External MCP agent tests
5. Public provider onboarding
6. Realistic-scale memory benchmarks
7. Re-evaluate L2 cold latency
8. Evaluate a graph layer only if benchmark/use-case evidence justifies it

Do not add a graph database yet.

## Copy-paste prompt for the next session

```text
Continue from REMAINING_WORK_2026-08-21.md.

Do not redo L0, L1, or L2. Do not redesign MemoryCore. Do not add a graph database.

Implement the next milestone: a production-grade hosted KONTEXT Memory MCP service.

Use the existing boundary:

MCP → MemoryCore → MemoryRepository → Storage

REST and MCP must share MemoryCore. Keep the existing local stdio adapter and add
Streamable HTTP support for local development and deployment at:

https://memory.kontext.dev/mcp

Expose strict typed tools:
memory_search, memory_retrieve, memory_store, memory_update, memory_forget,
memory_context, memory_profile, memory_entities.

Implement and test bearer auth, expiry, revocation, tenant/user/workspace/agent
bindings, audience validation, permissions, rate limits, quotas, request IDs,
audit logging, Origin validation, safe errors, and no secret/raw-memory leakage.

Keep the service stateless across replicas. Test with an actual MCP client,
including reconnect, expired/revoked tokens, cross-user/workspace/agent isolation,
two server instances, external-agent compatibility, and REST/MCP parity.

Profile the approximately 836 ms cold L2 path and record measured stage timings.
Do not optimize blindly or remove semantic retrieval.

Run backend tests, frontend typecheck, frontend lint, production build, Docker
build, and MCP integration tests. Ruff may remain unavailable locally; report it.
Do not claim 100x faster.
```
