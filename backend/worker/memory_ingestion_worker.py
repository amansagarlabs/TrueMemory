"""Durable worker for universal memory ingestion."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket

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


async def run_worker(*, poll_interval: float = 1.0, once: bool = False) -> None:
    settings = get_settings()
    if not postgres_enabled(settings):
        raise RuntimeError("PostgreSQL is required for the memory ingestion worker.")
    await asyncio.to_thread(ensure_memory_ingestion_schema, settings)
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(6)}"
    logger.info("memory_ingestion_worker_started worker_id=%s", worker_id)
    while True:
        await asyncio.to_thread(record_worker_heartbeat, settings, worker_id=worker_id)
        job = await asyncio.to_thread(
            claim_next_ingestion_job,
            settings,
            lease_owner=worker_id,
            lease_seconds=180,
        )
        if job:
            heartbeat = asyncio.create_task(_renew_loop(settings, job_id=str(job["id"]), worker_id=worker_id))
            try:
                await process_ingestion_job(settings, job, lease_owner=worker_id)
            finally:
                heartbeat.cancel()
                await asyncio.gather(heartbeat, return_exceptions=True)
                await asyncio.to_thread(record_worker_heartbeat, settings, worker_id=worker_id)
        elif once:
            return
        else:
            await asyncio.sleep(max(0.2, min(float(poll_interval), 30.0)))


if __name__ == "__main__":
    asyncio.run(run_worker())
