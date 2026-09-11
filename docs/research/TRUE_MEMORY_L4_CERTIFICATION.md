# TrueMemory L4 Certification

**Date:** 2026-09-10
**Status:** CONDITIONAL PASS

---

## Current Architecture

### Agent Loop Trace

```text
USER
 ↓
API (chat.py:_chat_event_stream)
 ↓
MEMORY PRELOAD (chat.py:1079-1140)
 ↓
MEMORY DECISION (chat.py:1166-1167)
  → orchestrator.analyze_request()
  → memory_decision_engine.classify_memory_need()
  → keyword/substring matching
 ↓
MEMORY QUERY (chat.py:1169-1174)
  → orchestrator.execute_memory_plan()
  → agent_memory_tools.search_memory()
 ↓
CONTEXT INJECTION (chat.py:1176-1184)
  → profile_memories.append({"key": "agentic_memory", ...})
 ↓
LLM (chat.py:1865-1888)
  → build_general_chat_messages()
  → flat text injection
 ↓
RESPONSE
 ↓
POST-RESPONSE EXTRACTION (chat.py:1961-1973)
  → memory_client.extract_and_save_workspace_memory()
```

### Decision Owner Analysis

```text
MEMORY DECISION OWNER: APPLICATION/ORCHESTRATOR

The memory decision is made by the application layer (chat.py),
not by the model/agent. The orchestrator classifies the request
using keyword/substring matching, then retrieves and injects
memory into the context before the LLM sees it.

The LLM does NOT have memory tools in its tool set.
The LLM does NOT decide when to call memory.
The LLM does NOT control memory retrieval parameters.
```

### Memory Tool Analysis

```text
MEMORY TOOLS ACTUALLY MODEL-INVOKED: NO

Memory tools (memory_tool_registry.py) define 6 tools:
- memory_search
- memory_current_state
- memory_timeline
- memory_store
- memory_forget
- memory_related

These are NOT registered in the LLM's tool set.
The agent runtime does NOT expose memory tools to the model.
Memory is injected as flat text in the prompt, not as tool results.
```

---

## Memory Decision Engine Classification

### Decision Method

```text
CLASSIFICATION METHOD: KEYWORD/SUBSTRING MATCHING

The memory_decision_engine.py uses:
- _EXPLICIT_MEMORY_KEYWORDS: set of exact phrases
- _PREFERENCE_SIGNALS: set of exact phrases
- _DECISION_SIGNALS: set of exact phrases
- _HISTORICAL_SIGNALS: set of exact phrases
- _PROJECT_SIGNALS: set of exact phrases
- _AGENT_HISTORY_SIGNALS: set of exact phrases
- _NO_MEMORY_SIGNALS: set of exact phrases

Classification is done by checking if any phrase in each set
appears as a substring in the lowercased question.

This is NOT:
- Embedding similarity
- Classifier
- LLM-based
- Agent tool call
- Hybrid

This is keyword/substring matching with predefined signal sets.
```

### Seven Memory Need Types

```text
1. EXPLICIT_MEMORY_COMMAND (0.95 confidence)
   "remember this", "forget this", "what do you remember"

2. PREFERENCE_CHECK (0.85 confidence)
   "i prefer", "i like", "i always", "i never"

3. DECISION_CHECK (0.80 confidence)
   "we decided", "we agreed", "going with"

4. HISTORICAL_CHECK (0.80 confidence)
   "before", "previously", "used to", "ago"

5. PROJECT_CONTEXT (0.75 confidence)
   "this project", "the project", "project uses"

6. AGENT_HISTORY (0.65 confidence)
   "what did we implement", "what did we build"

7. NOT_NEEDED (0.30-0.70 confidence)
   "what is", "how do", "explain", default
```

---

## JIT Retrieval Analysis

### Current Implementation

```text
JIT RETRIEVAL TRIGGER: APPLICATION-CONTROLLED

The orchestrator decides whether to retrieve memory based on
the classification result. The decision is made before the LLM
sees the question.

Flow:
1. User question received
2. Orchestrator classifies question
3. If classification.need != NOT_NEEDED:
   a. Execute memory plan
   b. Retrieve memories
   c. Format for context
4. Inject into prompt
5. LLM sees memory as flat text
```

### Agent Control

```text
AGENT CONTROL: NONE

The agent (LLM) has no control over:
- Whether memory is retrieved
- What memory is retrieved
- How memory is formatted
- When memory is retrieved

The application makes all memory decisions.
```

---

## Memory Abstention

