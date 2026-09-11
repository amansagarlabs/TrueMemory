# TrueMemory Harness — Roadmap Patch

## Purpose

This document corrects the original `TRUE_MEMORY_HARNESS_IMPLEMENTATION_ROADMAP.md` based on the architecture gate audit. It addresses missing L3 prerequisites, incorrectly scoped tasks, and missing observability foundations.

---

## Changes Summary

### Demoted to L5 (was incorrectly L4)

| Original Task | Reason for Demotion |
|---------------|---------------------|
| P5-T1: Knowledge Graph | L5 capability, not required for L4 completion |
| P5-T2: Sleep-time Compute | L5 capability, not required for L4 completion |
| P5-T3: Multi-Agent Memory | L5 capability, not required for L4 completion |
| P5-T4: Learned Control | L5 capability, not required for L4 completion |

### Promoted / Split / New

| New Task | Priority | Reason |
|----------|----------|--------|
| P0-NEW-1: Semantic Conflict Detection | P0 | Split from P1-T2; required for L3 |
| P0-NEW-2: Temporal State View | P0 | Missing L3 prerequisite |
| P0-NEW-3: L5 Event Model | P0 | Foundation for all L5 learning |
| P1-NEW-1: Memory Observability | P1 | Implements event model |
| P1-NEW-2: Behavior Test Suite | P1 | Required to verify L4 completion |
| P2-NEW-1: Point-in-Time Reconstruction | P2 | Completes L3 temporal capabilities |

### Modified Tasks

| Task | Change |
|------|--------|
| P1-T1: LLM Extraction | No change |
| P1-T2: Conflict Resolution | Split into P0-NEW-1 (semantic detection) + P1-T2 (resolution actions) |
| P1-T3: Agent Memory | No change |
| P2-T1: Memory Governor | No change |
| P2-T2: Temporal Reasoning | No change |
| P2-T3: Memory Decay | No change |
| P3-T1: Context Compiler | No change |
| P3-T2: Working Memory | No change |
| P3-T3: Memory as Tool | No change |
| P4-T1: Consolidation | No change |
| P4-T2: Entity Resolution | No change |
| P4-T3: Observability | Renamed; implementation deferred to P1-NEW-1 |

---

## Revised Critical Path

```
Phase 0 (Foundation)
├── P0-NEW-3: L5 Event Model .................. 3 SP (defines event schemas)
├── P0-NEW-2: Temporal State View ............. 5 SP (L3 prerequisite)
└── P0-NEW-1: Semantic Conflict Detection ..... 5 SP (L3 prerequisite)

Phase 1 (Core Extraction)
├── P1-T1: LLM Extraction .................... 8 SP
├── P1-T2: Conflict Resolution Actions ....... 5 SP (depends on P0-NEW-1)
├── P1-T3: Agent Memory ...................... 5 SP
├── P1-NEW-1: Memory Observability ........... 8 SP (depends on P0-NEW-3)
└── P1-NEW-2: Behavior Test Suite ............ 5 SP (depends on P1-T1)

Phase 2 (Governance)
├── P2-T1: Memory Governor .................. 13 SP
├── P2-T2: Temporal Reasoning ............... 8 SP (depends on P0-NEW-2)
├── P2-T3: Memory Decay ..................... 5 SP
└── P2-NEW-1: Point-in-Time Reconstruction .. 5 SP (depends on P0-NEW-2)

Phase 3 (Context Engineering)
├── P3-T1: Context Compiler ................ 13 SP
├── P3-T2: Working Memory .................. 8 SP
└── P3-T3: Memory as Tool .................. 5 SP

Phase 4 (Advanced Memory)
├── P4-T1: Consolidation ................... 8 SP
└── P4-T2: Entity Resolution ............... 5 SP

Phase 5 (L5 — Adaptive) [deferred]
├── P5-T1: Knowledge Graph ................ 13 SP (L5 only)
├── P5-T2: Sleep-time Compute ............. 8 SP (L5 only)
├── P5-T3: Multi-Agent Memory ............. 8 SP (L5 only)
└── P5-T4: Learned Control ................. 13 SP (L5 only)
```

### Revised Critical Path

```
P0-NEW-3 (Event Model)
    ↓
P0-NEW-2 (Temporal State View) + P0-NEW-1 (Semantic Conflict Detection)
    ↓
P1-T1 (LLM Extraction) + P1-T2 (Conflict Resolution Actions)
    ↓
P1-T3 (Agent Memory)
    ↓
P2-T1 (Memory Governor)
    ↓
P3-T1 (Context Compiler)
    ↓
P1-NEW-1 (Memory Observability) + P1-NEW-2 (Behavior Test Suite)
    ↓
L4 COMPLETE
    ↓
P5-* (L5 tasks — only after L4 verification)
```

**Revised Duration:** ~22 weeks (reduced from 24 by removing L5 from L4 path)

---

## Revised Definition of Done

### L3 Complete When:
- [ ] Temporal state view: can query "what is true now" with correct filtering
- [ ] Temporal state view: can query "what was true on date X" with correct filtering
- [ ] LLM extraction: captures preferences, facts, decisions, entities
- [ ] LLM extraction: F1 score > 0.85 on test corpus
- [ ] Semantic conflict detection: detects contradictions with >85% precision
- [ ] Conflict resolution: correctly chooses ADD/UPDATE/SUPERSEDE/NOOP
- [ ] Agent-generated memories: tool results and task completions are captured
- [ ] Supersession chains: new memories correctly link to superseded predecessors
- [ ] Project scoping: facts scoped to different projects don't conflict

