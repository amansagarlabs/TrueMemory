"""Memory Result Contract — structured memory information for the agent.

Defines the contract for how memory results are returned to the agent,
ensuring consistent and useful information.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class MemoryResult:
    """Structured memory result for the agent."""
    memory_id: str
    content: str
    type: str  # fact, preference, decision, task_completion, observation
    state: str  # current, historical, uncertain, superseded
    scope: str  # workspace, project, user
    confidence: float
    valid_from: str | None = None
    valid_until: str | None = None
    source_type: str | None = None  # user_message, agent_observation, tool_result
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "memory_id": self.memory_id,
            "content": self.content,
            "type": self.type,
            "state": self.state,
            "scope": self.scope,
            "confidence": self.confidence,
            "valid_from": self.valid_from,
            "valid_until": self.valid_until,
            "source_type": self.source_type,
            "metadata": self.metadata,
        }


@dataclass(frozen=True)
class MemoryQueryResult:
    """Result from a memory query operation."""
    query_id: str
    operation: str  # search, current_state, timeline, related
    memories: list[MemoryResult]
    total_count: int
    retrieval_time_ms: float
    success: bool
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "query_id": self.query_id,
            "operation": self.operation,
            "memories": [m.to_dict() for m in self.memories],
            "total_count": self.total_count,
            "retrieval_time_ms": self.retrieval_time_ms,
            "success": self.success,
            "error": self.error,
            "metadata": self.metadata,
        }


@dataclass(frozen=True)
class MemoryInfluenceEvent:
    """Event recording memory influence on agent behavior."""
    id: str
    run_id: str
    task_id: str | None = None
    memory_id: str | None = None
    retrieval_event_id: str | None = None
    stage: str = "reasoning"  # planning, reasoning, tool_selection, action, verification, response
    evidence: str = "unknown"  # explicit_reference, tool_choice, parameter_choice, code_change, decision_change, unknown
    confidence: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "memory_id": self.memory_id,
            "retrieval_event_id": self.retrieval_event_id,
            "stage": self.stage,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
        }


@dataclass(frozen=True)
class OutcomeEvent:
    """Event recording the outcome of an agent action."""
    id: str
    run_id: str
    task_id: str | None = None
    success: bool = True
    outcome_type: str = "success"  # success, failure, partial_success, user_correction, user_rejection, user_acceptance
    details: str | None = None
    influence_event_id: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "success": self.success,
            "outcome_type": self.outcome_type,
            "details": self.details,
            "influence_event_id": self.influence_event_id,
            "timestamp": self.timestamp,
        }


@dataclass(frozen=True)
class DecisionEvent:
    """Event recording memory influence on agent decision."""
    id: str
    run_id: str
    task_id: str | None = None
    decision_type: str = "unspecified"  # recall, create, update, delete, route, prioritize, abstain
    memory_ids: list[str] = field(default_factory=list)
    evidence: str = "unknown"  # explicit_reference, tool_call, reasoning_trace, unknown
    confidence: float = 0.0
    reasoning: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "decision_type": self.decision_type,
            "memory_ids": self.memory_ids,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "timestamp": self.timestamp,
        }


@dataclass(frozen=True)
class ActionEvent:
    """Event recording agent action and its linkage to decisions and memories."""
    id: str
    run_id: str
    task_id: str | None = None
    action_type: str = "unspecified"  # tool_call, response, code_change, file_operation, system_call
    tool_name: str | None = None
    decision_event_id: str | None = None
    memory_ids: list[str] = field(default_factory=list)
    success: bool = True
    details: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "action_type": self.action_type,
            "tool_name": self.tool_name,
            "decision_event_id": self.decision_event_id,
            "memory_ids": self.memory_ids,
            "success": self.success,
            "details": self.details,
            "timestamp": self.timestamp,
        }


def create_memory_result(
    memory_id: str,
    content: str,
    type: str,
    state: str,
    scope: str,
    confidence: float,
    **kwargs: Any,
) -> MemoryResult:
    """Factory function to create a MemoryResult."""
    return MemoryResult(
        memory_id=memory_id,
        content=content,
        type=type,
        state=state,
        scope=scope,
        confidence=confidence,
        **kwargs,
    )


def create_memory_query_result(
    operation: str,
    memories: list[MemoryResult],
    retrieval_time_ms: float,
    success: bool,
    error: str | None = None,
    **kwargs: Any,
) -> MemoryQueryResult:
    """Factory function to create a MemoryQueryResult."""
    return MemoryQueryResult(
        query_id=str(uuid4()),
        operation=operation,
        memories=memories,
        total_count=len(memories),
        retrieval_time_ms=retrieval_time_ms,
        success=success,
        error=error,
        **kwargs,
    )


def create_influence_event(
    run_id: str,
    memory_id: str,
    stage: str,
    evidence: str,
    confidence: float,
    **kwargs: Any,
) -> MemoryInfluenceEvent:
    """Factory function to create a MemoryInfluenceEvent."""
    return MemoryInfluenceEvent(
        id=str(uuid4()),
        run_id=run_id,
        memory_id=memory_id,
        stage=stage,
        evidence=evidence,
        confidence=confidence,
        **kwargs,
    )


def create_outcome_event(
    run_id: str,
    success: bool,
    outcome_type: str,
    details: str | None = None,
    **kwargs: Any,
) -> OutcomeEvent:
    """Factory function to create an OutcomeEvent."""
    return OutcomeEvent(
        id=str(uuid4()),
        run_id=run_id,
        success=success,
        outcome_type=outcome_type,
        details=details,
        **kwargs,
    )


def create_decision_event(
    run_id: str,
    decision_type: str,
    memory_ids: list[str],
    evidence: str,
    confidence: float,
    **kwargs: Any,
) -> DecisionEvent:
    """Factory function to create a DecisionEvent."""
    return DecisionEvent(
        id=str(uuid4()),
        run_id=run_id,
        decision_type=decision_type,
        memory_ids=memory_ids,
        evidence=evidence,
        confidence=confidence,
        **kwargs,
    )


def create_action_event(
    run_id: str,
    action_type: str,
    success: bool,
    **kwargs: Any,
) -> ActionEvent:
    """Factory function to create an ActionEvent."""
    return ActionEvent(
        id=str(uuid4()),
        run_id=run_id,
        action_type=action_type,
        success=success,
        **kwargs,
    )
