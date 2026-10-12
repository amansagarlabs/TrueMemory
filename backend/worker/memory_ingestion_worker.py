"""Durable worker for universal memory ingestion."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import secrets
import socket
import time

from app.config import get_settings
from services.memory_ingestion import (
    claim_next_ingestion_job,
    ensure_memory_ingestion_schema,
    record_worker_heartbeat,
    process_ingestion_job,
    renew_ingestion_lease,
)
from services.postgres_store import postgres_enabled


logger = logging.getLogger("truememory.memory_ingestion_worker")


async def _renew_loop(settings, *, job_id: str, worker_id: str) -> None:
    while True:
        await asyncio.sleep(45)
        renewed, _ = await asyncio.gather(
            asyncio.to_thread(
                renew_ingestion_lease,
                settings,
                job_id=job_id,
                lease_owner=worker_id,
                lease_seconds=180,
            ),
            asyncio.to_thread(record_worker_heartbeat, settings, worker_id=worker_id, current_job_id=job_id),
        )
        if not renewed:
            return


async def run_worker(
    *,
    poll_interval: float = 1.0,
    once: bool = False,
    max_jobs: int | None = None,
    max_runtime_seconds: float | None = None,
) -> None:
    if max_jobs is not None and max_jobs < 1:
        raise ValueError("max_jobs must be at least 1")
    if max_runtime_seconds is not None and max_runtime_seconds <= 0:
        raise ValueError("max_runtime_seconds must be greater than 0")

    settings = get_settings()
    if not postgres_enabled(settings):
        raise RuntimeError("PostgreSQL is required for the memory ingestion worker.")
    await asyncio.to_thread(ensure_memory_ingestion_schema, settings)
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(6)}"
    logger.info("memory_ingestion_worker_started worker_id=%s", worker_id)
    started_at = time.monotonic()
    jobs_seen = 0
    jobs_claimed = 0
    jobs_completed = 0
    jobs_failed = 0

    def report_batch(reason: str) -> None:
        logger.info(
            "memory_ingestion_worker_batch_complete reason=%s jobs_seen=%d jobs_claimed=%d jobs_completed=%d jobs_failed=%d duration_seconds=%.3f",
            reason,
            jobs_seen,
            jobs_claimed,
            jobs_completed,
            jobs_failed,
            time.monotonic() - started_at,
        )

    while True:
        if max_jobs is not None and jobs_claimed >= max_jobs:
            report_batch("max_jobs")
            return
        if max_runtime_seconds is not None and time.monotonic() - started_at >= max_runtime_seconds:
            report_batch("max_runtime")
            return
        await asyncio.to_thread(record_worker_heartbeat, settings, worker_id=worker_id)
        job = await asyncio.to_thread(
            claim_next_ingestion_job,
            settings,
            lease_owner=worker_id,
            lease_seconds=180,
        )
        if job:
            jobs_seen += 1
            jobs_claimed += 1
            job_id = str(job.get("id") or "")
            heartbeat = asyncio.create_task(_renew_loop(settings, job_id=str(job["id"]), worker_id=worker_id))
            try:
                result = await process_ingestion_job(settings, job, lease_owner=worker_id)
                if str((result or {}).get("status") or "") in {"failed", "dead_letter"}:
                    jobs_failed += 1
                else:
                    jobs_completed += 1
                logger.info(
                    "memory_ingestion_worker_job_complete job_id=%s status=%s",
                    job_id,
                    str((result or {}).get("status") or "unknown"),
                )
            except Exception:
                jobs_failed += 1
                logger.exception("memory_ingestion_worker_job_error job_id=%s", job_id)
                raise
            finally:
                heartbeat.cancel()
                await asyncio.gather(heartbeat, return_exceptions=True)
                await asyncio.to_thread(record_worker_heartbeat, settings, worker_id=worker_id)
        elif once:
            report_batch("queue_empty")
            return
        else:
            await asyncio.sleep(max(0.2, min(float(poll_interval), 30.0)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process durable memory ingestion jobs.")
    parser.add_argument("--once", action="store_true", help="Exit when the queue is empty.")
    parser.add_argument("--max-jobs", type=int, help="Stop after processing at most this many jobs.")
    parser.add_argument(
        "--max-runtime",
        type=float,
        help="Stop claiming new jobs after this many seconds; an active job is allowed to finish.",
    )
    args = parser.parse_args()
    asyncio.run(
        run_worker(
            once=args.once,
            max_jobs=args.max_jobs,
            max_runtime_seconds=args.max_runtime,
        )
    )
