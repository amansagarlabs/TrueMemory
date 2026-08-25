from __future__ import annotations

import asyncio

from services import memory_ingestion


def test_canonicalize_url_removes_fragment_and_default_port() -> None:
    assert memory_ingestion.canonicalize_url("HTTPS://Example.com:443/path/#section") == "https://example.com/path"


def test_deterministic_filter_redacts_secrets_before_processing() -> None:
    result = memory_ingestion.deterministic_filter(
        "Use token: ghp_abcdefghijklmnopqrstuvwxyz1234567890 for deploys.",
        source_type="text",
        target="candidate",
    )
    assert result["decision"] == "processing"
    assert result["redacted"] is True
    assert "ghp_" not in result["content"]


def test_short_content_is_rejected_for_memory_candidate() -> None:
    result = memory_ingestion.deterministic_filter("hi", source_type="text", target="candidate")
    assert result["decision"] == "rejected"
    assert result["reason"] == "content_too_short"


def test_explicit_statement_scores_above_external_observation() -> None:
    explicit = memory_ingestion.extract_signals("I prefer PostgreSQL for application storage.")
    derived = memory_ingestion.extract_signals("The project uses PostgreSQL for application storage.")
    explicit_score, _, explicit_reason = memory_ingestion.score_candidate(
        source_type="text", target="candidate", signals=explicit
    )
    derived_score, _, derived_reason = memory_ingestion.score_candidate(
        source_type="url", target="candidate", signals=derived
    )
    assert explicit_score > derived_score
    assert explicit_reason == "explicit_user_statement"
    assert derived_reason == "external_observation"


def test_ai_signals_are_extracted_without_claiming_personal_interest() -> None:
    signals = memory_ingestion.extract_signals(
        "Repository notes describe RAG retrieval with vector embeddings.",
        title="Research notes",
        url="https://example.com/research",
    )
    assert "rag" in signals["topics"]
    assert "retrieval" in signals["topics"]
    assert "embeddings" in signals["topics"]
    assert signals["explicit_user_signal"] is False


def test_url_adapter_uses_existing_crawl_service(monkeypatch) -> None:
    async def fake_scrape(url: str, formats: list[str]) -> dict:
        return {
            "url": url,
            "provider": "test-reader",
            "title": "A source",
            "description": "A test source",
            "status_code": 200,
            "markdown": "A useful source about memory systems.",
        }

    monkeypatch.setattr(memory_ingestion, "scrape_url", fake_scrape)
    job = {
        "id": "job-1",
        "user_id": "user-1",
        "source_type": "url",
        "provider": "amancrawl",
        "source_url": "https://example.com/source",
        "external_id": None,
        "request_payload": {"discover": False, "max_pages": 5},
    }
    items = asyncio.run(memory_ingestion.retrieve_job_sources(job))
    assert len(items) == 1
    assert items[0].provider == "test-reader"
    assert items[0].url == "https://example.com/source"


def test_unknown_source_fails_closed() -> None:
    job = {
        "id": "job-1",
        "user_id": "user-1",
        "source_type": "unknown-platform",
        "provider": "unknown",
        "request_payload": {},
    }
    try:
        asyncio.run(memory_ingestion.retrieve_job_sources(job))
    except ValueError as exc:
        assert str(exc) == "source_adapter_not_registered:unknown-platform"
    else:  # pragma: no cover - assertion branch
        raise AssertionError("unknown source adapter must fail closed")
