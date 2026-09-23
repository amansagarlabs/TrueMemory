# TrueMemory Phase 11.20 — Complete Architecture Audit

Date: 2026-09-23  
Status: **PARTIAL** — core regression suite and frontend static checks pass; live MCP, OPA-Wasm, and Groq production gates were not available in this audit environment.

## Scope and evidence

This is a repository and runtime-path audit, not a claim that every hosted deployment has been observed. Evidence used:

- Git history and working-tree inspection at `31d7c9698ecf260c2c47f1f20de237b67ce2cfaa` (`feat: add embedded OPA and optional Groq decision engine`).
- Backend test suite: `545 passed, 15 skipped`; the live MCP release test was separately observed as environment-blocked because `127.0.0.1:8000` was not running.
- Frontend clean-install `npm run typecheck`: passed.
- Frontend `npm run lint`: passed with 69 warnings and no errors.
- AST/diff checks and targeted decision/provider/chat tests: passed.
- Local capability probes: no `opa` executable, no `opa_wasm` import, no compiled `backend/policies/bundle/policy.wasm`, and no `GROQ_API_KEY`.

No secrets were read, printed, committed, or changed.

## Repository/change audit

The repository was clean before the audit. The latest committed change is the embedded OPA/optional Groq decision architecture. The audit made only three local, uncommitted frontend corrections:

1. Usage-page loading is scheduled asynchronously and the loader has stable dependencies.
2. Pinned and recent chat sections open when fetched conversations contain records.
3. Memory-graph drag transition state is represented with React state instead of reading a mutable ref during render.

The requested audit policy was followed: no commit, push, schema rewrite, provider migration, or architecture redesign was performed.

## Actual runtime path

The normal chat path is:

```text
HTTP /api/v1/query/stream or chat route
  → auth dependency / token or session resolution
  → user and workspace resolution
  → conversation and recent-message loading
  → deterministic route decision
  → profile/workspace/L1 memory and optional L2/hybrid retrieval
  → context and execution-plan construction
  → provider-neutral OpenAI-compatible provider
  → optional web/tools with scope and approval checks
  → streamed answer and structured SSE events
  → message persistence, usage/telemetry/audit events
  → experience/candidate capture and governed memory writes
```

`backend/app/routes/chat.py` is the authoritative production chat integration. The new `FastDecisionService` is currently called only in `FAST_DECISION_MODE=shadow`; its result cannot modify memory, authorization, revision, or the existing route decision. This is a safe integration boundary, but it means the new decision engine is not an active production authority.

| Stage | Implementation | Production finding | Evidence |
|---|---|---|---|
| Authentication | auth middleware, API tokens, session handling | Wired | route dependencies and auth tests |
| User/workspace scope | `MemoryScope`, workspace routes, token bindings | Wired and tested | memory/MCP isolation tests |
| Memory authority | `MemoryCore`, Postgres durable store, local fallback adapter | Wired | `backend/services/memory_core.py` |
| L1/context | profile, recent conversation, hot cache | Wired | chat route and memory tests |
| L2/hybrid | Postgres temporal retrieval plus hybrid retriever/Milvus adapter | Wired with graceful fallback | hybrid and provider tests |
| Temporal/history | valid time, `as_of`, revisions, supersession, timeline | Implemented and tested | temporal/consolidation tests |
| Decision | deterministic policy, optional OPA, optional Groq | Deterministic path tested; OPA/Groq live path unverified | decision suite and runtime probes |
| Tool execution | web/crawl/scrape/agent planning and approval | Wired | query/chat HTTP tests |
| Provider | OpenAI/OpenRouter-compatible interfaces and catalog | Wired; live credentials not exercised here | provider-independence tests |
| Capture/write | extraction, governor, observations, ingestion worker | Wired; worker deployment not live-tested here | ingestion/agentic tests |
| Persistence | messages, memories, usage, audit/telemetry | Wired | Postgres stores and tests |
| Async jobs | Postgres ingestion rows plus optional Upstash transport | Durable row path exists; hosted worker/queue not live-tested | job and ingestion code/tests |

## Capability matrix

Legend: **YES** means repository behavior is covered by passing tests; **PARTIAL** means a path or gate is incomplete; **NOT VERIFIED** means an external runtime or artifact was unavailable.