### Test Results

```text
GENERIC QUESTIONS (NO MEMORY NEEDED):
✓ "What is recursion?" → NOT_NEEDED
✓ "What is an HTTP status code?" → NOT_NEEDED
✓ "How do I sort an array?" → NOT_NEEDED
✓ "Explain binary search" → NOT_NEEDED

FACTUAL QUESTIONS (NO MEMORY NEEDED):
✓ "What is 2 + 2?" → NOT_NEEDED
✓ "Calculate 17 × 28" → NOT_NEEDED
✓ "What is the capital of France?" → NOT_NEEDED

LOW CONFIDENCE:
✓ Confidence < 0.60 → NOT triggered
```

### Abstention Mechanism

```text
The memory decision engine uses a threshold (default 0.60) to
determine whether memory retrieval should be triggered. Questions
below this threshold are not memory-retrieved.

This is application-controlled abstention, not agent-controlled.
```

---

## Memory → Planning

### Evidence

```text
MEMORY RETRIEVED: YES (when decision.need != NOT_NEEDED)
MEMORY INCLUDED: YES (injected into prompt)
MEMORY REFERENCED: UNKNOWN (LLM may or may not reference it)
MEMORY INFLUENCED DECISION: UNKNOWN (no attribution mechanism)
MEMORY INFLUENCED ACTION: UNKNOWN (no attribution mechanism)
MEMORY IMPROVED OUTCOME: UNKNOWN (no attribution mechanism)
```

### Limitation

```text
There is no mechanism to determine whether the LLM actually
used the injected memory in its reasoning. The memory is
present in the context, but we cannot attribute specific
decisions or actions to it.
```

---

## Memory → Tool Selection

### Evidence

```text
MEMORY RETRIEVED: YES
MEMORY PRESENTED: YES (in context)
AGENT DECISION REFERENCES MEMORY: UNKNOWN
ACTION MATCHES MEMORY: UNKNOWN

No attribution mechanism exists to determine if tool selection
was influenced by memory.
```

---

## Memory → Action

### Evidence

```text
MEMORY RETRIEVED: YES
MEMORY PRESENTED: YES
AGENT DECISION: UNKNOWN (no structured output)
ACTION: UNKNOWN (no structured output)
OUTCOME: UNKNOWN (no structured output)

No structured output mechanism to track memory → action flow.
```

---

## Counterfactual Tests

### A/B Testing Framework

```text
WITHOUT MEMORY:
- Memory decision: NOT_NEEDED
- Memory retrieved: 0
- Memory in context: None

WITH MEMORY (PREFERENCE):
- Memory decision: PREFERENCE_CHECK
- Memory retrieved: 1+
- Memory in context: "User prefers TypeScript"

OBSERVED DIFFERENCE:
- Application correctly retrieves preference memory
- Memory is injected into context
- LLM may use it (but not verified)
```

### Limitation

```text
Cannot verify behavioral difference without:
1. Structured LLM output
2. Attribution mechanism
3. Outcome tracking
```

---

## Temporal Tests

### Current vs Historical

```text
CURRENT STATE PREFERRED:
✓ "What framework does this project use?" → current memories
✓ Historical questions → historical memories

TEMPORAL REASONING:
✓ Valid_from/valid_until fields present
✓ Superseded memories marked correctly
✓ Timeline query available
```

---

## Conflict Tests

### Stale/Conflicting Memory

```text
STALE MEMORY HANDLING:
✓ Superseded memories marked as "superseded"
✓ Current memories prioritized
✓ Conflicting memories resolved by state

LIMITATION:
- Resolution is by state field, not by content analysis
- No semantic conflict detection at retrieval time
```

---

## Scope Tests

### Project-Scoped Memory

```text
PROJECT ISOLATION:
✓ Project A memories not visible to Project B
✓ Project B memories not visible to Project A
✓ Wrong scope returns empty results

USER ISOLATION:
✓ User A memories not visible to User B
✓ Workspace scoping works correctly
```

---

## Failure Tests

### Memory Failure Handling

```text
SEARCH FAILURE:
✓ Agent continues without memory
✓ Error logged but not propagated
✓ Empty result returned

STORE FAILURE:
✓ Agent continues
✓ Memory not stored

EMPTY RESULT:
✓ Handled gracefully
✓ No crash
```

---

## Memory Influence Telemetry

### Events Tracked

