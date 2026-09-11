# TrueMemory Architecture Gate

## Executive Summary

TrueMemory is currently at **Level 2.5** — between a Memory/RAG Assistant and a Tool-Using Agent. It has a real multi-tier memory system with hybrid retrieval, lifecycle management, and temporal schema fields. However, it critically lacks LLM-based extraction, semantic conflict resolution, agent-generated memory, context compilation, memory governance, and observability.

**Critical finding:** The research documents contain several unverified claims and misidentify the current maturity level. The actual architecture is more capable in some areas (dual-mode Postgres/SQLite, hybrid BM25+semantic retrieval, project-scoped memory) and less capable in others (no LLM extraction, no conflict detection, no agent-generated memory, no context compiler).

**Implementation status:** READY — with roadmap corrections.

---

## Current Repository Structure

```
D:\aman\TrueMemory\
├── app/                          # Next.js frontend
├── backend/                      # Python FastAPI backend
│   ├── app/routes/               # API routes (chat.py, memory_api.py, etc.)
│   ├── services/                 # Core services (memory_core.py, etc.)
│   ├── rag/                      # RAG pipeline (prompt_builder.py)
│   ├── query/                    # Query routing (router.py)
│   ├── db/init/                  # SQL migrations (001-018)
│   ├── tests/                    # pytest tests
│   └── embeddings/               # Embedding service
├── mcp-server/                   # TypeScript MCP server (memory.ts)
├── docs/research/                # Research documents
├── tests/                        # E2E tests
├── scripts/                      # Build/deploy scripts
└── infra/                        # Infrastructure config
```

**Roots:**
- Frontend root: `app/` (Next.js)
- Backend root: `backend/` (FastAPI)
- MCP root: `mcp-server/` (TypeScript)
- Tests root: `backend/tests/` + `tests/`
- Migration root: `backend/db/init/`

---

## Current Agent Architecture

### Execution Flow (Verified)

```
POST /api/chat/stream (chat.py:761)
    ↓
_chat_event_stream() (chat.py:930)
    ↓
MemoryClient.recent_messages() → conversation history (chat.py:1079)
MemoryClient.list() → profile memories (chat.py:1090)
MemoryClient.workspace_search() → durable memories (chat.py:1098)
    ↓
decide_route() → intent classification (chat.py:1159)
build_execution_plan() → plan creation (chat.py:1212)
    ↓
Knowledge retrieval (hybrid search) (chat.py:1449)
Web search (async) (chat.py:1446)
    ↓
build_general_chat_messages() → prompt assembly (chat.py:1875)
    ↓
stream_chat_completion() → LLM inference (chat.py:2050+)
    ↓
extract_and_save_workspace_memory() → memory write (chat.py:1955)
```

### Agent Components

| Component | File | Function | Status |
|-----------|------|----------|--------|
| API Router | `chat.py:761` | `chat_stream()` | ✅ Exists |
| Intent Router | `router.py:425` | `decide_route()` | ✅ Exists |
| Execution Plan | `router.py` | `build_execution_plan()` | ✅ Exists |
| Memory Retrieval | `memory_core.py:162` | `MemoryClient.search()` | ✅ Exists |
| Prompt Builder | `prompt_builder.py:498` | `build_general_chat_messages()` | ✅ Exists |
| LLM Inference | `openrouter.py` | `stream_chat_completion()` | ✅ Exists |
| Memory Write | `durable_memory.py:58` | `extract_durable_memories()` | ⚠️ Regex-only |
| Context Engine | `context_engine.py` | `ContextNode`, `build_context_graph()` | ✅ Exists |
| Parallel Retriever | `context_retrieval.py` | `ParallelContextRetriever` | ✅ Exists |
| Guardrails | `agent_guardrails.py` | `StreamingOutputGuard` | ✅ Exists |

### Agent Maturity Classification

**LEVEL 3 — Tool-Using Agent**