| Capability | Exists | Wired | Tested | E2E/live evidence | Assessment |
|---|---:|---:|---:|---:|---|
| L0/L1 profile and recent context | YES | YES | YES | PARTIAL | Core context path works in tests; hosted persistence not observed. |
| Durable persistent memory | YES | YES | YES | PARTIAL | Postgres is the durable adapter when enabled. |
| Conversation memory | YES | YES | YES | PARTIAL | Recent messages are loaded by conversation/user. |
| Hybrid retrieval | YES | YES | YES | PARTIAL | Vector/lexical fallbacks are tested; Milvus live path is not. |
| Versioning/current state/history | YES | YES | YES | PARTIAL | Revision, temporal filters, timeline and supersession are present. |
| Conflict resolution | YES | YES | YES | PARTIAL | Deterministic/conservative resolution is covered by unit tests. |
| LLM extraction and regex fallback | YES | YES | YES | PARTIAL | Provider-backed extraction is not live-tested here. |
| Governor and provenance | YES | YES | YES | PARTIAL | Decision-before-write tests pass. |
| Experience/tool/action capture | YES | YES | YES | PARTIAL | Coverage exists; universal vendor hooks remain incomplete. |
| JIT retrieval/context compilation | YES | YES | YES | PARTIAL | Agent tool path exists; no independent hosted agent chain observed. |
| Consolidation/reconsolidation | YES | YES | YES | PARTIAL | Controlled consolidation is tested; background production schedule is deployment-dependent. |
| REST API | YES | YES | YES | PARTIAL | HTTP contract suite passes. |
| Python SDK | YES | YES | YES | PARTIAL | Local/runtime tests exist; hosted SDK E2E not run. |
| TypeScript SDK | YES | YES | YES | PARTIAL | Local package tests exist; hosted E2E not run. |
| MCP | YES | YES | YES | NOT VERIFIED | Live release matrix could not start without a backend/database. |
| Portable memory and notes | YES | YES | YES | PARTIAL | Export/import/notes tests pass. |
| Decision engine | YES | SHADOW ONLY | YES | PARTIAL | Not authoritative in normal chat. |
| Embedded OPA-Wasm | YES (loader/build path) | Conditional | Unit path | NOT VERIFIED | No CLI, runtime module, or compiled bundle was available. |
| Groq advisor | YES (optional adapter) | Conditional | Mock/contract path | NOT VERIFIED | No key/live request in this environment. |
| Jev/TypeSafe | YES (legacy adapter) | No normal-chat import | Historical tests/scripts | PARTIAL | Non-essential to current service; legacy validation remains. |
| Provider independence | YES | YES | YES | PARTIAL | Core contracts do not require Jev/Groq/OPA; live provider matrix pending. |
| Usage/pricing telemetry | YES | YES | YES | PARTIAL | UI/API paths exist; billing-provider truth is outside this audit. |
| Workspace synchronization | YES | YES | YES | PARTIAL | Scope propagation is tested; hosted multi-client flow not observed. |
| Durable jobs/idempotency/retry | YES | YES | YES | PARTIAL | Postgres job lifecycle is present; external worker crash recovery needs live deployment evidence. |
| API reliability/structured errors | YES | YES | YES | PARTIAL | Retry/stream guards are tested; hosted failure injection not run. |
| Frontend memory/workspace UI | YES | YES | YES | PARTIAL | Typecheck/lint pass; browser E2E was not run in this audit. |

## MemoryCore integrity

MemoryCore remains the domain boundary. The following components do not become memory authorities:

- OPA is an optional policy/decision evaluator and returns no decision when its artifact/runtime is unavailable.
- Groq is an optional structured advisor and is behind a timeout/retry boundary.
- Jev is a historical adapter and is not imported by the active decision service.
- Extraction proposes candidates; the governor and durable write path decide what becomes memory.
- Frontend and transport layers call service/API boundaries rather than owning persistence policy.

Authorization checks bind user and requested scope, with workspace/agent token bindings checked before retrieval. Current/history selection, supersession, deletion/forgetting, provenance, and durable updates remain in the memory/store layer.

## OPA-Wasm audit

The repository contains Rego, a build script, a loader, and a safe deterministic fallback. The expected artifact is `backend/policies/bundle/policy.wasm`, but it is not present in this checkout. The OPA CLI and Python Wasm runtime are also unavailable. Therefore:

**OPA architecture: implemented. OPA execution: NOT VERIFIED.**

There is no OPA HTTP-server, `OPA_URL`, or hosted OPA requirement in the active code path. The missing artifact must be built and exercised in CI/deployment before claiming production OPA execution.

## Groq and Jev audit

Groq is optional, server-side, structured-output-only, and does not own memory or authorization. It is only constructed when the provider is `groq` and `AI_DECISION_ENABLED=true`. No live key was available, so model availability, schema acceptance, timeout behavior against the real endpoint, and cost/limit behavior remain unverified.

Jev/TypeSafe remains in historical validation files and configuration compatibility fields. It is not imported by `FastDecisionService` and is not required by the normal chat path. The correct classification is **non-essential to current runtime, but legacy code still exists**.

## Jobs, migrations, and deployment

The primary compose stack does not start local Postgres or pgAdmin; it uses the configured database URL and has a separate disposable test compose file. The backend Docker image binds to `0.0.0.0` and Render's `PORT`, while health/readiness checks use the container loopback appropriately.