```text
✓ MemoryInfluenceEvent:
  - id
  - run_id
  - memory_id
  - stage (planning, reasoning, tool_selection, action, verification, response)
  - evidence (explicit_reference, tool_choice, parameter_choice, code_change, decision_change, unknown)
  - confidence
  - timestamp

✓ OutcomeEvent:
  - id
  - run_id
  - success
  - outcome_type (success, failure, partial_success, user_correction, user_rejection, user_acceptance)
  - details
  - influence_event_id
  - timestamp
```

### Telemetry Gaps

```text
MISSING:
- memory_retrieved event (when memory is fetched)
- memory_selected event (when memory is chosen for context)
- memory_included event (when memory is in prompt)
- memory_referenced event (when LLM references memory)
- attribution mechanism (which memory influenced which decision)
```

---

## Outcome Telemetry

### Current Signals

```text
✓ Tool success (HTTP status)
✓ Task completion (message saved)
✓ User feedback (follow-ups)

MISSING:
✓ Test pass/fail
✓ Build pass/fail
✓ User correction signal
✓ User rejection signal
✓ User acceptance signal
✓ Explicit feedback
✓ Follow-up repair
```

---

## Causal Evidence Limitations

### What We Can Claim

```text
✓ Memory is stored correctly
✓ Memory evolves correctly (temporal, conflict resolution)
✓ Memory is retrieved when application decides
✓ Memory is injected into context
✓ Memory abstention works for generic questions
✓ Memory failure degrades gracefully
✓ Project/user isolation works
```

### What We Cannot Claim

```text
✗ Agent decides when memory is needed
✗ Agent controls memory retrieval
✗ Memory causally influences agent decisions
✗ Memory causally influences agent actions
✗ Memory improves outcomes
✗ Agent references memory in reasoning
```

---

## L4 Completion Decision

### Gate Assessment

| Item | Status | Evidence |
|------|--------|----------|
| Memory is persistent | ✅ PASS | PostgreSQL + SQLite |
| Memory evolves correctly | ✅ PASS | L3 verification (7/7) |
| Current/historical state works | ✅ PASS | L3 verification |
| Temporal reasoning works | ✅ PASS | L3 verification |
| Conflicts resolve correctly | ✅ PASS | L3 verification |
| LLM extraction works | ✅ PASS | Phase 2 (12/17) |
| Governor controls writes | ✅ PASS | Phase 2 |
| Agent can access memory | ⚠️ PARTIAL | Application controls, not agent |
| Agent can retrieve memory when needed | ⚠️ PARTIAL | Application decides, not agent |
| Agent can abstain when memory is unnecessary | ⚠️ PARTIAL | Application abstains, not agent |
| Agent can access current state | ⚠️ PARTIAL | Application retrieves, not agent |
| Agent can access historical state | ⚠️ PARTIAL | Application retrieves, not agent |
| Agent/tool experience becomes memory | ✅ PASS | Phase 3 |
| Memory can influence planning | ⚠️ UNKNOWN | No attribution mechanism |
| Memory can influence tool selection | ⚠️ UNKNOWN | No attribution mechanism |
| Memory can influence action | ⚠️ UNKNOWN | No attribution mechanism |
| Memory influence is observable | ⚠️ PARTIAL | Events defined but not populated |
| Outcomes are observable | ⚠️ PARTIAL | Events defined but not populated |
| Project/user isolation works | ✅ PASS | Tests pass |
| Forgetting works | ✅ PASS | Tests pass |
| Memory failures degrade safely | ✅ PASS | Tests pass |
| Counterfactual behavior tests pass | ⚠️ PARTIAL | Application-level only |

### Decision

```text
L4 STATUS: CONDITIONAL PASS

TrueMemory qualifies as an L4 Agent Memory Harness at the
APPLICATION level, but NOT at the AGENT level.

The application orchestrates memory correctly.
The agent does NOT control memory retrieval.

Key gap: The LLM does not have memory tools in its tool set.
Memory is injected as flat text, not as tool results.
The agent cannot decide when to retrieve memory.
```

---

## Recommendations

### For L4 Full Certification

1. **Register memory tools in LLM tool set** — Allow the model to call memory_search, memory_current_state, etc.
2. **Add attribution mechanism** — Track which memory influenced which decision
3. **Populate influence events** — Actually record when memory is used
4. **Add outcome tracking** — Track task success/failure with memory correlation

### For L5 Readiness

1. **Structured memory output** — LLM outputs structured memory decisions
2. **A/B testing framework** — Compare behavior with/without memory
3. **Causal inference** — Determine if memory actually improves outcomes
4. **Feedback loop** — User corrections feed back into memory quality
