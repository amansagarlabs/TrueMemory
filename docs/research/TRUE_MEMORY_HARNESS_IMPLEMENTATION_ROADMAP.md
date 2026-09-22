# TrueMemory Implementation Roadmap

## Engineering Task Backlog

**Author:** Aman Sagar  
**Date:** September 2026  
**Target:** Model-Agnostic Memory Harness for AI Agents  
**Current Level:** 4 (Agent Memory Harness)  
**Target Level:** 5 (Adaptive Memory)

---

## Table of Contents

1. [Roadmap Overview](#1-roadmap-overview)
2. [Phase 1: Core Extraction (Weeks 1-4)](#2-phase-1)
3. [Phase 2: Governance (Weeks 5-8)](#3-phase-2)
4. [Phase 3: Context Engineering (Weeks 9-12)](#4-phase-3)
5. [Phase 4: Consolidation (Weeks 13-16)](#5-phase-4)
6. [Phase 5: Advanced Capabilities (Weeks 17-24)](#6-phase-5)
7. [Dependency Graph](#7-dependency-graph)
8. [Test Matrix](#8-test-matrix)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Risk Register](#10-risk-register)

---

## 1. Roadmap Overview

### Philosophy

The roadmap follows three principles:
1. **Extract first, govern later** — Get extraction quality high before adding complexity
2. **Memory as infrastructure** — Treat memory as a first-class system component, not a feature
3. **Iterative maturity** — Each phase builds on the previous, with measurable checkpoints

### Phase Summary

| Phase | Focus | Duration | Status |
|-------|-------|----------|--------|
| Phase 1 | Core Extraction | Weeks 1-4 | ✅ COMPLETE |
| Phase 2 | Governance | Weeks 5-8 | ✅ COMPLETE |
| Phase 3 | Context Engineering | Weeks 9-12 | ✅ COMPLETE |
| Phase 4 | Agentic Memory Control | Weeks 13-16 | ✅ COMPLETE |
| Phase 5 | Adaptive Learning | Weeks 17-24 | PENDING |
| Phase 7 | Native Memory Tool Loop | Week 17 | ✅ COMPLETE |
| Phase 8 | Production Wiring & L4 Certification | Week 18 | ✅ COMPLETE |
| Phase 8.5 | Provider-Agnostic L4 Hardening | Week 19 | ✅ CORE COMPLETE |
| Phase 8.6 | Live Provider Validation & Evidence Gate | Week 20 | ✅ HARDENED |
| Phase 8.7 | Production Observation & L5 Signal Collection | Week 21 | ✅ COMPLETE |
| Phase 9.8 | Autonomous E2E Execution | Week 22 | ✅ COMPLETE (65/65) |
| Phase 9.9 | Live Provider Validation | Week 23 | ⚠️ BLOCKED (OpenRouter rate limit) |
| Phase 9.10 | TypeScript SDK Runtime E2E | Week 24 | ✅ COMPLETE (24/24) |
| Phase 9.9.1 | Live Provider Gate Readiness | Week 25 | ✅ COMPLETE (Infrastructure READY) |
| Phase 10.0 | Production Hardening & Observability | Week 26 | ✅ COMPLETE |

### Maturity Progression

```
Week 0:   Level 2 (Current) — Persistent Selective Memory
Week 8:   Level 3 — Memory + Temporal + Governance
Week 16:  Level 4 — Agent Memory Harness
Week 18:  Level 4 CERTIFIED — Native Tool Calling + Production Wiring
Week 19:  Level 4 HARDENED — Provider-Agnostic, Attribution Chain Extended
Week 20:  Level 4 HARDENED — Live Evidence Partial (credits needed)
Week 21:  Level 4 HARDENED — Production Observation Infrastructure Added
Week 24:  Level 5 — Adaptive Memory
```

---

## 2. Phase 1: Core Extraction (Weeks 1-4)

### Task 1.1: LLM-based Extraction Pipeline

**ID:** P1-T1  
**Priority:** P0 (Critical)  
**Effort:** 8 story points  
**Owner:** TBD  
**Dependencies:** None

**Description:**
Replace regex-only extraction with LLM-based extraction that captures durable facts, preferences, decisions, entities, and temporal references from conversation.

**Technical Details:**
- Add extraction endpoint to `MemoryCore` service
- Single LLM call per conversation turn (after response)
- Extraction prompt template stored in `backend/prompts/extraction/`
- Output: structured JSON with typed facts

**Extraction Prompt:**
```
Extract durable facts from this conversation. For each fact:
- type: preference | fact | decision | entity | temporal
- content: The extracted fact
- confidence: 0.0-1.0
- temporal: {start, end} if time-bound

Conversation:
{conversation_history}

Respond with JSON array of facts.
```

**Files to Create/Modify:**
- `backend/services/extraction/extractor.py` — New extraction service
- `backend/services/extraction/prompts.py` — Prompt templates
- `backend/services/memory_core.py` — Add extraction call to write path
- `backend/services/memory_store.py` — Store extracted facts

**Acceptance Criteria:**
- [ ] Extraction F1 score > 0.85 on test set of 100 conversations
- [ ] Latency < 500ms per extraction call
- [ ] Cost < $0.002 per conversation turn
- [ ] Extraction handles: preferences, facts, decisions, entities, temporal references
- [ ] Extraction gracefully handles LLM failures (falls back to regex)

**Test Cases:**
```python
def test_extraction_preferences():
    """'I prefer dark mode' → preference:dark_mode"""
    
def test_extraction_decisions():
    """'We decided to use PostgreSQL' → decision:database_postgresql"""
    
def test_extraction_temporal():
    """'Going on vacation next week' → temporal:vacation:2026-09-17to2026-09-23"""
    
def test_extraction_entities():
    """'I work at Acme Corp' → entity:Acme_Corp:organization"""
    
def test_extraction_llm_failure():
    """LLM timeout → falls back to regex extraction"""
```

---

### Task 1.2: Conflict Resolution

**ID:** P1-T2  
**Priority:** P0 (Critical)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P1-T1

**Description:**
When new memories are extracted, compare them against existing memories. If a contradiction exists, resolve it at write time (not retrieval time).

**Technical Details:**
- Before writing new memory, search for semantically similar existing memories
- LLM compares new vs existing and selects operation:
  - `ADD` — No equivalent exists
  - `UPDATE` — New info complements existing
  - `DELETE` — New info contradicts existing (supersedes)
  - `NOOP` — New info adds nothing meaningful
- Use existing `supersedes_memory_id` column for supersession chains

**Files to Create/Modify:**
- `backend/services/extraction/conflict_resolver.py` — New conflict resolution service
- `backend/services/memory_store.py` — Add conflict check before write
- `backend/services/postgres_store.py` — Implement supersession logic

**Acceptance Criteria:**
- [ ] Contradictory memories are detected with > 90% precision
- [ ] Supersession chains are maintained (old memory linked to new)
- [ ] Resolution happens at write time, not retrieval time
- [ ] Contradictions do not both surface in top-k retrieval results

**Test Cases:**
```python
def test_add_new_fact():
    """No existing memory → ADD"""
    
def test_update_complementary():
    """Existing: 'user prefers dark mode' + New: 'user also prefers large font' → UPDATE"""
    
def test_delete_contradiction():
    """Existing: 'user prefers dark mode' + New: 'user prefers light mode' → DELETE (supersede)"""
    
def test_noop_duplicate():
    """Existing: 'user prefers dark mode' + New: 'user prefers dark mode' → NOOP"""
    
def test_supersession_chain():
    """After DELETE, old memory has lifecycle_status='superseded'"""
```

---

### Task 1.3: Agent-Generated Memory

**ID:** P1-T3  
**Priority:** P0 (Critical)  
**Effort:** 3 story points  
**Owner:** TBD  
**Dependencies:** P1-T1

**Description:**
Capture the agent's own completed work as durable memories. Currently only user messages are processed; agent observations about tasks, decisions, and learned patterns are lost.

**Technical Details:**
- After each tool call result, extract agent observations
- Store with source_type = "agent_observation"
- Equal weight to user-extracted memories in retrieval
- Use existing `user_memories` table with new source type

**Files to Create/Modify:**
- `backend/app/routes/chat.py` — Capture agent observations after tool calls
- `backend/services/extraction/extractor.py` — Add agent observation extraction
- `backend/db/init/018_agent_memory.sql` — Add source_type column

**Acceptance Criteria:**
- [ ] Agent's tool call results are captured as memories
- [ ] Agent observations are retrievable via `memory_search`
- [ ] Agent observations have source_type = "agent_observation"
- [ ] Agent observations are weighted equally to user facts

**Test Cases:**
```python
def test_agent_observation_stored():
    """Agent completes task → observation stored"""
    
def test_agent_observation_retrievable():
    """Agent observation appears in search results"""
    
def test_agent_observation_source():
    """Agent observation has source_type='agent_observation'"""
```

---

## 3. Phase 2: Governance (Weeks 5-8)

### Task 2.1: Memory Governor

**ID:** P2-T1  
**Priority:** P1 (High)  
**Effort:** 8 story points  
**Owner:** TBD  
**Dependencies:** P1-T1, P1-T2

**Description:**
Implement a policy engine that decides what becomes memory, where it lives, what scope it has, and when it expires.

**Technical Details:**
- New service: `backend/services/governance/memory_governor.py`
- Policy configuration: `backend/config/memory_policies.yaml`
- Policies: scope, trust, conflicts, expiry, compliance
- Decouples lifecycle management from model weights

**Policy Configuration:**
```yaml
memory_policies:
  scope:
    default: workspace
    allowed: [workspace, user, agent, global]
  
  trust:
    user_input: 0.9
    agent_observation: 0.85
    system_observation: 0.95
  
  expiry:
    working_memory: session
    episodic: 90d
    semantic: permanent
  
  compliance:
    pii_detection: true
    right_to_be_forgotten: true
    data_retention_days: 365
```

**Files to Create/Modify:**
- `backend/services/governance/memory_governor.py` — Policy engine
- `backend/config/memory_policies.yaml` — Policy configuration
- `backend/services/memory_core.py` — Route writes through governor

**Acceptance Criteria:**
- [ ] All memory writes go through governance layer
- [ ] PII is detected and handled per policy
- [ ] Scope is enforced (workspace isolation)
- [ ] Expiry policies are applied
- [ ] Governance decisions are logged

---

### Task 2.2: Temporal Reasoning

**ID:** P2-T2  
**Priority:** P1 (High)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P1-T1

**Description:**
Implement temporal reasoning over memory. Currently `valid_from`/`valid_until` columns exist but no logic uses them.

**Technical Details:**
- Bi-temporal model: event time + ingestion time
- Time-aware query expansion (extract time range from query)
- Point-in-time queries: "what was true on date X?"
- Use existing `valid_from`/`valid_until` columns

**Files to Create/Modify:**
- `backend/services/temporal/reasoner.py` — Temporal reasoning service
- `backend/services/memory_hybrid.py` — Add temporal filtering to retrieval
- `backend/services/retrieval_scoring.py` — Add temporal scoring signal

**Acceptance Criteria:**
- [ ] Time-aware queries return correct results (> 80% accuracy)
- [ ] Point-in-time queries work ("what was my preference before March?")
- [ ] Temporal reasoning adds < 100ms latency
- [ ] Temporal filtering is a retrieval signal alongside semantic/BM25

**Test Cases:**
```python
def test_temporal_current():
    """'What's my current preference?' → only current memories"""
    
def test_temporal_historical():
    """'What was my preference in January?' → only January memories"""
    
def test_temporal_range():
    """'What happened last week?' → memories from last 7 days"""
    
def test_temporal_expiration():
    """Memory with valid_until in past does not surface for current queries"""
```

---

### Task 2.3: Memory Decay

**ID:** P2-T3  
**Priority:** P1 (High)  
**Effort:** 3 story points  
**Owner:** TBD  
**Dependencies:** P2-T2

**Description:**
Implement time-based relevance scoring. Recently accessed memories should rank higher; unused memories should dampen over time.

**Technical Details:**
- Access-based boost: recently accessed = higher score (1.0 → 1.5x)
- Time-based decay: unused memories dampen (1.0 → 0.3x)
- Decay formula: `score = base_score * recency_boost * access_boost`
- Decayed memories still surface when genuinely relevant

**Files to Create/Modify:**
- `backend/services/decay/scorer.py` — Decay scoring service
- `backend/services/memory_hybrid.py` — Apply decay to retrieval scores
- `backend/db/init/019_memory_decay.sql` — Add last_accessed_at column

**Acceptance Criteria:**
- [ ] Recently accessed memories boost by up to 1.5x
- [ ] Unused memories dampen toward 0.3x
- [ ] Decayed memories still surface when genuinely relevant
- [ ] Decay does not affect pinned memories

---

## 4. Phase 3: Context Engineering (Weeks 9-12)

### Task 3.1: Context Compiler

**ID:** P3-T1  
**Priority:** P1 (High)  
**Effort:** 13 story points  
**Owner:** TBD  
**Dependencies:** P1-T1, P2-T1, P2-T2

**Description:**
Replace flat text injection with typed, budgeted, prioritized context assembly.

**Technical Details:**
- New service: `backend/services/context/compiler.py`
- Typed context nodes: profile, working, semantic, episodic
- Budget enforcement: max tokens per type
- Priority selection based on query intent
- Chain-of-Note reading strategy

**Context Budget:**
```python
CONTEXT_BUDGET = {
    "profile": 500,      # User preferences, always available
    "working": 1000,     # Current task context
    "semantic": 1500,    # Abstracted facts
    "episodic": 1000,    # Recent events
    "total": 4000,       # Max memory tokens in prompt
}
```

**Files to Create/Modify:**
- `backend/services/context/compiler.py` — New context compiler
- `backend/rag/prompt_builder.py` — Use compiler for memory injection
- `backend/app/routes/chat.py` — Route memory through compiler

**Acceptance Criteria:**
- [ ] Context is typed (profile, working, semantic, episodic)
- [ ] Token budget is enforced per type
- [ ] Context utilization stays at 60-80%
- [ ] Retrieval precision improves by > 10%
- [ ] Token usage decreases by > 20%

---

### Task 3.2: Working Memory Separation

**ID:** P3-T2  
**Priority:** P2 (Medium)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P3-T1

**Description:**
Separate working memory (current task) from long-term memory (durable facts). Working memory is session-scoped and high-frequency.

**Technical Details:**
- New table: `working_memories` (session-scoped)
- Automatic promotion: working → semantic when task completes
- Automatic demotion: semantic → working when task resumes
- Working memory is always injected; long-term is retrieved on-demand

**Files to Create/Modify:**
- `backend/db/init/020_working_memory.sql` — New working memory table
- `backend/services/memory/working_memory.py` — Working memory service
- `backend/services/context/compiler.py` — Include working memory in context

**Acceptance Criteria:**
- [ ] Working memory is session-scoped
- [ ] Working memory is always in context
- [ ] Promotion/demotion happens automatically
- [ ] Working memory does not persist beyond session (unless promoted)

---

### Task 3.3: Memory as Tool Surface

**ID:** P3-T3  
**Priority:** P1 (High)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P1-T3, P3-T1

**Description:**
Expose all memory operations as agent-callable tools. Support both proactive (auto-inject) and just-in-time (agent calls) access patterns.

**Technical Details:**
- Enhance MCP server tools with richer schemas
- Add proactive injection at conversation start
- Add just-in-time retrieval for agent-initiated searches
- Token-efficient tool responses (< 500 tokens per tool call)

**Files to Create/Modify:**
- `mcp-server/memory.ts` — Enhanced tool schemas
- `backend/services/memory/agent_tools.py` — Agent tool interface
- `backend/app/routes/chat.py` — Add proactive injection

**Acceptance Criteria:**
- [ ] All 7 MCP tools work correctly
- [ ] Proactive injection at conversation start
- [ ] Just-in-time retrieval for agent calls
- [ ] Tool responses are token-efficient (< 500 tokens)

---

## 5. Phase 4: Consolidation (Weeks 13-16)

### Task 4.1: Background Consolidation

**ID:** P4-T1  
**Priority:** P2 (Medium)  
**Effort:** 8 story points  
**Owner:** TBD  
**Dependencies:** P2-T1, P3-T1

**Description:**
Periodically merge related memories into higher-level facts. Pattern: "user corrected date format on Jan 5, 12, Feb 1" → "user prefers DD/MM/YYYY".

**Technical Details:**
- Background job: runs every N conversations
- Groups memories by semantic similarity
- Merges related memories into summaries
- Deduplication, summarization, abstraction
- Uses existing `memory_consolidation_rules` table

**Files to Create/Modify:**
- `backend/services/consolidation/consolidator.py` — Consolidation service
- `backend/services/consolidation/scheduler.py` — Background job scheduler
- `backend/services/postgres_store.py` — Implement consolidation storage

**Acceptance Criteria:**
- [ ] Related memories are merged into summaries
- [ ] Deduplication removes redundant facts
- [ ] Consolidation runs in background without blocking
- [ ] Consolidated memories are retrievable

---

### Task 4.2: Entity Resolution

**ID:** P4-T2  
**Priority:** P2 (Medium)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P4-T1

**Description:**
Extract entities from all memories and link them across memories for entity-based retrieval boosting.

**Technical Details:**
- Entity extraction: people, organizations, concepts
- Entity linking: match entities across memories
- Entity-based retrieval: boost memories sharing query entities
- Store entities in `memory_entities` table

**Files to Create/Modify:**
- `backend/services/entities/extractor.py` — Entity extraction service
- `backend/services/entities/resolver.py` — Entity resolution service
- `backend/db/init/021_memory_entities.sql` — Entity tables
- `backend/services/memory_hybrid.py` — Add entity scoring signal

**Acceptance Criteria:**
- [ ] Entities are extracted from all memories
- [ ] Entities are linked across memories
- [ ] Entity-based retrieval boosts relevant memories
- [ ] Entity extraction adds < 200ms latency

---

### Task 4.3: Observability

**ID:** P4-T3  
**Priority:** P2 (Medium)  
**Effort:** 5 story points  
**Owner:** TBD  
**Dependencies:** P4-T1

**Description:**
Implement memory trace, provenance tracking, and audit log for debugging and compliance.

**Technical Details:**
- Memory trace: why each memory was retrieved (score breakdown)
- Provenance: which conversation/event produced each memory
- Audit log: all memory operations (create, update, delete, search)
- New tables: `memory_trace`, `memory_audit_log`

**Files to Create/Modify:**
- `backend/services/observability/tracer.py` — Memory trace service
- `backend/services/observability/audit.py` — Audit log service
- `backend/db/init/022_memory_observability.sql` — Observability tables
- `backend/services/memory_core.py` — Add trace/audit logging

**Acceptance Criteria:**
- [ ] Memory trace shows why each memory was retrieved
- [ ] Provenance links memories to source conversations
- [ ] Audit log records all memory operations
- [ ] Observability adds < 50ms latency

---

## 6. Phase 5: Advanced Capabilities (Weeks 17-24)

### Task 5.1: Knowledge Graph (Optional)

**ID:** P5-T1  
**Priority:** P3 (Low)  
**Effort:** 13 story points  
**Owner:** TBD  
**Dependencies:** P4-T2

**Description:**
Build a knowledge graph for entity relationships. Enables graph traversal queries and relationship-aware retrieval.

**Technical Details:**
- Graph database: Neo4j or in-memory graph
- Entity nodes + relationship edges
- Temporal edges (valid_from/valid_until)
- Graph traversal queries

---

### Task 5.2: Sleep-time Compute

**ID:** P5-T2  
**Priority:** P3 (Low)  
**Effort:** 8 story points  
**Owner:** TBD  
**Dependencies:** P4-T1, P4-T3

**Description:**
Background agents process information during idle periods, reflecting on past conversations and generating new insights.

**Technical Details:**
- Background "dreaming" agent
- Processes recent conversations
- Generates higher-level reflections
- Updates memory blocks with learned context

---

### Task 5.3: Multi-Agent Memory

**ID:** P5-T3  
**Priority:** P3 (Low)  
**Effort:** 8 story points  
**Owner:** TBD  
**Dependencies:** P3-T2, P4-T1

**Description:**
Enable multiple agents to share memory blocks with proper scoping and concurrency control.

**Technical Details:**
- Shared memory blocks (Letta-style)
- Database-level locking for concurrency
- Agent-specific memory scoping
- Cross-agent knowledge transfer

---

### Task 5.4: Learned Control

**ID:** P5-T4  
**Priority:** P3 (Low)  
**Effort:** 13 story points  
**Owner:** TBD  
**Dependencies:** All previous

**Description:**
Train a policy that learns when to retrieve, what to retrieve, and how much context to use — replacing fixed heuristics.

**Technical Details:**
- Memory operations as policy actions
- Reinforcement learning pipeline
- State: task progress, memory state, agent phase
- Actions: RETRIEVE, PLANINJECT, RE-RETRIEVE, CONSOLIDATE, FORGET, NOOP

---

## 7. Dependency Graph

```
Phase 1 (Extraction)
├── P1-T1: LLM Extraction
├── P1-T2: Conflict Resolution ← P1-T1
└── P1-T3: Agent Memory ← P1-T1

Phase 2 (Governance)
├── P2-T1: Memory Governor ← P1-T1, P1-T2
├── P2-T2: Temporal Reasoning ← P1-T1
└── P2-T3: Memory Decay ← P2-T2

Phase 3 (Context Engineering)
├── P3-T1: Context Compiler ← P1-T1, P2-T1, P2-T2
├── P3-T2: Working Memory ← P3-T1
└── P3-T3: Memory as Tool ← P1-T3, P3-T1

Phase 4 (Consolidation)
├── P4-T1: Background Consolidation ← P2-T1, P3-T1
├── P4-T2: Entity Resolution ← P4-T1
└── P4-T3: Observability ← P4-T1

Phase 5 (Advanced)
├── P5-T1: Knowledge Graph ← P4-T2
├── P5-T2: Sleep-time Compute ← P4-T1, P4-T3
├── P5-T3: Multi-Agent Memory ← P3-T2, P4-T1
└── P5-T4: Learned Control ← All previous
```

### Critical Path

```
P1-T1 → P2-T1 → P3-T1 → P4-T1 → P5-T4
```

### Parallel Tracks

```
Track A (Extraction):    P1-T1 → P1-T2 → P1-T3
Track B (Governance):    P2-T1 → P2-T2 → P2-T3
Track C (Context):       P3-T1 → P3-T2 → P3-T3
Track D (Consolidation): P4-T1 → P4-T2 → P4-T3
Track E (Advanced):      P5-T1 → P5-T2 → P5-T3 → P5-T4
```

---

## 8. Test Matrix

### Unit Tests

| Module | Test Type | Coverage Target |
|--------|-----------|-----------------|
| `extraction/extractor.py` | F1 score | > 0.85 |
| `extraction/conflict_resolver.py` | Precision | > 0.90 |
| `governance/memory_governor.py` | Policy enforcement | 100% |
| `temporal/reasoner.py` | Accuracy | > 0.80 |
| `decay/scorer.py` | Score range | 0.3-1.5 |
| `context/compiler.py` | Budget adherence | 100% |

### Integration Tests

| Scenario | Expected Result |
|----------|-----------------|
| Extract → Store → Retrieve | Fact is retrievable |
| Extract → Conflict → Supersede | Only new fact surfaces |
| Agent tool call → Extract → Store | Observation is stored |
| Temporal query → Filter → Return | Only relevant time range |
| Context compile → Budget → Inject | Token limit respected |

### End-to-End Tests

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Preference extraction | "I prefer dark mode" | preference:dark_mode stored |
| Conflict resolution | "I prefer X" then "I prefer Y" | Only Y surfaces |
| Agent memory | Tool call completes | Observation stored |
| Temporal query | "What was my preference in Jan?" | January memories only |
| Context budget | 100 memories retrieved | 4000 token max in prompt |

### Benchmark Tests

| Benchmark | Metric | Target |
|-----------|--------|--------|
| LongMemEval | Accuracy | > 70% |
| LoCoMo | Accuracy | > 80% |
| BEAM 1M | Score | > 60% |
| Custom | Token efficiency | < 10K avg |

---

## 9. Acceptance Criteria

### Phase 1 Complete When:
- [ ] LLM extraction captures preferences, facts, decisions, entities, temporal references
- [ ] Extraction F1 > 0.85
- [ ] Conflict resolution detects contradictions with > 90% precision
- [ ] Agent-generated memories are stored and retrievable
- [ ] All unit tests pass
- [ ] Integration tests pass

### Phase 2 Complete When:
- [ ] All memory writes go through governance layer
- [ ] PII detection and handling works
- [ ] Scope enforcement (workspace isolation) works
- [ ] Temporal reasoning returns correct results for time-aware queries
- [ ] Memory decay scoring works (0.3-1.5 range)
- [ ] All unit tests pass
- [ ] Integration tests pass

### Phase 3 Complete When:
- [ ] Context compiler produces typed, budgeted context
- [ ] Token budget is enforced (60-80% utilization)
- [ ] Working memory is session-scoped
- [ ] Memory tools work for both proactive and just-in-time access
- [ ] Retrieval precision improves by > 10%
- [ ] Token usage decreases by > 20%

### Phase 4 Complete When:
- [ ] Background consolidation merges related memories
- [ ] Entity extraction and linking work
- [ ] Entity-based retrieval boosts relevant memories
- [ ] Memory trace shows why each memory was retrieved
- [ ] Audit log records all operations
- [ ] All unit tests pass
- [ ] Integration tests pass

### Phase 5 Complete When (Optional):
- [ ] Knowledge graph enables graph traversal queries
- [ ] Sleep-time compute generates reflections
- [ ] Multi-agent memory sharing works
- [ ] Learned control replaces fixed heuristics
- [ ] All benchmarks meet targets

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM extraction cost too high | Medium | High | Batch extraction, use smaller models |
| Conflict resolution creates loops | Low | High | Limit supersession chain depth |
| Temporal reasoning latency too high | Medium | Medium | Cache temporal computations |
| Context compiler adds too much latency | Low | High | Pre-compute, cache common queries |
| Consolidation destroys important info | Low | Critical | Keep originals, only merge summaries |
| Entity resolution creates false links | Medium | Medium | Confidence threshold for linking |
| Governance policies too restrictive | Medium | High | Configurable policies, tuning period |
| Scope creep delays delivery | High | Medium | Strict phase boundaries, MVP focus |

---

## Appendix A: File Inventory

### New Files to Create

```
backend/services/extraction/extractor.py
backend/services/extraction/prompts.py
backend/services/extraction/conflict_resolver.py
backend/services/governance/memory_governor.py
backend/services/temporal/reasoner.py
backend/services/decay/scorer.py
backend/services/context/compiler.py
backend/services/memory/working_memory.py
backend/services/memory/agent_tools.py
backend/services/consolidation/consolidator.py
backend/services/consolidation/scheduler.py
backend/services/entities/extractor.py
backend/services/entities/resolver.py
backend/services/observability/tracer.py
backend/services/observability/audit.py
backend/config/memory_policies.yaml
backend/prompts/extraction/extraction.txt
backend/prompts/extraction/conflict.txt
backend/db/init/018_agent_memory.sql
backend/db/init/019_memory_decay.sql
backend/db/init/020_working_memory.sql
backend/db/init/021_memory_entities.sql
backend/db/init/022_memory_observability.sql
docs/research/TRUE_MEMORY_HARNESS_ADVANCED_RESEARCH.md
docs/research/TRUE_MEMORY_HARNESS_IMPLEMENTATION_ROADMAP.md
```

### Existing Files to Modify

```
backend/services/memory_core.py — Add extraction, governance, compiler calls
backend/services/memory_store.py — Add conflict check, agent memory storage
backend/services/memory_hybrid.py — Add temporal, decay, entity scoring
backend/services/postgres_store.py — Implement supersession, consolidation
backend/app/routes/chat.py — Capture agent observations, use compiler
backend/rag/prompt_builder.py — Use context compiler for memory injection
mcp-server/memory.ts — Enhanced tool schemas
backend/services/retrieval_scoring.py — Add temporal, entity signals
```

---

## Appendix B: Effort Summary

| Phase | Tasks | Total Story Points | Duration |
|-------|-------|-------------------|----------|
| Phase 1 | 3 | 16 | Weeks 1-4 |
| Phase 2 | 3 | 16 | Weeks 5-8 |
| Phase 3 | 3 | 23 | Weeks 9-12 |
| Phase 4 | 3 | 18 | Weeks 13-16 |
| Phase 5 | 4 | 42 | Weeks 17-24 |
| **Total** | **16** | **115** | **24 weeks** |

---

*This roadmap is a living document. Updates will be made as implementation progresses and new findings emerge.*
## Phase 10.2 disposition

The competitive audit supersedes feature-copying assumptions in this roadmap. Existing governed capture, temporal/versioned retrieval, telemetry, REST/MCP and SDK surfaces are treated as implemented evidence. The next high-confidence work is the generic agent integration contract, portable export/import, a deterministic internal benchmark, and a reusable source-aware envelope. Automatic recall remains an opt-in research/design item; L5 adaptive learning remains deferred.
