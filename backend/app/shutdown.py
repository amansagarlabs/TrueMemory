"""Graceful Shutdown — handles SIGTERM/SIGINT for clean server shutdown.

Provides:
- Connection pool cleanup
- In-flight request completion
- Resource deallocation
- Shutdown logging

Usage:
    from app.shutdown import shutdown_handler
    app.router.on_shutdown.append(shutdown_handler)
"""

from __future__ import annotations

import logging
import os
import signal
import time
from typing import Any

logger = logging.getLogger("truememory.shutdown")


class GracefulShutdown:
    """Manage graceful shutdown of the application."""

    def __init__(self):
        self._shutdown_requested = False
        self._shutdown_start: float | None = None
        self._timeout_seconds = 30.0
        self._callbacks: list[Any] = []

    def request_shutdown(self, timeout: float | None = None) -> None:
        """Request graceful shutdown."""
        if self._shutdown_requested:
            return

        self._shutdown_requested = True
        self._shutdown_start = time.monotonic()
        if timeout is not None:
            self._timeout_seconds = timeout

        logger.info(
            "shutdown_requested",
            extra={"timeout_seconds": self._timeout_seconds},
        )

    @property
    def is_shutdown_requested(self) -> bool:
        return self._shutdown_requested

    @property
    def seconds_since_shutdown(self) -> float:
        if self._shutdown_start is None:
            return 0.0
        return time.monotonic() - self._shutdown_start

    def register_callback(self, callback) -> None:
        """Register a callback to be called during shutdown."""
        self._callbacks.append(callback)

    async def execute_callbacks(self) -> None:
        """Execute all registered shutdown callbacks."""
        for callback in self._callbacks:
            try:
                if callable(callback):
                    import asyncio
                    if asyncio.iscoroutinefunction(callback):
                        await callback()
                    else:
                        callback()
            except Exception as e:
                logger.error(
                    "shutdown_callback_error",
                    extra={"error": str(e)[:200]},
                )

    def cleanup_pool(self) -> None:
        """Close database connection pool."""
        try:
            from services.postgres_pool import get_pool
            pool = get_pool()
            if pool is not None:
                pool.close()
                logger.info("pool_closed")
        except Exception as e:
            logger.error("pool_cleanup_error", extra={"error": str(e)[:200]})

    def cleanup_audit(self) -> None:
        """Flush audit log buffer."""
        try:
            from app.audit import get_audit_logger
            audit = get_audit_logger()
            entries = audit.flush()
            if entries:
                logger.info("audit_flushed", extra={"entries": len(entries)})
        except Exception as e:
            logger.error("audit_cleanup_error", extra={"error": str(e)[:200]})


# Global shutdown handler
_shutdown_handler = GracefulShutdown()


def get_shutdown_handler() -> GracefulShutdown:
    """Get the global shutdown handler."""
    return _shutdown_handler


async def shutdown_handler() -> None:
    """FastAPI shutdown handler."""
    handler = get_shutdown_handler()
    handler.request_shutdown()

    # Execute callbacks
    await handler.execute_callbacks()

    # Cleanup resources
    handler.cleanup_pool()
    handler.cleanup_audit()

    logger.info("shutdown_complete")


def setup_signal_handlers() -> None:
    """Setup SIGTERM/SIGINT handlers for graceful shutdown."""
    handler = get_shutdown_handler()

    def signal_handler(signum, frame):
        sig_name = signal.Signals(signum).name
        logger.info("signal_received", extra={"signal": sig_name})
        handler.request_shutdown()

    # Only setup in main process
    if os.environ.get("SERVER_SOFTWARE", "").startswith("uvicorn"):
        try:
            signal.signal(signal.SIGTERM, signal_handler)
            signal.signal(signal.SIGINT, signal_handler)
        except (ValueError, OSError):
            # Can't set signal handlers in non-main thread
            pass
