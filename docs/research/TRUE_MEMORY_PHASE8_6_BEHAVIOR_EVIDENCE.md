# TRUE MEMORY PHASE 8.6 — BEHAVIOR EVIDENCE

## Status: EVIDENCE PARTIAL — Live Testing Blocked by Credits

**Date:** 2026-09-10

---

## Evidence Collection Framework

### Required Evidence Per Scenario

For each behavioral scenario, the following must be recorded:

```
memory available?
memory retrieved?
memory selected?
memory referenced?
decision changed?
action changed?
outcome changed?
```

### Evidence Classification

| Signal | Definition | How to Measure |
|--------|-----------|----------------|
| retrieved | Memory was fetched from store | Tool call to memory_search/memory_current_state |
| selected | Model chose to use retrieved memory | Model references memory content in response |
| returned | Memory result was returned to model | Tool result in message history |
| referenced | Model explicitly mentions memory | Response contains memory content |
| decision_influenced | Model decision changed due to memory | Compare with/without memory responses |
| action_influenced | Model action changed due to memory | Different tool calls or parameters |
| outcome_improved | Task outcome improved with memory | User satisfaction or correctness |

---

## Scenario Results

### Scenario A: Retrieval

**Setup**: Store "preferred editor is Cursor", then ask "What editor do I prefer?"

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | UNKNOWN | Requires live test |
| memory retrieved | UNKNOWN | Requires live test |
| memory selected | UNKNOWN | Requires live test |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | UNKNOWN | Requires live test |
| action changed | UNKNOWN | Requires live test |
| outcome changed | UNKNOWN | Requires live test |

**Test**: `test_scenario_a_retrieval` — SKIPPED (no credits)

### Scenario B: Abstention

**Setup**: Ask "What is a binary search tree?" (generic, no memory needed)

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | YES | Context provided |
| memory retrieved | UNKNOWN | Requires live test |
| memory selected | UNKNOWN | Requires live test |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | N/A | Generic question |
| action changed | N/A | Generic question |
| outcome changed | N/A | Generic question |

**Test**: `test_scenario_b_abstention` — SKIPPED (no credits)

### Scenario C: Current State

**Setup**: Store React, update to Next.js, query current preference

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | UNKNOWN | Requires live test |
| memory retrieved | UNKNOWN | Requires live test |
| memory selected | UNKNOWN | Requires live test |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | UNKNOWN | Requires live test |
| action changed | UNKNOWN | Requires live test |
| outcome changed | UNKNOWN | Requires live test |

**Test**: `test_scenario_c_current_state` — SKIPPED (no credits)

### Scenario D: Historical State

**Setup**: Store VS Code, update to Cursor, query history

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | UNKNOWN | Requires live test |
| memory retrieved | UNKNOWN | Requires live test |
| memory selected | UNKNOWN | Requires live test |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | UNKNOWN | Requires live test |
| action changed | UNKNOWN | Requires live test |
| outcome changed | UNKNOWN | Requires live test |

**Test**: `test_scenario_d_historical` — SKIPPED (no credits)

### Scenario E: Store via Governor

**Setup**: Ask model to remember "dark mode for IDEs"

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | UNKNOWN | Requires live test |
| memory retrieved | N/A | Store operation |
| memory selected | N/A | Store operation |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | UNKNOWN | Requires live test |
| action changed | UNKNOWN | Requires live test |
| outcome changed | UNKNOWN | Requires live test |

**Test**: `test_scenario_e_store_via_governor` — SKIPPED (no credits)

### Scenario F: Forget

**Setup**: Store pet name, then forget it

| Signal | Status | Evidence |
|--------|--------|----------|
| memory available | UNKNOWN | Requires live test |
| memory retrieved | UNKNOWN | Requires live test |
| memory selected | UNKNOWN | Requires live test |
| memory referenced | UNKNOWN | Requires live test |
| decision changed | UNKNOWN | Requires live test |
| action changed | UNKNOWN | Requires live test |
| outcome changed | UNKNOWN | Requires live test |

**Test**: `test_scenario_f_forget` — SKIPPED (no credits)

---

## Behavioral Comparison Framework

### Test Design

```
A: memory enabled (with relevant memory stored)
B: memory disabled (no memory tools provided)
C: irrelevant memory (memory exists but unrelated)
D: stale memory (old version superseded by current)
E: wrong-scope memory (project A memory, project B query)
```

### For Each Scenario Record

```
memory available?     [YES/NO]
memory retrieved?     [YES/NO]
memory selected?      [YES/NO]
memory referenced?    [YES/NO]
decision changed?     [YES/NO]
action changed?       [YES/NO]
outcome changed?      [YES/NO]
```

### Strongest Evidence

```
same task
same model
same prompt
only memory availability differs
```

Then compare behavior.

---

## Current Evidence Status

### Architecture-Level Evidence (PROVEN)

| Evidence | Status | Source |
|----------|--------|--------|
| Memory tools callable by model | PROVEN | Unit tests |
| Tool calling loop works | PROVEN | Unit tests |
| Attribution events created | PROVEN | Unit tests |
| Security enforcement | PROVEN | Architectural tests |
| Streaming works | PROVEN | Unit tests |
| Failure handling works | PROVEN | Unit tests |
| Tool loop bounded | PROVEN | Unit tests |

### Live Model Evidence (UNKNOWN)

| Evidence | Status | Source |
|----------|--------|--------|
| Real model calls memory tools | UNKNOWN | No credits |
| Memory changes model behavior | UNKNOWN | No credits |
| Abstention works with real model | UNKNOWN | No credits |
| Current state retrieval correct | UNKNOWN | No credits |
| Historical state retrieval correct | UNKNOWN | No credits |
| Store through governor works | UNKNOWN | No credits |
| Forget works end-to-end | UNKNOWN | No credits |

---

## Conclusion

**Behavior evidence is PARTIAL**. The architecture is solid and thoroughly tested at the unit/integration level. Live behavioral evidence requires a funded OpenRouter account or alternative provider.

To complete evidence collection:

1. Fund OpenRouter account
2. Run: `TRUEMEMORY_LIVE_MODEL_TESTS=true pytest tests/test_phase8_6_live_validation.py -v -k "Live"`
3. Record all traces
4. Compare WITH vs WITHOUT memory responses
5. Document behavioral changes