Evidence:
- Agent uses web search tools (chat.py:1446)
- Agent uses knowledge base retrieval (chat.py:1449)
- Agent uses GitHub integration tools (chat.py:1729)
- Agent has intent routing and execution planning (router.py)
- Agent has guardrails and safety checks (agent_guardrails.py)

NOT Level 4 because:
- No iterative planning/execution loops
- No self-reflective reasoning
- No adaptive tool selection based on results
- No multi-step autonomous execution

---

## Current Memory Architecture

### Memory Tiers (Verified)

**L0 Hot Cache** (`memory_hot_cache.py:40`):
- 512 entries max, 30-second TTL
- In-memory OrderedDict with LRU eviction
- Postgres-backed shared cache when configured
- Stampede protection via per-key locks
- Metrics: hits, misses, writes, invalidations

**L1 SQLite Search** (`memory_store.py`):
- LIKE-based text search
- Profile memory storage (user_name, location, timezone, occupation, interests, communication_style)
- Regex-based extraction via `PROFILE_TRIGGER_PATTERN` (memory_store.py:12)

**L2 Hybrid Search** (`memory_hybrid.py:44`):
- BM25 keyword matching (retrieval_scoring.py)
- Sentence-transformer semantic similarity (all-MiniLM-L6-v2)
- Exact-key matching
- Reciprocal Rank Fusion (RRF)
- Temporal filtering (valid_from/valid_until)
- Deduplication by logical key + revision

### Memory Types (Verified)

**Profile Memories** (SQLite):
- user_name, location, timezone, occupation, interests, communication_style
- Extracted via `PROFILE_TRIGGER_PATTERN` regex
- Storage: `profile_memories` table

**Durable Memories** (Postgres):
- conversation_summary, preference, task_state, fact, decision
- Extracted via 4 regex patterns in `durable_memory.py`
- Storage: `user_memories` table

**Conversation Memory** (Postgres/SQLite):
- Recent messages for context
- Storage: `messages` table

### Database Schema (Verified)

**user_memories table** (006, 008, 009):
```sql
-- Core fields
id UUID PRIMARY KEY
user_id UUID NOT NULL
workspace_id UUID
project_id UUID
memory_type TEXT (conversation_summary|preference|task_state|fact|decision)
memory_key TEXT NOT NULL
content TEXT NOT NULL
importance_score NUMERIC
confidence_score NUMERIC DEFAULT 0.750

-- Lifecycle (008)
lifecycle_status TEXT DEFAULT 'approved' (pending|approved|rejected|superseded|archived)
is_pinned BOOLEAN DEFAULT FALSE
supersedes_memory_id UUID
reviewed_at TIMESTAMPTZ
superseded_at TIMESTAMPTZ

-- Temporal (009)
valid_from TIMESTAMPTZ
valid_until TIMESTAMPTZ
revision INTEGER DEFAULT 1
provenance JSONB DEFAULT '{}'

-- Source tracking
source_message_id UUID
conversation_id UUID
source TEXT
```

### Memory Write Pipeline (Verified)

```
User message arrives
    ↓
extract_durable_memories(text) (durable_memory.py:58)
    - 4 regex patterns: decision, preference, task_state, fact
    - Returns DurableMemoryCandidate objects
    ↓
save_durable_memories() (postgres_store.py:545)
    - For each candidate:
      - SELECT existing memory with same key (FOR UPDATE)
      - If content matches → UPDATE metadata only
      - If content differs:
        - UPDATE existing → lifecycle_status='superseded'
        - INSERT new memory with lifecycle_status='pending', supersedes_memory_id
    ↓
Memory stored with supersession chain
```

**Critical limitation:** Conflict detection is **exact string matching only** (`current["content"] == candidate.content` at postgres_store.py:579). No semantic comparison.

---

## L3 Temporal / Mutability Audit

### L3 TEMPORAL / MUTABILITY AUDIT

