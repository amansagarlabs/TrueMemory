# TRUE MEMORY L5 RESEARCH PLAN — Adaptive Memory

## Status: L5 NOT STARTED

**Date:** 2026-09-11
**Prerequisite:** L4 PROVEN (live evidence required)

---

## A. L5 Definition

L5 (Adaptive Memory) is the level where the memory system learns from production behavior and adapts its policies automatically. L5 requires:

1. **Trustworthy L4 telemetry** — Production observation data from real interactions
2. **Evaluation dataset** — Ground truth labels for memory influence
3. **Baseline metrics** — Current system performance benchmarks
4. **Controlled experiments** — A/B testing infrastructure

---

## B. L5 Research Areas

### 1. Learned Retrieval Ranking

**Goal:** Replace hand-tuned retrieval scoring with learned ranking

**Current:** `retrieval_scoring.py` uses static heuristics (semantic similarity, recency, scope)

**L5 Approach:**
- Collect (query, retrieved_memories, user_feedback) tuples from production
- Train reranker on user correction signals
- Evaluate: Did retrieved memories actually help?

**Metrics:**
- Precision@k: Of top-k retrieved, how many were useful?
- Recall@k: Of useful memories, how many were retrieved?
- NDCG: Ranking quality

**Prerequisites:**
- 1000+ production runs with telemetry
- User feedback signals (corrections, rejections)
- Memory influence tracking

### 2. Adaptive Extraction

**Goal:** Let the extraction pipeline learn what to extract

**Current:** Extraction uses fixed prompts and thresholds

**L5 Approach:**
- Track which extracted facts were actually used
- Track which facts were never referenced
- Adjust extraction thresholds based on usage patterns
- Learn extraction prompt variants per domain

**Metrics:**
- Extraction utility rate: % of extracted facts that were ever used
- False positive rate: % of extractions that were noise
- Domain adaptation: Performance across different project types

**Prerequisites:**
- Extraction telemetry (what was extracted, what was used)
- Domain labels on conversations
- Sufficient production data

### 3. Adaptive Memory Decay

**Goal:** Let memory decay rates learn from access patterns

**Current:** Decay is time-based with fixed rates

**L5 Approach:**
- Track memory access frequency
- Track memory utility over time
- Learn per-memory decay rates based on access patterns
- Automatically archive/forget low-utility memories

**Metrics:**
- Memory utility over time
- Decay rate optimization
- Storage efficiency

**Prerequisites:**
- Memory access logs
- Utility signals (was memory used in tool calls?)
- Longitudinal data (weeks/months of production)

### 4. Self-Modifying Policies

**Goal:** Let Governor policies adapt based on outcomes

**Current:** Governor uses static rules defined in code

**L5 Approach:**
- Track policy decisions and their outcomes
- Learn which policies lead to better outcomes
- Automatically adjust policy thresholds
- A/B test policy changes

**Metrics:**
- Policy decision quality
- Outcome improvement with policy changes
- User satisfaction signals

**Prerequisites:**
- Governor decision telemetry
- Outcome tracking (did memory help?)
- A/B testing infrastructure

### 5. Reinforcement Learning

**Goal:** Train memory system from user feedback

**Current:** No learning from feedback

**L5 Approach:**
- Define reward signal: user_corrected = negative, outcome_improved = positive
- Train policy to maximize reward
- Start with simple bandit approaches
- Graduate to full RL if needed

**Metrics:**
- Reward accumulation over time
- Policy convergence
- Stability of learned behaviors

**Prerequisites:**
- Sufficient feedback signals
- Evaluation framework
- Safe deployment infrastructure

---

## C. Evaluation Dataset Schema

### Purpose

The evaluation dataset provides ground truth labels for training and evaluating L5 adaptive policies.

### Schema

