# TRUE MEMORY PHASE 8.6 — ATTRIBUTION VALIDATION

## Status: ARCHITECTURE PROVEN — LIVE VALIDATION PENDING

**Date:** 2026-09-10

---

## Attribution Chain Architecture

### Required Chain

```
run
  ↓
tool_call
  ↓
memory
  ↓
decision
  ↓
action
  ↓
outcome
```

### Event Types

| Event | File | Purpose |
|-------|------|---------|
| DecisionEvent | `memory_result_contract.py` | Records model decision to use memory |
| ActionEvent | `memory_result_contract.py` | Records tool execution linked to decision |
| MemoryInfluenceEvent | `memory_result_contract.py` | Records specific memory retrieval |
| OutcomeEvent | `memory_result_contract.py` | Records action outcome |

---

## Event Verification

### DecisionEvent

```python
DecisionEvent(
    id=uuid4(),
    run_id="run-123",
    task_id="task-456",
    decision_type="recall",  # recall, create, update, delete, route, prioritize, abstain
    memory_ids=["mem-1", "mem-2"],
    evidence="tool_call",  # explicit_reference, tool_call, reasoning_trace, unknown
    confidence=0.85,
    reasoning="Model decided to call memory_search for user preferences",
    timestamp="2026-09-10T12:00:00Z",
)
```

**Verification**: PASS — Created, serialized, deserialized correctly.

### ActionEvent

```python
ActionEvent(
    id=uuid4(),
    run_id="run-123",
    task_id="task-456",
    action_type="tool_call",  # tool_call, response, code_change, file_operation, system_call
    tool_name="memory_search",
    decision_event_id="decision-789",  # Links to DecisionEvent
    memory_ids=["mem-1"],
    success=True,
    details="memory_search executed in 45ms",
    timestamp="2026-09-10T12:00:01Z",
)
```

**Verification**: PASS — Created, serialized, linked to DecisionEvent.

### MemoryInfluenceEvent

```python
MemoryInfluenceEvent(
    id=uuid4(),
    run_id="run-123",
    task_id="task-456",
    memory_id="mem-1",
    retrieval_event_id="action-012",  # Links to ActionEvent
    stage="retrieved",  # planning, reasoning, tool_selection, action, verification, response, retrieved
    evidence="tool_call",
    confidence=0.9,
    timestamp="2026-09-10T12:00:01Z",
)
```

**Verification**: PASS — Created, serialized, linked to ActionEvent.

### OutcomeEvent

```python
OutcomeEvent(
    id=uuid4(),
    run_id="run-123",
    task_id="task-456",
    success=True,
    outcome_type="success",  # success, failure, partial_success, user_correction, user_rejection, user_acceptance
    details="Memory retrieved and used in response",
    influence_event_id="influence-345",  # Links to MemoryInfluenceEvent
    timestamp="2026-09-10T12:00:02Z",
)
```

**Verification**: PASS — Created, serialized, linked to MemoryInfluenceEvent.

---

## Chain Completeness

### Linkage Verification

```
DecisionEvent.id ← ActionEvent.decision_event_id
ActionEvent.id ← MemoryInfluenceEvent.retrieval_event_id
MemoryInfluenceEvent.id ← OutcomeEvent.influence_event_id
```

**Test**: `test_attribution_chain_completeness` — PASS

All four events share the same `run_id`, enabling full trace reconstruction.

---

## Attribution Stages

| Stage | Description | Verified |
|-------|-------------|----------|
| planning | Memory used in planning phase | YES (unit) |
| reasoning | Memory used in reasoning | YES (unit) |
| tool_selection | Memory influenced tool selection | YES (unit) |
| action | Memory influenced action | YES (unit) |
| verification | Memory used in verification | YES (unit) |
| response | Memory used in response generation | YES (unit) |
| retrieved | Memory was retrieved | YES (unit) |

---

## Tool Calling Loop Integration

### How Events Are Created

In `tool_calling_loop.py`, for each tool call:

1. **DecisionEvent** created when model emits tool call
2. **ActionEvent** created after tool execution completes
3. **MemoryInfluenceEvent** created for each memory in tool result
4. **OutcomeEvent** created at loop completion

### Event Yielding

The loop yields events as SSE-compatible dicts:

```python
yield {"decision_event": decision_event.to_dict()}
yield {"action_event": action_event.to_dict()}
yield {"influence_event": influence_event.to_dict()}
```

---

## Observed vs Unknown

### PROVEN (Unit Tests)

| Signal | Evidence |
|--------|----------|
| retrieved | Tool call returns memory results |
| selected | DecisionEvent created for each tool call |
| returned | Tool result formatted and returned to model |
| referenced | Memory IDs tracked in attribution events |

### PARTIAL (Architecture)

| Signal | Evidence |
|--------|----------|
| decision_influenced | DecisionEvent records model's decision to call tool |
| action_influenced | ActionEvent records tool execution |

### UNKNOWN (Requires Live Testing)

| Signal | Evidence |
|--------|----------|
| outcome_improved | No live behavioral comparison data |

---

## Conclusion

**Attribution architecture is PROVEN**. The full chain from DecisionEvent → ActionEvent → MemoryInfluenceEvent → OutcomeEvent is implemented, tested, and serializable.

**Live validation is PENDING**. To verify attribution works with real models:

1. Run live tests with `TRUEMEMORY_LIVE_MODEL_TESTS=true`
2. Capture full execution traces
3. Verify decision_event_id → action_event_id → influence_event_id → outcome_event_id links
4. Compare behavior WITH vs WITHOUT memory
