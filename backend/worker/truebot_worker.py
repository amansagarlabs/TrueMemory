"""Run from backend/: python -m worker.truebot_worker [--once]."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from dotenv import load_dotenv

from app.config import get_settings
from services.postgres_store import postgres_enabled
from services.truebot_runtime import execute_run
from services.truebot_store import TrueBotStore


async def serve(settings, *, once=False):
    if not settings.truebot_enabled or not postgres_enabled(settings) or not settings.openai_api_key or not settings.truebot_models:
        raise RuntimeError("Worker requires TRUEBOT_ENABLED, PostgreSQL, OPENAI_API_KEY and TRUEBOT_OPENAI_MODELS")
    store = TrueBotStore(settings)
    await asyncio.to_thread(store.check_schema)
    async def heartbeat_loop():
        while True:
            try:
                await asyncio.to_thread(store.heartbeat)
            except Exception:
                logging.getLogger("truebot.worker").error("Worker heartbeat storage unavailable; retrying.")
            await asyncio.sleep(10)
    heartbeat = asyncio.create_task(heartbeat_loop())
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    try:
        while not stop.is_set():
            try:
                run = await asyncio.to_thread(store.claim)
                if run:
                    await execute_run(settings, store, run)
                elif not once:
                    try:
                        await asyncio.wait_for(stop.wait(), timeout=2)
                    except TimeoutError:
                        pass
                if once:
                    return
            except Exception:
                logging.getLogger("truebot.worker").error("Worker storage unavailable; retrying without replaying active executions.")
                if once:
                    raise
                try:
                    await asyncio.wait_for(stop.wait(), timeout=5)
                except TimeoutError:
                    pass
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="TrueBot durable execution worker")
    parser.add_argument("--once", action="store_true", help="Process at most one job, then exit")
    args = parser.parse_args()
    asyncio.run(serve(get_settings(), once=args.once))


if __name__ == "__main__":
    main()