| Capability | Status | Evidence |
|------------|--------|----------|
| **1. Validity windows** | **PARTIAL** | `valid_from`, `valid_until` columns exist (009_temporal_memory.sql:1-2). Filtered in `memory_hybrid.py:178-183`. But never set during extraction — all memories have NULL valid_from/valid_until. |
| **2. Versioning** | **PARTIAL** | `revision` column exists (009_temporal_memory.sql:3). Used for deduplication ordering (memory_hybrid.py:204). But never incremented during writes — always defaults to 1. |
| **3. Historical state** | **PARTIAL** | Superseded memories preserved with `lifecycle_status='superseded'` (postgres_store.py:602). `include_history` flag in queries (memory_hybrid.py:175). But no UI or API to reconstruct historical state. |
| **4. Current state** | **PARTIAL** | `lifecycle_status='approved'` filter (postgres_store.py:661). Deduplication keeps highest revision (memory_hybrid.py:199-210). But no explicit "current state" view — must query and filter manually. |
| **5. Supersession** | **YES** | `supersedes_memory_id` column (008_memory_lifecycle.sql:6). Chain created during writes (postgres_store.py:598-606). Edit action creates supersession (postgres_store.py:748-773). |
| **6. Conflict detection** | **NO** | Only exact string matching (postgres_store.py:579). No semantic comparison. "I use React" vs "I prefer React" → treated as different facts, not conflict. |
| **7. Context-dependent facts** | **YES** | `project_id` column (006_durable_workspace_memory.sql). Scoped queries (postgres_store.py:660). Unique index includes project_id (008_memory_lifecycle.sql:11-19). |
| **8. Temporal queries** | **PARTIAL** | `as_of` parameter in search (memory_core.py:237). `include_history` flag (memory_core.py:237). But no "what was true on date X" logic — only basic time-range filtering. |
| **9. Point-in-time reconstruction** | **NO** | Schema supports it (valid_from, valid_until, revision). But no code reconstructs state at a given point in time. |
| **10. Explicit roadmap ownership** | **NO** | No task in current roadmap explicitly owns L3 temporal reasoning. |

### Missing L3 Capabilities

1. **No semantic conflict detection** — exact string matching only
2. **No temporal reasoning** — can't answer "what was true before March?"
3. **No current state view** — must manually filter approved memories
4. **No point-in-time reconstruction** — schema exists, logic doesn't
5. **No consolidation** — related memories stored independently
6. **No memory decay** — old memories rank equally with new

---

## Write → Resolve → State Audit

### Pipeline Verification

```
EXPERIENCE (user message)
    ↓
EXTRACT (durable_memory.py:58)
    - 4 regex patterns only
    - No LLM extraction
    - No entity extraction
    - No temporal reference extraction
    ↓
UNDERSTAND — DOES NOT EXIST
    - No semantic understanding of extracted facts
    - No entity resolution
    - No relationship extraction
    ↓
COMPARE (postgres_store.py:561-576)
    - SELECT existing with same memory_type + memory_key
    - Exact string comparison only (line 579)
    ↓
RESOLVE (postgres_store.py:596-627)
    - If content matches → UPDATE metadata
    - If content differs → supersede old, insert new
    - No ADD/UPDATE/SUPERSEDE/DELETE/NOOP selection
    - No semantic conflict resolution
    ↓
COMMIT (postgres_store.py:632)
    - Transaction committed
    - Hot cache invalidated
```

### Resolve Operations Available

| Operation | Exists? | Evidence |
|-----------|---------|----------|
| ADD | **YES** | New memory inserted (postgres_store.py:608-628) |
| UPDATE | **PARTIAL** | Metadata update only (postgres_store.py:580-594) |
| SUPERSEDE | **YES** | Old memory marked superseded (postgres_store.py:599-606) |
| DELETE | **NO** | No delete operation in write path |
| NOOP | **PARTIAL** | Implicit when content matches (postgres_store.py:579) |
| KEEP_SEPARATE | **NO** | No logic for context-specific variations |

### Critical Gap

The system cannot distinguish:
- **Correction:** "I switched from React to Vue" → should supersede
- **Temporal change:** "I used React last year" → should keep both with time bounds
- **Context variation:** "React for frontend, Vue for dashboard" → should keep both
- **Additional info:** "I also know TypeScript" → should add, not conflict
- **Duplicate:** "I prefer TypeScript" (said twice) → should be NOOP
- **Unrelated fact:** "I like dark mode" → should ADD

