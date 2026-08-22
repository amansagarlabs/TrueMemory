from __future__ import annotations

from urllib.parse import urlparse

from .models import EvidenceRole, SCORE_VERSION
from .normalization import canonicalize_url, content_hash, favicon_url
from .scoring import score_freshness, score_support, score_trust
from .verification import classify_source


def _reason_used(verification_label: str, evidence_role: EvidenceRole, has_quote: bool) -> str:
    if evidence_role == EvidenceRole.BACKGROUND:
        return "Retrieved as relevant background; not yet confirmed as cited evidence."
    passage = "an exact supporting passage" if has_quote else "relevant source content"
    return f"Selected as {evidence_role.value} evidence because this {verification_label.lower()} provided {passage}."


def build_source_intelligence(
    item: dict,
    *,
    source_type: str,
    provider: str | None,
    citation_index: int | None,
) -> dict:
    raw_url = str(item.get("url") or item.get("start_url") or "").strip()
    canonical_url = canonicalize_url(raw_url)
    parsed = urlparse(canonical_url)
    title = str(item.get("title") or parsed.hostname or "Source").strip()
    snippet = str(item.get("snippet") or item.get("description") or item.get("text") or "").strip()[:600]
    quote = str(item.get("quote") or "").strip() or (snippet[:280] if snippet else None)
    verification = classify_source(
        canonical_url=canonical_url,
        title=title,
        source_type=source_type,
        provider=provider or item.get("provider"),
        verification_hint=item.get("verification_hint"),
    )
    freshness = score_freshness(
        updated_at=item.get("updated_at"),
        published_at=item.get("published_at"),
    )
    trust = score_trust(
        verification=verification,
        freshness=freshness,
        title=title,
        snippet=snippet,
        quote=quote,
        license_value=item.get("license") or item.get("image_license"),
    )
    support = score_support(
        snippet=snippet,
        quote=quote,
        retrieval=item.get("retrieval"),
        citation_index=citation_index,
    )
    role = (
        EvidenceRole.PRIMARY
        if citation_index == 1
        else EvidenceRole.SUPPORTING
        if citation_index
        else EvidenceRole.BACKGROUND
    )
    return {
        "canonical_url": canonical_url,
        "favicon_url": item.get("favicon_url") or favicon_url(canonical_url),
        "verification": verification.to_dict(),
        "trust_score": trust.score,
        "trust_label": trust.label,
        "trust_components": trust.components,
        "trust_explanation": trust.explanation,
        "confidence_score": support.score,
        "confidence_label": support.label,
        "confidence_components": support.components,
        "confidence_explanation": support.explanation,
        "evidence_role": role.value,
        "reason_used": _reason_used(verification.label, role, bool(quote)),
        "influence_score": 0.0,
        "freshness": freshness.to_dict(),
        "cross_verification": {
            "status": "not_evaluated",
            "independent_sources": 0,
            "supporting_source_ids": [],
            "conflicting_source_ids": [],
        },
        "content_hash": content_hash(title, snippet, quote or ""),
        "language": item.get("language"),
        "license": item.get("license") or item.get("image_license"),
        "score_version": SCORE_VERSION,
    }
