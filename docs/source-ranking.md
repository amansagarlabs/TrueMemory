# Source Ranking

## Ranking objective

Ranking selects the evidence most useful for the current claim. It is distinct
from trust scoring: an official manual can be highly trustworthy but irrelevant
to a specific question; a community report can be highly relevant but require
corroboration.

## Candidate pipeline

1. Retrieve broadly from web, workspace, documents, and memory.
2. Canonicalize URLs and merge duplicate snapshots.
3. Reject unsafe, empty, blocked, or non-citable results.
4. Score query relevance and passage relevance.
5. Classify source type and official ownership.
6. Compute trust, freshness, and evidence-quality components.
7. Detect corroboration and contradiction across independent owners.
8. Select a diverse evidence set under a source budget.

## Rank score

```text
rank =
  0.34 * passage_relevance
  + 0.18 * claim_entailment
  + 0.14 * source_trust
  + 0.10 * freshness_fit
  + 0.10 * information_gain
  + 0.08 * source_diversity
  + 0.06 * citation_quality
  - duplicate_penalty
  - conflict_without_disclosure_penalty
```

All inputs are normalized to `0..1`. Weights are defaults and must be evaluated
per query class. Medical, legal, financial, security, and current-role questions
increase primary-source and freshness weights.

## Diversity constraints

- Do not count mirrors or syndications as independent verification.
- Prefer at least one primary/official source for authoritative factual claims.
- Prefer two independent owners for contested or high-impact claims.
- Avoid filling the evidence set with multiple pages from one domain.
- Keep a dissenting credible source when material disagreement exists.

## Ranking output

Every ranked source returns:

```json
{
  "source_id": "src_...",
  "rank": 1,
  "rank_score": 0.86,
  "reason_used": "Official API reference directly defines the behavior.",
  "evidence_role": "primary",
  "selected": true,
  "score_version": "source-intelligence-v1"
}
```

The reason is templated from observable signals, never free-form model
chain-of-thought.

