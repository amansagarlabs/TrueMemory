"""Deterministic Phase 11 brain-inspired memory facade.

This module provides conceptual layers over existing TrueMemory primitives. It
does not create a second repository and does not perform adaptive learning.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class EpisodicEvidence:
    experience_id: str
    source_type: str
    content: str
    observed_at: str
    event_time: str | None = None
    session_id: str | None = None
    run_id: str | None = None
    task_id: str | None = None
    agent_id: str | None = None
    provider: str | None = None
    model: str | None = None
    outcome: dict[str, Any] | None = None


@dataclass(frozen=True)
class WorkingMemoryItem:
    content: str
    kind: str = "context"
    token_estimate: int = 0
    source_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class WorkingMemory:
    """Bounded session/task context; never durable by itself."""

    def __init__(self, *, token_budget: int = 2000):
        self.token_budget = max(1, token_budget)
        self._items: list[WorkingMemoryItem] = []

    def add(self, item: WorkingMemoryItem) -> None:
        self._items.append(item)
        while self.token_count > self.token_budget and self._items:
            self._items.pop(0)

    @property
    def items(self) -> list[WorkingMemoryItem]:
        return list(self._items)

    @property
    def token_count(self) -> int:
        return sum(max(0, item.token_estimate) for item in self._items)

    def clear(self) -> None:
        self._items.clear()


def create_episodic_evidence(content: str, *, source_type: str, **metadata: Any) -> EpisodicEvidence:
    return EpisodicEvidence(
        experience_id=str(uuid4()),
        source_type=source_type,
        content=content,
        observed_at=datetime.now(UTC).isoformat(),
        **{key: value for key, value in metadata.items() if key in EpisodicEvidence.__dataclass_fields__},
    )


def classify_semantic_state(*, memory_type: str, source_id: str | None = None, evidence_ids: list[str] | None = None) -> dict[str, Any]:
    """Return explicit deterministic metadata for a semantic memory."""
    return {
        "layer": "semantic",
        "memory_type": memory_type,
        "source_id": source_id,
        "evidence_ids": list(evidence_ids or []),
        "adaptive": False,
    }


def memory_lifecycle_event(event_type: str, *, memory_id: str | None = None, experience_id: str | None = None, **details: Any) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "memory_id": memory_id,
        "experience_id": experience_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "details": details,
    }
