from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .models import FreshnessResult, ScoreResult, VerificationStatus, VerificationType


def _parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def score_freshness(*, updated_at: Any = None, published_at: Any = None, now: datetime | None = None) -> FreshnessResult:
    source_date = _parse_date(updated_at) or _parse_date(published_at)
    if source_date is None:
        return FreshnessResult("unknown", "Update date unknown", None, None)
    current = now or datetime.now(UTC)
    age_days = max(0, (current - source_date.astimezone(UTC)).days)
    if age_days == 0:
        label = "Updated today"
    elif age_days == 1:
        label = "Updated yesterday"
    elif age_days < 60:
        label = f"Updated {age_days} days ago"
    elif age_days < 730:
        months = max(2, round(age_days / 30))
        label = f"Updated {months} months ago"
    else:
        label = f"Updated {max(2, round(age_days / 365))} years ago"

    status = "fresh" if age_days <= 30 else "aging" if age_days <= 180 else "stale"
    return FreshnessResult(status, label, age_days, source_date.isoformat())


def score_trust(
    *,
    verification,
    freshness: FreshnessResult,
    title: str,
    snippet: str,
    quote: str | None,
    license_value: str | None,
) -> ScoreResult:
    authority_by_type = {
        VerificationType.GOVERNMENT: 25,
        VerificationType.STANDARD: 25,
        VerificationType.RESEARCH: 23,
        VerificationType.OFFICIAL_DOCS: 24,
        VerificationType.OFFICIAL_REPOSITORY: 22,
        VerificationType.ACADEMIC: 19,
        VerificationType.API_REFERENCE: 18,
        VerificationType.DOCUMENTATION: 17,
        VerificationType.NEWS: 16,
        VerificationType.REFERENCE: 16,
        VerificationType.COMPANY: 15,
        VerificationType.REPOSITORY: 13,
        VerificationType.COMMUNITY: 9,
        VerificationType.VIDEO: 8,
        VerificationType.UNKNOWN: 7,
    }
    authority = authority_by_type.get(verification.type, 7)
    ownership = {
        VerificationStatus.VERIFIED: 20,
        VerificationStatus.PROBABLE: 12,
        VerificationStatus.UNVERIFIED: 4,
        VerificationStatus.CONFLICTING: 1,
        VerificationStatus.REVOKED: 0,
    }[verification.status]
    source_quality = min(
        20,
        (6 if title.strip() else 0)
        + (8 if len(snippet.strip()) >= 80 else 4 if snippet.strip() else 0)
        + (6 if quote and len(quote.strip()) >= 30 else 0),
    )
    freshness_points = {
        "fresh": 15,
        "aging": 10,
        "stale": 4,
        "unknown": 6,
    }[freshness.status]
    transparency = (
        (4 if freshness.source_date else 0)
        + (3 if license_value else 0)
        + (3 if quote else 0)
    )
    components = {
        "authority": float(authority),
        "ownership": float(ownership),
        "source_quality": float(source_quality),
        "freshness_fit": float(freshness_points),
        "corroboration": 0.0,
        "transparency": float(transparency),
    }
    score = round(min(100.0, sum(components.values())), 1)
    label = "very_high" if score >= 85 else "high" if score >= 70 else "medium" if score >= 45 else "low"
    explanation = (
        f"{verification.label}; {freshness.label.lower()}. "
        "Corroboration is scored separately when independent evidence is available."
    )
    return ScoreResult(score, label, components, explanation)


def score_support(
    *,
    snippet: str,
    quote: str | None,
    retrieval: dict | None,
    citation_index: int | None,
) -> ScoreResult:
    retrieval = retrieval or {}
    rerank = float(retrieval.get("rerank_score") or retrieval.get("similarity") or 0)
    if rerank > 1:
        rerank = min(1.0, rerank / 100)
    semantic = rerank if rerank > 0 else (0.58 if snippet else 0.2)
    passage_coverage = 0.8 if quote and len(quote.strip()) >= 30 else 0.45 if snippet else 0.0
    selection = 0.75 if citation_index else 0.35
    components = {
        "semantic_relevance": round(semantic, 3),
        "passage_coverage": round(passage_coverage, 3),
        "selected_for_answer": round(selection, 3),
        "independent_corroboration": 0.0,
    }
    score = round(0.5 * semantic + 0.3 * passage_coverage + 0.2 * selection, 3)
    label = "very_high" if score >= 0.85 else "high" if score >= 0.70 else "medium" if score >= 0.45 else "low"
    return ScoreResult(
        score,
        label,
        components,
        "Estimated from retrieval relevance and available supporting passage; entailment has not yet been evaluated.",
    )