All are treated as either "exact match" or "different fact."

---

## Experience Capture Audit

### EXPERIENCE SOURCE MATRIX

| Source | Captured? | Persisted? | Can become memory? | Provenance? | Used for learning? |
|--------|-----------|------------|---------------------|-------------|-------------------|
| User message | ✅ | ✅ | ✅ (regex extraction) | ✅ (source_message_id) | ❌ |
| Assistant response | ❌ | ✅ (stored as message) | ❌ | ❌ | ❌ |
| Agent plan | ❌ | ❌ | ❌ | ❌ | ❌ |
| Agent decision | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tool call | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tool result | ❌ | ❌ | ❌ | ❌ | ❌ |
| Observation | ❌ | ❌ | ❌ | ❌ | ❌ |
| Task completion | ❌ | ❌ | ❌ | ❌ | ❌ |
| Task failure | ❌ | ❌ | ❌ | ❌ | ❌ |
| Code change | ❌ | ❌ | ❌ | ❌ | ❌ |
| Web result | ❌ | ✅ (stored as source) | ❌ | ❌ | ❌ |
| User correction | ❌ | ❌ | ❌ | ❌ | ❌ |
| User feedback | ❌ | ❌ | ❌ | ❌ | ❌ |

**Only user messages trigger memory extraction.** The agent's own work is never captured as memory.

---

## Agent-Generated Memory Audit

### Test: Agent completes a task

```
User: "Implement JWT authentication"
Agent: "JWT authentication has been implemented."
Later: "How does authentication work?"
```

**Expected:** JWT authentication should be remembered.
**Actual:** Unless the user said "remember this" or the message matched a regex pattern, the implementation is NOT stored as memory.

### Classification

| Source | Status | Evidence |
|--------|--------|----------|
| User message | **SUPPORTED** | Regex extraction in durable_memory.py |
| Agent response | **UNSUPPORTED** | No extraction from assistant messages |
| Tool result | **UNSUPPORTED** | No extraction from tool outputs |
| Task completion | **UNSUPPORTED** | No extraction from task status |
| Code change | **UNSUPPORTED** | No extraction from code changes |
| Web discovery | **UNSUPPORTED** | No extraction from web search results |
| User correction | **UNSUPPORTED** | No extraction from corrections |
| User feedback | **UNSUPPORTED** | No extraction from feedback |

---

## Memory ↔ Agent Tool Usage Audit

### Memory Tools Exist

**MCP Server** (`mcp-server/memory.ts`):
- `memory_search` ✅
- `memory_retrieve` ✅
- `memory_store` ✅
- `memory_update` ✅
- `memory_forget` ✅
- `memory_profile` ✅

**REST API** (`memory_api.py`):
- `GET /v1/memories` ✅
- `POST /v1/memories` ✅
- `POST /v1/memories/search` ✅
- `POST /v1/memories/retrieve` ✅
- `POST /v1/memories/update` ✅
- `POST /v1/memories/forget` ✅

### Memory Tools Registered with Live Agent

**UNKNOWN** — The MCP server exists but there's no evidence it's connected to the live agent in `chat.py`. The agent in `chat.py` uses `MemoryClient` directly, not MCP tools.

### Agent Calls Memory Proactively

**NO** — Memory retrieval is hardcoded in `_chat_event_stream()` (chat.py:1079-1104). The agent doesn't decide when to search memory; the pipeline always retrieves profile and workspace memories.

### Agent Calls Memory Just-in-Time

**NO** — All memory retrieval happens at the start of the pipeline, before LLM inference. There's no mid-execution memory search.

### Agent Can Write Memory During Execution

**PARTIAL** — `extract_and_save_workspace_memory()` is called after the user message (chat.py:1955). But the agent itself doesn't invoke memory writes; the pipeline does it automatically.

---

## JIT Retrieval Audit

