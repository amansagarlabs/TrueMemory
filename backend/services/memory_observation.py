"""Memory Observation Events — L4 telemetry for production observation.

Defines canonical observation events for the memory system.
Each event captures a specific stage of the memory lifecycle:
  retrieval → selection → decision → action → outcome

Events are designed for:
  - Structured logging
  - Future L5 evaluation dataset consumption
  - Privacy-preserving metadata (no raw prompts)

Do NOT use these events for adaptive behavior yet.
Observe first, adapt later.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


# ─── Observation Event Types ──────────────────────────────────────────

@dataclass(frozen=True)
class MemoryObservationEvent:
    """Canonical observation for a single memory in a single run.

    Tracks a memory through the full lifecycle:
      retrieved → selected → returned → referenced →
      decision_influenced → action_influenced → outcome_improved

    Fields use None/UNKNOWN when a state cannot be observed.
    Do not infer causality from event ordering alone.
    """
    id: str
    run_id: str
    memory_id: str
    provider: str | None = None
    model: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    retrieval_rank: int | None = None
    retrieval_score: float | None = None
    memory_type: str | None = None
    memory_state: str | None = None  # current, historical, superseded
    scope: str | None = None
    selected: bool | None = None
    returned: bool | None = None
    referenced: bool | None = None
    decision_influenced: bool | None = None
    action_influenced: bool | None = None
    outcome_improved: bool | None = None
    user_corrected: bool | None = None
    user_rejected: bool | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "memory_id": self.memory_id,
            "provider": self.provider,
            "model": self.model,
            "tool_call_id": self.tool_call_id,
            "tool_name": self.tool_name,
            "retrieval_rank": self.retrieval_rank,
            "retrieval_score": self.retrieval_score,
            "memory_type": self.memory_type,
            "memory_state": self.memory_state,
            "scope": self.scope,
            "selected": self.selected,
            "returned": self.returned,
            "referenced": self.referenced,
            "decision_influenced": self.decision_influenced,
            "action_influenced": self.action_influenced,
            "outcome_improved": self.outcome_improved,
            "user_corrected": self.user_corrected,
            "user_rejected": self.user_rejected,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class GovernorObservationEvent:
    """Observation of a Governor policy decision.

    Records what the Governor decided for a memory write candidate,
    which rule fired, and the confidence/trust scores involved.
    """
    id: str
    run_id: str
    candidate_memory_id: str | None = None
    scope: str | None = None
    source_type: str | None = None
    source_trust: float | None = None
    memory_type: str | None = None
    confidence: float | None = None
    effective_confidence: float | None = None
    importance: float | None = None
    decision: str | None = None  # STORE, UPDATE, SUPERSEDE, KEEP_SEPARATE, NOOP, REJECT, EXPIRE
    rule_id: str | None = None
    reason: str | None = None
    policy_version: str | None = None
    existing_memory_id: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "candidate_memory_id": self.candidate_memory_id,
            "scope": self.scope,
            "source_type": self.source_type,
            "source_trust": self.source_trust,
            "memory_type": self.memory_type,
            "confidence": self.confidence,
            "effective_confidence": self.effective_confidence,
            "importance": self.importance,
            "decision": self.decision,
            "rule_id": self.rule_id,
            "reason": self.reason,
            "policy_version": self.policy_version,
            "existing_memory_id": self.existing_memory_id,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class ConflictObservationEvent:
    """Observation of a conflict resolution decision.

    Records how a new memory relates to an existing one:
      ADD, UPDATE, SUPERSEDE, NOOP, KEEP_SEPARATE
    """
    id: str
    run_id: str
    old_memory_id: str | None = None
    new_memory_id: str | None = None
    resolution: str | None = None  # ADD, UPDATE, SUPERSEDE, NOOP, KEEP_SEPARATE
    confidence: float | None = None
    reason: str | None = None
    reason_category: str | None = None  # duplicate, correction, temporal, scope, complementary, unrelated
    similarity_score: float | None = None
    revision: int | None = None
    superseded: bool | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "old_memory_id": self.old_memory_id,
            "new_memory_id": self.new_memory_id,
            "resolution": self.resolution,
            "confidence": self.confidence,
            "reason": self.reason,
            "reason_category": self.reason_category,
            "similarity_score": self.similarity_score,
            "revision": self.revision,
            "superseded": self.superseded,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class TemporalObservationEvent:
    """Observation of temporal intent extraction and filtering.

    Records whether the query had temporal intent and how it affected retrieval.
    """
    id: str
    run_id: str
    query_temporal_intent: str | None = None  # current, historical, range, before, after
    intent_confidence: float | None = None
    target_date: str | None = None
    memories_filtered: int | None = None
    memories_returned: int | None = None
    current_state_only: bool | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "query_temporal_intent": self.query_temporal_intent,
            "intent_confidence": self.intent_confidence,
            "target_date": self.target_date,
            "memories_filtered": self.memories_filtered,
            "memories_returned": self.memories_returned,
            "current_state_only": self.current_state_only,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class ContextObservationEvent:
    """Observation of context compilation for a run.

    Records what went into the context: memory count, token budget,
    duplicates removed, truncation, etc.
    """
    id: str
    run_id: str
    memory_count: int | None = None
    memory_ids: list[str] | None = None
    total_context_tokens: int | None = None
    memory_context_tokens: int | None = None
    duplicates_removed: int | None = None
    truncated: bool | None = None
    current_state_memories: int | None = None
    historical_memories: int | None = None
    proactive_memories: int | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "memory_count": self.memory_count,
            "memory_ids": self.memory_ids,
            "total_context_tokens": self.total_context_tokens,
            "memory_context_tokens": self.memory_context_tokens,
            "duplicates_removed": self.duplicates_removed,
            "truncated": self.truncated,
            "current_state_memories": self.current_state_memories,
            "historical_memories": self.historical_memories,
            "proactive_memories": self.proactive_memories,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class ToolLoopObservationEvent:
    """Observation of tool loop behavior.

    Records metrics about the tool calling loop itself:
      rounds, calls, abstentions, failures.
    """
    id: str
    run_id: str
    provider: str | None = None
    model: str | None = None
    tool_rounds: int | None = None
    memory_tool_calls: int | None = None
    non_memory_tool_calls: int | None = None
    abstained_from_memory: bool | None = None
    tool_failures: int | None = None
    tool_loop_terminated: bool | None = None
    total_tool_ms: float | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "id": self.id,
            "run_id": self.run_id,
            "provider": self.provider,
            "model": self.model,
            "tool_rounds": self.tool_rounds,
            "memory_tool_calls": self.memory_tool_calls,
            "non_memory_tool_calls": self.non_memory_tool_calls,
            "abstained_from_memory": self.abstained_from_memory,
            "tool_failures": self.tool_failures,
            "tool_loop_terminated": self.tool_loop_terminated,
            "total_tool_ms": self.total_tool_ms,
            "timestamp": self.timestamp,
        }.items() if v is not None}


@dataclass(frozen=True)
class RunObservationSummary:
    """Summary of all observations for a single run.

    Aggregates all observation events into a single summary.
    This is the top-level document for L5 evaluation.
    """
    run_id: str
    provider: str | None = None
    model: str | None = None
    conversation_id: str | None = None
    user_id: str | None = None
    workspace_id: str | None = None
    project_id: str | None = None
    memory_observations: list[dict[str, Any]] = field(default_factory=list)
    governor_observations: list[dict[str, Any]] = field(default_factory=list)
    conflict_observations: list[dict[str, Any]] = field(default_factory=list)
    temporal_observations: list[dict[str, Any]] = field(default_factory=list)
    context_observation: dict[str, Any] | None = None
    tool_loop_observation: dict[str, Any] | None = None
    outcome_event: dict[str, Any] | None = None
    user_feedback: list[dict[str, Any]] = field(default_factory=list)
    total_ms: float | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in {
            "run_id": self.run_id,
            "provider": self.provider,
            "model": self.model,
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "workspace_id": self.workspace_id,
            "project_id": self.project_id,
            "memory_observations": self.memory_observations,
            "governor_observations": self.governor_observations,
            "conflict_observations": self.conflict_observations,
            "temporal_observations": self.temporal_observations,
            "context_observation": self.context_observation,
            "tool_loop_observation": self.tool_loop_observation,
            "outcome_event": self.outcome_event,
            "user_feedback": self.user_feedback,
            "total_ms": self.total_ms,
            "timestamp": self.timestamp,
        }.items() if v is not None}


# ─── Factory Functions ────────────────────────────────────────────────

def create_memory_observation(
    run_id: str,
    memory_id: str,
    **kwargs: Any,
) -> MemoryObservationEvent:
    return MemoryObservationEvent(id=str(uuid4()), run_id=run_id, memory_id=memory_id, **kwargs)


def create_governor_observation(
    run_id: str,
    **kwargs: Any,
) -> GovernorObservationEvent:
    return GovernorObservationEvent(id=str(uuid4()), run_id=run_id, **kwargs)


def create_conflict_observation(
    run_id: str,
    **kwargs: Any,
) -> ConflictObservationEvent:
    return ConflictObservationEvent(id=str(uuid4()), run_id=run_id, **kwargs)


def create_temporal_observation(
    run_id: str,
    **kwargs: Any,
) -> TemporalObservationEvent:
    return TemporalObservationEvent(id=str(uuid4()), run_id=run_id, **kwargs)


def create_context_observation(
    run_id: str,
    **kwargs: Any,
) -> ContextObservationEvent:
    return ContextObservationEvent(id=str(uuid4()), run_id=run_id, **kwargs)


def create_tool_loop_observation(
    run_id: str,
    **kwargs: Any,
) -> ToolLoopObservationEvent:
    return ToolLoopObservationEvent(id=str(uuid4()), run_id=run_id, **kwargs)


def create_run_summary(
    run_id: str,
    **kwargs: Any,
) -> RunObservationSummary:
    return RunObservationSummary(run_id=run_id, **kwargs)
