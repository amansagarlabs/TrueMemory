"""Small AG-UI-inspired event adapter for AmanAgentLab streams.

This keeps the current frontend-compatible `type` field while adding a
consistent envelope that can evolve toward AG-UI without replacing SSE.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import UTC, datetime
from typing import Any


AG_UI_EVENT_MAP = {
    "status": "agent.status",
    "retrieval": "tool.result",
    "token": "message.delta",
    "done": "run.finished",
    "error": "run.error",
}


def make_event(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "event": AG_UI_EVENT_MAP.get(event_type, f"custom.{event_type}"),
        "timestamp": datetime.now(UTC).isoformat(),
        "sequence": time.time_ns(),
        **payload,
    }


def sse(event_type: str, payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(make_event(event_type, payload))}\n\n"