### Current: Preloaded

```
Conversation starts
    ↓
memory_client.recent_messages() → conversation history
memory_client.list() → profile memories
memory_client.workspace_search() → durable memories
    ↓
All memory loaded into prompt
    ↓
LLM inference
```

### Missing: Agent-requested

```
Agent needs information
    ↓
memory_search(query)
    ↓
Result
    ↓
Continue reasoning
```

### Missing: Hybrid

The system is **preload-only**. No just-in-time retrieval exists.

---

## Memory → Context → Reasoning → Action Audit

### Chain Verification

```
MEMORY RETRIEVED (chat.py:1079-1104)
    ↓
MEMORY INCLUDED (prompt_builder.py:519-532)
    - Injected as flat text in user prompt
    - "USER / PROFILE MEMORY:" block
    - No typing, no budgeting, no prioritization
    ↓
AGENT REASONING (LLM inference)
    - LLM sees memory as part of prompt
    - No structured memory input
    - No memory-aware planning
    ↓
AGENT DECISION (LLM output)
    - No evidence memory influenced decision
    - No memory trace
    ↓
ACTION (streaming response)
    - No post-action memory update
    - No outcome tracking
```

### Observable Links

| Link | Observable? | Evidence |
|------|-------------|----------|
| Memory retrieved | ✅ | SSE events, logging |
| Memory included | ✅ | Prompt contains memory block |
| Agent saw it | ❌ | No attention tracking |
| Agent decision | ❌ | No decision logging |
| Action | ❌ | No action-memory correlation |
| Outcome | ❌ | No outcome tracking |
| Feedback | ❌ | No feedback capture |

---

## Context Engineering Audit

### Current: Flat Text Injection

```python
# prompt_builder.py:519-532
user_content = f"""RECENT CONVERSATION MEMORY:
{conversation_block}

USER / PROFILE MEMORY:
{profile_block}

WEB SEARCH CONTEXT:
{web_context or "None"}

CURATED KNOWLEDGE CONTEXT:
{knowledge_context or "None"}

USER QUESTION:
{question}"""
```

### Missing Capabilities

| Capability | Status | Evidence |
|------------|--------|----------|
| Relevance filtering | **NO** | All retrieved memories injected |
| Token budget | **NO** | No limit on memory tokens |
| Prioritization | **NO** | No priority-based selection |
| Deduplication | **PARTIAL** | Dedup in hybrid retriever, not in prompt |
| Typed context | **NO** | All memory in single block |
| Temporal labels | **NO** | No temporal metadata in prompt |
| Current vs historical | **NO** | No distinction in prompt |
| Conflict filtering | **NO** | Contradictions can both appear |
| Provenance | **NO** | No source attribution in prompt |

---

## Memory Governance Audit

### Current: No Central Governor

Memory mutations happen in:
1. `durable_memory.py` — extraction
2. `postgres_store.py` — storage with supersession
3. `memory_store.py` — profile memory storage
4. `memory_api.py` — API writes
5. `memory_core.py` — MemoryClient facade

**No central policy engine** enforces rules across all these paths.

### Distributed Policy Decisions

| Location | Policy | Enforced? |
|----------|--------|-----------|
| `memory_core.py:57-68` | User authorization | ✅ |
| `memory_core.py:71-75` | Token bindings | ✅ |
| `memory_store.py:12-17` | Profile trigger regex | ✅ |
| `durable_memory.py:15-47` | Durable extraction regex | ✅ |
| `postgres_store.py:577-579` | Exact content match | ✅ |
| `memory_hybrid.py:174-183` | Temporal filtering | ✅ |
| `memory_hybrid.py:188-211` | Deduplication | ✅ |

### Missing Governance

- No PII detection
- No scope enforcement beyond workspace
- No expiry policies
- No confidence-based filtering
- No compliance rules
- No lifecycle transitions (pending → approved is manual)

---

## L5 Observability Readiness Audit

### Current Instrumentation

