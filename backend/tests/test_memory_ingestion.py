from __future__ import annotations

import asyncio
import pytest

from services import memory_ingestion
from worker import memory_ingestion_worker
from app.routes.ingestion import IngestionRequest, _request_payload, _same_request_payload


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


def test_ingestion_idempotency_conflicts_when_payload_changes() -> None:
    original = IngestionRequest(
        provider="manual",
        source_type="text",
        key="architecture",
        content="PostgreSQL is the durable source of truth.",
        idempotency_key="same-operation",
    )
    changed = IngestionRequest(
        provider="manual",
        source_type="text",
        key="architecture",
        content="Redis is the durable source of truth.",
        idempotency_key="same-operation",
    )
    assert _same_request_payload(_request_payload(original), _request_payload(original))
    assert not _same_request_payload(_request_payload(original), _request_payload(changed))


def test_ephemeral_worker_processes_bounded_batch_and_exits_when_empty(monkeypatch) -> None:
    jobs = [{"id": f"job-{index}"} for index in range(3)]
    processed: list[str] = []

    monkeypatch.setattr(memory_ingestion_worker, "get_settings", lambda: object())
    monkeypatch.setattr(memory_ingestion_worker, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(memory_ingestion_worker, "ensure_memory_ingestion_schema", lambda _settings: None)
    monkeypatch.setattr(memory_ingestion_worker, "record_worker_heartbeat", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        memory_ingestion_worker,
        "claim_next_ingestion_job",
        lambda *_args, **_kwargs: jobs.pop(0) if jobs else None,
    )
    monkeypatch.setattr(memory_ingestion_worker, "renew_ingestion_lease", lambda *_args, **_kwargs: True)

    async def process(_settings, job, *, lease_owner):
        assert lease_owner
        processed.append(job["id"])

    monkeypatch.setattr(memory_ingestion_worker, "process_ingestion_job", process)

    records = []
    monkeypatch.setattr(memory_ingestion_worker.logger, "info", lambda message, *args, **kwargs: records.append((message, args)))
    asyncio.run(memory_ingestion_worker.run_worker(once=True, max_jobs=2, max_runtime_seconds=30))

    assert processed == ["job-0", "job-1"]
    assert len(jobs) == 1
    assert any("job_id=%s status=%s" in message for message, _ in records)
    summary = next((args for message, args in records if "batch_complete" in message), None)
    assert summary is not None
    assert summary[:5] == ("max_jobs", 2, 2, 2, 0)
    assert summary[5] >= 0


def test_ephemeral_worker_counts_terminal_failed_job(monkeypatch) -> None:
    monkeypatch.setattr(memory_ingestion_worker, "get_settings", lambda: object())
    monkeypatch.setattr(memory_ingestion_worker, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(memory_ingestion_worker, "ensure_memory_ingestion_schema", lambda _settings: None)
    monkeypatch.setattr(memory_ingestion_worker, "record_worker_heartbeat", lambda *_args, **_kwargs: None)
    jobs = [{"id": "job-failed"}]
    monkeypatch.setattr(memory_ingestion_worker, "claim_next_ingestion_job", lambda *_args, **_kwargs: jobs.pop() if jobs else None)
    monkeypatch.setattr(memory_ingestion_worker, "renew_ingestion_lease", lambda *_args, **_kwargs: True)

    async def process(*_args, **_kwargs):
        return {"status": "dead_letter"}

    monkeypatch.setattr(memory_ingestion_worker, "process_ingestion_job", process)
    records = []
    monkeypatch.setattr(memory_ingestion_worker.logger, "info", lambda message, *args, **kwargs: records.append((message, args)))
    asyncio.run(memory_ingestion_worker.run_worker(once=True, max_jobs=1))
    summary = next(args for message, args in records if "batch_complete" in message)
    assert summary[:5] == ("max_jobs", 1, 1, 0, 1)


def test_ephemeral_worker_once_exits_when_queue_is_empty(monkeypatch) -> None:
    monkeypatch.setattr(memory_ingestion_worker, "get_settings", lambda: object())
    monkeypatch.setattr(memory_ingestion_worker, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(memory_ingestion_worker, "ensure_memory_ingestion_schema", lambda _settings: None)
    monkeypatch.setattr(memory_ingestion_worker, "record_worker_heartbeat", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(memory_ingestion_worker, "claim_next_ingestion_job", lambda *_args, **_kwargs: None)

    async def unexpected_process(*_args, **_kwargs):
        raise AssertionError("an empty queue must not process a job")

    monkeypatch.setattr(memory_ingestion_worker, "process_ingestion_job", unexpected_process)

    asyncio.run(memory_ingestion_worker.run_worker(once=True, max_jobs=10))


@pytest.mark.parametrize(
    ("max_jobs", "max_runtime_seconds"),
    [(0, None), (-1, None), (None, 0), (None, -1)],
)
def test_ephemeral_worker_rejects_non_positive_bounds(max_jobs, max_runtime_seconds) -> None:
    with pytest.raises(ValueError):
        asyncio.run(
            memory_ingestion_worker.run_worker(
                max_jobs=max_jobs,
                max_runtime_seconds=max_runtime_seconds,
            )
        )
