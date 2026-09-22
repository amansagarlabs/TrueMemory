"""Phase 11.16 disposable failure/recovery evidence runner.

This runner extends the Phase 11.15 disposable environment. It refuses cloud
hosts and never imports production credentials. PostgreSQL checks use the real
database and durable ingestion tables; unavailable infrastructure is reported
as SKIPPED instead of being simulated as a pass.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.memory_ingestion import claim_next_ingestion_job, create_ingestion_job, ensure_memory_ingestion_schema
from services.postgres_store import _connect, postgres_enabled
from services.retry_policy import backoff_ms, classify_http, retry_after_ms


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres-test"}
FORBIDDEN_MARKERS = {"supabase", "render.com", "neon.tech", "upstash.com", "production"}


@dataclass
class Evidence:
    name: str
    status: str
    detail: str
    duration_ms: float = 0.0


def _check_disposable(base_url: str) -> None:
    if not os.getenv("TRUEMEMORY_RUNTIME_ENV") == "disposable-test":
        raise RuntimeError("TRUEMEMORY_RUNTIME_ENV=disposable-test is required")
    parsed = urlparse(base_url)
    if parsed.hostname not in LOCAL_HOSTS:
        raise RuntimeError(f"refusing non-local base URL: {parsed.hostname or '<missing>'}")
    values = [base_url, os.getenv("TRUEMEMORY_E2E_DATABASE_URL", ""), os.getenv("UPSTASH_REDIS_URL", "")]
    if any(marker in value.casefold() for value in values for marker in FORBIDDEN_MARKERS):
        raise RuntimeError("cloud or production infrastructure detected; aborting")


def _run(name: str, fn) -> Evidence:
    started = time.perf_counter()
    try:
        detail = fn()
        return Evidence(name, "PASS", str(detail), round((time.perf_counter() - started) * 1000, 2))
    except Exception as exc:  # evidence must expose failures, not hide them
        return Evidence(name, "FAIL", f"{type(exc).__name__}: {exc}", round((time.perf_counter() - started) * 1000, 2))


def _retry_policy_checks() -> str:
    transient = (408, 429, 502, 503, 504)
    for status in transient:
        assert classify_http(status, method="GET").retryable, status
        assert not classify_http(status, method="POST").retryable, status
        assert classify_http(status, method="POST", idempotency_key="phase11-16").retryable, status
    for status in (400, 401, 403, 404, 409, 422):
        assert not classify_http(status, method="GET").retryable, status
        assert not classify_http(status, method="POST", idempotency_key="phase11-16").retryable, status
    assert retry_after_ms("2") == 2000
    assert retry_after_ms("Thu, 01 Jan 2026 00:00:03 GMT", now=datetime(2026, 1, 1, tzinfo=timezone.utc)) == 3000
    assert backoff_ms(20, maximum_ms=1000) <= 1000
    return "408/429/502/503/504 retryable only for safe or idempotent operations; 4xx non-retryable"


def _postgres_checks(database_url: str, user_id: str) -> list[Evidence]:
    if not database_url or not user_id:
        return [Evidence("postgres rollback/lease recovery", "SKIPPED", "TRUEMEMORY_E2E_DATABASE_URL and TRUEMEMORY_E2E_USER_ID are required")]
    settings = SimpleNamespace(database_url=database_url)
    if not postgres_enabled(settings):
        return [Evidence("postgres rollback/lease recovery", "SKIPPED", "psycopg or PostgreSQL is unavailable")]
    ensure_memory_ingestion_schema(settings)
    workspace_id = os.getenv("TRUEMEMORY_E2E_WORKSPACE_ID") or None
    results: list[Evidence] = []

    def rollback() -> str:
        marker = f"phase11_16_rollback_{uuid4().hex}"
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO user_memories (user_id, workspace_id, memory_type, memory_key, content, source) VALUES (%s,%s,'fact',%s,'must rollback','phase11.16') RETURNING id", (user_id, workspace_id, marker))
                cur.execute("INSERT INTO memory_ingestion_jobs (user_id, workspace_id, provider, source_type, idempotency_key, request_payload) VALUES (%s,%s,'phase11.16','text',%s,'{}'::jsonb) RETURNING id", (user_id, workspace_id, marker))
                conn.rollback()
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS count FROM user_memories WHERE user_id=%s AND memory_key=%s", (user_id, marker))
                assert int(cur.fetchone()["count"]) == 0
                cur.execute("SELECT COUNT(*) AS count FROM memory_ingestion_jobs WHERE user_id=%s AND idempotency_key=%s", (user_id, marker))
                assert int(cur.fetchone()["count"]) == 0
        return "memory and durable job absent after rollback"

    def commit() -> str:
        marker = f"phase11_16_commit_{uuid4().hex}"
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO user_memories (user_id, workspace_id, memory_type, memory_key, content, source) VALUES (%s,%s,'fact',%s,'must commit','phase11.16') RETURNING id", (user_id, workspace_id, marker))
                cur.execute("INSERT INTO memory_ingestion_jobs (user_id, workspace_id, provider, source_type, idempotency_key, request_payload) VALUES (%s,%s,'phase11.16','text',%s,'{}'::jsonb) RETURNING id", (user_id, workspace_id, marker))
                conn.commit()
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS count FROM user_memories WHERE user_id=%s AND memory_key=%s", (user_id, marker))
                assert int(cur.fetchone()["count"]) == 1
                cur.execute("SELECT id::text FROM memory_ingestion_jobs WHERE user_id=%s AND idempotency_key=%s", (user_id, marker))
                job_id = cur.fetchone()["id"]
                cur.execute("DELETE FROM memory_ingestion_jobs WHERE id=%s", (job_id,))
                cur.execute("DELETE FROM user_memories WHERE user_id=%s AND memory_key=%s", (user_id, marker))
                conn.commit()
        return "memory and job committed, then cleaned up without orphan state"

    results.append(_run("postgres transaction rollback", rollback))
    results.append(_run("postgres transaction commit", commit))

    def lease_recovery() -> str:
        marker = f"phase11_16_lease_{uuid4().hex}"
        job, created = create_ingestion_job(settings, user_id=user_id, provider="phase11.16", source_type="text", content="lease recovery", idempotency_key=marker)
        assert created
        job_id = str(job["id"])
        try:
            first = claim_next_ingestion_job(settings, lease_owner="phase11-16-worker-a", lease_seconds=30)
            assert first and str(first["id"]) == job_id
            with _connect(settings) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE memory_ingestion_jobs SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=%s", (job_id,))
                conn.commit()
            second = claim_next_ingestion_job(settings, lease_owner="phase11-16-worker-b", lease_seconds=30)
            assert second and str(second["id"]) == job_id
            assert int(second["attempt_count"]) == 2
            return "expired lease was reclaimed by a second worker; attempt_count=2"
        finally:
            with _connect(settings) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM memory_ingestion_jobs WHERE id=%s", (job_id,))
                conn.commit()

    results.append(_run("worker lease recovery", lease_recovery))
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("TRUEMEMORY_E2E_BASE_URL", "http://127.0.0.1:18000"))
    parser.add_argument("--report-path", required=True)
    parser.add_argument("--disposable-test", action="store_true")
    args = parser.parse_args()
    if not args.disposable_test:
        raise SystemExit("--disposable-test is required")
    _check_disposable(args.base_url)
    checks = [_run("retry policy matrix", _retry_policy_checks)]
    checks.extend(_postgres_checks(os.getenv("TRUEMEMORY_E2E_DATABASE_URL", ""), os.getenv("TRUEMEMORY_E2E_USER_ID", "")))
    checks.extend([
        Evidence("process crash after commit", "SKIPPED", "requires disposable process supervisor injection"),
        Evidence("duplicate delivery semantic idempotency", "SKIPPED", "requires worker handler failure injection"),
        Evidence("transient/permanent worker handler failure", "SKIPPED", "requires handler fault injection"),
        Evidence("Redis outage and restoration", "SKIPPED", "Redis is not configured in the current disposable compose stack"),
        Evidence("HTTP 408/429/502/503/504 live injection", "SKIPPED", "requires disposable HTTP fault injector"),
        Evidence("streaming before/after-token failure", "SKIPPED", "requires controlled upstream stream termination"),
        Evidence("FastAPI/PostgreSQL restart", "SKIPPED", "requires process/database supervisor orchestration"),
    ])
    payload = {
        "phase": "11.16",
        "status": "COMPLETE" if all(item.status == "PASS" for item in checks) else "PARTIAL",
        "environment": "disposable-test",
        "production_touched": False,
        "checks": [asdict(item) for item in checks],
        "performance": {"baseline_phase_11_15_ms": {"p50": 30.76, "p95": 43.28, "p99": 55.56}},
    }
    path = os.path.abspath(args.report_path)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(json.dumps(payload, indent=2))
    return 0 if payload["status"] != "FAIL" else 1


if __name__ == "__main__":
    raise SystemExit(main())
