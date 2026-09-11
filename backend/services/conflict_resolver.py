"""Semantic conflict detection for memory writes.

Classifies the relationship between a new memory candidate and an existing memory
to determine the correct write operation: ADD, UPDATE, SUPERSEDE, NOOP, or KEEP_SEPARATE.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from hashlib import sha256


class ConflictResolution(Enum):
    ADD = "add"
    UPDATE = "update"
    SUPERSEDE = "supersede"
    NOOP = "noop"
    KEEP_SEPARATE = "keep_separate"


@dataclass(frozen=True)
class ConflictResult:
    resolution: ConflictResolution
    confidence: float
    reason: str


_SPACE_RE = re.compile(r"\s+")
_TERM_RE = re.compile(r"[a-z0-9][a-z0-9_-]{1,}", re.IGNORECASE)

_CORRECTION_PATTERNS = re.compile(
    r"\b(?:switched?|changed?|moved?|replaced?|updated?|corrected?|actually|"
    r"instead|no longer|used to|previously|before|now use|now prefer|"
    r"from .+ to |to be .+ now)\b",
    re.IGNORECASE,
)

_TEMPORAL_PATTERNS = re.compile(
    r"\b(?:last year|last month|yesterday|ago|previously|before|"
    r"in january|in february|march|april|may|june|july|august|"
    r"september|october|november|december|last week|this week)\b",
    re.IGNORECASE,
)

_SCOPE_INDICATORS = re.compile(
    r"\b(?:for (?:the )?(?:project|app|dashboard|frontend|backend|api|server|client)"
    r"|in (?:the )?(?:project|app|dashboard|frontend|backend|api|server|client))"
    r"\s+(\w+)",
    re.IGNORECASE,
)


def _extract_terms(text: str) -> set[str]:
    return {term.casefold() for term in _TERM_RE.findall(text)}


def _jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _content_fingerprint(text: str) -> str:
    normalized = _SPACE_RE.sub(" ", text.strip()).casefold()
    return sha256(normalized.encode("utf-8")).hexdigest()[:16]


def resolve_conflict(
    candidate_content: str,
    candidate_type: str,
    candidate_key: str,
    existing: dict,
) -> ConflictResult:
    """Determine the relationship between a new memory and an existing memory.

    Returns a ConflictResult indicating how the write should proceed.
    """
    existing_content = str(existing.get("content", ""))
    existing_type = str(existing.get("memory_type", ""))
    existing_key = str(existing.get("memory_key", ""))

    candidate_fp = _content_fingerprint(candidate_content)
    existing_fp = _content_fingerprint(existing_content)

    if candidate_fp == existing_fp:
        return ConflictResult(
            resolution=ConflictResolution.NOOP,
            confidence=1.0,
            reason="exact_duplicate",
        )

    candidate_terms = _extract_terms(candidate_content)
    existing_terms = _extract_terms(existing_content)
    similarity = _jaccard_similarity(candidate_terms, existing_terms)

    if similarity > 0.8:
        return ConflictResult(
            resolution=ConflictResolution.NOOP,
            confidence=similarity,
            reason="near_duplicate",
        )

    has_correction = bool(_CORRECTION_PATTERNS.search(candidate_content))
    has_temporal = bool(_TEMPORAL_PATTERNS.search(candidate_content))
    has_scope = bool(_SCOPE_INDICATORS.search(candidate_content))

    if has_correction and similarity > 0.3:
        return ConflictResult(
            resolution=ConflictResolution.SUPERSEDE,
            confidence=0.85,
            reason="correction_detected",
        )

    if has_temporal and similarity > 0.3:
        return ConflictResult(
            resolution=ConflictResolution.KEEP_SEPARATE,
            confidence=0.8,
            reason="temporal_variation",
        )

    if has_scope and similarity > 0.3:
        return ConflictResult(
            resolution=ConflictResolution.KEEP_SEPARATE,
            confidence=0.75,
            reason="scope_specific_variation",
        )

    if candidate_type == existing_type and candidate_key == existing_key:
        if similarity > 0.5:
            return ConflictResult(
                resolution=ConflictResolution.UPDATE,
                confidence=similarity,
                reason="complementary_same_key",
            )
        else:
            return ConflictResult(
                resolution=ConflictResolution.SUPERSEDE,
                confidence=0.7,
                reason="same_key_different_content",
            )

    if similarity > 0.6:
        return ConflictResult(
            resolution=ConflictResolution.UPDATE,
            confidence=similarity * 0.8,
            reason="related_content",
        )

    return ConflictResult(
        resolution=ConflictResolution.ADD,
        confidence=0.9,
        reason="unrelated_content",
    )
