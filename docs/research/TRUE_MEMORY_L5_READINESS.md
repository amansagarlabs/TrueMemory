# TrueMemory L5 Readiness

**Date:** 2026-09-10
**Status:** NOT READY

---

## L5 Definition

L5 = Adaptive Memory

The memory system can improve its own policies from evidence.

Target loop:
```text
EXPERIENCE → MEMORY → STATE → RETRIEVAL → AGENT → DECISION → ACTION → OUTCOME → FEEDBACK → MEMORY EVALUATION → POLICY IMPROVEMENT → BETTER MEMORY → BETTER AGENT
```

---

## Current Signals

### Available

```text
✓ Memory events (MemoryInfluenceEvent, OutcomeEvent)
✓ Run summary (run_id, decisions, queries, influences, outcomes)
✓ Memory content and metadata
✓ Temporal fields (valid_from, valid_until, revision)
✓ Confidence scores
✓ Source types
✓ Project/user scoping
```

### Missing

```text
✗ Memory retrieval events (when memory is fetched)
✗ Memory selection events (when memory is chosen for context)
✗ Memory inclusion events (when memory is in prompt)
✗ Memory reference events (when LLM references memory)
✗ Attribution mechanism (which memory influenced which decision)
✗ Structured LLM output (memory decisions, reasoning)
✗ User correction signals
✓ User rejection signals
✗ User acceptance signals
✗ Outcome quality metrics
✗ Task success/failure correlation
✗ Memory quality scores
✗ Policy versioning
✗ Historical telemetry retention
```

---

## Event Correlation

### Current Correlation

```text
run_id → decisions, queries, influences, outcomes

MISSING CORRELATION:
- memory_id → retrieval_event_id
- retrieval_event_id → agent_decision
- agent_decision → action
- action → outcome
- outcome → feedback
- feedback → memory_quality_score
```

### Correlation Gaps

```text
The system tracks:
- Which decisions were made
- Which queries were executed
- Which influences were recorded
- Which outcomes occurred

But does NOT track:
- Which specific memory was retrieved
- Which specific memory was selected
- Which specific memory was included in context
- Which specific memory was referenced by LLM
- Which specific memory influenced which decision
```

---

## Outcome Quality

### Current Signals

```text
✓ HTTP 200 (tool success)
✓ Message saved (task completion)
✓ Follow-ups generated

MISSING:
✗ Test pass/fail
✗ Build pass/fail
✗ User correction ("No, I prefer X")
✗ User rejection ("That's wrong")
✗ User acceptance ("Thanks, that works")
✗ Explicit feedback
✗ Follow-up repair requests
```

### Quality Metrics

```text
METRIC: Task success
STATUS: NOT AVAILABLE
EVIDENCE: No structured outcome tracking

METRIC: User satisfaction
STATUS: NOT AVAILABLE
EVIDENCE: No user feedback mechanism

METRIC: Memory usefulness
STATUS: NOT AVAILABLE
EVIDENCE: No memory quality scoring
```

---

## User Feedback

### Current Feedback

```text
✓ Implicit: User continues conversation (acceptance)
✓ Implicit: User asks follow-up (partial acceptance)

MISSING:
✗ Explicit: "That's correct"
✗ Explicit: "That's wrong"
✗ Explicit: "I prefer X instead"
✗ Explicit: "Forget this"
✗ Explicit: "This is outdated"
```

### Feedback Mechanism

```text
No structured feedback mechanism exists.
User corrections are not captured as memory events.
The system cannot learn from user corrections.
```

---

## Offline Evaluation

### Current Capabilities

```text
✓ Event logging (MemoryInfluenceEvent, OutcomeEvent)
✓ Run summaries
✓ Memory content and metadata

MISSING:
✗ Event replay pipeline
✗ A/B testing framework
✗ Counterfactual analysis
✗ Causal inference
✗ Statistical significance testing
```

### Evaluation Pipeline

```text
NO offline evaluation pipeline exists.
Cannot compare:
- With memory vs without memory
- Different retrieval strategies
- Different context budgets
- Different memory types
```

