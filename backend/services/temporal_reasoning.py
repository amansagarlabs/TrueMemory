"""Temporal reasoning for memory queries.

Extracts temporal intent from queries and applies time-aware filtering
to memory retrieval results.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TemporalIntent:
    """Extracted temporal intent from a query."""
    has_temporal: bool
    target_date: datetime | None = None
    date_range: tuple[datetime | None, datetime | None] = (None, None)
    intent: str = "current"  # "current", "historical", "range", "before", "after"
    confidence: float = 0.0


_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

_RELATIVE_PATTERNS = {
    "yesterday": timedelta(days=1),
    "last week": timedelta(weeks=1),
    "last month": timedelta(days=30),
    "last year": timedelta(days=365),
    "this week": timedelta(weeks=1),
    "this month": timedelta(days=30),
}

_HISTORICAL_KEYWORDS = re.compile(
    r"\b(?:before|ago|previously|used to|was|were|last|previous|"
    r"before the change|in the past|earlier|formerly)\b",
    re.IGNORECASE,
)

_CURRENT_KEYWORDS = re.compile(
    r"\b(?:current|now|present|today|currently|right now|at the moment)\b",
    re.IGNORECASE,
)

_RANGE_KEYWORDS = re.compile(
    r"\b(?:between|from .+ to|during|in|since|after)\b",
    re.IGNORECASE,
)

_MONTH_PATTERN = re.compile(
    r"\b(?:in\s+)?(january|february|march|april|may|june|july|august|"
    r"september|october|november|december)\b",
    re.IGNORECASE,
)

_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")

_DAY_PATTERN = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\b"
)


def extract_temporal_intent(query: str, now: datetime | None = None) -> TemporalIntent:
    """Extract temporal intent from a natural language query.

    Supports:
    - "What is my current preference?" → current
    - "What was my preference before March?" → historical (before March)
    - "What did I use last year?" → historical (last year)
    - "What happened in January?" → range (January)
    - "What changed between Jan and March?" → range (Jan-March)
    """
    if now is None:
        now = datetime.now(UTC)

    query_lower = query.lower()

    if _CURRENT_KEYWORDS.search(query):
        return TemporalIntent(
            has_temporal=True,
            intent="current",
            confidence=0.9,
        )

    if _HISTORICAL_KEYWORDS.search(query):
        for keyword, delta in _RELATIVE_PATTERNS.items():
            if keyword in query_lower:
                target = now - delta
                return TemporalIntent(
                    has_temporal=True,
                    target_date=target,
                    date_range=(None, target),
                    intent="before",
                    confidence=0.85,
                )

        month_match = _MONTH_PATTERN.search(query)
        if month_match:
            month_name = month_match.group(1).lower()
            month_num = _MONTH_MAP.get(month_name)
            if month_num:
                year = now.year
                year_match = _YEAR_PATTERN.search(query)
                if year_match:
                    year = int(year_match.group(1))
                target = datetime(year, month_num, 1, tzinfo=UTC)
                return TemporalIntent(
                    has_temporal=True,
                    target_date=target,
                    date_range=(None, target),
                    intent="before",
                    confidence=0.8,
                )

        return TemporalIntent(
            has_temporal=True,
            intent="historical",
            confidence=0.6,
        )

    month_match = _MONTH_PATTERN.search(query)
    if month_match:
        month_name = month_match.group(1).lower()
        month_num = _MONTH_MAP.get(month_name)
        if month_num:
            year = now.year
            year_match = _YEAR_PATTERN.search(query)
            if year_match:
                year = int(year_match.group(1))
            start = datetime(year, month_num, 1, tzinfo=UTC)
            if month_num == 12:
                end = datetime(year + 1, 1, 1, tzinfo=UTC)
            else:
                end = datetime(year, month_num + 1, 1, tzinfo=UTC)
            return TemporalIntent(
                has_temporal=True,
                target_date=start,
                date_range=(start, end),
                intent="range",
                confidence=0.85,
            )

    for keyword, delta in _RELATIVE_PATTERNS.items():
        if keyword in query_lower:
            target = now - delta
            return TemporalIntent(
                has_temporal=True,
                target_date=target,
                date_range=(target, now),
                intent="range",
                confidence=0.75,
            )

    return TemporalIntent(
        has_temporal=False,
        intent="current",
        confidence=0.0,
    )


def filter_by_temporal_intent(
    records: list[dict[str, Any]],
    intent: TemporalIntent,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Filter records based on extracted temporal intent.

    - "current" → only currently valid records
    - "before" → records valid before the target date
    - "range" → records valid within the date range
    - "historical" → include superseded records
    """
    if now is None:
        now = datetime.now(UTC)

    if not intent.has_temporal:
        return records

    filtered: list[dict[str, Any]] = []
    for record in records:
        valid_from = record.get("valid_from")
        valid_until = record.get("valid_until")
        lifecycle = record.get("lifecycle_status", "approved")

        if intent.intent == "current":
            if lifecycle == "superseded":
                continue
            if valid_from and isinstance(valid_from, datetime) and valid_from > now:
                continue
            if valid_until and isinstance(valid_until, datetime) and valid_until <= now:
                continue
            filtered.append(record)

        elif intent.intent == "before":
            if intent.target_date:
                if valid_until and isinstance(valid_until, datetime) and valid_until > intent.target_date:
                    continue
                if valid_from and isinstance(valid_from, datetime) and valid_from >= intent.target_date:
                    continue
            filtered.append(record)

        elif intent.intent == "range":
            start, end = intent.date_range
            if start and end:
                if valid_until and isinstance(valid_until, datetime) and valid_until <= start:
                    continue
                if valid_from and isinstance(valid_from, datetime) and valid_from >= end:
                    continue
            filtered.append(record)

        elif intent.intent == "historical":
            filtered.append(record)

    return filtered


def temporal_sort_key(record: dict[str, Any]) -> tuple:
    """Sort key for temporal ordering (newest first)."""
    updated = record.get("updated_at")
    valid_from = record.get("valid_from")
    revision = int(record.get("revision") or 0)

    if isinstance(updated, datetime):
        ts = updated
    elif isinstance(updated, str):
        try:
            ts = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            ts = datetime.min.replace(tzinfo=UTC)
    else:
        ts = datetime.min.replace(tzinfo=UTC)

    return (-revision, -ts.timestamp())