| Signal | Exists? | Evidence |
|--------|---------|----------|
| Retrieval event | **PARTIAL** | `retrieval_tier` in results (memory_hybrid.py:137) |
| Context compilation | **NO** | No logging of what was included |
| Agent decision | **NO** | No decision logging |
| Tool/action | **PARTIAL** | SSE events for tool steps |
| Outcome | **NO** | No outcome tracking |
| Memory write | **PARTIAL** | `memory.saved` SSE event (chat.py:1967) |
| Governor decision | **NO** | No governor exists |
| User correction | **NO** | No correction capture |
| Feedback | **PARTIAL** | `update_message_feedback` exists (postgres_store.py:75) |

### Missing L5 Signals

1. **memory_retrieval_event** — which memories were retrieved, with scores
2. **memory_influence_event** — which memories influenced agent decisions
3. **outcome_event** — task success/failure/correction
4. **governor_decision_event** — lifecycle decisions with reasoning
5. **event_correlation** — runId/taskId linking all events

---

## Research Claim Verification

### Claims from TRUE_MEMORY_HARNESS_ADVANCED_RESEARCH.md

| Claim | Source | Verified? | Status |
|-------|--------|-----------|--------|
| "4 regex patterns + 1 profile pattern" | durable_memory.py + memory_store.py | ✅ | **VERIFIED** |
| "512 entries, 30-second TTL" | memory_hot_cache.py:41 | ✅ | **VERIFIED** |
| "Lifecycle states: pending/approved/rejected/superseded/archived" | 008_memory_lifecycle.sql:2-3 | ✅ | **VERIFIED** |
| "Temporal fields: valid_from, valid_until, revision" | 009_temporal_memory.sql:1-3 | ✅ | **VERIFIED** |
| "No LLM extraction" | durable_memory.py:58-76 | ✅ | **VERIFIED** |
| "No conflict resolution" | postgres_store.py:579 | ✅ | **VERIFIED** |
| "No agent-generated memory" | chat.py:1955 | ✅ | **VERIFIED** |
| "Memory injected as flat text" | prompt_builder.py:519-532 | ✅ | **VERIFIED** |
| "Level 2 maturity" | Architecture assessment | ✅ | **VERIFIED** — actually 2.5 |
| "MCP tools exist" | mcp-server/memory.ts | ✅ | **VERIFIED** |
| "Agent doesn't use MCP tools" | chat.py:1079-1104 | ✅ | **VERIFIED** |

### Claims from TRUE_MEMORY_HARNESS_IMPLEMENTATION_ROADMAP.md

| Claim | Source | Verified? | Status |
|-------|--------|-----------|--------|
| "16 tasks across 5 phases" | Roadmap doc | ✅ | **VERIFIED** |
| "115 total story points" | Roadmap doc | ✅ | **VERIFIED** |
| "24 weeks duration" | Roadmap doc | ✅ | **VERIFIED** |
| "Critical path: P1-T1 → P2-T1 → P3-T1 → P4-T1 → P5-T4" | Roadmap doc | ✅ | **VERIFIED** |
| "Extraction F1 > 0.85 target" | Roadmap doc | N/A | **UNVERIFIED** — no baseline exists |
| "Conflict detection > 90% precision target" | Roadmap doc | N/A | **UNVERIFIED** — no baseline exists |

---

## Roadmap Problems

### Problem 1: L3 Prerequisites Hidden

The existing roadmap puts L3 capabilities (temporal reasoning, conflict resolution) inside Phase 1 (Core Extraction) and Phase 2 (Governance) without explicitly calling them out as L3 prerequisites.

### Problem 2: Missing Critical L3 Tasks

The roadmap doesn't include:
- Semantic conflict detection
- Temporal reasoning logic
- Current state view
- Point-in-time reconstruction

### Problem 3: Level 4 Scope Creep

The roadmap includes Level 5 tasks (Learned Control, Knowledge Graph, Multi-Agent Memory, Sleep-time Compute) as prerequisites for Level 4. These should be Level 5 only.

### Problem 4: Missing Observability Prerequisites

