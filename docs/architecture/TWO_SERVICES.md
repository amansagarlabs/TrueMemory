# Kontext two-service architecture

Kontext has two products with separate runtime ownership. Kontext Memory is
the universal memory provider itself. No dependency on Supermemory, Mem0, Zep,
or another external memory provider exists.

## 1. Kontext Memory — universal memory provider

Long-term memory infrastructure for any AI agent: Kontext Assistant, custom
agents, CrewAI routes, MCP clients, and future agent runtimes.

Owns:

- profile facts and durable memories
- memory scopes and tenant isolation
- memory CRUD, recall, provenance, deletion
- embeddings/indexes and future memory graph
- connector ingestion into memory
- memory API and agent/MCP client access
- durable context across sessions, agents, and applications

Entry point: `backend/memory_main.py`

External-agent API:

- `GET /v1/memory/health`
- `GET /v1/memories`
- `POST /v1/memories`
- `POST /v1/memories/search`
- `POST /v1/memories/retrieve`
- `POST /v1/memories/update`
- `POST /v1/memories/forget`

Retrieval roadmap: L0 hot memory, L1 structured recall, L2 hybrid retrieval,
L3 graph traversal, reranking, and context assembly. Current API implements
L1 structured recall first; future tiers stay behind same contract.

All memory mutations require authenticated `memory` scope. Storage is shared
with current local development code during migration; production deployment
must give Memory sole write ownership.

## 2. Kontext Assistant

Full AI assistant application.

Owns:

- chat UI and conversations
- intent routing and clarification
- model/provider calls
- web search, citations, files, RAG, and tool orchestration
- agent execution policy and guardrails
- feedback, evaluation, A/B tests, and admin dashboard

Assistant calls Memory for profile/context recall and memory writes. Assistant
must not duplicate memory business rules or write Memory tables directly after
cutover.

## Request flow

```text
User / external agent
        |
        +--> Kontext Assistant --> model, web, files, tools
        |             |
        |             +----------> Kontext Memory --> facts, recall, storage
        |
        +--> Kontext Memory API (direct agent integration)
```

External agents use Kontext Memory as their memory backend:

```text
Any AI agent --> Kontext Memory API --> profile, facts, recall, storage
```

“Infinity” means provider scope and durable growth across agents. It does not
promise physically unlimited storage; quotas, retention, indexing, and billing
remain enforceable per tenant.

## Migration order

1. Keep existing Assistant behavior and add Memory API contract.
2. Move chat profile-memory reads/writes behind a Memory client.
3. Deploy Memory with its own database/index ownership.
4. Switch Assistant to `MEMORY_SERVICE_URL`.
5. Add SDK/MCP adapter for external agents.
6. Remove direct Assistant access to Memory storage.

Do not split web search, model calls, or admin evaluation into Memory. Those
belong to Assistant.
