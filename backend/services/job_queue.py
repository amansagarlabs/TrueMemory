"""Provider-neutral dispatch boundary for durable PostgreSQL-backed jobs.

PostgreSQL job rows remain authoritative. Queue adapters only transport a job
ID/payload reference after the durable row exists; they must never be required
for a synchronous memory write to succeed.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import uuid4


@dataclass(frozen=True)
class JobEnvelope:
    job_id: str = field(default_factory=lambda: str(uuid4()))
    job_type: str = "memory_ingestion"
    payload_ref: dict[str, str] = field(default_factory=dict)
    idempotency_key: str = ""
    run_id: str | None = None
    request_id: str | None = None
    user_id: str | None = None
    workspace_id: str | None = None
    agent_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class JobQueue(Protocol):
    async def enqueue(self, job: JobEnvelope) -> str: ...


class InMemoryJobQueue:
    """Test-only transport; never a production durability mechanism."""

    def __init__(self) -> None:
        self.jobs: list[JobEnvelope] = []

    async def enqueue(self, job: JobEnvelope) -> str:
        if job.idempotency_key and any(existing.idempotency_key == job.idempotency_key for existing in self.jobs):
            return job.job_id
        self.jobs.append(job)
        return job.job_id


class UpstashRedisQueue:
    """Optional Upstash REST transport. Durable state remains in PostgreSQL."""

    def __init__(self, *, url: str, token: str, stream: str = "truememory:jobs") -> None:
        self.url = url.rstrip("/")
        self.token = token
        self.stream = stream

    async def enqueue(self, job: JobEnvelope) -> str:
        import httpx

        response = await self._request("XADD", self.stream, "*", "job_id", job.job_id, "job_type", job.job_type)
        response.raise_for_status()
        return job.job_id

    async def _request(self, *parts: str) -> httpx.Response:
        import httpx

        async with httpx.AsyncClient(timeout=8.0) as client:
            return await client.post(self.url, headers={"Authorization": f"Bearer {self.token}"}, json=list(parts))


def queue_from_settings(settings: Any) -> JobQueue | None:
    """Return an optional transport; None means PostgreSQL-only recovery mode."""
    url = str(getattr(settings, "upstash_redis_url", "") or "").strip()
    token = str(getattr(settings, "upstash_redis_token", "") or "").strip()
    if not url or not token:
        return None
    return UpstashRedisQueue(url=url, token=token, stream=str(getattr(settings, "async_job_stream", "truememory:jobs")))
