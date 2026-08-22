"""Shared fixed-window rate limiting with a safe local development fallback."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from math import ceil
from typing import Any

from services.postgres_store import _connect, postgres_enabled


class RateLimiter:
    def __init__(self, settings: Any, *, limit: int, window_seconds: float):
        self.settings = settings
        self.limit = max(1, int(limit))
        self.window_seconds = max(1.0, float(window_seconds))
        self.shared = bool(getattr(settings, "database_url", "")) and postgres_enabled(settings)
        self._local: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.RLock()

    def check(self, key: str) -> dict[str, Any]:
        if self.shared:
            try:
                return self._check_postgres(key)
            except Exception:
                # Keep a database restart from taking the whole API down. The
                # fallback is intentionally visible in metrics/response data.
                return self._check_local(key, backend="local-fallback")
        return self._check_local(key, backend="local")

    def _check_local(self, key: str, *, backend: str) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            window = self._local[key]
            while window and now - window[0] >= self.window_seconds:
                window.popleft()
            allowed = len(window) < self.limit
            if allowed:
                window.append(now)
            retry_after = (
                max(1, ceil(self.window_seconds - (now - window[0])))
                if window and not allowed
                else 0
            )
            return {
                "allowed": allowed,
                "limit": self.limit,
                "remaining": max(0, self.limit - len(window)),
                "retry_after": retry_after,
                "backend": backend,
            }

    def _check_postgres(self, key: str) -> dict[str, Any]:
        with _connect(self.settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO shared_rate_limits (
                        bucket_key, window_started_at, request_count, expires_at
                    ) VALUES (%s, NOW(), 1, NOW() + (%s * INTERVAL '1 second'))
                    ON CONFLICT (bucket_key) DO UPDATE SET
                        window_started_at = CASE
                            WHEN shared_rate_limits.expires_at <= NOW() THEN NOW()
                            ELSE shared_rate_limits.window_started_at
                        END,
                        request_count = CASE
                            WHEN shared_rate_limits.expires_at <= NOW() THEN 1
                            ELSE shared_rate_limits.request_count + 1
                        END,
                        expires_at = CASE
                            WHEN shared_rate_limits.expires_at <= NOW()
                                THEN NOW() + (%s * INTERVAL '1 second')
                            ELSE shared_rate_limits.expires_at
                        END
                    RETURNING request_count, expires_at
                    """,
                    (key, self.window_seconds, self.window_seconds),
                )
                row = cur.fetchone() or {}
                count = int(row.get("request_count", 0))
                expires_at = row.get("expires_at")
                if count == 1:
                    cur.execute("DELETE FROM shared_rate_limits WHERE expires_at <= NOW() AND bucket_key <> %s", (key,))
                conn.commit()

        now = datetime.now(UTC)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        retry_after = max(1, ceil((expires_at - now).total_seconds())) if expires_at and count > self.limit else 0
        return {
            "allowed": count <= self.limit,
            "limit": self.limit,
            "remaining": max(0, self.limit - count),
            "retry_after": retry_after,
            "backend": "postgres",
        }


_limiters: dict[tuple[str, int, float], RateLimiter] = {}
_limiters_lock = threading.Lock()


def get_rate_limiter(settings: Any, *, limit: int, window_seconds: float) -> RateLimiter:
    key = (
        str(getattr(settings, "database_url", "") or getattr(settings, "memory_db_path", "")),
        int(limit),
        float(window_seconds),
    )
    with _limiters_lock:
        if key not in _limiters:
            _limiters[key] = RateLimiter(settings, limit=limit, window_seconds=window_seconds)
        return _limiters[key]


def ensure_rate_limit_schema(settings: Any) -> None:
    """Create the shared limiter table for fresh and existing Postgres volumes."""
    if not getattr(settings, "database_url", "") or not postgres_enabled(settings):
        return
    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS shared_rate_limits (
                        bucket_key TEXT PRIMARY KEY,
                        window_started_at TIMESTAMPTZ NOT NULL,
                        request_count INTEGER NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_shared_rate_limits_expiry ON shared_rate_limits(expires_at)")
                conn.commit()
    except Exception:
        return
