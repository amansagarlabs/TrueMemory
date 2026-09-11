# TrueMemory Stage 2 Baseline

## Test Command
```bash
cd backend && python -m pytest --tb=short -q
```

## Test Results
- **Tests passed:** 281
- **Tests failed:** 1
- **Total:** 282
- **Duration:** 7.89s

## Known Failures
- `test_live_mcp_release_matrix` — PostgreSQL connection failure (database "app-agent" does not exist). This is an environment configuration issue, not a code defect. All memory-specific tests pass.

## Build Status
- **Python:** 3.13.3
- **pytest:** 9.1.1
- **Platform:** win32
- **Backend:** FastAPI

---

## Current Memory Schema

### user_memories (Postgres)
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
workspace_id UUID
project_id UUID
conversation_id UUID
source_message_id UUID
memory_type TEXT (conversation_summary|preference|task_state|fact|decision)
memory_key TEXT NOT NULL
content TEXT NOT NULL
importance_score NUMERIC
confidence_score NUMERIC DEFAULT 0.750
lifecycle_status TEXT DEFAULT 'approved' (pending|approved|rejected|superseded|archived)
is_pinned BOOLEAN DEFAULT FALSE
supersedes_memory_id UUID
reviewed_at TIMESTAMPTZ
superseded_at TIMESTAMPTZ
valid_from TIMESTAMPTZ
valid_until TIMESTAMPTZ
revision INTEGER DEFAULT 1
provenance JSONB DEFAULT '{}'
source TEXT DEFAULT 'user-declared'
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### profile_memories (SQLite)
```sql
id UUID PRIMARY KEY
workspace_id TEXT NOT NULL
profile_type TEXT CHECK(profile_type IN ('user_name','location','timezone','occupation','interests','communication_style'))
content TEXT NOT NULL
confidence REAL DEFAULT 1.0
source TEXT DEFAULT 'explicit'
last_mentioned_at TIMESTAMP
times_mentioned INTEGER DEFAULT 1
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

### memory_hot_cache (Postgres)
```sql
id UUID PRIMARY KEY
workspace_id UUID NOT NULL
query_hash TEXT NOT NULL
results_json TEXT NOT NULL
hit_count INTEGER DEFAULT 1
created_at TIMESTAMPTZ DEFAULT NOW()
expires_at TIMESTAMPTZ NOT NULL
```

---

## Current Agent Execution Path

```
POST /api/chat/stream (chat.py:761)
    ↓
_chat_event_stream() (chat.py:930)
    ↓
MemoryClient.recent_messages() → conversation history
MemoryClient.list() → profile memories
MemoryClient.workspace_search() → durable memories
    ↓
decide_route() → intent classification
build_execution_plan() → plan creation
    ↓
Knowledge retrieval (hybrid search)
Web search (async)
    ↓
build_general_chat_messages() → prompt assembly
    ↓
stream_chat_completion() → LLM inference
    ↓
extract_and_save_workspace_memory() → memory write
```

---

## Current Retrieval Path

```
MemoryClient.search(query)
    ↓
L0 Hot Cache (512 entries, 30s TTL)
    ↓ miss
L1 SQLite LIKE search
    ↓ miss
L2 Hybrid Search:
    - BM25 keyword matching
    - Semantic similarity (all-MiniLM-L6-v2)
    - Exact-key matching
    - Reciprocal Rank Fusion (RRF)
    - Temporal filtering (valid_from/valid_until)
    - Deduplication by logical key + revision
```

---

## Current Memory Write Path

```
User message arrives
    ↓
extract_durable_memories(text) (durable_memory.py:58)
    - 4 regex patterns: decision, preference, task_state, fact
    - Returns DurableMemoryCandidate objects
    ↓
save_durable_memories() (postgres_store.py:545)
    - SELECT existing with same memory_type + memory_key
    - If content matches → UPDATE metadata only
    - If content differs:
        - Mark old as superseded
        - Insert new as approved/pending
