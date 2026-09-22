# TrueMemory Phase 11.8 — Performance Baseline

Date: 2026-09-22. Local in-process Python, no database, network, or external LLM. This is not production latency.

Deterministic consolidation preview over three experiences, 200 iterations: p50 **0.024 ms**, p95 **0.032 ms**, p99 **0.091 ms**, max **0.148 ms**.

Memory search/retrieve/store, PostgreSQL commit, chat orchestration, browser workflow, L0/L1/L2, vector lookup, authentication, and queue work were not measured because the isolated test environment was unavailable. No production performance claim is made.

Sync: auth, authorization, required retrieval, Governor/ConflictResolver checks, streaming, correctness-critical writes. Async candidates: non-critical extraction, optional embeddings, consolidation preview, relationship enrichment, telemetry aggregation. Semantic compression and source intelligence need evidence. Cloudflare migration is deferred.
