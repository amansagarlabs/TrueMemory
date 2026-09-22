# TrueMemory Phase 10.2 — Supermemory Competitive Audit

Date: 2026-09-22  
Status: research only. L4 remains **HARDENED — LIVE EVIDENCE PARTIAL**. L5 remains **NOT IMPLEMENTED**.

## Evidence discipline

Supermemory claims below are classified as current public documentation, research claim, marketing claim, or not verified. The audit does not treat a product page as independently observed behavior. Primary sources: [Supermemory product](https://supermemory.ai/product/), [API changelog](https://supermemory.ai/changelog/api/), [LongMemEval report](https://supermemory.ai/research/longmembench/), [official GitHub](https://github.com/supermemoryai/supermemory), and the [September 10, 2026 product update](https://supermemory.ai/blog/an-update-to-supermemory/).

## Source-of-truth table

| Capability | Supermemory | TrueMemory | Evidence | Gap | Importance |
|---|---|---|---|---|---|
| API | IMPLEMENTED | IMPLEMENTED | Supermemory API/OpenAPI; `backend/app/routes/memory_api.py`, Python and TS clients | No verified parity claim | P1 |
| MCP | IMPLEMENTED | IMPLEMENTED | Supermemory hosted MCP; `backend/app/routes/memory_mcp.py`, E2E MCP tests | Managed multi-client onboarding not verified | P1 |
| Claude Code | IMPLEMENTED | NOT VERIFIED | Supermemory plugin/changelog; no TrueMemory Claude adapter | Adapter/validation missing | P1 |
| Codex | IMPLEMENTED | NOT VERIFIED | Supermemory changelog; no TrueMemory vendor adapter | Adapter/validation missing | P1 |
| Cursor | IMPLEMENTED | NOT VERIFIED | Supermemory MCP/client documentation; no TrueMemory adapter | Runtime validation missing | P1 |
| automatic recall | IMPLEMENTED | PARTIAL | Supermemory changelog says recall on substantive prompts; TrueMemory has explicit context preview and model tools, but chat comments remove universal automatic retrieval | Define opt-in boundary if pursued | P1 |
| automatic capture | IMPLEMENTED | PARTIAL | Supermemory plugin claim; TrueMemory `agent_memory_capture.py`, `experience_capture.py`, ingestion worker | No universal vendor hook | P1 |
| memory graph | IMPLEMENTED | PARTIAL | Supermemory product/research describes meaningful edges; TrueMemory context graph and `memory_related` tool, but no durable relationship graph contract | Durable typed relationships | P2 |
| temporal reasoning | IMPLEMENTED | IMPLEMENTED | Supermemory research; `temporal_reasoning.py`, `valid_from`, `valid_until`, `as_of`, timeline tools | Explicit event/ingestion time separation not universal | P1 |
| versioning | IMPLEMENTED | IMPLEMENTED | Supermemory relational versioning; revisions/supersession in migrations and store | No parity claim | P1 |
| conflict handling | IMPLEMENTED | IMPLEMENTED | Supermemory research; `conflict_resolver.py`, governor observations | No parity claim | P1 |
| forgetting | IMPLEMENTED | IMPLEMENTED | Supermemory API/product; `memory_forget`, forget routes and audit event | Retention policy breadth differs | P1 |
| agent-generated memory | IMPLEMENTED | IMPLEMENTED | Supermemory plugins; capture/extraction/governor services | Capture coverage is partial | P1 |
| cross-agent memory | IMPLEMENTED | VERIFIED | Supermemory coding-agent material; TrueMemory workspace/agent scopes and cross-agent E2E evidence | Vendor workflow not verified | P0 |
| provider independence | MARKETING CLAIM | IMPLEMENTED | Supermemory API/product claim; TrueMemory provider interfaces and L4 documents | Supermemory internal implementation unknown | P0 |
| source ingestion | IMPLEMENTED | PARTIAL | Supermemory documents/URLs/files/connectors; TrueMemory ingestion, documents, URLs, connectors and observations exist, unified source contract is incomplete | Source→experience→memory pipeline | P1 |
| observability | MARKETING CLAIM | IMPLEMENTED | Supermemory statusline/research; TrueMemory observation, telemetry, audit and live traces | External product behavior not verified | P0 |
| self-hosting | IMPLEMENTED | IMPLEMENTED | Supermemory product says local binary; TrueMemory Docker/local API/MCP | Private-network operations need deployment evidence | P1 |
| benchmarking | IMPLEMENTED | PARTIAL | Supermemory LongMemEval report; TrueMemory evaluation harness exists but no independent reproduction | Deterministic internal suite and public reproduction | P0 |
| continual learning | RESEARCH CLAIM | NOT IMPLEMENTED | Supermemory product/research discusses continual learning/learner; TrueMemory L5 plan only | Requires separate future research/evaluation | DEFER |

## TrueMemory architecture findings

The provider-neutral boundary is `MemoryCore`/`MemoryClient`; transports are REST, MCP, Python SDK and TypeScript SDK. The system has scope dimensions for user, tenant, organization, workspace, agent and session, authorization checks, hot caching, hybrid retrieval, temporal intent, current/history selection, revisions, supersession, conflict resolution, forgetting, ingestion jobs, and audit/telemetry events. `agent_memory_capture.py` and `memory_extraction.py` already provide primitives for tool results, decisions, task completion and observations, with governor decisions recorded before writes.

### Automatic recall

Current status: **PARTIAL**, not full automatic recall. The normal chat path retains recent conversation/profile/workspace context and exposes memory tools, while the code explicitly states that application-level automatic retrieval was removed and the model controls additional retrieval. This is:

`agent → explicit memory tool → search`

It is not yet a transport-neutral:

`agent prompt → automatic selection → attributed context → agent`

Before implementation, ownership must be assigned to a universal agent integration layer, with a deduplication key based on memory id/revision, a governor-enforced token budget, and retrieval attribution in the existing observation trace. A safe design is mandatory minimal scoped context plus opt-in JIT retrieval, not unconditional injection.

### Automatic capture

Current status: **PARTIAL**. TrueMemory has equivalent domain primitives, but not verified hooks for every coding client. Capture must remain outside MemoryCore: adapters emit normalized observations, extraction proposes candidates, and the governor decides whether a candidate becomes durable memory.

### Graph and time

Current status: **PARTIAL** graph, **IMPLEMENTED** temporal/version semantics. Relational links already exist through source/provenance, workspace/project scope, revision/supersession and context graph construction. A graph database is not justified by current requirements. The current model has valid time and observed/ingested timestamps in different paths, but lacks a single documented contract that always distinguishes event time, ingestion time and observation time. Add that contract only when a demonstrated use case requires it; do not change L3 semantics for feature parity.

### Atomic memory and context

Extraction produces typed candidates and durable records retain content, key/type, scope, source, confidence, temporal fields and revision metadata. Source context is adequate for current agent observations when provenance is passed, but the reusable source envelope is incomplete. The next abstraction should preserve source id/type, locator, excerpt or payload hash, actor, observed_at, event time, extraction run and parent experience id.

## Agent integration matrix

| Client | Protocol-compatible | Tool-compatible | Runtime-validated | Directly integrated |
|---|---|---|---|---|
| Claude Code | UNKNOWN | UNKNOWN | NOT VERIFIED | NOT VERIFIED |
| Codex | UNKNOWN | UNKNOWN | NOT VERIFIED | NOT VERIFIED |
| Cursor | UNKNOWN | UNKNOWN | NOT VERIFIED | NOT VERIFIED |
| OpenCode | UNKNOWN | UNKNOWN | NOT VERIFIED | NOT VERIFIED |
| custom MCP agent | IMPLEMENTED | IMPLEMENTED | PARTIAL | NOT VERIFIED |
| custom REST agent | IMPLEMENTED | IMPLEMENTED | VERIFIED | NOT VERIFIED |
| Python agent | IMPLEMENTED | IMPLEMENTED | VERIFIED | IMPLEMENTED |
| TypeScript agent | IMPLEMENTED | IMPLEMENTED | VERIFIED | IMPLEMENTED |

The correct architecture is core MCP + generic agent integration layer + optional vendor adapters. Vendor adapters must translate lifecycle events and configuration only; they must not implement memory policy or storage.

## Security and deployment

TrueMemory verifies API-token/Bearer authentication, scope binding, authorization checks, audit events, rate limits, Docker and local deployment. OAuth/connectors exist for selected integrations. MCP authorization and multi-client hosted onboarding are not established as a product-wide claim. No compliance certification is asserted. Private-network/self-hosted API and MCP are technically supported by the deployment artifacts, but operational hardening evidence is partial.

## Agent switching story

`Claude Code → store → TrueMemory → Codex retrieve → Cursor update → current state` is **PARTIAL**: the substrate has cross-agent scope and cross-interface tests, but the named vendor-to-vendor path is not directly runtime-validated.

Cross-agent: **PROVEN** for the tested generic interfaces; named vendor chain **NOT PROVEN**. Cross-provider: **PARTIAL** pending the real provider/live-model gate. L4 is unchanged.