The roadmap doesn't define the event model needed for L5 learning. Without observability primitives, no future learning system can be built.

### Problem 5: No Behavior Tests

The roadmap defines acceptance criteria but no behavior tests to verify memory actually improves agent behavior.

---

## Roadmap Patch

### Existing Tasks — Changes Required

| Task | Change | Why | Priority Change |
|------|--------|-----|-----------------|
| P1-T1: LLM Extraction | Keep | Core capability | UNCHANGED (P0) |
| P1-T2: Conflict Resolution | **Split into two tasks** | Needs semantic comparison + context-aware resolution | SPLIT |
| P1-T3: Agent Memory | Keep | Core capability | UNCHANGED (P0) |
| P2-T1: Memory Governor | Keep | Core capability | UNCHANGED (P1) |
| P2-T2: Temporal Reasoning | **Promote to P0** | L3 prerequisite, blocks L4 | PROMOTED |
| P2-T3: Memory Decay | Keep | P2 capability | UNCHANGED (P2) |
| P3-T1: Context Compiler | Keep | Core capability | UNCHANGED (P1) |
| P3-T2: Working Memory | Keep | P2 capability | UNCHANGED (P2) |
| P3-T3: Memory as Tool | Keep | Core capability | UNCHANGED (P1) |
| P4-T1: Consolidation | Keep | P2 capability | UNCHANGED (P2) |
| P4-T2: Entity Resolution | Keep | P2 capability | UNCHANGED (P2) |
| P4-T3: Observability | **Split into two tasks** | Needs event model + implementation | SPLIT |
| P5-T1: Knowledge Graph | **DEMOTED to L5** | Not required for L4 | DEMOTED |
| P5-T2: Sleep-time Compute | **DEMOTED to L5** | Not required for L4 | DEMOTED |
| P5-T3: Multi-Agent Memory | **DEMOTED to L5** | Not required for L4 | DEMOTED |
| P5-T4: Learned Control | **DEMOTED to L5** | Not required for L4 | DEMOTED |

### New Tasks

| Task | Priority | Dependencies | Acceptance Criteria |
|------|----------|--------------|---------------------|
| **P0-NEW-1: Semantic Conflict Detection** | P0 | P1-T1 | Detects semantic contradictions with >85% precision |
| **P0-NEW-2: Temporal State View** | P0 | None | Can query "what is true now" and "what was true on date X" |
| **P0-NEW-3: L5 Event Model** | P0 | None | Defines memory_retrieval_event, agent_memory_influence_event, outcome_event, governor_decision_event |
| **P1-NEW-1: Memory Observability** | P1 | P0-NEW-3 | Implements event logging for all 4 event types |
| **P1-NEW-2: Behavior Test Suite** | P1 | P1-T1, P1-T2 | 10 behavior tests verifying memory improves agent actions |
| **P2-NEW-1: Point-in-Time Reconstruction** | P2 | P0-NEW-2 | Can reconstruct memory state at any historical timestamp |

---

## Revised Dependency Graph

```
L2 → L3 (Mutable + Versioned + Temporal)
├── P0-NEW-2: Temporal State View
├── P1-T1: LLM Extraction
├── P0-NEW-1: Semantic Conflict Detection
└── P1-T3: Agent Memory

L3 → L4 (Agent Memory Harness)
├── P2-T1: Memory Governor
├── P2-T2: Temporal Reasoning
├── P3-T1: Context Compiler
├── P3-T3: Memory as Tool
├── P4-T1: Consolidation
├── P4-T2: Entity Resolution
├── P1-NEW-1: Memory Observability
├── P1-NEW-2: Behavior Test Suite
└── P0-NEW-3: L5 Event Model

L4 → L5 (Adaptive / Self-Improving)
├── P5-T1: Knowledge Graph (was L4, now L5)
├── P5-T2: Sleep-time Compute (was L4, now L5)
├── P5-T3: Multi-Agent Memory (was L4, now L5)
├── P5-T4: Learned Control (was L4, now L5)
└── P2-NEW-1: Point-in-Time Reconstruction
```