```

---

## Current MCP Tools

| Tool | Status |
|------|--------|
| `memory_search` | Exists |
| `memory_retrieve` | Exists |
| `memory_store` | Exists |
| `memory_update` | Exists |
| `memory_forget` | Exists |
| `memory_profile` | Exists |
| `memory_current_state` | Exists |
| `memory_timeline` | Exists |
| `memory_related` | Exists |

---

## Current Context Injection

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

**Flat text injection. No token budget. No prioritization. No typed context.**

---

## Memory Tests Baseline

| Test | Status |
|------|--------|
| `test_memory_client_uses_core_for_crud` | PASS |
| `test_scope_rejects_missing_user` | PASS |
| `test_scope_rejects_cross_user_assertion` | PASS |
| `test_l0_hit_and_write_invalidation` | PASS |
| `test_l0_isolates_users_and_scopes` | PASS |
| `test_l0_concurrent_reads_return_consistent_memory` | PASS |
| `test_temporal_revision_survives_l0_invalidation` | PASS |
| `test_l0_ttl_and_bounded_size` | PASS |
| `test_concurrent_writes_and_deletes_invalidate_l0` | PASS |
| `test_l2_fuses_paths_and_deduplicates_current_revision` | PASS |
| `test_l2_historical_query_can_retrieve_superseded_fact` | PASS |
| `test_l2_returns_lexical_results_when_embeddings_fail` | PASS |
| `test_memory_client_escalates_l1_miss_to_l2` | PASS |
| `test_l2_enforces_bound_workspace_before_retrieval` | PASS |
| `test_l2_returns_empty_on_workspace_store_failure` | PASS |
| `test_hierarchy_does_not_return_expired_l1_memory` | PASS |
| `test_l2_scopes_user_workspace_and_agent_namespaces` | PASS |
| `test_l2_concurrent_reads_preserve_scope_isolation` | PASS |
| `test_questions_are_not_saved_as_durable_memory` | PASS |
| `test_declared_decision_is_extracted` | PASS |
| `test_preference_and_task_statements_are_classified` | PASS |
| `test_ranking_prioritizes_requested_memory_type` | PASS |
| `test_memory_api_isolation_and_crud` | PASS |
| `test_memory_api_rejects_bound_workspace_mismatch` | PASS |
| `test_memory_api_returns_retryable_429_when_limit_is_exceeded` | PASS |
| `test_memory_api_reports_l2_tier_after_structured_miss` | PASS |
| `test_relative_memory_path_is_independent_of_working_directory` | PASS |
| `test_only_explicit_user_declarations_become_profile_memory` | PASS |
| `test_explicit_company_declaration_uses_company_key` | PASS |
| `test_role_declaration_without_is_uses_role_key` | PASS |
| `test_account_profile_fields_sync_into_general_memory` | PASS |
| `test_equal_username_and_full_name_are_deduplicated` | PASS |

**32/32 memory-specific tests pass.**

---

## Current Capability Summary

| Capability | Status | Evidence |
|------------|--------|----------|
| Multi-tier retrieval (L0/L1/L2) | **YES** | memory_hot_cache.py, memory_store.py, memory_hybrid.py |
| Hybrid BM25+Semantic search | **YES** | retrieval_scoring.py, memory_hybrid.py |
| Profile memory extraction | **YES** | PROFILE_TRIGGER_PATTERN, memory_store.py |
| Durable memory extraction | **YES** | 4 regex patterns, durable_memory.py |
| Lifecycle states | **YES** | 008_memory_lifecycle.sql |
| Temporal fields | **YES** | 009_temporal_memory.sql |
| Supersession chains | **YES** | postgres_store.py:596-606 |
| Project scoping | **YES** | project_id column, unique index |
| MCP tools | **YES** | mcp-server/memory.ts |
| Hot cache (TTL) | **YES** | memory_hot_cache.py |
| Semantic conflict detection | **NO** | Exact string match only |
| Temporal reasoning | **NO** | Fields exist, logic absent |
| LLM extraction | **NO** | Regex only |
| Agent-generated memory | **NO** | Only user messages processed |
| Context compiler | **NO** | Flat text injection |
| Memory governance | **NO** | No policy engine |
| Observability | **NO** | No event logging |
| Behavior tests | **NO** | No test suite |

---

## Files Documented

| File | Lines | Purpose |
|------|-------|---------|
| `backend/services/memory_core.py` | 393 | MemoryClient facade |
| `backend/services/memory_store.py` | 614 | SQLite store, profile extraction |
| `backend/services/memory_hybrid.py` | 281 | L2 hybrid retrieval |
| `backend/services/memory_hot_cache.py` | ~200 | L0 TTL cache |
| `backend/services/durable_memory.py` | 111 | Regex extraction |
| `backend/services/postgres_store.py` | 3164 | Postgres store, supersession |
| `backend/rag/prompt_builder.py` | 569 | Prompt assembly |
| `backend/app/routes/chat.py` | 2463 | Main chat endpoint |
| `backend/app/routes/memory_api.py` | 199 | REST memory API |
| `mcp-server/memory.ts` | ~82 | MCP tools |
| `backend/db/init/008_memory_lifecycle.sql` | 22 | Lifecycle schema |
| `backend/db/init/009_temporal_memory.sql` | 7 | Temporal schema |
