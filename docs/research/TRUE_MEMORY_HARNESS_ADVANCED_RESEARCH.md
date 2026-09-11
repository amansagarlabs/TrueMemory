# TrueMemory Advanced Investigation: From Memory Store to Memory Harness

## Research Document

**Author:** Aman Sagar  
**Date:** September 2026  
**Status:** Research Direction  
**Maturity Assessment:** Level 2 (Persistent Selective Memory)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture: Evidence-Based Assessment](#2-current-architecture)
3. [Modern Memory System Landscape](#3-modern-landscape)
4. [Critical Gap Analysis](#4-gap-analysis)
5. [Target Architecture: Memory Harness](#5-target-architecture)
6. [Implementation Priorities](#6-implementation-priorities)
7. [Evaluation Framework](#7-evaluation-framework)
8. [References](#8-references)

---

## 1. Executive Summary

TrueMemory currently operates at **Level 2 maturity** (Persistent Selective Memory), implementing a functional memory system with multi-tier retrieval, durable memory extraction, and basic lifecycle management. However, it falls significantly short of the **Memory Harness** vision described in `TRUE_MEMORY_HARNESS_ADVANCED_RESEARCH_PROMPT.md`.

This investigation documents:
- The actual architecture of TrueMemory (evidence-based, not inferred)
- How modern memory systems (OpenAI Dreaming, Anthropic Memory Tool, Mem0, Zep/Graphiti, Letta) solve similar problems
- The specific gaps preventing TrueMemory from becoming a true memory harness
- A prioritized implementation roadmap with dependency tracking

**Key Finding:** TrueMemory's core limitation is that it treats memory as a **passive store** rather than an **active governance layer**. The system lacks LLM-based extraction, conflict resolution, temporal reasoning, consolidation, and agent-generated memory—all critical for a production memory harness.

---

## 2. Current Architecture: Evidence-Based Assessment

### 2.1 Execution Flow

```
User Message
    ↓
POST /api/chat/stream (chat.py)
    ↓
_chat_event_stream()
    ↓
MemoryClient.search() → Hot Cache (L0) → SQLite LIKE (L1) → Hybrid BM25+Semantic (L2)
    ↓
Router (intent detection)
    ↓
Prompt Builder (injects memory as flat text)
    ↓
LLM (OpenRouter)
    ↓
Post-response: Regex extraction → Durable memory write
```

### 2.2 Memory Core (`memory_core.py`)

**Facade Pattern:** `MemoryClient` provides a provider-neutral API over `MemoryCore`.

Key methods:
- `search(query, workspace_id, k)` → Returns ranked memory results
- `remember(text, workspace_id)` → Stores a memory (explicit write)
- `get(memory_id)` → Retrieves a specific memory
- `forget(memory_id)` → Deletes a memory
- `current_state(workspace_id)` → Returns current state view

**Domain Boundary:** `MemoryCore` encapsulates storage, retrieval, and extraction. All adapters (SQLite, Postgres, Zilliz) are behind this boundary.

**Provider Configuration:** Configurable via `MemoryProviderConfig`:
- `provider_type`: "sqlite" | "postgres" | "zilliz"
- `connection_string`: Database connection
- `embedding_dim`: Vector dimensions (default: 384)
- `enable_hybrid_search`: Boolean flag

### 2.3 Multi-Tier Retrieval

**L0 Hot Cache** (`memory_hot_cache.py`):
- 512 entries, 30-second TTL
- In-memory dictionary with LRU eviction
- Pattern: `{workspace_id}:{query_hash}` → results
- **Limitation:** Can serve stale results; no invalidation on writes

**L1 SQLite Search** (`memory_store.py`):
- LIKE-based text search: `%query%`
- Simple but fast for small datasets
- No semantic understanding

**L2 Hybrid Search** (`memory_hybrid.py`):
- BM25 keyword matching via `retrieval_scoring.py`
- Sentence-transformer semantic similarity (all-MiniLM-L6-v2)
- Exact-key matching (for profile lookups)
- Reciprocal Rank Fusion (RRF) to combine signals
- Temporal filtering: `valid_from`/`valid_until` columns

**Retrieval Scoring** (`retrieval_scoring.py`):
```python
def bm25_scores(query, documents, k1=1.5, b=0.75):
    # Standard BM25 implementation
    
def reciprocal_rank_fusion(rankings, k=60):
    # RRF fusion of multiple ranking lists
```

### 2.4 Write Pipeline

Three distinct write paths:

**Path A: Profile Declaration** (`PROFILE_TRIGGER_PATTERN` in `memory_store.py`):
```python
PROFILE_TRIGGER_PATTERN = re.compile(
    r"(?:my name is|i'm|i am|call me|prefer|always|never|usually)\s+(.{3,50})",
    re.IGNORECASE
)
```
- Regex match on user messages
- Direct SQLite upsert to `profile_memories` table
- Bypasses LLM entirely
- **Limitation:** Only 1 pattern captures profile information

**Path B: Durable Extraction** (`durable_memory.py`):
```python
DURABLE_PATTERNS = [
    (r"decision[:\s]+(.+)", "decision"),
    (r"prefer(?:ence)?s?[:\s]+(.+)", "preference"),
    (r"task[:\s]+(.+)", "task_state"),
    (r"(?:fact|remember)[:\s]+(.+)", "fact"),
]
```
- Regex extraction from user messages only
- Stored via `postgres_store.save_durable_memories()`
- 4 patterns total
- **Limitation:** Misses most natural language durable information

**Path C: Explicit API/MCP Write** (`MemoryClient.remember()`):
- Direct write to memory store
- Used by MCP tools and REST API
- No extraction or deduplication

### 2.5 Database Schema

**Core Tables:**

```sql
-- user_memories: Durable extracted memories
CREATE TABLE user_memories (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    memory_type TEXT CHECK(memory_type IN (
        'conversation_summary', 'preference', 'task_state',
        'fact', 'decision'
    )),
    content TEXT NOT NULL,
    source_message_id UUID,
    lifecycle_status TEXT DEFAULT 'approved',
    is_pinned BOOLEAN DEFAULT FALSE,
    confidence_score REAL DEFAULT 1.0,
    supersedes_memory_id UUID,
    reviewed_at TIMESTAMPTZ,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    revision INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- profile_memories: Implicit profile facts
CREATE TABLE profile_memories (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    profile_type TEXT CHECK(profile_type IN (
        'user_name', 'location', 'timezone', 'occupation',
        'interests', 'communication_style'
    )),
    content TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    source TEXT DEFAULT 'explicit',
    last_mentioned_at TIMESTAMPTZ,
    times_mentioned INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- memory_hot_cache: L0 cache
CREATE TABLE memory_hot_cache (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    query_hash TEXT NOT NULL,
    results_json TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
```

**Lifecycle States:**
- `pending` → Awaiting review
- `approved` → Active, retrievable
- `rejected` → Not retrievable
- `superseded` → Replaced by newer memory
- `archived` → Soft-deleted, retrievable for audit

**Temporal Columns:**
- `valid_from`: When the fact became true
- `valid_until`: When the fact stopped being true
- `revision`: Version number for supersession chain
- `supersedes_memory_id`: Links to the memory this replaces

### 2.6 MCP Server Tools

**Memory MCP Server** (`mcp-server/memory.ts`):

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `memory_search` | Search memories | query, k, filters | Ranked results |
| `memory_retrieve` | Get specific memory | memory_id | Memory object |
| `memory_store` | Store new memory | content, metadata | Write confirmation |
| `memory_forget` | Delete memory | memory_id | Deletion confirmation |
| `memory_timeline` | Temporal query | start_date, end_date | Time-ordered results |
| `memory_related` | Find related | memory_id, k | Related memories |
| `memory_current_state` | Current view | workspace_id | State snapshot |

### 2.7 Maturity Assessment

**Level 2 (Persistent Selective Memory)** — Evidence:

✅ **Implemented:**
- Multi-tier retrieval (hot cache → SQLite → hybrid)
- Durable memory extraction (regex-based)
- Profile memory (regex-based)
- Lifecycle states (pending/approved/rejected/superseded/archived)
- Temporal fields (valid_from/valid_until/revision)
- MCP tool interface
- Workspace/project scoping
- Memory ingestion pipeline (20 stages)

❌ **Missing (required for Level 3):**
- LLM-based extraction (regex-only)
- Conflict resolution (contradictions coexist)
- Memory consolidation (related memories not merged)
- Temporal reasoning (fields exist, logic absent)
- Agent-generated memory (only user messages processed)
- Context compilation (memory injected as flat text)
- Memory decay/scoring (no time-based relevance)
- Observability (no memory trace)

---

## 3. Modern Memory System Landscape

### 3.1 OpenAI ChatGPT Dreaming (2024-2026)

**Evolution:**
1. **April 2024:** Saved memories — user-triggered "remember that..." patterns
2. **April 2025:** Dreaming V0 — background process synthesizes memories from chat history
3. **June 2026:** Dreaming V3 — continuous memory synthesis with freshness tracking

**Architecture:**
- Background process periodically reviews all conversations
- Synthesizes a "memory summary" — a curated knowledge state
- Memories are reviewable, editable, deletable by user
- Temporal awareness: "planning birthday party for next Saturday" eventually expires

**Key Insight:** OpenAI treats memory as a **synthesized state**, not raw facts. The background process "dreams" about what matters, prioritizing patterns over individual facts.

**Benchmark Performance:** Dreaming V3 achieved 82.8% on their evaluation (up from Saved Memories baseline).

**Relevance to TrueMemory:** TrueMemory could implement a simpler version of dreaming by:
1. Running a background consolidation job after N conversations
2. Synthesizing related memories into higher-level facts
3. Tracking freshness via access/recency scores

### 3.2 Anthropic Claude Memory Tool (August 2025)

**Architecture:**
- Client-side tool: Claude requests file operations, app executes them
- Memory stored as files in `/memories` directory
- Just-in-time retrieval: checks memory directory before starting a task
- Pairs with compaction for long-running sessions

**Key Design Decisions:**
- **Client-side storage:** Application controls where/how data is stored
- **No input schema:** Tool definition is minimal (`{type: "memory_20250818", name: "memory"}`)
- **Path validation required:** Must prevent directory traversal attacks
- **File-based persistence:** Plain files, not database records

**Tool Commands:** view, create, str_replace, insert, delete, rename

**Key Insight:** Anthropic separates memory (persistent files) from context (conversation). Memory is always external to the context window; the agent explicitly loads what it needs.

**Relevance to TrueMemory:** TrueMemory's MCP server already exposes memory as tools. The missing piece is the **client-side handler** that manages file-based persistence with proper path validation.

### 3.3 Mem0 (2024-2026)

**Architecture (v3 — April 2026):**

```
User Input → Retrieve relevant memories → Enrich LLM prompt → Generate response → Store new memories
```

**Storage Layers:**
| Store | Contents | Purpose |
|-------|----------|---------|
| Vector Database | Memory text, embeddings, metadata | Semantic retrieval |
| Graph/Entity Store | Entities + embeddings + linked memory IDs | Entity-based boost |
| SQL Database | History log + rolling message window | Audit trail + dedup |

**Memory Processing Pipeline (v3):**

```
Messages In
    ↓
1. EXTRACTION (single LLM call)
    - Extracts structured facts
    - infer=True: LLM extracts facts
    - infer=False: stores raw text
    ↓
2. DEDUPLICATION (ADD-only)
    - Hash-based dedup (MD5)
    - No UPDATE/DELETE in extraction
    - Memories accumulate over time
    ↓
3. STORAGE
    - Batch embed → vector store
    - Entity extraction → entity store
    ↓
Memory Object
```

**Key Innovations:**
1. **Single-pass ADD-only extraction:** One LLM call, no UPDATE/DELETE during extraction. History preserved.
2. **Agent-generated facts are first-class:** When an agent confirms an action, that information is stored with equal weight to user facts.
3. **Entity linking:** Entities extracted, embedded, and linked across memories for retrieval boosting.
4. **Multi-signal retrieval:** Semantic + BM25 keyword + entity matching, fused via rank scoring.
5. **Temporal reasoning:** Time-aware retrieval scores candidates against query's temporal intent.
6. **Memory decay:** Search-time re-ranking — recently accessed memories get up to 1.5x boost, unused ones dampen toward 0.3x.

**Memory Object Structure:**
```json
{
  "id": "uuid",
  "memory": "Extracted memory text",
  "user_id": "user-identifier",
  "agent_id": null,
  "app_id": null,
  "run_id": null,
  "metadata": { "source": "chat", "priority": "high" },
  "categories": ["health", "preferences"],
  "created_at": "2025-03-12T12:34:56Z",
  "updated_at": "2025-03-12T12:34:56Z",
  "structured_attributes": {
    "day": 12, "month": 3, "year": 2025,
    "hour": 12, "minute": 34,
    "day_of_week": "wednesday",
    "is_weekend": false
  },
  "score": 0.85
}
```

**Benchmark Results (2026):**
- LoCoMo: 92.5
- LongMemEval: 94.4
- BEAM 1M: 64.1
- BEAM 10M: 48.6
- Average retrieval tokens: ~6.7K

**Relevance to TrueMemory:** The biggest gap is Mem0's **LLM-based extraction** vs TrueMemory's regex-only. Mem0's single-call extraction captures what users actually mean, while TrueMemory's 4 patterns miss most natural language.

### 3.4 Zep/Graphiti — Temporal Knowledge Graph (2024-2026)

**Architecture:**

Graphiti builds a **temporal knowledge graph** with three hierarchical tiers:

```
Episode Subgraph (G_e)
    ↓ raw data + provenance
Semantic Entity Subgraph (G_s)
    ↓ entities + relationships
Community Subgraph (G_c)
    ↓ clusters + summaries
```

**Bi-Temporal Model:**
- **Timeline T:** Chronological ordering of events (when things happened)
- **Timeline T':** Transactional ordering of ingestion (when data was added)
- Every edge has: `t_valid`, `t_invalid` (in T), `t_created`, `t_expired` (in T')

**Key Innovations:**
1. **Non-lossy episodic storage:** Raw messages preserved as episodes, linked to derived entities/facts
2. **Temporal edge invalidation:** When new facts contradict old, old edges get `t_invalid` set — not deleted
3. **Entity resolution:** LLM-based entity matching across episodes
4. **Hybrid search:** Semantic + keyword (BM25) + graph traversal — no LLM in retrieval
5. **Community detection:** Entities clustered into communities with summaries

**Benchmark Results:**
- DMR: 94.8% (vs MemGPT's 93.4%)
- LongMemEval: Up to 18.5% improvement over baselines
- P95 latency: 300ms (no LLM calls during retrieval)

**Relevance to TrueMemory:** TrueMemory has temporal columns (`valid_from`, `valid_until`) but no **temporal reasoning logic**. Graphiti shows how to implement bi-temporal tracking and edge invalidation without full graph infrastructure.

### 3.5 Letta/MemGPT — Stateful Agents (2023-2026)

**Architecture:**

```
Core Memory (in-context blocks)
    ↕ memory tools (self-editing)
Archival Memory (out-of-context)
    ↕ archival tools (search, insert)
Recall Memory (conversation history)
```

**Memory Hierarchy:**
- **Core Memory:** In-context memory blocks (persona, user, custom) — editable by agent via tools
- **Archival Memory:** External storage (vector DB, filesystem) — searchable via tools
- **Recall Memory:** Complete conversation history — searchable via tools

**Key Innovations:**
1. **Self-editing memory:** Agent can modify its own context window via tools (`memory_replace`, `memory_insert`, `memory_rethink`)
2. **Shared memory blocks:** Multiple agents can access/modify the same memory block
3. **Sleep-time compute:** Background agents process information during idle periods, update shared memory
4. **Context constitution:** Principles governing how agents manage context
5. **Context repositories:** Git-based versioning of agent context

**Memory Block Structure:**
- Label (e.g., "human", "persona", "docs/api/endpoints")
- Value (string content)
- Attached to agent (in-context) or detached
- Persisted in database with unique block_id

**Key Insight:** Letta treats the **context window as a managed resource**, not a monolith. The agent actively decides what to keep, what to archive, and what to forget.

**Relevance to TrueMemory:** TrueMemory injects memory as flat text in prompts. Letta shows how to structure memory into **typed, editable blocks** that the agent can manage.

### 3.6 LongMemEval Benchmark (2024)

**Framework:** Three-stage model for long-term memory:
1. **Indexing:** Convert history into key-value items
2. **Retrieval:** Formulate query, collect top-k items
3. **Reading:** LLM reads results, generates response

**Four Control Points:**
1. **Value:** Granularity (session → round → summary/fact)
2. **Key:** Index expansion (original + summaries + facts + keyphrases)
3. **Query:** Time-aware query expansion
4. **Reading:** Chain-of-Note + structured format

**Key Findings:**
- Session decomposition into rounds improves retrieval
- Fact-augmented key expansion improves recall by 4%
- Time-aware query expansion improves temporal reasoning by 7-11%
- Chain-of-Note reading prevents "lost in the middle" effect

**Relevance to TrueMemory:** TrueMemory uses flat text as both key and value. LongMemEval shows that **multi-pathway indexing** (original + expanded keys) significantly improves retrieval.

### 3.7 MemArchitect — Memory Governance (March 2026)

**Architecture:**

Four governance pillars:
1. **Lifecycle & Hygiene:** Decay, compression, deletion of noise
2. **Consistency & Truth:** Conflict resolution, factuality enforcement
3. **Provenance & Trust:** Source tracking, confidence scoring
4. **Efficiency & Safety:** Token budgets, privacy compliance

**Key Innovation:** A **governance middleware** that decouples memory lifecycle management from model weights. Memory operations go through policy enforcement before storage.

**Benchmark Results:**
- +7.45% aggregate improvement over ungoverned memory
- +27.5% over SimpleMem in subgroup analysis

**Relevance to TrueMemory:** TrueMemory has lifecycle states but no **policy enforcement engine**. MemArchitect shows how to implement governance as a separate layer.

---

## 4. Critical Gap Analysis

### 4.1 P0 — Core Quality Blockers

| Gap | Current State | Impact | Priority |
|-----|--------------|--------|----------|
| **LLM Extraction** | 4 regex patterns + 1 profile pattern | Most natural language durable information missed | P0 |
| **Conflict Resolution** | Contradictions coexist indefinitely | LLM sees contradictory facts, must disambiguate | P0 |
| **Agent-Generated Memory** | Only user messages processed | Agent's own completed work is not stored | P0 |
| **Memory as Tool** | Memory only injected as prompt text | Never used as structured input to planning/tool selection | P0 |

### 4.2 P1 — Architecture Gaps

| Gap | Current State | Impact | Priority |
|-----|--------------|--------|----------|
| **Context Compiler** | Flat text injection | No budgeting, prioritization, or typed context | P1 |
| **Working Memory** | Mixed with conversation history | No separation between active context and durable memory | P1 |
| **Consolidation** | No merging of related memories | Multiple similar memories coexist | P1 |
| **Temporal Reasoning** | Fields exist, logic absent | Cannot answer "what's true now vs. before" | P1 |

### 4.3 P2 — Production Gaps

| Gap | Current State | Impact | Priority |
|-----|--------------|--------|----------|
| **Memory Decay** | No time-based relevance scoring | Old irrelevant memories rank equally with new | P2 |
| **Observability** | No memory trace | Cannot debug why specific memories were retrieved | P2 |
| **Memory Governor** | No policy enforcement | No control over what becomes memory | P2 |
| **Entity Resolution** | No entity extraction/linking | Cannot track entities across memories | P2 |

### 4.4 P3 — Advanced Capabilities

| Gap | Current State | Impact | Priority |
|-----|--------------|--------|----------|
| **Knowledge Graph** | Flat storage only | Cannot model relationships between entities | P3 |
| **Sleep-time Compute** | No background processing | No consolidation, reflection, or dreaming | P3 |
| **Multi-Agent Memory** | Single-agent only | No shared memory across agents | P3 |
| **Learned Control** | Fixed heuristics | No adaptive memory management policy | P3 |

---

## 5. Target Architecture: Memory Harness

### 5.1 The Closed Loop

```
Experience → Capture → Remember → Understand → Store → Retrieve → Resolve → Compile Context → Reason → Act → Observe → Learn → Consolidate → Update State
```

### 5.2 Architectural Layers

```
┌─────────────────────────────────────────────────────────┐
│                    MEMORY GOVERNOR                       │
│  Policy Engine: What becomes memory, scope, trust,      │
│  conflicts, expiry, compliance                          │
├─────────────────────────────────────────────────────────┤
│                    EXTRACTION LAYER                      │
│  LLM-based extraction: Preferences, facts, decisions,   │
│  entities, temporal references, agent observations       │
├─────────────────────────────────────────────────────────┤
│                    STORAGE LAYER                         │
│  Multi-tier: Hot cache → SQLite → Postgres → Vector DB  │
│  Graph layer (optional): Knowledge graph for entities    │
├─────────────────────────────────────────────────────────┤
│                    RETRIEVAL LAYER                       │
│  Multi-signal: Semantic + BM25 + Entity + Temporal       │
│  Intent-aware reranking, budget enforcement             │
├─────────────────────────────────────────────────────────┤
│                    CONTEXT COMPILER                      │
│  Typed, budgeted, prioritized context assembly          │
│  Working memory (hot) + Long-term (warm) + Archive (cold)│
├─────────────────────────────────────────────────────────┤
│                    AGENT INTERFACE                       │
│  Memory as tools: search, get, remember, forget,        │
│  current_state, timeline, related                       │
├─────────────────────────────────────────────────────────┤
│                    OBSERVABILITY                         │
│  Memory trace, provenance tracking, audit log           │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Event + Projection Architecture

**Append-only experience ledger:**
```json
{
  "event_id": "uuid",
  "timestamp": "2026-09-10T14:30:00Z",
  "source": "user_message|agent_action|system_observation",
  "content": "The raw event data",
  "metadata": {
    "conversation_id": "...",
    "agent_id": "...",
    "confidence": 0.95
  }
}
```

**Derived current-state view (projection):**
```json
{
  "entity": "User: Alice",
  "facts": [
    {"fact": "prefers dark mode", "confidence": 0.9, "last_updated": "..."},
    {"fact": "works at Acme Corp", "confidence": 0.85, "last_updated": "..."}
  ],
  "computed_at": "2026-09-10T14:35:00Z"
}
```

### 5.4 Memory Types

| Type | Purpose | TTL | Access Pattern |
|------|---------|-----|----------------|
| **Working Memory** | Current task context | Session | High frequency |
| **Episodic Memory** | Conversation events | Months | By time range |
| **Semantic Memory** | Abstracted facts/rules | Permanent | By relevance |
| **Procedural Memory** | Reusable skills/plans | Permanent | By task match |
| **Profile Memory** | User preferences/identity | Permanent | Always |

---

## 6. Implementation Priorities

### 6.1 Phase 1: Core Extraction (Weeks 1-4)

**Task 1.1: LLM-based Extraction Pipeline**
- Replace regex patterns with LLM extraction call
- Extract: preferences, facts, decisions, entities, temporal references
- Single-pass extraction (Mem0-style ADD-only)
- Cost: ~$0.001 per conversation turn

**Task 1.2: Conflict Resolution**
- Compare new extraction against existing memories
- Operations: ADD, UPDATE, DELETE, NOOP
- Resolution happens at write time, not retrieval time
- LLM selects the operation based on semantic comparison

**Task 1.3: Agent-Generated Memory**
- Capture agent's completed work observations
- Store with equal weight to user facts
- Source: tool call results, task completions, learned patterns

### 6.2 Phase 2: Governance (Weeks 5-8)

**Task 2.1: Memory Governor**
- Policy engine for memory operations
- Rules: scope, trust, conflicts, expiry, compliance
- Decouples lifecycle management from model weights

**Task 2.2: Temporal Reasoning**
- Implement bi-temporal model (event time + ingestion time)
- Time-aware query expansion
- Point-in-time queries: "what was true on date X?"

**Task 2.3: Memory Decay**
- Access-based scoring (recently accessed = higher relevance)
- Time-based decay (unused memories dampen)
- Consolidation triggers based on stability scores

### 6.3 Phase 3: Context Engineering (Weeks 9-12)

**Task 3.1: Context Compiler**
- Replace flat text injection with typed, budgeted context
- Budget enforcement: ~60-80% context utilization
- Priority-based selection: profile > working > semantic > episodic

**Task 3.2: Working Memory Separation**
- Distinct from long-term memory
- Session-scoped, high-frequency access
- Automatic promotion/demotion based on relevance

**Task 3.3: Memory as Tool Surface**
- Expose all memory operations as agent-callable tools
- Proactive (auto-inject) + Just-in-time (agent calls)
- Token-efficient tool responses

### 6.4 Phase 4: Consolidation (Weeks 13-16)

**Task 4.1: Background Consolidation**
- Periodic merging of related memories
- Pattern: "user corrected date format on Jan 5, 12, Feb 1" → "user prefers DD/MM/YYYY"
- Deduplication, summarization, abstraction

**Task 4.2: Entity Resolution**
- Extract entities from all memories
- Link entities across memories
- Entity-based retrieval boosting

**Task 4.3: Observability**
- Memory trace: why each memory was retrieved
- Provenance: which conversation/event produced each memory
- Audit log: all memory operations

---

## 7. Evaluation Framework

### 7.1 Benchmarks to Target

| Benchmark | Metric | Current | Target |
|-----------|--------|---------|--------|
| **LongMemEval** | Accuracy | N/A | >70% |
| **LoCoMo** | Accuracy | N/A | >80% |
| **BEAM 1M** | Score | N/A | >60% |
| **Custom** | Token efficiency | N/A | <10K avg retrieval |

### 7.2 Internal Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Extraction F1** | Precision/recall of memory extraction | >0.85 |
| **Conflict Detection** | Rate of contradictory memories detected | >0.90 |
| **Retrieval Precision** | Top-k relevance | >0.80 |
| **Context Utilization** | % of context window used productively | 60-80% |
| **Latency** | End-to-end memory write/read | <200ms |

### 7.3 Golden Test Suite

**Test Cases:**
1. **Temporal:** "What was my preference before the change?"
2. **Conflict:** "I used to prefer X, now I prefer Y" → only Y surfaces
3. **Consolidation:** Multiple related facts merge into one
4. **Agent Memory:** Completed task is retrievable
5. **Abstention:** System says "I don't know" for unanswerable queries

---

## 8. References

### Papers
- Park et al., "Generative Agents: Interactive Simulacra of Human Behavior" (2023)
- Packer et al., "MemGPT: Towards LLMs as Operating Systems" (2023)
- Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory" (2025)
- Der Common et al., "Zep: A Temporal Knowledge Graph Architecture for Agent Memory" (2025)
- "Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers" (2026)
- "MemArchitect: A Policy Driven Memory Governance Layer" (2026)

### Systems
- OpenAI ChatGPT Dreaming (2024-2026)
- Anthropic Claude Memory Tool (2025)
- Mem0 v3 (2026)
- Zep/Graphiti (2024-2026)
- Letta/MemGPT (2023-2026)

### Benchmarks
- LongMemEval (2024)
- LoCoMo (2024)
- BEAM (2026)
- MemoryArena (2026)

### Internal
- `backend/services/memory_core.py`: MemoryClient/MemoryCore
- `backend/services/memory_store.py`: SQLite store, profile extraction
- `backend/services/memory_hybrid.py`: L2 hybrid retrieval
- `backend/services/memory_hot_cache.py`: L0 TTL cache
- `backend/services/durable_memory.py`: Regex extraction
- `backend/app/routes/chat.py`: Main chat endpoint
- `mcp-server/memory.ts`: MCP memory tools

---

*This document represents the current state of the TrueMemory investigation. Updates will be made as new findings emerge during implementation.*
