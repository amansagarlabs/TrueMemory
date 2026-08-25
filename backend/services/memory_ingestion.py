"""Durable universal memory-ingestion orchestration.

This module owns queue state and source normalization only. Durable memory
writes continue through ``MemoryClient``/``MemoryCore``; AmanCrawl and the
document/browser providers remain the source-specific retrieval systems.
"""

from __future__ import annotations

import hashlib
import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from app.config import get_settings
from services.agent_guardrails import sanitize_model_output
from services.artifact_extract import extract_artifact_text
from services.crawl_service import crawl_site, scrape_url
from services.memory_core import MemoryClient
from services.pdf_upload import get_uploads_dir
from services.postgres_store import _connect, get_artifact_for_user, postgres_enabled

try:
    from psycopg.types.json import Json
except ImportError:  # pragma: no cover - psycopg is optional in local SQLite mode
    Json = None


logger = logging.getLogger(__name__)


class IngestionCancelled(Exception):
    """Raised when a worker observes that its job was cancelled."""

# API and worker processes can reach schema setup concurrently during startup
# and request handling. A transaction-scoped advisory lock serializes this
# idempotent DDL so PostgreSQL does not deadlock while creating the same
# indexes from multiple connections.
MEMORY_INGESTION_SCHEMA_LOCK = 840171032
_MEMORY_INGESTION_SCHEMA_READY: set[str] = set()

JOB_STATUSES = {
    "requested", "queued", "running", "candidate_ready", "completed",
    "failed", "dead_letter", "cancelled",
}
STAGES = {
    "requested", "queued", "authorized", "safe", "discovering", "fetching",
    "fetched", "normalized", "deduplicated", "filtered", "extracted",
    "classified", "resolved", "confidence_scored", "related", "routed",
    "embedded", "indexed", "candidate_ready", "completed", "failed",
    "cancelled",
}