### Critical Path (Revised)

```
P0-NEW-3 (Event Model) → P1-T1 (LLM Extraction) → P0-NEW-1 (Semantic Conflict) → P2-T1 (Governor) → P3-T1 (Context Compiler) → P1-NEW-1 (Observability) → P1-NEW-2 (Behavior Tests)
```

---

## Revised Level-4 Definition of Done

### L3 Complete When:
- [ ] Temporal state view works ("what is true now" query)
- [ ] LLM extraction captures preferences, facts, decisions, entities
- [ ] Semantic conflict detection works (>85% precision)
- [ ] Agent-generated memories are stored
- [ ] Supersession chains are maintained
- [ ] Project-scoped facts don't conflict across projects

### L4 Complete When:
- [ ] L3 prerequisites all pass
- [ ] Memory Governor enforces policies on all writes
- [ ] Context compiler produces typed, budgeted context
- [ ] Memory tools work for both proactive and JIT access
- [ ] Background consolidation merges related memories
- [ ] Entity extraction and linking work
- [ ] Memory trace shows why each memory was retrieved
- [ ] Audit log records all operations
- [ ] 10 behavior tests pass (memory improves agent actions)
- [ ] Event model implemented (4 event types)
- [ ] Observability dashboard shows memory metrics

---

## L5 Prerequisites

Before any L5 work begins:

1. **Event model defined** — 4 event types with correlation IDs
2. **Event logging implemented** — all events captured
3. **Behavior test suite** — baseline measurements
4. **Evaluation framework** — memory-conditioned task improvement metric
5. **Data collection** — sufficient event data for learning

Only after these exist should L5 work begin:
- Adaptive ranking
- Adaptive retention
- Adaptive extraction
- Policy learning
- Knowledge graph
- Sleep-time compute
- Multi-agent memory

---

## Final Architecture Decision

**TrueMemory is at Level 2.5** — between a Memory/RAG Assistant and a Tool-Using Agent.

**Strengths:**
- Real multi-tier memory system (L0/L1/L2)
- Hybrid retrieval (BM25 + semantic + exact)
- Lifecycle management (supersession chains)
- Project-scoped memory
- Dual-mode persistence (SQLite + Postgres)
- MCP server exists

**Critical Gaps:**
- No LLM extraction (regex only)
- No semantic conflict detection
- No agent-generated memory
- No context compiler
- No memory governance
- No observability
- No behavior tests

**The architecture has the prerequisites for L3** (schema supports it, supersession works, project scoping works). But L3 logic (temporal reasoning, semantic conflict) must be implemented before L4 work can begin.

**Implementation status:** READY — with roadmap corrections as specified above.

---

## Appendix: Evidence Sources

| File | Line(s) | Claim |
|------|---------|-------|
| `backend/services/durable_memory.py` | 15-47 | 4 regex patterns |
| `backend/services/memory_store.py` | 12-17 | PROFILE_TRIGGER_PATTERN |
| `backend/services/memory_hot_cache.py` | 41 | 512 entries, 30s TTL |
| `backend/services/memory_core.py` | 162-393 | MemoryClient facade |
| `backend/services/memory_hybrid.py` | 44-281 | Hybrid retrieval |
| `backend/services/postgres_store.py` | 545-633 | save_durable_memories |
| `backend/services/postgres_store.py` | 728-797 | update_managed_memory |
| `backend/app/routes/chat.py` | 930-1999 | _chat_event_stream |
| `backend/rag/prompt_builder.py` | 498-543 | build_general_chat_messages |
| `backend/db/init/006_durable_workspace_memory.sql` | 1-30 | workspace_id, project_id |
| `backend/db/init/008_memory_lifecycle.sql` | 1-22 | lifecycle_status, superseded |
| `backend/db/init/009_temporal_memory.sql` | 1-7 | valid_from, valid_until, revision |
| `mcp-server/memory.ts` | 1-82 | MCP tools |
| `backend/app/routes/memory_api.py` | 1-199 | REST API |
