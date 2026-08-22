"""Small, dependency-free metrics for curated retrieval evaluations."""

from __future__ import annotations

import math
from statistics import mean
from typing import Iterable


def recall_at_k(ranked_ids: Iterable[str], relevant_ids: set[str], k: int) -> float:
    ranked = list(ranked_ids)[: max(0, k)]
    return 1.0 if any(item in relevant_ids for item in ranked) else 0.0


def reciprocal_rank(ranked_ids: Iterable[str], relevant_ids: set[str]) -> float:
    for index, item in enumerate(ranked_ids, start=1):
        if item in relevant_ids:
            return 1.0 / index
    return 0.0


def ndcg_at_k(ranked_ids: Iterable[str], relevance: dict[str, float], k: int) -> float:
    ranked = list(ranked_ids)[: max(0, k)]

    def gain(position: int, score: float) -> float:
        return (2**score - 1) / math.log2(position + 1)

    actual = sum(gain(position, relevance.get(item, 0.0)) for position, item in enumerate(ranked, start=1))
    ideal = sorted(relevance.values(), reverse=True)[: max(0, k)]
    ideal_score = sum(gain(position, score) for position, score in enumerate(ideal, start=1))
    return actual / ideal_score if ideal_score else 0.0


def citation_coverage(cited_source_ids: Iterable[str], supported_source_ids: set[str]) -> float:
    cited = set(cited_source_ids)
    if not cited:
        return 0.0
    return len(cited & supported_source_ids) / len(cited)


def latency_summary(samples_ms: Iterable[float]) -> dict[str, float]:
    samples = sorted(float(value) for value in samples_ms)
    if not samples:
        return {"count": 0, "mean_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0}

    def percentile(percent: float) -> float:
        index = min(len(samples) - 1, max(0, math.ceil(percent * len(samples)) - 1))
        return round(samples[index], 2)

    return {
        "count": len(samples),
        "mean_ms": round(mean(samples), 2),
        "p50_ms": percentile(0.50),
        "p95_ms": percentile(0.95),
    }
