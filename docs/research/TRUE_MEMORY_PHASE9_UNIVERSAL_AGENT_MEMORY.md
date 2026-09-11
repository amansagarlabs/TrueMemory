# TrueMemory Phase 9 — Universal Agent Memory

## Architecture

Any agent reaches one provider-neutral boundary through MCP, REST, or an SDK.
All transports delegate to `MemoryClient` and `MemoryCore`; storage, retrieval,
temporal reasoning, governance, and authorization remain internal.

```text
Agent → MCP / SDK / REST → TrueMemory Core → Memory State
```

## Canonical v1 operations

`memory_search`, `memory_retrieve`, `memory_current_state`, `memory_timeline`,
`memory_related`, `memory_store`, and `memory_forget`. Legacy `/v1/memories/*`
routes remain compatible aliases. Provider/model information is provenance,
never ownership.

## Status

- REST: VERIFIED (authenticated, scoped, shared core)
- Python SDK: VERIFIED surface; live cross-interface validation requires a running API/database
- TypeScript SDK: VERIFIED surface; live cross-interface validation requires a running API/database
- MCP: VERIFIED protocol boundary; direct Claude Code/Codex platform support is NOT VERIFIED
- Cross-agent persistence and isolation: NOT VERIFIED in this environment
- L5 adaptive memory: NOT IMPLEMENTED

TrueMemory provides an open, scoped, temporal memory harness. Mem0,
Supermemory, Letta, MCP memory servers, and agent frameworks each provide
different combinations of hosted memory, context infrastructure, stateful
agents, protocol adapters, or orchestration. This phase does not claim
superiority; it documents the narrower interoperability contract and the
remaining need for production evidence.
