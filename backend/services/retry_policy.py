"""Bounded, method-aware retry classification for HTTP clients/workers."""
from __future__ import annotations

import email.utils
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

RETRYABLE_STATUSES = {408, 429, 502, 503, 504}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

@dataclass(frozen=True)
class RetryDecision:
    retryable: bool
    reason: str
    delay_ms: int = 0

def classify_http(status: int, *, method: str = "GET", idempotency_key: str | None = None) -> RetryDecision:
    allowed = method.upper() in SAFE_METHODS or bool(idempotency_key)
    return RetryDecision(status in RETRYABLE_STATUSES and allowed, f"http_{status}" if allowed else f"http_{status}_not_retryable")

def retry_after_ms(value: str | None, *, now: datetime | None = None, maximum_ms: int = 30_000) -> int:
    if not value: return 0
    try: return min(maximum_ms, int(max(0.0, float(value.strip())) * 1000))
    except ValueError:
        try:
            target = email.utils.parsedate_to_datetime(value)
            current = now or datetime.now(timezone.utc)
            if target.tzinfo is None: target = target.replace(tzinfo=timezone.utc)
            return min(maximum_ms, max(0, int((target - current).total_seconds() * 1000)))
        except (TypeError, ValueError, OverflowError): return 0

def backoff_ms(attempt: int, *, base_ms: int = 250, maximum_ms: int = 8_000, jitter: float = 0.2, rng: Any = random) -> int:
    raw = min(maximum_ms, base_ms * (2 ** (max(1, int(attempt)) - 1)))
    spread = max(0.0, min(1.0, float(jitter)))
    return max(0, min(maximum_ms, int(raw * (1 - spread + rng.random() * 2 * spread))))
