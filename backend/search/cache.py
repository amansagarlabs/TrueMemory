from __future__ import annotations

import time
from threading import Lock
from typing import Any


class TTLCache:
    """Small process-local cache for metadata and image lookups.

    It intentionally has no persistence requirement. Deployments can replace
    this adapter with Redis without changing callers.
    """

    def __init__(self, max_items: int = 512):
        self.max_items = max_items
        self._items: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            value = self._items.get(key)
            if value is None:
                return None
            expires, payload = value
            if expires <= now:
                self._items.pop(key, None)
                return None
            return payload

    def set(self, key: str, value: Any, ttl: float) -> None:
        with self._lock:
            if len(self._items) >= self.max_items:
                oldest = min(self._items, key=lambda item: self._items[item][0])
                self._items.pop(oldest, None)
            self._items[key] = (time.monotonic() + max(ttl, 1.0), value)


metadata_cache = TTLCache()
image_cache = TTLCache()
