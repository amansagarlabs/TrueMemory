# TrueMemory Phase 10.2 — Implementation Recommendation

## P0 — required for the thesis

### 1. Generic agent integration contract

Problem: generic MCP/REST works, but named client lifecycle behavior is unverified. Evidence: current routes/SDKs and generic E2E tests. Gap: normalized `recall`, `capture`, `update`, `forget` lifecycle events plus attribution and scope propagation. Fit: adapters above MemoryCore. Test: contract tests for custom MCP/REST plus runtime smoke tests for each supported client.

### 2. Portable memory export/import contract

Problem: cross-deployment portability is a core thesis and import exists without a stable documented interchange contract. Gap: versioned JSONL envelope with memory id, content, type, scope, revision, valid interval, source/provenance and relationships. Fit: transport-level serializer, never provider-specific. Test: export→fresh deployment→current/history/forget/scope checks.

### 3. Internal deterministic benchmark

Problem: existing evaluation code is not a small deterministic regression suite. Gap: fixed fixtures for facts, preferences, updates, temporal questions, multi-session, abstention, cross-agent, forgetting and isolation. Fit: tests against MemoryCore/retrieval with no LLM requirement. Test plan is in `TRUE_MEMORY_PHASE10_2_BENCHMARK_PLAN.md`.

### 4. Source-aware envelope

Problem: provenance is present in multiple forms but not one reusable pipeline. Gap: source identity, locator, excerpt/hash, observed_at, event time, extraction run and parent experience id. Test: source→experience→candidate→memory trace and stale-source behavior.

## P1 — strong product value

- Opt-in automatic recall mode at the generic integration boundary, using mandatory minimal scoped context plus model-controlled JIT retrieval. Gate on duplicate rate, token budget, attribution and abstention tests.
- Direct runtime validation for Claude Code, Codex and Cursor adapters; do not claim direct support from MCP compatibility alone.
- Expand operational self-hosting documentation for private network, secret rotation, backup/restore and MCP authorization.

## P2 — useful later

- Durable typed relationships using relational tables first (`related`, `entity`, `source`, `revision`, `derives`).
- Additional retrieval backends behind the existing retrieval boundary.
- Reproduction harnesses for LongMemEval, LoCoMo and SWE-ContextBench after the internal suite is stable.

## DEFER

Continual learning, sleep-time reflection, learned retrieval policy, broad web crawling, and a managed multi-client service. These require data, evaluation and safety evidence not present in this phase.

## DO NOT BUILD

Feature-copying UI, graph database without a query requirement, unconditional prompt injection, hidden reasoning capture, or any L5 adaptive policy.

