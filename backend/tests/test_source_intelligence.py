from datetime import UTC, datetime

from source_intelligence import (
    aggregate_source_set,
    build_source_intelligence,
    canonicalize_url,
    finalize_source_usage,
)
from source_intelligence.scoring import score_freshness
from source_intelligence.verification import classify_source


def test_canonicalize_url_removes_tracking_and_normalizes_host():
    assert canonicalize_url(
        "HTTPS://www.Example.com:443/docs/?utm_source=test&b=2&a=1#intro"
    ) == "https://example.com/docs?a=1&b=2"


def test_github_name_alone_is_never_verified_official():
    verification = classify_source(
        canonical_url="https://github.com/example/example",
        title="Example official repository",
        source_type="search",
    )
    assert verification.type.value == "repository"
    assert verification.status.value == "unverified"


def test_government_domain_is_verified_with_explicit_signal():
    verification = classify_source(
        canonical_url="https://www.nasa.gov/mission",
        title="Mission",
        source_type="search",
    )
    assert verification.status.value == "verified"
    assert verification.type.value == "government"
    assert verification.signals


def test_recognized_reference_publishers_are_not_generic_unverified_sources():
    wikipedia = classify_source(
        canonical_url="https://en.wikipedia.org/wiki/Virat_Kohli",
        title="Virat Kohli",
        source_type="search",
    )
    britannica = classify_source(
        canonical_url="https://www.britannica.com/biography/Virat-Kohli",
        title="Virat Kohli",
        source_type="search",
    )

    assert wikipedia.status.value == "probable"
    assert wikipedia.type.value == "reference"
    assert wikipedia.label == "Community encyclopedia"
    assert britannica.status.value == "probable"
    assert britannica.type.value == "reference"


def test_curated_official_domain_is_verified():
    verification = classify_source(
        canonical_url="https://www.bcci.tv/international/men/players/virat-kohli/2",
        title="Virat Kohli",
        source_type="search",
    )

    assert verification.status.value == "verified"
    assert verification.label == "Official cricket board"
    assert verification.method == "official_domain_registry"


def test_official_title_claim_is_probable_until_ownership_is_verified():
    verification = classify_source(
        canonical_url="https://example-athlete.com",
        title="Example Athlete — Official Website",
        source_type="search",
    )

    assert verification.status.value == "probable"
    assert verification.label == "Claimed official website"
    assert verification.method == "title_claim"


def test_verified_adapter_can_assert_official_ownership():
    verification = classify_source(
        canonical_url="https://docs.example.com",
        title="Example documentation",
        source_type="search",
        verification_hint="official_docs",
    )

    assert verification.status.value == "verified"
    assert verification.type.value == "official_docs"


def test_unknown_freshness_does_not_use_retrieval_time():
    freshness = score_freshness(now=datetime(2026, 7, 23, tzinfo=UTC))
    assert freshness.status == "unknown"
    assert freshness.age_days is None


def test_source_intelligence_exposes_score_components_and_version():
    source = build_source_intelligence(
        {
            "url": "https://www.rfc-editor.org/rfc/rfc9110",
            "title": "HTTP Semantics",
            "snippet": "This document describes the overall architecture of HTTP.",
            "published_at": "2022-06-01T00:00:00Z",
        },
        source_type="search",
        provider="searxng",
        citation_index=1,
    )
    assert source["verification"]["type"] == "standard"
    assert 0 <= source["trust_score"] <= 100
    assert source["trust_components"]["authority"] > 0
    assert source["score_version"] == "source-intelligence-v2"


def test_duplicate_merge_and_public_usage_roles():
    sources = aggregate_source_set(
        [
            {
                "id": "a",
                "url": "https://example.com/page?utm_source=x",
                "canonical_url": "https://example.com/page",
                "snippet": "short",
            },
            {
                "id": "b",
                "url": "https://www.example.com/page",
                "snippet": "a longer supporting passage",
            },
            {
                "id": "c",
                "url": "https://other.org/article",
                "canonical_url": "https://other.org/article",
            },
        ]
    )
    assert len(sources) == 2
    assert sources[0]["snippet"] == "a longer supporting passage"

    finalized = finalize_source_usage("Claim one [1]. Background only.", sources)
    assert finalized[0]["evidence_role"] == "primary"
    assert finalized[0]["influence_score"] == 1.0
    assert finalized[1]["evidence_role"] == "background"


def test_markdown_link_citations_are_counted_by_canonical_url():
    sources = aggregate_source_set(
        [
            {
                "id": "a",
                "url": "https://www.example.com/page",
                "canonical_url": "https://example.com/page",
            },
            {
                "id": "b",
                "url": "https://other.org/article",
                "canonical_url": "https://other.org/article",
            },
        ]
    )

    finalized = finalize_source_usage(
        (
            "The first claim uses [Example](https://www.example.com/page?utm_source=answer). "
            "The second uses [Other 2](https://other.org/article)."
        ),
        sources,
    )

    assert finalized[0]["evidence_role"] == "primary"
    assert finalized[0]["influence_score"] == 0.5
    assert finalized[1]["evidence_role"] == "supporting"
    assert finalized[1]["influence_score"] == 0.5


def test_markdown_link_with_number_is_not_double_counted():
    sources = aggregate_source_set(
        [
            {
                "id": "a",
                "url": "https://example.com/page",
                "canonical_url": "https://example.com/page",
            },
            {
                "id": "b",
                "url": "https://other.org/article",
                "canonical_url": "https://other.org/article",
            },
        ]
    )

    finalized = finalize_source_usage(
        "[Example 1](https://example.com/page) and [Other 2](https://other.org/article).",
        sources,
    )

    assert finalized[0]["influence_score"] == 0.5
    assert finalized[1]["influence_score"] == 0.5


def test_line_range_citation_uses_source_number_not_line_number():
    sources = aggregate_source_set(
        [
            {
                "id": f"source-{index}",
                "url": f"https://example.com/{index}",
                "canonical_url": f"https://example.com/{index}",
            }
            for index in range(1, 8)
        ]
    )

    finalized = finalize_source_usage(
        "A supported claim【Source 7†L4-L5]. Another claim [Source 3†L2-L3 without a closing bracket.",
        sources,
    )

    assert finalized[6]["evidence_role"] == "primary"
    assert finalized[6]["influence_score"] == 0.5
    assert finalized[2]["evidence_role"] == "supporting"
    assert finalized[2]["influence_score"] == 0.5
    assert finalized[4]["evidence_role"] == "background"
