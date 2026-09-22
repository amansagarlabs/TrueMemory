# TrueMemory Phase 11.9 — Real API Performance Analysis

Status: **PARTIAL — instrumentation and classification complete; live HTTP baseline pending**.

FastAPI remains the application boundary. REST, MCP and SDK clients converge on `MemoryClient`/`MemoryCore`; PostgreSQL/Supabase remains durable state. Existing middleware records request latency histograms. `GET /v1/memory/performance` now exposes authenticated aggregate request, L0 cache, hybrid retrieval, and PostgreSQL pool metrics without memory content or secrets.

The measured Phase 11.8 in-process consolidation baseline was p50 0.024 ms, p95 0.032 ms and p99 0.091 ms over 200 iterations. It excludes HTTP, authentication, PostgreSQL, vector retrieval, serialization and network latency and is not an API or production claim.

Real HTTP p50/p95/p99 for memory search/retrieve/current-state/timeline/related/store/forget, consolidation, and chat TTFT were not executed in this environment. No actual bottleneck is promoted as verified. The next run should collect cold/warm cache, concurrent, small/realistic dataset, and no-LLM chat orchestration samples against disposable infrastructure.

Must remain synchronous: authentication, authorization, response-critical retrieval, current state/timeline/related, correctness-critical writes, Governor/ConflictResolver checks, agent memory tools, and streaming response work.

Safe to async after correctness is secured: non-critical extraction, optional embeddings, consolidation, semantic compression, relationship enrichment, source processing, bulk ingestion, telemetry aggregation and maintenance. Any work that can affect immediate recall needs further evidence.

The future domain dependency should be `JobQueue` with `enqueue`, `get_status`, and `retry`; adapters may target the existing PostgreSQL queue, Redis, Cloudflare Queues, or another worker system. Future Workers may route, normalize, propagate correlation IDs, rate-limit, proxy and submit explicitly async jobs, but must not contain MemoryCore, Governor, ConflictResolver, temporal reasoning, retrieval ranking, persistence or provider logic. No Cloudflare or Convex migration was implemented.