```python
@dataclass
class EvaluationSample:
    """One sample from the evaluation dataset."""
    sample_id: str
    conversation_id: str
    project_id: str
    domain: str  # "software", "writing", "research", etc.

    # Input
    query: str  # User's original query
    context: dict  # MemoryContext at time of query

    # Memory system behavior
    memories_retrieved: list[str]  # Memory IDs retrieved
    memories_selected: list[str]  # Memory IDs selected by governor
    memories_returned: list[str]  # Memory IDs returned to model
    tool_calls: list[dict]  # Tool calls made by model

    # Ground truth labels
    useful_memories: list[str]  # Which memories were actually useful
    harmful_memories: list[str]  # Which memories led to errors
    optimal_response_quality: float  # 0-1 quality of optimal response

    # Outcome
    outcome_improved: bool  # Did memory improve the response?
    user_satisfied: bool  # Was user satisfied?
    user_corrected: bool  # Did user correct the response?

    # Metadata
    timestamp: str
    provider: str
    model: str
```

### Data Sources

| Source | Label Type | Reliability |
|--------|-----------|-------------|
| Telemetry events | System behavior | High |
| User corrections | Memory quality | High |
| Outcome events | Improvement | Medium |
| Manual annotation | Ground truth | High (expensive) |

### Collection Process

1. Deploy with telemetry enabled
2. Collect 1000+ production runs
3. Identify user corrections (negative signal)
4. Identify outcome improvements (positive signal)
5. Manual annotation of 100 samples for calibration
6. Train initial models on collected data

---

## D. Baseline Metrics

### Current System Performance (Estimated)

| Metric | Current | Target |
|--------|---------|--------|
| Retrieval precision@5 | ~0.6 | 0.8 |
| Memory influence rate | ~0.3 | 0.5 |
| Outcome improvement rate | ~0.2 | 0.4 |
| User correction rate | ~0.1 | <0.05 |
| Extraction utility rate | ~0.4 | 0.7 |

*Note: These are estimates. Actual baselines require production telemetry.*

### L5 Target Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Retrieval precision@5 | 0.8+ | Evaluation dataset |
| Memory influence rate | 0.5+ | Telemetry |
| Outcome improvement rate | 0.4+ | Telemetry |
| User correction rate | <0.05 | User feedback |
| Extraction utility rate | 0.7+ | Extraction telemetry |

---

## E. Implementation Order

### Phase 5.1: Data Collection (Weeks 1-4)

1. Deploy telemetry in staging
2. Collect production runs
3. Build evaluation dataset pipeline
4. Establish baseline metrics

### Phase 5.2: Simple Adaptation (Weeks 5-8)

1. Learned retrieval ranking (simple reranker)
2. Adaptive extraction thresholds
3. A/B testing infrastructure

### Phase 5.3: Advanced Adaptation (Weeks 9-16)

1. Adaptive memory decay
2. Self-modifying Governor policies
3. Full evaluation framework

### Phase 5.4: Reinforcement Learning (Weeks 17-24)

1. Reward signal definition
2. Bandit approaches
3. Full RL if needed
4. Safety and stability validation

---

## F. Safety Constraints

### L5 Must NOT

- Modify system behavior without human oversight
- Change security policies
- Bypass governance
- Access raw prompts or API keys
- Make irreversible changes without confirmation

### L5 Must

- Log all policy changes
- Provide rollback capability
- Maintain provider independence
- Preserve L3/L4 guarantees
- Be optional (can be disabled)

---

## G. Success Criteria

### L5 Partial

- [ ] Evaluation dataset with 1000+ samples
- [ ] Baseline metrics established
- [ ] Simple retrieval reranker trained
- [ ] A/B testing infrastructure operational

### L5 Full

- [ ] Retrieval precision@5 >= 0.8
- [ ] Memory influence rate >= 0.5
- [ ] Outcome improvement rate >= 0.4
- [ ] User correction rate < 0.05
- [ ] All L5 research areas implemented
- [ ] Safety validation complete

---

## Conclusion

L5 (Adaptive Memory) requires production telemetry data that does not yet exist. Phase 8.7 added the instrumentation to collect this data. L5 should begin only after L4 PROVEN status is achieved and sufficient production data is collected.
