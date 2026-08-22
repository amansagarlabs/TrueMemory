"""Conservative extraction and ranking for user-declared durable memory."""

from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256

_SPACE_RE = re.compile(r"\s+")
_TERM_RE = re.compile(r"[a-z0-9][a-z0-9_-]{1,}", re.IGNORECASE)
_QUESTION_PREFIX_RE = re.compile(
    r"^\s*(?:what|why|when|where|who|how|can|could|would|should|do|does|did|is|are)\b",
    re.IGNORECASE,
)
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "decision",
        re.compile(
            r"\b(?:we|i)\s+(?:have\s+)?decided\b|\bthe decision is\b|"
            r"\bwe(?:'ll| will)\s+use\b|\blet(?:'s| us)\s+use\b",
            re.IGNORECASE,
        ),
    ),
    (
        "preference",
        re.compile(
            r"\b(?:i|we)\s+prefer\b|\bmy preference is\b|\bour preference is\b",
            re.IGNORECASE,
        ),
    ),
    (
        "task_state",
        re.compile(
            r"\b(?:i|we)\s+need to\b|\bnext step is\b|\bremember to\b|"
            r"\b(?:my|our)\s+(?:next\s+)?task is\b",
            re.IGNORECASE,
        ),
    ),
    (
        "fact",
        re.compile(
            r"\bremember that\b|\b(?:my|our)\s+(?:project|repository|repo|stack|"
            r"deadline|launch|client|team)\s+(?:is|uses|runs|has)\b",
            re.IGNORECASE,
        ),
    ),
)


@dataclass(frozen=True)
class DurableMemoryCandidate:
    memory_type: str
    memory_key: str
    content: str
    importance_score: float


def extract_durable_memories(text: str) -> list[DurableMemoryCandidate]:
    normalized = _SPACE_RE.sub(" ", text).strip()
    if not normalized or _QUESTION_PREFIX_RE.match(normalized):
        return []
    results: list[DurableMemoryCandidate] = []
    for memory_type, pattern in _PATTERNS:
        if not pattern.search(normalized):
            continue
        digest = sha256(normalized.casefold().encode("utf-8")).hexdigest()[:24]
        results.append(
            DurableMemoryCandidate(
                memory_type=memory_type,
                memory_key=f"{memory_type}:{digest}",
                content=normalized[:2000],
                importance_score=0.9 if memory_type == "decision" else 0.75,
            )
        )
        break
    return results


def rank_durable_memories(
    question: str,
    memories: list[dict],
    *,
    limit: int = 6,
) -> list[dict]:
    query_terms = {term.casefold() for term in _TERM_RE.findall(question)}
    asks_for_decisions = bool(
        re.search(r"\b(decid(?:e|ed|ion)|choice|agreed)\b", question, re.IGNORECASE)
    )
    asks_for_tasks = bool(
        re.search(r"\b(next|task|todo|to-do|need to)\b", question, re.IGNORECASE)
    )

    def score(item: dict) -> tuple[float, str]:
        content_terms = {
            term.casefold()
            for term in _TERM_RE.findall(
                f"{item.get('memory_key', '')} {item.get('content', '')}"
            )
        }
        overlap = len(query_terms & content_terms) / max(1, len(query_terms))
        type_bonus = 0.0
        if asks_for_decisions and item.get("memory_type") == "decision":
            type_bonus = 1.0
        elif asks_for_tasks and item.get("memory_type") == "task_state":
            type_bonus = 1.0
        return (
            float(item.get("importance_score") or 0.5) + overlap + type_bonus,
            str(item.get("updated_at") or ""),
        )

    return sorted(memories, key=score, reverse=True)[:limit]
