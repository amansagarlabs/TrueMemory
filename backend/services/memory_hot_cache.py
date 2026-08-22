"""Shared L0 cache for hot memory reads.

PostgreSQL is used as shared cache when configured. SQLite/local development
uses bounded process-local cache. Cache never owns truth; misses fall back to
MemoryCore/L1 and writes invalidate before returning.
"""

from __future__ import annotations

import json
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from services.postgres_store import _connect, postgres_enabled


@dataclass
class CacheMetrics:
    hits: int = 0
    misses: int = 0
    writes: int = 0
    invalidations: int = 0
    lookup_ms_total: float = 0.0

    def snapshot(self) -> dict[str, Any]:
        lookups = self.hits + self.misses
        return {
            "hits": self.hits,
            "misses": self.misses,
            "writes": self.writes,
            "invalidations": self.invalidations,
            "hit_rate": self.hits / lookups if lookups else 0.0,
            "lookup_ms_total": round(self.lookup_ms_total, 3),
        }


class HotMemoryCache:
    def __init__(self, settings: Any, *, max_entries: int = 512, ttl_seconds: float = 30.0):
        self.settings = settings
        self.max_entries = max(16, max_entries)
        self.ttl_seconds = max(1.0, ttl_seconds)
        # Tests and lightweight local callers may provide only memory_db_path.
        self.shared = bool(getattr(settings, "database_url", "")) and postgres_enabled(settings)
        self._local: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = threading.RLock()
        self._load_locks: dict[str, threading.Lock] = {}
        self._metrics = CacheMetrics()

    @staticmethod
    def key(*, user_id: str, scope: str, operation: str, query: str = "", workspace_id: str | None = None, agent_id: str | None = None, session_id: str | None = None) -> str:
        return "|".join(str(item or "") for item in (user_id, scope, operation, query.strip().casefold(), workspace_id, agent_id, session_id))

    def get(self, key: str) -> Any | None:
        started = time.perf_counter()
        value = self._read(key)
        elapsed = (time.perf_counter() - started) * 1000
        with self._lock:
            self._metrics.lookup_ms_total += elapsed
            if value is None:
                self._metrics.misses += 1
            else:
                self._metrics.hits += 1
        return value

    def set(self, key: str, value: Any) -> None:
        expires_at = time.monotonic() + self.ttl_seconds
        if self.shared:
            self._shared_set(key, value)
            return
        with self._lock:
            self._local[key] = (expires_at, value)
            self._local.move_to_end(key)
            while len(self._local) > self.max_entries:
                self._local.popitem(last=False)
            self._metrics.writes += 1

    def get_or_load(self, key: str, loader) -> Any:
        value = self.get(key)
        if value is not None:
            return value
        with self._lock:
            lock = self._load_locks.setdefault(key, threading.Lock())
        with lock:
            # Avoid counting the stampede-protection recheck as a second
            # caller lookup. The first lookup represents this request.
            value = self._read(key)
            if value is None:
                value = loader()
                self.set(key, value)
            return value

    def _read(self, key: str) -> Any | None:
        if self.shared:
            return self._shared_get(key)
        with self._lock:
            entry = self._local.get(key)
            if entry and entry[0] > time.monotonic():
                self._local.move_to_end(key)
                return entry[1]
            if entry:
                self._local.pop(key, None)
        return None

    def invalidate(self, *, user_id: str, scope: str | None = None) -> None:
        prefix = f"{user_id}|"
        if scope:
            prefix = f"{user_id}|{scope}|"
        if self.shared:
            self._shared_invalidate(user_id=user_id, scope=scope)
        with self._lock:
            for key in list(self._local):
                if key.startswith(prefix):
                    self._local.pop(key, None)
            self._metrics.invalidations += 1

    def metrics(self) -> dict[str, Any]:
        with self._lock:
            return {**self._metrics.snapshot(), "shared": self.shared, "entries": len(self._local), "ttl_seconds": self.ttl_seconds}

    def _shared_get(self, key: str) -> Any | None:
        try:
            with _connect(self.settings) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT payload FROM memory_hot_cache WHERE cache_key = %s AND expires_at > NOW()",
                        (key,),
                    )
                    row = cur.fetchone()
                    if not row:
                        return None
                    return row["payload"]
        except Exception:
            return None

    def _shared_set(self, key: str, value: Any) -> None:
        try:
            with _connect(self.settings) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO memory_hot_cache (cache_key, user_id, scope, payload, expires_at)
                        VALUES (%s, %s, %s, %s::jsonb, NOW() + (%s * INTERVAL '1 second'))
                        ON CONFLICT (cache_key) DO UPDATE SET
                            payload = EXCLUDED.payload,
                            expires_at = EXCLUDED.expires_at,
                            updated_at = NOW()
                        """,
                        (key, key.split("|", 1)[0], key.split("|", 2)[1], json.dumps(value), self.ttl_seconds),
                    )
                    cur.execute("DELETE FROM memory_hot_cache WHERE expires_at <= NOW()")
                    cur.execute(
                        """
                        DELETE FROM memory_hot_cache
                        WHERE cache_key IN (
                            SELECT cache_key FROM memory_hot_cache
                            ORDER BY updated_at DESC
                            OFFSET %s
                        )
                        """,
                        (self.max_entries,),
                    )
                    conn.commit()
                    with self._lock:
                        self._metrics.writes += 1
        except Exception:
            return

    def _shared_invalidate(self, *, user_id: str, scope: str | None) -> None:
        try:
            with _connect(self.settings) as conn:
                with conn.cursor() as cur:
                    if scope:
                        # The logical storage scope can itself contain '|'
                        # (workspace and agent bindings). Match the canonical
                        # cache-key prefix instead of the denormalized scope
                        # column, which only stores its first segment.
                        cur.execute("DELETE FROM memory_hot_cache WHERE user_id = %s AND cache_key LIKE %s", (user_id, f"{user_id}|{scope}|%"))
                    else:
                        cur.execute("DELETE FROM memory_hot_cache WHERE user_id = %s", (user_id,))
                    conn.commit()
        except Exception:
            return


def ensure_hot_cache_schema(settings: Any) -> None:
    """Apply the additive shared-cache schema for existing Postgres volumes."""
    if not getattr(settings, "database_url", "") or not postgres_enabled(settings):
        return
    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS memory_hot_cache (
                        cache_key TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        scope TEXT NOT NULL,
                        payload JSONB NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_hot_cache_expiry ON memory_hot_cache(expires_at)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_hot_cache_user_scope ON memory_hot_cache(user_id, scope)")
                conn.commit()
    except Exception:
        # Startup must remain available while Postgres is restarting; cache
        # reads safely fall back to L1 until the next startup or migration.
        return


_cache_instances: dict[tuple[str, float, int], HotMemoryCache] = {}
_cache_instances_lock = threading.Lock()


def get_hot_cache(settings: Any) -> HotMemoryCache:
    key = (
        str(getattr(settings, "database_url", "") or getattr(settings, "memory_db_path", "")),
        float(getattr(settings, "memory_hot_ttl_seconds", 30.0)),
        int(getattr(settings, "memory_hot_max_entries", 512)),
    )
    with _cache_instances_lock:
        if key not in _cache_instances:
            _cache_instances[key] = HotMemoryCache(settings, max_entries=key[2], ttl_seconds=key[1])
        return _cache_instances[key]
