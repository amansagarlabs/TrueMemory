# TRUEMEMORY PHASE 8: PRODUCTION WIRING

**Date:** 2026-09-10
**Status:** IN PROGRESS

---

## Baseline: Current Production Chat Flow

### Request Flow

```text
POST /api/chat/stream
  ↓
chat_stream() [chat.py:~2800]
  ↓
_chat_event_stream() [chat.py:944]
  ↓
┌─────────────────────────────────────────────┐
│ 1. INPUT VALIDATION [944-978]               │
│    - inspect_user_input()                   │
│    - _selected_memory_ids()                 │
│    - resolve_user_id()                      │
│    - upsert_workspace()                     │
│    - get_project_for_user()                 │
│    └─────────────────────────────────────────│
│ 2. MEMORY PRELOAD [1079-1140]               │
│    - memory_client.recent_messages()        │
│    - memory_client.list()                   │
│    - memory_client.workspace_search()       │
│    └─────────────────────────────────────────│
│ 3. AGENTIC MEMORY [1152-1184]               │
│    - orchestrator.analyze_request()         │
│    - orchestrator.execute_memory_plan()     │
│    - orchestrator.get_memory_context()      │
│    - profile_memories.append()              │
│    └─────────────────────────────────────────│
│ 4. ROUTING [1186-1270]                      │
│    - decide_route()                         │
│    - build_execution_plan()                 │
│    - rank_capabilities()                    │
│    └─────────────────────────────────────────│
│ 5. CONTEXT RETRIEVAL [1356-1866]            │
│    - retrieve_chunks() (document)           │
│    - HybridKnowledgeRetriever (workspace)   │
│    - search_web_multi() (web)               │
│    - ParallelContextRetriever               │
│    └─────────────────────────────────────────│
│ 6. MESSAGE BUILDING [1895-1937]             │
│    - build_general_chat_messages()          │
│    - apply_skills_to_messages()             │
│    - attach_image_content()                 │
│    └─────────────────────────────────────────│
│ 7. LLM CALL [2066-2081] ← CRITICAL POINT    │
│    - stream_chat_completion()               │
│    - NO TOOLS PASSED                        │
│    - Single LLM call                        │
│    └─────────────────────────────────────────│
│ 8. RESPONSE [2082-2106]                     │
│    - Streaming tokens via SSE               │
│    - update_streaming_message()             │
│    └─────────────────────────────────────────│
│ 9. POST-RESPONSE [2241+]                    │
│    - sanitize_model_output()                │
│    - validate_output()                      │
│    - finalize_source_usage()                │
│    - update_streaming_message()             │
└─────────────────────────────────────────────┘
```

### Current LLM Call

```text
File: backend/app/routes/chat.py
Function: _chat_event_stream()
Lines: 2066-2081

Current call:
  stream_chat_completion(
    api_key=settings.openrouter_api_key,
    model=response_model,
    messages=messages,
    max_tokens=settings.openrouter_max_tokens,
  )

No tools are passed.
Single LLM call only.
No tool loop.
```

### Current Memory Handling

```text
File: backend/app/routes/chat.py
Function: _chat_event_stream()
Lines: 1152-1184

Application-level orchestration:
  1. orchestrator.analyze_request(question, agentic_context)
     → keyword/substring matching
     → MemoryNeed classification
  2. orchestrator.execute_memory_plan(memory_decision, agentic_context, agentic_state)
     → agent_memory_tools.search_memory()
  3. orchestrator.get_memory_context(memory_decision, query_result)
     → flat text formatting
  4. profile_memories.append({"key": "agentic_memory", "content": memory_context_str})
     → injected into prompt

The LLM does NOT decide when to retrieve memory.
The LLM does NOT control memory parameters.
Memory is flat text in the prompt.
```

### Current Streaming Mechanism

```text
File: backend/services/openrouter.py
Function: stream_chat_completion()

Payload:
  {
    "model": model,
    "messages": messages,
    "stream": True,
    "stream_options": {"include_usage": True},
    "max_tokens": max_tokens,
  }

No "tools" parameter.
No "tool_choice" parameter.
Only text content is streamed.
```

---

## Target Architecture

### With Native Tool Calling

```text
POST /api/chat/stream
  ↓
chat_stream()
  ↓
_chat_event_stream()
  ↓
┌─────────────────────────────────────────────┐
│ 1. INPUT VALIDATION (unchanged)             │
│ 2. MEMORY PRELOAD (reduce/simplify)         │
│ 3. AGENTIC MEMORY (keep as proactive)       │
│ 4. ROUTING (unchanged)                      │
│ 5. CONTEXT RETRIEVAL (unchanged)            │
│ 6. MESSAGE BUILDING (unchanged)             │
│ 7. TOOL CALLING LOOP [NEW]                  │
│    - stream_chat_completion_with_tools()    │
│    - Memory tools in tool set               │
│    - Model decides when to call memory      │
│    - Tool execution via NativeExecutor      │
│    - Tool results returned to model         │
│    - Multiple rounds if needed              │
│    └─────────────────────────────────────────│
│ 8. RESPONSE (enhanced with attribution)     │
│ 9. POST-RESPONSE (unchanged)               │
└─────────────────────────────────────────────┘
```

