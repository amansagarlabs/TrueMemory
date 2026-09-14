"""PostgreSQL Connection Pool — production-grade connection management.

Provides:
- Connection pooling with configurable size
- Automatic connection recovery
- Health checks
- Connection timeout
- Usage metrics

Usage:
    from services.postgres_pool import get_pool, get_connection
    pool = get_pool(settings)
    with get_connection(settings) as conn:
        conn.execute("SELECT 1")
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Generator
from threading import Lock

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool
except ImportError:
    psycopg = None
    dict_row = None
    ConnectionPool = None

logger = logging.getLogger("truememory.postgres_pool")


@dataclass
class PoolMetrics:
    """Connection pool metrics."""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    total_requests: int = 0
    failed_requests: int = 0
    avg_wait_time_ms: float = 0.0
    last_health_check: str | None = None
    last_health_status: str = "unknown"

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_connections": self.total_connections,
            "active_connections": self.active_connections,
            "idle_connections": self.idle_connections,
            "total_requests": self.total_requests,
            "failed_requests": self.failed_requests,
            "avg_wait_time_ms": round(self.avg_wait_time_ms, 2),
            "last_health_check": self.last_health_check,
            "last_health_status": self.last_health_status,
        }


class PostgresPool:
    """Production PostgreSQL connection pool."""

    def __init__(
        self,
        database_url: str,
        min_size: int = 2,
        max_size: int = 10,
        timeout: float = 30.0,
        max_inactive_time: float = 600.0,
    ):
        if ConnectionPool is None:
            raise RuntimeError("psycopg_pool is not installed. Run: pip install psycopg_pool")

        self.database_url = database_url
        self.metrics = PoolMetrics()
        self._lock = Lock()

        # Configure pool
        self.pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_size,
            max_size=max_size,
            timeout=timeout,
            max_inactive=max_inactive_time,
            kwargs={"row_factory": dict_row} if dict_row else {},
        )

        logger.info(
            "connection_pool_created",
            extra={"min_size": min_size, "max_size": max_size, "timeout": timeout},
        )

    @contextmanager
    def connection(self) -> Generator[psycopg.Connection, None, None]:
        """Get a connection from the pool."""
        start = time.monotonic()
        conn = None
        try:
            with self.pool.connection() as conn:
                wait_time = (time.monotonic() - start) * 1000
                with self._lock:
                    self.metrics.total_requests += 1
                    self.metrics.active_connections += 1
                    # Update average wait time
                    n = self.metrics.total_requests
                    self.metrics.avg_wait_time_ms = (
                        (self.metrics.avg_wait_time_ms * (n - 1) + wait_time) / n
                    )

                try:
                    yield conn
                finally:
                    with self._lock:
                        self.metrics.active_connections -= 1

        except Exception as e:
            with self._lock:
                self.metrics.failed_requests += 1
            logger.error("connection_error", extra={"error": str(e)[:200]})
            raise

    def health_check(self) -> dict[str, Any]:
        """Perform a health check on the pool."""
        try:
            start = time.monotonic()
            with self.pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            latency_ms = (time.monotonic() - start) * 1000

            self.metrics.last_health_check = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            self.metrics.last_health_status = "healthy"

            return {
                "status": "healthy",
                "latency_ms": round(latency_ms, 2),
                "pool_size": self.pool.get_stats().get("pool_size", 0),
                "connections_active": self.pool.get_stats().get("connections_active", 0),
                "connections_idle": self.pool.get_stats().get("connections_idle", 0),
            }
        except Exception as e:
            self.metrics.last_health_check = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            self.metrics.last_health_status = "unhealthy"
            return {
                "status": "unhealthy",
                "error": str(e)[:200],
            }

    def get_stats(self) -> dict[str, Any]:
        """Get pool statistics."""
        try:
            stats = self.pool.get_stats()
            return {
                **self.metrics.to_dict(),
                "pool_size": stats.get("pool_size", 0),
                "connections_active": stats.get("connections_active", 0),
                "connections_idle": stats.get("connections_idle", 0),
                "connections_used": stats.get("connections_used", 0),
                "connections_errors": stats.get("connections_errors", 0),
                "connections_timeouts": stats.get("connections_timeouts", 0),
            }
        except Exception:
            return self.metrics.to_dict()

    def close(self) -> None:
        """Close the connection pool."""
        self.pool.close()
        logger.info("connection_pool_closed")


# Global pool instance
_pool: PostgresPool | None = None
_pool_lock = Lock()


def get_pool(settings: Any | None = None) -> PostgresPool | None:
    """Get or create the global connection pool."""
    global _pool

    if _pool is not None:
        return _pool

    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    database_url = getattr(settings, "database_url", "")
    if not database_url:
        return None

    if psycopg is None:
        return None

    with _pool_lock:
        if _pool is None:
            # Get pool config from environment
            min_size = int(os.environ.get("PG_POOL_MIN_SIZE", "2"))
            max_size = int(os.environ.get("PG_POOL_MAX_SIZE", "10"))
            timeout = float(os.environ.get("PG_POOL_TIMEOUT", "30"))

            _pool = PostgresPool(
                database_url=database_url,
                min_size=min_size,
                max_size=max_size,
                timeout=timeout,
            )

    return _pool


@contextmanager
def get_connection(settings: Any | None = None) -> Generator:
    """Get a connection from the pool, with fallback to direct connection."""
    pool = get_pool(settings)

    if pool is not None:
        with pool.connection() as conn:
            yield conn
    else:
        # Fallback to direct connection
        if settings is None:
            from app.config import get_settings
            settings = get_settings()

        if psycopg is None or dict_row is None:
            raise RuntimeError("psycopg is not installed")

        conn = psycopg.connect(settings.database_url, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()


def check_pool_health(settings: Any | None = None) -> dict[str, Any]:
    """Check pool health status."""
    pool = get_pool(settings)
    if pool is None:
        return {"status": "not_configured", "message": "No database URL configured"}
    return pool.health_check()