_TOPIC_TERMS = {
    "ai", "agent", "agents", "artificial intelligence", "machine learning",
    "ml", "llm", "rag", "retrieval", "embedding", "embeddings", "vector",
    "transformer", "inference", "computer vision", "generative ai",
}
_EXPLICIT_RE = re.compile(
    r"\b(i am|i'm|my |we use|we prefer|i prefer|i work|i like|remember that|"
    r"our project|our team)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SourceEnvelope:
    source_id: str
    source_type: str
    provider: str
    external_id: str | None
    url: str | None
    title: str
    content: str
    metadata: dict[str, Any]
    provenance: dict[str, Any]
    permissions: dict[str, Any]
    observed_at: str
    source_version: str = "1"


def _json(value: Any) -> Any:
    # Ingestion checkpoints and filter decisions contain database UUIDs and
    # other provider values. Keep JSONB writes deterministic instead of
    # failing after the source has already been retrieved.
    dumps = lambda item: json.dumps(item, default=str)
    return Json(value, dumps=dumps) if Json is not None else dumps(value)


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _row(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    return {str(key): _iso(item) for key, item in dict(value).items()}


def canonicalize_url(value: str | None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed = urlsplit(raw if "://" in raw else f"https://{raw}")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw
    host = parsed.hostname.lower() if parsed.hostname else parsed.netloc.lower()
    port = parsed.port
    netloc = host
    if port and not ((parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"
    return urlunsplit((parsed.scheme.lower(), netloc, path, parsed.query, ""))


def content_hash(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8", errors="replace")).hexdigest()


def normalize_content(value: str, *, max_chars: int = 200_000) -> str:
    text = str(value or "").replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars]


def deterministic_filter(content: str, *, source_type: str, target: str) -> dict[str, Any]:
    """Run cheap, deterministic gates before any expensive classifier."""
    normalized = normalize_content(content)
    if not normalized:
        return {"decision": "rejected", "reason": "empty_content", "content": ""}
    if len(normalized) < 12 and target != "reference":
        return {"decision": "rejected", "reason": "content_too_short", "content": normalized}

    sanitized = sanitize_model_output(normalized, max_chars=200_000)
    redacted = sanitized.text or normalized
    return {
        "decision": "processing",
        "reason": "content_accepted",
        "content": redacted,
        "redacted": sanitized.action.value == "modify",
        "guardrail_reason": sanitized.reason,
        "source_type": source_type,
    }


def extract_signals(content: str, *, title: str = "", url: str | None = None) -> dict[str, Any]:
    haystack = f"{title}\n{url or ''}\n{content}".casefold()
    topics = sorted(term for term in _TOPIC_TERMS if term in haystack)
    explicit = bool(_EXPLICIT_RE.search(content))
    return {
        "topics": topics,
        "explicit_user_signal": explicit,
        "content_length": len(content),
        "evidence": [{"type": "source", "url": url}] if url else [],
    }


def score_candidate(
    *,
    source_type: str,
    target: str,
    signals: dict[str, Any],
) -> tuple[float, float, str]:
    explicit = bool(signals.get("explicit_user_signal"))
    topics = list(signals.get("topics") or [])
    if target == "reference":
        return 0.35, 0.25, "reference_only"
    if explicit:
        return 0.94, 0.85, "explicit_user_statement"
    if source_type in {"url", "website", "search_result"}:
        confidence = min(0.82, 0.48 + min(len(topics), 5) * 0.06)
        return confidence, 0.45, "external_observation"
    return 0.72, 0.55, "derived_candidate"


def ensure_memory_ingestion_schema(settings: Any) -> None:
    if not postgres_enabled(settings):
        return
    schema_target = str(getattr(settings, "database_url", "") or "default")
    if schema_target in _MEMORY_INGESTION_SCHEMA_READY:
        return
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (MEMORY_INGESTION_SCHEMA_LOCK,))
            cur.execute(
                """
                SELECT (
                    to_regclass('public.memory_ingestion_jobs') IS NOT NULL
                    AND to_regclass('public.memory_ingestion_items') IS NOT NULL
                    AND to_regclass('public.memory_ingestion_events') IS NOT NULL
                    AND to_regclass('public.memory_ingestion_worker_heartbeats') IS NOT NULL
                    AND to_regclass('public.uq_memory_ingestion_idempotency') IS NOT NULL
                    AND to_regclass('public.idx_memory_ingestion_events_job') IS NOT NULL
                    AND to_regclass('public.idx_memory_ingestion_worker_heartbeat_seen') IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'memory_ingestion_jobs'
                          AND column_name = 'next_attempt_at'
                    )
                ) AS ready
                """
            )
            if bool((cur.fetchone() or {}).get("ready")):
                conn.commit()
                _MEMORY_INGESTION_SCHEMA_READY.add(schema_target)
                return
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_ingestion_jobs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    job_kind TEXT NOT NULL DEFAULT 'ingestion',
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tenant_id TEXT, workspace_id TEXT, agent_id TEXT,
                    scope TEXT NOT NULL DEFAULT 'general', provider TEXT NOT NULL,
                    source_type TEXT NOT NULL, source_url TEXT, external_id TEXT,
                    idempotency_key TEXT,
                    status TEXT NOT NULL DEFAULT 'queued', current_stage TEXT NOT NULL DEFAULT 'queued',
                    priority INTEGER NOT NULL DEFAULT 50, attempt_count INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3, lease_owner TEXT, lease_expires_at TIMESTAMPTZ,
                    next_attempt_at TIMESTAMPTZ,
                    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
                    filter_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
                    discovered_items INTEGER NOT NULL DEFAULT 0, candidate_count INTEGER NOT NULL DEFAULT 0,
                    memory_count INTEGER NOT NULL DEFAULT 0, source_version TEXT NOT NULL DEFAULT '1',
                    processor_version TEXT NOT NULL DEFAULT 'memory-compiler-v1', embedding_version TEXT,
                    error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ,
                    completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_ingestion_items (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    job_id UUID NOT NULL REFERENCES memory_ingestion_jobs(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    workspace_id TEXT, agent_id TEXT, source_id TEXT NOT NULL,
                    source_type TEXT NOT NULL, provider TEXT NOT NULL, external_id TEXT,
                    canonical_url TEXT, title TEXT, raw_content TEXT, normalized_content TEXT,
                    content_hash TEXT NOT NULL, source_version TEXT NOT NULL DEFAULT '1',
                    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), valid_from TIMESTAMPTZ,
                    valid_until TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    provenance JSONB NOT NULL DEFAULT '{}'::jsonb, permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
                    extracted JSONB NOT NULL DEFAULT '{}'::jsonb, decision TEXT NOT NULL DEFAULT 'processing',
                    confidence NUMERIC(5,4), importance NUMERIC(5,4), memory_key TEXT,
                    memory_content TEXT, memory_id TEXT, error TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (job_id, source_id, content_hash)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_ingestion_events (
                    id BIGSERIAL PRIMARY KEY,
                    job_id UUID NOT NULL REFERENCES memory_ingestion_jobs(id) ON DELETE CASCADE,
                    item_id UUID REFERENCES memory_ingestion_items(id) ON DELETE CASCADE,
                    stage TEXT NOT NULL, status TEXT NOT NULL, message TEXT,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb, duration_ms NUMERIC(12,2),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_ingestion_idempotency ON memory_ingestion_jobs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''")
            cur.execute("ALTER TABLE memory_ingestion_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_queue ON memory_ingestion_jobs(status, priority DESC, created_at ASC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_owner ON memory_ingestion_jobs(user_id, created_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_items_owner ON memory_ingestion_items(user_id, decision, updated_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_items_hash ON memory_ingestion_items(user_id, content_hash)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_events_job ON memory_ingestion_events(job_id, created_at ASC)")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_ingestion_worker_heartbeats (
                    worker_id TEXT PRIMARY KEY,
                    current_job_id UUID REFERENCES memory_ingestion_jobs(id) ON DELETE SET NULL,
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_ingestion_worker_heartbeat_seen ON memory_ingestion_worker_heartbeats(last_seen_at DESC)")
        conn.commit()
    _MEMORY_INGESTION_SCHEMA_READY.add(schema_target)


def _require_postgres(settings: Any) -> None:
    if not postgres_enabled(settings):
        raise RuntimeError("postgres_required_for_memory_ingestion")


def create_ingestion_job(settings: Any, *, user_id: str, provider: str, source_type: str,
                         source_url: str | None = None, external_id: str | None = None,
                         scope: str = "general", tenant_id: str | None = None,
                         workspace_id: str | None = None, agent_id: str | None = None,
                         key: str | None = None, content: str | None = None,
                         metadata: dict[str, Any] | None = None, target: str = "candidate",
                         discover: bool = False, max_pages: int = 5,
                         idempotency_key: str | None = None, priority: int = 50,
                         source_version: str = "1") -> tuple[dict[str, Any], bool]:
    _require_postgres(settings)
    ensure_memory_ingestion_schema(settings)
    payload = {
        "key": str(key or "").strip()[:120],
        "content": str(content or "")[:200_000],
        "metadata": metadata or {},
        "target": target if target in {"candidate", "reference", "durable"} else "candidate",
        "discover": bool(discover),
        "max_pages": max(1, min(int(max_pages), 20)),
    }
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS count FROM memory_ingestion_jobs WHERE user_id=%s AND status IN ('queued','running')",
                (user_id,),
            )
            if int((cur.fetchone() or {}).get("count") or 0) >= 100:
                raise RuntimeError("ingestion_queue_limit_reached")
            if idempotency_key:
                cur.execute("SELECT * FROM memory_ingestion_jobs WHERE user_id = %s AND idempotency_key = %s", (user_id, idempotency_key[:200]))
                existing = cur.fetchone()
                if existing:
                    return _row(existing) or {}, False
            cur.execute(
                """
                INSERT INTO memory_ingestion_jobs (
                    user_id, tenant_id, workspace_id, agent_id, scope, provider, source_type,
                    source_url, external_id, idempotency_key, request_payload, priority, source_version
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (user_id, idempotency_key)
                    WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
                    DO NOTHING
                RETURNING *
                """,
                (user_id, tenant_id, workspace_id, agent_id, scope[:120], provider[:80], source_type[:80],
                 canonicalize_url(source_url), external_id, idempotency_key[:200] if idempotency_key else None,
                 _json(payload), max(0, min(int(priority), 100)), source_version[:80]),
            )
            row = cur.fetchone()
            if not row and idempotency_key:
                cur.execute(
                    "SELECT * FROM memory_ingestion_jobs WHERE user_id = %s AND idempotency_key = %s",
                    (user_id, idempotency_key[:200]),
                )
                existing = cur.fetchone()
                if existing:
                    conn.rollback()
                    return _row(existing) or {}, False
        conn.commit()
    job = _row(row) or {}
    append_event(settings, job_id=str(job["id"]), stage="queued", status="queued", message="Ingestion job accepted.")
    return job, True


def get_ingestion_job(settings: Any, *, job_id: str, user_id: str, include_items: bool = True) -> dict[str, Any] | None:
    _require_postgres(settings)
    ensure_memory_ingestion_schema(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM memory_ingestion_jobs WHERE id = %s AND user_id = %s", (job_id, user_id))
            job = _row(cur.fetchone())
            if not job:
                return None
            cur.execute("SELECT * FROM memory_ingestion_events WHERE job_id = %s ORDER BY created_at ASC, id ASC", (job_id,))
            job["events"] = [_row(item) for item in cur.fetchall()]
            if include_items:
                cur.execute("SELECT * FROM memory_ingestion_items WHERE job_id = %s ORDER BY created_at ASC", (job_id,))
                job["items"] = [_row(item) for item in cur.fetchall()]
    return job


def _persist_source_snapshot(settings: Any, *, envelope: SourceEnvelope, normalized_content: str, extracted: dict[str, Any]) -> None:
    """Persist URL identity/snapshot data without coupling ingestion to answers.

    Source intelligence already has a canonical source and snapshot model. The
    ingestion queue records the user-owned processing item; this helper records
    the reusable URL identity in that existing model. A missing/older optional
    schema must never make a memory job fail after its item is durable.
    """
    canonical = canonicalize_url(envelope.url)
    if not canonical:
        return
    parsed = urlsplit(canonical)
    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sources (
                        canonical_url, domain, title, source_type, verification,
                        trust_score, trust_components, score_version
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (canonical_url) DO UPDATE SET
                        title=EXCLUDED.title,
                        source_type=EXCLUDED.source_type,
                        verification=EXCLUDED.verification,
                        trust_score=EXCLUDED.trust_score,
                        trust_components=EXCLUDED.trust_components,
                        score_version=EXCLUDED.score_version,
                        updated_at=NOW()
                    RETURNING id
                    """,
                    (
                        canonical,
                        parsed.hostname or "",
                        envelope.title[:500] or canonical,
                        envelope.source_type[:80],
                        _json({"provider": envelope.provider, "observed_at": envelope.observed_at}),
                        50.0,
                        _json({"method": "ingestion", "provider": envelope.provider}),
                        "source-intelligence-v1",
                    ),
                )
                source_row = cur.fetchone() or {}
                source_id = source_row.get("id")
                if source_id is None:
                    return
                cur.execute(
                    """
                    INSERT INTO source_snapshots (
                        source_id, content_hash, title, snippet, retrieved_at,
                        content_text, metadata
                    ) VALUES (%s,%s,%s,%s,NOW(),%s,%s)
                    ON CONFLICT (source_id, content_hash) DO UPDATE SET
                        retrieved_at=EXCLUDED.retrieved_at,
                        title=EXCLUDED.title,
                        snippet=EXCLUDED.snippet,
                        metadata=EXCLUDED.metadata
                    """,
                    (
                        source_id,
                        content_hash(normalized_content),
                        envelope.title[:500],
                        normalized_content[:800],
                        normalized_content[:200_000],
                        _json({"provider": envelope.provider, "provenance": envelope.provenance, "extracted": extracted}),
                    ),
                )
            conn.commit()
    except Exception:
        logger.warning("source_snapshot_persistence_skipped", exc_info=True)


def append_event(settings: Any, *, job_id: str, stage: str, status: str, message: str = "",
                 item_id: str | None = None, payload: dict[str, Any] | None = None,
                 duration_ms: float | None = None) -> None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO memory_ingestion_events (job_id,item_id,stage,status,message,payload,duration_ms) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (job_id, item_id, stage[:80], status[:40], message[:500], _json(payload or {}), duration_ms),
            )
        conn.commit()


def record_worker_heartbeat(settings: Any, *, worker_id: str, current_job_id: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO memory_ingestion_worker_heartbeats (worker_id,current_job_id,last_seen_at,metadata)
                VALUES (%s,%s,NOW(),%s)
                ON CONFLICT (worker_id) DO UPDATE SET
                    current_job_id=EXCLUDED.current_job_id,
                    last_seen_at=NOW(),
                    metadata=EXCLUDED.metadata
                """,
                (worker_id[:160], current_job_id, _json(metadata or {})),
            )
        conn.commit()


def ingestion_worker_is_healthy(settings: Any, *, max_age_seconds: int = 90) -> bool:
    if not postgres_enabled(settings):
        return False
    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT EXISTS (SELECT 1 FROM memory_ingestion_worker_heartbeats WHERE last_seen_at > NOW() - (%s * INTERVAL '1 second')) AS healthy",
                    (max(15, min(int(max_age_seconds), 900)),),
                )
                row = cur.fetchone() or {}
                return bool(row.get("healthy"))
    except Exception:
        return False


def claim_next_ingestion_job(settings: Any, *, lease_owner: str, lease_seconds: int = 120) -> dict[str, Any] | None:
    _require_postgres(settings)
    ensure_memory_ingestion_schema(settings)
    bounded = max(30, min(int(lease_seconds), 900))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH candidate AS (
                    SELECT id FROM memory_ingestion_jobs
                    WHERE (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
                       OR (status = 'running' AND lease_expires_at <= NOW())
                    ORDER BY priority DESC, created_at ASC, id ASC
                    FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE memory_ingestion_jobs AS jobs
                SET status = 'running', current_stage = CASE WHEN jobs.current_stage IN ('queued','requested') THEN 'authorized' ELSE jobs.current_stage END,
                    attempt_count = jobs.attempt_count + 1, lease_owner = %s,
                    lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                    next_attempt_at = NULL,
                    started_at = COALESCE(jobs.started_at, NOW()), updated_at = NOW()
                FROM candidate WHERE jobs.id = candidate.id
                RETURNING jobs.*
                """,
                (lease_owner[:160], bounded),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    result = _row(row) or {}
    append_event(settings, job_id=str(result["id"]), stage=str(result.get("current_stage") or "authorized"), status="running", message="Worker claimed ingestion job.")
    return result


def update_job(settings: Any, *, job_id: str, status: str, stage: str, checkpoint: dict[str, Any] | None = None,
               error: str = "", lease_owner: str | None = None, candidate_count: int | None = None,
               memory_count: int | None = None, discovered_items: int | None = None,
               filter_decisions: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
    _require_postgres(settings)
    if status not in JOB_STATUSES or stage not in STAGES:
        raise ValueError("invalid_memory_ingestion_state")
    terminal = status in {"completed", "failed", "dead_letter", "cancelled"}
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE memory_ingestion_jobs
                SET status=%s, current_stage=%s,
                    checkpoint=CASE WHEN %s::jsonb <> '{}'::jsonb THEN %s::jsonb ELSE checkpoint END,
                    error=CASE WHEN %s <> '' THEN %s ELSE error END,
                    candidate_count=COALESCE(%s,candidate_count), memory_count=COALESCE(%s,memory_count),
                    discovered_items=COALESCE(%s,discovered_items),
                    filter_decisions=CASE WHEN %s::jsonb <> '[]'::jsonb THEN %s::jsonb ELSE filter_decisions END,
                    lease_owner=CASE WHEN %s THEN NULL ELSE lease_owner END,
                    lease_expires_at=CASE WHEN %s THEN NULL ELSE lease_expires_at END,
                    completed_at=CASE WHEN %s THEN NOW() ELSE completed_at END,
                    updated_at=NOW()
                WHERE id=%s AND (%s::text IS NULL OR lease_owner=%s::text)
                RETURNING *
                """,
                (status, stage[:80], _json(checkpoint or {}), _json(checkpoint or {}), error, error[:4000],
                 candidate_count, memory_count, discovered_items, _json(filter_decisions or []), _json(filter_decisions or []),
                 terminal, terminal, terminal, job_id, lease_owner, lease_owner),
            )
            row = cur.fetchone()
        conn.commit()
    return _row(row)


def ingestion_job_is_cancelled(settings: Any, *, job_id: str) -> bool:
    """Read cancellation from PostgreSQL so workers do not rely on local state."""
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM memory_ingestion_jobs WHERE id=%s", (job_id,))
            row = cur.fetchone() or {}
    return str(row.get("status") or "") == "cancelled"


def consolidate_candidate_items(settings: Any, *, job: dict[str, Any]) -> dict[str, int]:
    """Perform a conservative consolidation pass through MemoryCore.

    Exact duplicate observations are collapsed. Existing exact memories are
    recognized as duplicates. Ambiguous updates and contradictions remain
    candidates so a later resolver or the user can review them safely.
    """
    _require_postgres(settings)
    client = MemoryClient(settings)
    duplicate_count = 0
    review_count = 0
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT items.*, jobs.scope, jobs.workspace_id, jobs.agent_id
                FROM memory_ingestion_items items
                JOIN memory_ingestion_jobs jobs ON jobs.id = items.job_id
                WHERE items.job_id = %s AND items.user_id = %s AND items.decision = 'candidate'
                ORDER BY items.confidence DESC NULLS LAST, items.created_at ASC
                """,
                (job["id"], job["user_id"]),
            )
            candidates = [_row(item) or {} for item in cur.fetchall()]

    seen_hashes: set[str] = set()
    for item in candidates:
        digest = str(item.get("content_hash") or "")
        if digest in seen_hashes:
            update_item_decision(settings, item_id=str(item["id"]), user_id=str(job["user_id"]), decision="duplicate")
            duplicate_count += 1
            continue
        seen_hashes.add(digest)
        key = str(item.get("memory_key") or "").strip()
        if not key:
            review_count += 1
            continue
        existing = client.search(
            user_id=str(job["user_id"]),
            scope=str(item.get("scope") or "general"),
            query=key,
            limit=20,
            workspace_id=item.get("workspace_id"),
            agent_id=item.get("agent_id"),
            include_history=True,
        )
        exact = next(
            (record for record in existing
             if str(record.get("key") or record.get("memory_key") or "") == key
             and str(record.get("content") or "") == str(item.get("memory_content") or "")),
            None,
        )
        if exact:
            update_item_decision(
                settings,
                item_id=str(item["id"]),
                user_id=str(job["user_id"]),
                decision="duplicate",
                memory_id=str(exact.get("id") or ""),
            )
            duplicate_count += 1
        elif existing:
            review_count += 1
    return {"duplicates": duplicate_count, "review": review_count, "candidates": len(candidates) - duplicate_count}


def insert_ingestion_item(settings: Any, *, job: dict[str, Any], envelope: SourceEnvelope,
                          raw_content: str, normalized_content: str, extracted: dict[str, Any],
                          decision: str, confidence: float | None, importance: float | None,
                          memory_key: str | None, memory_content: str | None, error: str = "") -> dict[str, Any]:
    _require_postgres(settings)
    item_id = str(uuid4())
    digest = content_hash(normalized_content)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text FROM memory_ingestion_items WHERE user_id=%s AND content_hash=%s AND job_id<>%s AND decision NOT IN ('rejected','expired') LIMIT 1",
                (job["user_id"], digest, job["id"]),
            )
            previous = cur.fetchone()
            if previous and decision not in {"rejected", "duplicate"}:
                decision = "duplicate"
                error = error or f"duplicate_of:{previous['id']}"
            cur.execute(
                """
                INSERT INTO memory_ingestion_items (
                    id, job_id, user_id, workspace_id, agent_id, source_id, source_type, provider,
                    external_id, canonical_url, title, raw_content, normalized_content, content_hash,
                    source_version, metadata, provenance, permissions, extracted, decision, confidence,
                    importance, memory_key, memory_content, error
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (job_id, source_id, content_hash) DO UPDATE SET
                    normalized_content=EXCLUDED.normalized_content, extracted=EXCLUDED.extracted,
                    decision=EXCLUDED.decision, confidence=EXCLUDED.confidence,
                    importance=EXCLUDED.importance, memory_key=EXCLUDED.memory_key,
                    memory_content=EXCLUDED.memory_content, error=EXCLUDED.error, updated_at=NOW()
                RETURNING *
                """,
                (item_id, job["id"], job["user_id"], job.get("workspace_id"), job.get("agent_id"),
                 envelope.source_id, envelope.source_type, envelope.provider, envelope.external_id,
                 canonicalize_url(envelope.url), envelope.title[:500], raw_content[:200_000], normalized_content[:200_000], digest,
                 envelope.source_version, _json(envelope.metadata), _json(envelope.provenance), _json(envelope.permissions),
                 _json(extracted), decision, confidence, importance, memory_key, memory_content, error[:4000]),
            )
            row = cur.fetchone()
        conn.commit()
    result = _row(row) or {}
    _persist_source_snapshot(settings, envelope=envelope, normalized_content=normalized_content, extracted=extracted)
    append_event(settings, job_id=str(job["id"]), item_id=str(result.get("id") or item_id), stage="routed", status=decision, message=f"Source routed to {decision}.", payload={"confidence": confidence, "source_id": envelope.source_id})
    return result


def renew_ingestion_lease(settings: Any, *, job_id: str, lease_owner: str, lease_seconds: int = 180) -> bool:
    _require_postgres(settings)
    bounded = max(30, min(int(lease_seconds), 900))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE memory_ingestion_jobs SET lease_expires_at=NOW()+(%s * INTERVAL '1 second'), updated_at=NOW() WHERE id=%s AND lease_owner=%s AND status='running'",
                (bounded, job_id, lease_owner[:160]),
            )
            renewed = cur.rowcount == 1
        conn.commit()
    return renewed


def schedule_ingestion_retry(settings: Any, *, job_id: str, lease_owner: str, error: str, delay_seconds: int) -> dict[str, Any] | None:
    _require_postgres(settings)
    delay = max(1, min(int(delay_seconds), 900))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE memory_ingestion_jobs SET status='queued', current_stage='queued', error=%s, next_attempt_at=NOW()+(%s * INTERVAL '1 second'), lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW() WHERE id=%s AND lease_owner=%s RETURNING *",
                (error[:4000], delay, job_id, lease_owner[:160]),
            )
            row = cur.fetchone()
        conn.commit()
    return _row(row)


def list_job_items(settings: Any, *, job_id: str, user_id: str) -> list[dict[str, Any]]:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM memory_ingestion_items WHERE job_id=%s AND user_id=%s ORDER BY created_at ASC", (job_id, user_id))
            return [_row(item) or {} for item in cur.fetchall()]


def update_item_decision(settings: Any, *, item_id: str, user_id: str, decision: str, memory_id: str | None = None) -> dict[str, Any] | None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE memory_ingestion_items SET decision=%s, memory_id=COALESCE(%s,memory_id), updated_at=NOW() WHERE id=%s AND user_id=%s RETURNING *", (decision, memory_id, item_id, user_id))
            row = cur.fetchone()
        conn.commit()
    return _row(row) or None


def approve_ingestion_item(settings: Any, *, item_id: str, user_id: str) -> dict[str, Any] | None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT items.*, jobs.scope, jobs.provider, jobs.workspace_id, jobs.agent_id FROM memory_ingestion_items items JOIN memory_ingestion_jobs jobs ON jobs.id=items.job_id WHERE items.id=%s AND items.user_id=%s FOR UPDATE", (item_id, user_id))
            row = cur.fetchone()
    if not row:
        return None
    item = _row(row) or {}
    if str(item.get("decision") or "") != "candidate":
        raise ValueError("memory_candidate_not_approvable")
    key = str(item.get("memory_key") or f"memory_{str(item_id)[:12]}")[:120]
    content = str(item.get("memory_content") or item.get("normalized_content") or "")[:4000]
    if not content:
        raise ValueError("memory_candidate_empty")
    client = MemoryClient(settings)
    client.remember(user_id=user_id, scope=str(item.get("scope") or "general"), key=key, content=content,
                    source=f"ingestion:{item.get('provider') or 'source'}", workspace_id=item.get("workspace_id"),
                    agent_id=item.get("agent_id"), confidence=float(item.get("confidence") or 0.75))
    memory_id = f"profile:{client._storage_scope(str(item.get('scope') or 'general'), workspace_id=item.get('workspace_id'), agent_id=item.get('agent_id'))}:{key}"
    return update_item_decision(settings, item_id=item_id, user_id=user_id, decision="approved", memory_id=memory_id)


def retry_ingestion_job(settings: Any, *, job_id: str, user_id: str) -> dict[str, Any] | None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE memory_ingestion_jobs SET status='queued', current_stage='queued', attempt_count=0, error=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW() WHERE id=%s AND user_id=%s AND status IN ('failed','dead_letter') RETURNING *", (job_id, user_id))
            row = cur.fetchone()
        conn.commit()
    if row:
        append_event(settings, job_id=job_id, stage="queued", status="retry", message="Ingestion retry requested.")
    return _row(row) or None


def cancel_ingestion_job(settings: Any, *, job_id: str, user_id: str) -> dict[str, Any] | None:
    _require_postgres(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE memory_ingestion_jobs SET status='cancelled', current_stage='cancelled', lease_owner=NULL, lease_expires_at=NULL, completed_at=NOW(), updated_at=NOW() WHERE id=%s AND user_id=%s AND status IN ('queued','running') RETURNING *", (job_id, user_id))
            row = cur.fetchone()
        conn.commit()
    if row:
        append_event(settings, job_id=job_id, stage="cancelled", status="cancelled", message="Ingestion cancelled.")
    return _row(row) or None


async def retrieve_job_sources(job: dict[str, Any]) -> list[SourceEnvelope]:
    payload = job.get("request_payload") or {}
    source_type = str(job.get("source_type") or "text")
    provider = str(job.get("provider") or "manual")
    observed = _now().isoformat()
    if source_type in {"text", "note", "memory", "browser", "browser_snapshot", "web_capture"}:
        content = str(payload.get("content") or "")
        return [SourceEnvelope(
            source_id=f"{provider}:text:{content_hash(content)[:24]}", source_type=source_type,
            provider=provider, external_id=str(job.get("external_id") or "") or None,
            url=None, title=str(payload.get("key") or "Memory input"), content=content,
            metadata=dict(payload.get("metadata") or {}),
            provenance={"kind": "browser_orchestration" if source_type in {"browser", "browser_snapshot", "web_capture"} else "direct_input"},
            permissions={"user_id": str(job.get("user_id"))}, observed_at=observed,
        )]
    if source_type in {"url", "website", "search_result"}:
        url = str(job.get("source_url") or "").strip()
        if not url:
            raise ValueError("source_url_required")
        discover = bool(payload.get("discover"))
        max_pages = max(1, min(int(payload.get("max_pages") or 5), 20))
        if discover and max_pages > 1:
            result = await crawl_site(url, max_pages=max_pages)
            pages = result.get("pages") if isinstance(result, dict) else []
            envelopes = []
            for index, page in enumerate(pages if isinstance(pages, list) else []):
                if not isinstance(page, dict):
                    continue
                page_url = str(page.get("url") or url)
                content = str(page.get("text") or "")
                envelopes.append(SourceEnvelope(
                    source_id=f"{provider}:url:{content_hash(canonicalize_url(page_url) or page_url)[:24]}",
                    source_type="website", provider=provider, external_id=None, url=page_url,
                    title=str(page.get("title") or page_url), content=content,
                    metadata={"crawl_index": index, "start_url": url},
                    provenance={"kind": "amancrawl", "operation": "crawl", "start_url": url},
                    permissions={"user_id": str(job.get("user_id"))}, observed_at=observed,
                ))
            if envelopes:
                return envelopes
        result = await scrape_url(url, formats=["markdown", "text"])
        content = str(result.get("markdown") or result.get("text") or "")
        return [SourceEnvelope(
            source_id=f"{provider}:url:{content_hash(canonicalize_url(url) or url)[:24]}",
            source_type=source_type, provider=str(result.get("provider") or provider), external_id=None,
            url=str(result.get("url") or url), title=str(result.get("title") or url), content=content,
            metadata={"description": result.get("description"), "status_code": result.get("status_code"), "provider_label": result.get("provider_label")},
            provenance={"kind": "amancrawl", "operation": "scrape", "requested_url": url},
            permissions={"user_id": str(job.get("user_id"))}, observed_at=observed,
        )]
    if source_type in {"file", "document", "artifact", "pdf"}:
        payload_metadata = dict(payload.get("metadata") or {})
        artifact_id = str(job.get("external_id") or payload_metadata.get("artifact_id") or "").strip()
        if not artifact_id:
            raise ValueError("artifact_id_required")
        settings = get_settings()
        artifact = await asyncio.to_thread(
            get_artifact_for_user,
            settings,
            artifact_id=artifact_id,
            user_id=str(job.get("user_id")),
        )
        if not artifact:
            raise ValueError("artifact_not_found")
        uploads_dir = get_uploads_dir(settings.uploads_dir).resolve()
        path = (uploads_dir.parent / str(artifact.get("storage_path") or "")).resolve()
        if uploads_dir not in path.parents or not path.is_file():
            raise ValueError("artifact_file_not_found")
        extracted = await asyncio.to_thread(extract_artifact_text, Path(path))
        pages = extracted.get("pages") if isinstance(extracted, dict) else []
        content = "\n\n".join(str(page.get("text") or "") for page in pages if isinstance(page, dict)).strip()
        if not content:
            raise ValueError("artifact_has_no_extractable_text")
        title = str(artifact.get("title") or artifact.get("filename") or artifact_id)
        return [SourceEnvelope(
            source_id=f"{provider}:artifact:{artifact_id}", source_type=source_type,
            provider=provider, external_id=artifact_id, url=None, title=title,
            content=content, metadata={"artifact_id": artifact_id, "filename": artifact.get("filename"), "page_count": extracted.get("page_count")},
            provenance={"kind": "document_pipeline", "artifact_id": artifact_id},
            permissions={"user_id": str(job.get("user_id"))}, observed_at=observed,
        )]
    raise ValueError(f"source_adapter_not_registered:{source_type}")


async def process_ingestion_job(settings: Any, job: dict[str, Any], *, lease_owner: str) -> dict[str, Any]:
    job_id = str(job["id"])
    try:
        checkpoint = job.get("checkpoint") or {}
        resume_stage = str(checkpoint.get("stage") or "")
        if ingestion_job_is_cancelled(settings, job_id=job_id):
            raise IngestionCancelled()
        if not resume_stage:
            update_job(settings, job_id=job_id, status="running", stage="authorized", checkpoint={"stage": "authorized"}, lease_owner=lease_owner)
        resumed_items: list[dict[str, Any]] = []
        if resume_stage in {"routed", "related"}:
            envelopes = []
            resumed_items = list_job_items(settings, job_id=job_id, user_id=str(job["user_id"]))
            update_job(settings, job_id=job_id, status="running", stage="fetched", checkpoint={"stage": "fetched", "resumed": True, "source_count": len(resumed_items)}, lease_owner=lease_owner, discovered_items=len(resumed_items))
        else:
            update_job(settings, job_id=job_id, status="running", stage="discovering", checkpoint={"stage": "discovering"}, lease_owner=lease_owner)
            envelopes = await retrieve_job_sources(job)
            if ingestion_job_is_cancelled(settings, job_id=job_id):
                raise IngestionCancelled()
            update_job(settings, job_id=job_id, status="running", stage="fetched", checkpoint={"stage": "fetched", "source_count": len(envelopes)}, lease_owner=lease_owner, discovered_items=len(envelopes))
        target = str((job.get("request_payload") or {}).get("target") or "candidate")
        decisions: list[dict[str, Any]] = []
        candidates = 0
        memories = 0
        if resumed_items:
            decisions = [
                {
                    "source_id": item.get("source_id"),
                    "decision": item.get("decision"),
                    "confidence": item.get("confidence"),
                    "item_id": item.get("id"),
                }
                for item in resumed_items
            ]
            candidates = sum(1 for item in resumed_items if item.get("decision") == "candidate")
        for envelope in envelopes:
            if ingestion_job_is_cancelled(settings, job_id=job_id):
                raise IngestionCancelled()
            gate = deterministic_filter(envelope.content, source_type=envelope.source_type, target=target)
            if gate["decision"] == "rejected":
                insert_ingestion_item(settings, job=job, envelope=envelope, raw_content=envelope.content,
                                      normalized_content=gate["content"], extracted={"filter": gate},
                                      decision="rejected", confidence=0.0, importance=0.0,
                                      memory_key=None, memory_content=None, error=gate["reason"])
                decisions.append({"source_id": envelope.source_id, "decision": "rejected", "reason": gate["reason"]})
                update_job(
                    settings,
                    job_id=job_id,
                    status="running",
                    stage="routed",
                    checkpoint={"stage": "routed", "completed_source_ids": [item["source_id"] for item in decisions]},
                    lease_owner=lease_owner,
                )
                continue
            normalized = gate["content"]
            signals = extract_signals(normalized, title=envelope.title, url=envelope.url)
            confidence, importance, reason = score_candidate(source_type=envelope.source_type, target=target, signals=signals)
            memory_key = str((job.get("request_payload") or {}).get("key") or envelope.title or f"source_{content_hash(normalized)[:12]}")[:120]
            memory_content = normalized[:4000]
            decision = "reference" if target == "reference" else "candidate"
            item = insert_ingestion_item(settings, job=job, envelope=envelope, raw_content=envelope.content,
                                         normalized_content=normalized, extracted={"filter": gate, "signals": signals, "classification_reason": reason},
                                         decision=decision, confidence=confidence, importance=importance,
                                         memory_key=memory_key, memory_content=memory_content)
            if target == "durable" and str(item.get("decision") or "") == "candidate":
                item = approve_ingestion_item(settings, item_id=str(item["id"]), user_id=str(job["user_id"])) or item
                decision = str(item.get("decision") or "approved")
                if decision == "approved":
                    memories += 1
            if decision == "candidate":
                candidates += 1
            decisions.append({"source_id": envelope.source_id, "decision": decision, "confidence": confidence, "reason": reason, "item_id": str(item.get("id") or "")})
            update_job(
                settings,
                job_id=job_id,
                status="running",
                stage="routed",
                checkpoint={"stage": "routed", "completed_source_ids": [item["source_id"] for item in decisions]},
                lease_owner=lease_owner,
            )
        if ingestion_job_is_cancelled(settings, job_id=job_id):
            raise IngestionCancelled()
        update_job(settings, job_id=job_id, status="running", stage="routed", checkpoint={"stage": "routed", "items": len(decisions)}, lease_owner=lease_owner, candidate_count=candidates, memory_count=memories, filter_decisions=decisions)
        update_job(settings, job_id=job_id, status="running", stage="related", checkpoint={"stage": "related"}, lease_owner=lease_owner)
        consolidation = await asyncio.to_thread(consolidate_candidate_items, settings, job=job)
        candidates = int(consolidation.get("candidates") or 0)
        append_event(settings, job_id=job_id, stage="related", status="completed", message="Conservative consolidation completed.", payload=consolidation)
        final_status = "candidate_ready" if candidates else "completed"
        final_stage = "candidate_ready" if candidates else "completed"
        result = update_job(settings, job_id=job_id, status=final_status, stage=final_stage, checkpoint={"stage": final_stage, "items": len(decisions)}, lease_owner=lease_owner, candidate_count=candidates, memory_count=memories, filter_decisions=decisions)
        append_event(settings, job_id=job_id, stage=final_stage, status=final_status, message="Memory ingestion completed.", payload={"items": len(decisions), "candidates": candidates})
        return result or {}
    except IngestionCancelled:
        logger.info("memory_ingestion_cancelled", extra={"job_id": job_id})
        return get_ingestion_job(settings, job_id=job_id, user_id=str(job["user_id"]), include_items=True) or {}
    except Exception as exc:
        logger.exception("memory_ingestion_failed", extra={"job_id": job_id})
        attempts = int(job.get("attempt_count") or 1)
        if attempts < int(job.get("max_attempts") or 3):
            status = "queued"
            result = schedule_ingestion_retry(settings, job_id=job_id, lease_owner=lease_owner, error=str(exc), delay_seconds=2 ** max(0, attempts - 1))
            append_event(settings, job_id=job_id, stage="failed", status="retry_scheduled", message=str(exc), payload={"attempt": attempts, "retry_in_seconds": 2 ** max(0, attempts - 1)})
        else:
            status = "dead_letter"
            result = update_job(settings, job_id=job_id, status=status, stage="failed", checkpoint={"stage": "failed"}, error=str(exc), lease_owner=lease_owner)
            append_event(settings, job_id=job_id, stage="failed", status=status, message=str(exc))
        return result or {}