---

## Smallest Insertion Point

### Strategy

```text
1. Replace the single LLM call (lines 2066-2081) with the tool calling loop
2. Keep all existing orchestration as proactive context
3. Add memory tools to the LLM's tool set
4. Allow model to call memory tools JIT
5. Handle streaming tool calls
6. Track attribution events
```

### Insertion Point

```text
File: backend/app/routes/chat.py
Location: Lines 2066-2081 (the LLM call section)

Current:
  stream = stream_chat_completion(
    api_key=settings.openrouter_api_key,
    model=response_model,
    messages=messages,
    max_tokens=settings.openrouter_max_tokens,
  )
  async for token in stream:
    ...

Replace with:
  tool_loop_result = await run_tool_calling_loop(
    settings=settings,
    messages=messages,
    context=memory_context,
    tools=memory_tools,
    max_tool_rounds=5,
    max_tokens=settings.openrouter_max_tokens,
    on_token=token_callback,
  )
  full_answer.append(tool_loop_result.content)
```

---

## Changes Required

### 1. Add Tool Definitions to OpenRouter Request

```text
In _chat_event_stream(), before the LLM call:

  from services.memory_tool_registry import get_memory_tool_definitions

  memory_tools = get_memory_tool_definitions()

This adds 6 memory tools to the LLM's tool set.
```

### 2. Implement Streaming Tool Call Handler

```text
The current stream_chat_completion() does not handle tool calls.

Need to add:
  stream_chat_completion_with_tools()

This function:
  - Streams text content normally
  - Detects tool call deltas
  - Assembles tool calls from streaming chunks
  - Returns tool calls when stream ends
```

### 3. Implement Tool Calling Loop

```text
The current flow makes a single LLM call.

Need to add:
  run_tool_calling_loop()

This function:
  1. Calls LLM with tools
  2. If model returns tool calls:
     a. Execute tools via NativeMemoryToolExecutor
     b. Add tool results to messages
     c. Call LLM again
  3. Repeat until model returns final answer
  4. Track attribution events
```

### 4. Prevent Double Memory Retrieval

```text
After native tool calling is active:
  - Reduce application-level memory retrieval
  - Keep proactive context for critical state
  - Let model control JIT memory retrieval

Strategy:
  - Keep memory_client.list() for high-priority preferences
  - Keep workspace_search() for active project state
  - Remove/simplify orchestrator.analyze_request()
  - Let model call memory_search() for JIT needs
```

### 5. Add Attribution Tracking

```text
For each tool call:
  - Record memory_id
  - Record tool_call_id
  - Record arguments
  - Record result
  - Record timestamp
  - Record run_id

Store in:
  - NativeMemoryToolExecutor.attribution_events
  - Emit via SSE events
  - Persist to database (optional)
```

---

## Security Considerations

### Scope Enforcement

```text
MemoryContext is built server-side from:
  - user_id (from auth)
  - workspace_id (from request)
  - project_id (from request)

Never trust model-supplied ownership identifiers.
NativeMemoryToolExecutor uses server-side context.
```

### Tool Validation

```text
All tool calls go through:
  1. get_memory_tool_by_name() - validates tool exists
  2. _execute_tool() - validates arguments
  3. AgentMemoryTools methods - validate permissions
```

---

## Test Plan

### Unit Tests

```text
1. Tool registration
2. Tool execution
3. Multiple tool calls
4. Streaming tool calls
5. Attribution tracking
6. Memory abstention
```

### Integration Tests

```text
1. Real model tool calling
2. Memory → planning
3. Memory → tool selection
4. Memory → action
5. Current state
6. Historical state
7. Project isolation
8. User isolation
```

### Regression Tests

```text
1. Streaming still works
2. Existing memory behavior preserved
3. L3 tests pass
4. L4 tests pass
```

---

## Implementation Order

```text
1. [ ] Create Phase 8 production wiring document (this)
2. [ ] Add tool definitions to chat.py imports
3. [ ] Modify _chat_event_stream() to use tool calling loop
4. [ ] Handle streaming tool calls
5. [ ] Prevent double memory retrieval
6. [ ] Add attribution tracking
7. [ ] Create integration tests
8. [ ] Run regression tests
9. [ ] Create behavior results document
10. [ ] Create L4 production certification
11. [ ] Update roadmap
```