---

## Shadow Evaluation

### Current Capabilities

```text
✗ Shadow mode not implemented
✗ Cannot run multiple policies simultaneously
✗ Cannot compare policy versions
✗ Cannot measure policy impact
```

---

## Candidate Adaptive Policies

### Potential L5 Policies

| Policy | Impact | Risk | Measurability | Feedback Quality | Reversibility |
|--------|--------|------|---------------|------------------|---------------|
| Retrieval weights | HIGH | LOW | MEDIUM | LOW | HIGH |
| Context budget | HIGH | LOW | HIGH | LOW | HIGH |
| Decay rates | MEDIUM | LOW | MEDIUM | LOW | HIGH |
| Extraction prompts | HIGH | MEDIUM | MEDIUM | LOW | HIGH |
| Ranking algorithms | HIGH | MEDIUM | MEDIUM | LOW | HIGH |
| Memory tool usage | HIGH | HIGH | LOW | LOW | MEDIUM |

### Priority Ranking

1. **Context budget** — High impact, low risk, high measurability
2. **Retrieval weights** — High impact, low risk, medium measurability
3. **Decay rates** — Medium impact, low risk, medium measurability
4. **Extraction prompts** — High impact, medium risk, medium measurability
5. **Ranking algorithms** — High impact, medium risk, medium measurability
6. **Memory tool usage** — High impact, high risk, low measurability

---

## Risk Analysis

### Current Risks

```text
LOW RISK:
- Memory retrieval failure (graceful degradation)
- Memory staleness (temporal resolution)
- Memory conflicts (conflict resolution)

MEDIUM RISK:
- Memory injection quality (flat text, not structured)
- Memory attribution (no mechanism)
- Memory quality scoring (no mechanism)

HIGH RISK:
- Adaptive policy changes (no safety mechanisms)
- Self-training (no validation pipeline)
- Automatic prompt mutation (no human review)
```

### Safety Requirements

```text
BEFORE ANY ADAPTIVE POLICY:
1. Policy versioning
2. Offline evaluation
3. Shadow mode
4. Human approval
5. Rollback mechanism
6. Regression tests
7. Drift monitoring
8. Minimum sample size
9. Confidence threshold
```

---

## Rollback

### Current Architecture

```text
NO ROLLBACK MECHANISM EXISTS

Memory is stored in PostgreSQL.
Memory versions are tracked (revision field).
But no policy rollback mechanism exists.

For adaptive policies:
- Need policy versioning
- Need ability to revert to previous policy
- Need A/B testing to compare versions
```

---

## Human Review

### Current Review

```text
NO HUMAN REVIEW MECHANISM EXISTS

For adaptive policies:
- Need human approval before deployment
- Need ability to review policy changes
- Need ability to override automatic decisions
```

---

## L5 Experiment Roadmap

### Phase 0: Telemetry/Data Collection (Weeks 1-2)

```text
1. Add memory retrieval events
2. Add memory selection events
3. Add memory inclusion events
4. Add memory reference events
5. Add attribution mechanism
6. Add structured LLM output
7. Add user correction signals
8. Add outcome quality metrics
9. Add policy versioning
10. Add historical telemetry retention
```

### Phase 1: Offline Evaluation (Weeks 3-4)

```text
1. Build event replay pipeline
2. Build A/B testing framework
3. Build counterfactual analysis
4. Build causal inference pipeline
5. Build statistical significance testing
```

### Phase 2: Shadow Evaluation (Weeks 5-6)

```text
1. Implement shadow mode
2. Run multiple policies simultaneously
3. Compare policy versions
4. Measure policy impact
5. Identify winning policies
```

### Phase 3: Human-Reviewed Adaptation (Weeks 7-8)

```text
1. Add human approval mechanism
2. Add policy review interface
3. Add override capability
4. Add change logging
```

### Phase 4: Limited Production Adaptation (Weeks 9-10)

```text
1. Deploy winning policies to 10% of users
2. Monitor for regressions
3. Measure improvement
4. Gradually increase rollout
```

