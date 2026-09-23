"""Redacted observability for fast decisions."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("truememory.fast_decision")


def record_fast_decision_event(
    event: str,
    *,
    provider: str,
    model: str | None,
    decision_type: str,
    latency_ms: float | None,
    confidence: float | None,
    fallback: bool,
    request_id: str,
    run_id: str,
    agreement: bool | None = None,
    error: str | None = None,
) -> None:
    """Log metadata only; state and question text are intentionally excluded."""
    extra: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "decision_type": decision_type,
        "latency_ms": latency_ms,
        "confidence": confidence,
        "fallback": fallback,
        "request_id": request_id,
        "run_id": run_id,
    }
    if agreement is not None:
        extra["agreement"] = agreement
    if error:
        extra["error_type"] = error[:120]
    logger.info(event, extra=extra)