### L4 Complete When:
- [ ] L3 prerequisites all pass
- [ ] Memory Governor: enforces policies on all write paths
- [ ] Memory Governor: lifecycle transitions are automated
- [ ] Context compiler: produces typed, budgeted context
- [ ] Context compiler: deduplicates before inclusion
- [ ] Memory tools: proactive (auto-inject) works
- [ ] Memory tools: JIT (agent-requested) works
- [ ] Background consolidation: merges related memories
- [ ] Entity extraction: identifies and links entities
- [ ] Memory trace: shows why each memory was retrieved
- [ ] Audit log: records all operations
- [ ] 10 behavior tests pass (memory improves agent actions)
- [ ] Event model implemented (4 event types with correlation IDs)
- [ ] Observability dashboard shows memory metrics

### L5 Definition (for future reference):
- [ ] Adaptive ranking: learns from retrieval success/failure
- [ ] Adaptive retention: learns what to keep/forget
- [ ] Adaptive extraction: learns extraction patterns
- [ ] Policy learning: optimizes governor rules
- [ ] Knowledge graph: entities and relationships
- [ ] Sleep-time compute: offline consolidation
- [ ] Multi-agent memory: cross-agent sharing
- [ ] Learned control: self-improving memory system

---

## Revised Story Points

### Original: 115 SP across 16 tasks

### Revised: 143 SP across 22 tasks

**Added:**
- P0-NEW-1: Semantic Conflict Detection — 5 SP
- P0-NEW-2: Temporal State View — 5 SP
- P0-NEW-3: L5 Event Model — 3 SP
- P1-NEW-1: Memory Observability — 8 SP
- P1-NEW-2: Behavior Test Suite — 5 SP
- P2-NEW-1: Point-in-Time Reconstruction — 5 SP

**Total added:** +31 SP

**Demoted to L5 (removed from L4 scope):**
- P5-T1: Knowledge Graph — 13 SP
- P5-T2: Sleep-time Compute — 8 SP
- P5-T3: Multi-Agent Memory — 8 SP
- P5-T4: Learned Control — 13 SP

**Total demoted:** -42 SP

**Net change:** +31 - 42 = -11 SP within L4 scope

**L4 revised total:** 143 - 42 = 101 SP (reduced from 115)

---

## Revised Risk Register

| Risk | Mitigation |
|------|-----------|
| LLM extraction accuracy insufficient | Start with simple patterns, iterate on test corpus |
| Semantic conflict detection has too many false positives | Conservative threshold, human-in-the-loop for uncertain cases |
| Context compiler produces too much context | Strict token budget, priority-based selection |
| Memory governance too restrictive | Configurable policies, gradual tightening |
| Observability overhead too high | Sampling, async logging, configurable granularity |
| Behavior tests flaky | Isolated test environments, deterministic seeds |

---

## Appendix: Task Details

### P0-NEW-1: Semantic Conflict Detection

**Description:** Implement semantic comparison of memory content to detect contradictions, corrections, and temporal changes.

**Dependencies:** None

**Acceptance Criteria:**
- Can detect "I use React" vs "I prefer Vue" as conflict
- Can detect "I switched from X to Y" as correction
- Can detect "I use React for frontend, Vue for dashboard" as non-conflict
- Precision > 85% on test corpus

**Story Points:** 5

**Owner:** TBD

---

### P0-NEW-2: Temporal State View

**Description:** Implement ability to query "what is true now" and "what was true on date X" using valid_from/valid_until fields.

**Dependencies:** None

**Acceptance Criteria:**
- Query with `as_of` parameter returns only memories valid at that time
- Query without `as_of` returns only currently valid memories
- Superseded memories are correctly excluded from current view
- Historical view correctly includes superseded memories

**Story Points:** 5

**Owner:** TBD

---

### P0-NEW-3: L5 Event Model

**Description:** Define the event schema for all L5 observability signals: memory_retrieval_event, agent_memory_influence_event, outcome_event, governor_decision_event.

**Dependencies:** None

**Acceptance Criteria:**
- 4 event types defined with JSON schema
- Each event includes correlation ID (runId/taskId)
- Each event includes timestamp, actor, payload
- Event schema supports future analytics queries

**Story Points:** 3

**Owner:** TBD

---

### P1-NEW-1: Memory Observability

**Description:** Implement event logging for all 4 event types defined in P0-NEW-3.

**Dependencies:** P0-NEW-3

**Acceptance Criteria:**
- memory_retrieval_event logged for every search
- agent_memory_influence_event logged when memory appears in prompt
- outcome_event logged for task success/failure/correction
- governor_decision_event logged for every lifecycle decision
- Events queryable via API

**Story Points:** 8

**Owner:** TBD

---

### P1-NEW-2: Behavior Test Suite

**Description:** Create 10 behavior tests that verify memory actually improves agent actions.

**Dependencies:** P1-T1, P1-T2

**Acceptance Criteria:**
- 10 test scenarios defined
- Each test has a "without memory" baseline and "with memory" condition
- Tests verify memory improves correctness, efficiency, or consistency
- Tests are deterministic and reproducible

**Story Points:** 5

**Owner:** TBD

---

### P2-NEW-1: Point-in-Time Reconstruction

**Description:** Implement ability to reconstruct the full memory state at any historical timestamp.

**Dependencies:** P0-NEW-2

**Acceptance Criteria:**
- Given a timestamp, can reconstruct all memories valid at that time
- Reconstruction includes superseded memories that were valid
- Reconstruction respects project scoping
- Reconstruction completes in < 500ms for 1000 memories

**Story Points:** 5

**Owner:** TBD
