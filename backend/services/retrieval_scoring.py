"""Shared deterministic lexical and rank-fusion primitives."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Iterable


TOKEN_RE = re.compile(r"[\w]+", re.UNICODE)


def tokenize(value: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(value or "")]


def normalize_scores(values: Iterable[float]) -> list[float]:
    scores = [float(value) for value in values]
    if not scores:
        return []
    low, high = min(scores), max(scores)
    if high <= low:
        return [1.0 if high > 0 else 0.0 for _ in scores]
    return [(value - low) / (high - low) for value in scores]


def bm25_scores(documents: list[str], query: str) -> list[float]:
    tokenized = [tokenize(document) for document in documents]
    query_counts = Counter(tokenize(query))
    count = len(tokenized)
    if not count or not query_counts:
        return [0.0] * count
    document_frequency = Counter(token for tokens in tokenized for token in set(tokens))
    idf = {
        token: math.log(1 + (count - frequency + 0.5) / (frequency + 0.5))
        for token, frequency in document_frequency.items()
    }
    average_length = sum(map(len, tokenized)) / count or 1.0
    k1, b = 1.5, 0.75
    scores: list[float] = []
    for tokens in tokenized:
        frequencies = Counter(tokens)
        length = len(tokens) or 1
        score = 0.0
        for token, query_frequency in query_counts.items():
            term_frequency = frequencies.get(token)
            if not term_frequency:
                continue
            denominator = term_frequency + k1 * (1 - b + b * length / average_length)
            score += idf.get(token, 0.0) * (term_frequency * (k1 + 1) / denominator) * min(query_frequency, 2)
        scores.append(score)
    return normalize_scores(scores)


def reciprocal_rank_fusion(
    rankings: dict[str, list[str]],
    *,
    rrf_k: int = 60,
) -> tuple[dict[str, float], dict[str, list[str]]]:
    """Fuse ranked IDs and retain the exact paths that contributed evidence."""
    scores: dict[str, float] = {}
    sources: dict[str, list[str]] = {}
    for source, ranked_ids in rankings.items():
        for rank, item_id in enumerate(ranked_ids, start=1):
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (rrf_k + rank)
            sources.setdefault(item_id, []).append(source)
    return scores, sources