### Phase 5: Safe Automatic Adaptation (Weeks 11-12)

```text
1. Implement automatic policy updates
2. Add safety checks
3. Add drift monitoring
4. Add rollback mechanism
5. Add confidence thresholds
```

---

## L5 Readiness Decision

### Assessment

```text
L5 READINESS: NOT READY

Missing critical infrastructure:
1. No attribution mechanism
2. No outcome quality metrics
3. No user feedback mechanism
4. No offline evaluation pipeline
5. No shadow evaluation
6. No policy versioning
7. No rollback mechanism
8. No human review mechanism
```

### Recommendation

```text
DO NOT begin L5 adaptive learning yet.

First, complete Phase 0 (Telemetry/Data Collection) to establish
the evidence loop required for safe adaptation.

Estimated time to L5 readiness: 10-12 weeks
```

---

## L5 Dataset Design

### Target Record Format

```json
{
  "run_id": "...",
  "task": "...",
  "user_id": "...",
  "project_id": "...",
  "timestamp": "...",

  "memory_candidates": [
    {
      "memory_id": "...",
      "content": "...",
      "type": "...",
      "confidence": 0.85
    }
  ],

  "memories_retrieved": [
    {
      "memory_id": "...",
      "retrieval_event_id": "...",
      "retrieval_time_ms": 50
    }
  ],

  "memories_selected": [
    {
      "memory_id": "...",
      "selection_reason": "..."
    }
  ],

  "context": {
    "total_tokens": 2000,
    "memory_tokens": 500,
    "memory_percentage": 0.25
  },

  "agent_decision": {
    "type": "...",
    "reasoning": "...",
    "memory_references": ["..."]
  },

  "action": {
    "type": "...",
    "tool": "...",
    "parameters": {},
    "memory_influenced": true
  },

  "outcome": {
    "success": true,
    "type": "success",
    "details": "..."
  },

  "user_feedback": {
    "type": "acceptance",
    "details": "..."
  },

  "memory_changes": [
    {
      "memory_id": "...",
      "change_type": "update",
      "old_value": "...",
      "new_value": "..."
    }
  ]
}
```

### Current Telemetry Coverage

```text
✓ run_id
✓ task (question)
✓ user_id
✓ project_id
✓ timestamp
✓ memory_candidates (from extraction)
✓ memories_retrieved (from queries)
? memories_selected (partial)
✗ context (no token counting)
✗ agent_decision (no structured output)
✗ action (no structured output)
✓ outcome (basic)
? user_feedback (implicit only)
? memory_changes (partial)
```

---

## Memory Quality Loop

### Target Loop

```text
MEMORY CREATED
       ↓
MEMORY RETRIEVED
       ↓
MEMORY USED?
       ↓
ACTION RESULT
       ↓
USER FEEDBACK
       ↓
MEMORY QUALITY SCORE
```

### Candidate Quality Score Formulations

```text
FORMULA 1: Usefulness
quality = (retrieved * 0.2) + (selected * 0.3) + (referenced * 0.3) + (outcome * 0.2)

FORMULA 2: Impact
quality = (action_influenced * 0.4) + (outcome_improved * 0.4) + (user_acceptance * 0.2)

FORMULA 3: Longevity
quality = (days_since_creation / days_since_last_use) * confidence

RECOMMENDATION: Do not choose formula without experiments.
Run offline evaluation to compare candidate formulations.
```

---

## Summary

### L4 Status

```text
L4: CONDITIONAL PASS

TrueMemory qualifies as an L4 Agent Memory Harness at the
APPLICATION level, but NOT at the AGENT level.

The application orchestrates memory correctly.
The agent does NOT control memory retrieval.
```

### L5 Status

```text
L5: NOT READY

Missing critical infrastructure for safe adaptation.
Estimated time to L5 readiness: 10-12 weeks.
```

### Next Steps

```text
1. Complete L4 gaps (agent-level memory control)
2. Complete Phase 0 (telemetry/data collection)
3. Build offline evaluation pipeline
4. Begin L5 experiments in shadow mode
5. Deploy winning policies with human review
```