The ingestion worker has durable Postgres rows, leases, checkpoints, retries, cancellation, dead-letter status, idempotency keys, and worker heartbeats. Upstash is an optional transport; the durable row remains authoritative.

The migration files are mostly idempotent (`IF NOT EXISTS`, guarded alterations, conflict-safe seeds), but the migration runner reapplies every SQL file in lexical order and the directory contains duplicate numeric prefixes (`008`, `009`, `010`, `011`, `012`). This is a maintainability and deployment-drift risk, not a failing test in the current suite. A future migration ledger should replace replay-all startup behavior.

## Security and provider independence

Production configuration validation requires a database URL, JWT secret, secure CORS, and secure cookies, while test-auth shortcuts are rejected outside development. Scope, token binding, rate-limit, audit, and MCP authorization tests are present. No compliance certification is claimed. The previous dependency scan warning remains external risk: GitHub reported 59 dependency vulnerabilities (2 critical, 27 high, 18 moderate, 12 low) at the last push and should be triaged separately.

The core memory layer is provider-neutral. OpenAI and OpenRouter use compatible provider boundaries; Groq is an optional decision advisor; OPA is local/optional; Jev is not on the normal path. The system still needs live provider and deployment matrices before a production-ready claim.

## Final 24-question audit

1. **Is TrueMemory a memory system? — YES.** Durable memory, profile memory, history, retrieval, forget, and temporal APIs exist and pass tests.
2. **Is TrueMemory an agent memory layer? — YES.** Agent-facing tools, capture, JIT retrieval, scope, and observations are wired.
3. **Is TrueMemory currently a memory harness? — PARTIAL.** The harness substrate is present, but live external-agent and hosted worker evidence is incomplete.
4. **Does it understand experiences? — PARTIAL.** Experience/candidate extraction exists; broad production source coverage is not fully validated.
5. **Does it maintain current state? — YES.** Current durable records and current-state retrieval are implemented and tested.
6. **Does it preserve history? — YES.** Revisions, supersession, temporal queries, and timeline paths exist.
7. **Does it resolve contradictions? — YES.** Conflict/consolidation logic and tests exist.
8. **Does it understand temporal state? — YES.** Valid intervals, `as_of`, and temporal intent are implemented.
9. **Can agents retrieve memory just-in-time? — YES.** Agent tools and JIT retrieval are wired; hosted agent validation remains partial.
10. **Can memory affect planning? — PARTIAL.** Memory participates in context and planning inputs; the new FastDecision engine remains shadow-only.
11. **Can agent actions create memory? — YES.** Capture and governed durable writes are present and tested.
12. **Can tool observations create memory? — YES.** Observation/capture primitives and ingestion paths exist.
13. **Can memory consolidate? — YES.** Controlled consolidation and candidate workflows are implemented and tested.
14. **Can memory decay or become stale safely? — PARTIAL.** Temporal validity/archive/forget paths exist; a complete automated decay policy is not established.
15. **Can the system explain memory provenance? — YES.** Source envelopes, provenance metadata, audit events, and notes exist.
16. **Can it explain why memory was retrieved? — PARTIAL.** Retrieval traces/telemetry exist, but a universal user-facing explanation contract is incomplete.
17. **Can it explain why memory was written? — YES.** Governor decisions and capture metadata are persisted/emitted.
18. **Can it prevent irrelevant memory from entering context? — PARTIAL.** Scoped retrieval, ranking, budgets, and JIT selection exist; quality needs benchmark/live evidence.
19. **Can it maintain project/user isolation? — YES.** Authorization, workspace/agent bindings, and isolation tests pass.
20. **Can it improve future agent behavior through remembered experience? — PARTIAL.** Memory feeds future context; measured behavior improvement is not yet independently demonstrated.
21. **Is Jev fully non-essential? — YES for normal runtime; PARTIAL for repository cleanup.** The active service does not depend on it, but legacy adapters/tests remain.
22. **Is OPA genuinely embedded rather than hosted? — PARTIAL / NOT VERIFIED.** The loader is in-process and no hosted OPA dependency exists, but the actual Wasm execution artifact/runtime was unavailable.
23. **Can TrueMemory function without any AI API? — PARTIAL.** Deterministic memory/decision and fallback paths exist, but the full chat answer path still needs an LLM provider for general answers.
24. **What remains between this architecture and a true memory harness? —** Live OPA/Groq/provider validation, hosted MCP and worker crash-recovery evidence, automated migration ledgering, broader source-to-memory coverage, retrieval-quality benchmarks, decay policy, and production browser/agent E2E.

## Conclusion

TrueMemory is a coherent, provider-neutral memory substrate with durable memory, temporal/history semantics, governed writes, agent tools, portability, and reliable test coverage. It is not yet fully certified as a production memory harness because external runtime gates were not observed and the new OPA/Groq decision layer is intentionally non-authoritative/shadow-only. The correct release label is **PARTIAL — core regression-safe, live integration evidence pending**.
