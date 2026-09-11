"""Memory Telemetry Collector — accumulates observation events per run.

This collector gathers all observation events during a single agent run
and produces a RunObservationSummary at completion.

Privacy: Stores only IDs, metadata, and scores. No raw prompts.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from services.memory_observation import (
    MemoryObservationEvent,
    GovernorObservationEvent,
    ConflictObservationEvent,
    TemporalObservationEvent,
    ContextObservationEvent,
    ToolLoopObservationEvent,
    RunObservationSummary,
    create_memory_observation,
    create_governor_observation,
    create_conflict_observation,
    create_temporal_observation,
    create_context_observation,
    create_tool_loop_observation,
    create_run_summary,
)

logger = logging.getLogger("truememory.telemetry")


@dataclass
class RunTelemetryCollector:
    """Accumulates all observation events for a single run.

    Usage:
        collector = RunTelemetryCollector(run_id="run-123", provider="openrouter", model="gpt-4o")

        # During retrieval
        collector.record_retrieval(memory_id="mem-1", tool_call_id="tc-1", rank=1, score=0.92)

        # During governance
        collector.record_governor_decision(decision="STORE", rule_id="new_durable_memory", ...)

        # At completion
        summary = collector.build_summary()
    """
    run_id: str
    provider: str | None = None
    model: str | None = None
    conversation_id: str | None = None
    user_id: str | None = None
    workspace_id: str | None = None
    project_id: str | None = None

    memory_observations: list[MemoryObservationEvent] = field(default_factory=list)
    governor_observations: list[GovernorObservationEvent] = field(default_factory=list)
    conflict_observations: list[ConflictObservationEvent] = field(default_factory=list)
    temporal_observations: list[TemporalObservationEvent] = field(default_factory=list)
    context_observation: ContextObservationEvent | None = None
    tool_loop_observation: ToolLoopObservationEvent | None = None
    outcome_event: dict[str, Any] | None = None
    user_feedback: list[dict[str, Any]] = field(default_factory=list)
    total_ms: float | None = None

    def record_retrieval(
        self,
        memory_id: str,
        tool_call_id: str | None = None,
        tool_name: str | None = None,
        rank: int | None = None,
        score: float | None = None,
        memory_type: str | None = None,
        memory_state: str | None = None,
        scope: str | None = None,
    ) -> MemoryObservationEvent:
        """Record that a memory was retrieved."""
        obs = create_memory_observation(
            run_id=self.run_id,
            memory_id=memory_id,
            provider=self.provider,
            model=self.model,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            retrieval_rank=rank,
            retrieval_score=score,
            memory_type=memory_type,
            memory_state=memory_state,
            scope=scope,
            selected=None,
            returned=True,
        )
        self.memory_observations.append(obs)
        return obs

    def record_selection(
        self,
        memory_id: str,
        selected: bool = True,
        referenced: bool = False,
    ) -> None:
        """Record that a retrieved memory was selected/referenced by the model."""
        for obs in self.memory_observations:
            if obs.memory_id == memory_id:
                # Update in-place (frozen dataclass, so replace)
                idx = self.memory_observations.index(obs)
                self.memory_observations[idx] = MemoryObservationEvent(
                    id=obs.id,
                    run_id=obs.run_id,
                    memory_id=obs.memory_id,
                    provider=obs.provider,
                    model=obs.model,
                    tool_call_id=obs.tool_call_id,
                    tool_name=obs.tool_name,
                    retrieval_rank=obs.retrieval_rank,
                    retrieval_score=obs.retrieval_score,
                    memory_type=obs.memory_type,
                    memory_state=obs.memory_state,
                    scope=obs.scope,
                    selected=selected,
                    returned=obs.returned,
                    referenced=referenced,
                    decision_influenced=obs.decision_influenced,
                    action_influenced=obs.action_influenced,
                    outcome_improved=obs.outcome_improved,
                    user_corrected=obs.user_corrected,
                    user_rejected=obs.user_rejected,
                    timestamp=obs.timestamp,
                )
                return
        # If not found, create new
        obs = create_memory_observation(
            run_id=self.run_id,
            memory_id=memory_id,
            selected=selected,
            referenced=referenced,
        )
        self.memory_observations.append(obs)

    def record_influence(
        self,
        memory_id: str,
        decision_influenced: bool | None = None,
        action_influenced: bool | None = None,
        outcome_improved: bool | None = None,
    ) -> None:
        """Record influence signals for a memory."""
        for obs in self.memory_observations:
            if obs.memory_id == memory_id:
                idx = self.memory_observations.index(obs)
                self.memory_observations[idx] = MemoryObservationEvent(
                    id=obs.id,
                    run_id=obs.run_id,
                    memory_id=obs.memory_id,
                    provider=obs.provider,
                    model=obs.model,
                    tool_call_id=obs.tool_call_id,
                    tool_name=obs.tool_name,
                    retrieval_rank=obs.retrieval_rank,
                    retrieval_score=obs.retrieval_score,
                    memory_type=obs.memory_type,
                    memory_state=obs.memory_state,
                    scope=obs.scope,
                    selected=obs.selected,
                    returned=obs.returned,
                    referenced=obs.referenced,
                    decision_influenced=decision_influenced if decision_influenced is not None else obs.decision_influenced,
                    action_influenced=action_influenced if action_influenced is not None else obs.action_influenced,
                    outcome_improved=outcome_improved if outcome_improved is not None else obs.outcome_improved,
                    user_corrected=obs.user_corrected,
                    user_rejected=obs.user_rejected,
                    timestamp=obs.timestamp,
                )
                return

    def record_user_feedback(
        self,
        memory_id: str,
        corrected: bool = False,
        rejected: bool = False,
    ) -> None:
        """Record user correction/rejection of a memory."""
        self.user_feedback.append({
            "memory_id": memory_id,
            "corrected": corrected,
            "rejected": rejected,
        })
        # Also update the memory observation
        for obs in self.memory_observations:
            if obs.memory_id == memory_id:
                idx = self.memory_observations.index(obs)
                self.memory_observations[idx] = MemoryObservationEvent(
                    id=obs.id,
                    run_id=obs.run_id,
                    memory_id=obs.memory_id,
                    provider=obs.provider,
                    model=obs.model,
                    tool_call_id=obs.tool_call_id,
                    tool_name=obs.tool_name,
                    retrieval_rank=obs.retrieval_rank,
                    retrieval_score=obs.retrieval_score,
                    memory_type=obs.memory_type,
                    memory_state=obs.memory_state,
                    scope=obs.scope,
                    selected=obs.selected,
                    returned=obs.returned,
                    referenced=obs.referenced,
                    decision_influenced=obs.decision_influenced,
                    action_influenced=obs.action_influenced,
                    outcome_improved=obs.outcome_improved,
                    user_corrected=corrected,
                    user_rejected=rejected,
                    timestamp=obs.timestamp,
                )
                return

    def record_governor_decision(
        self,
        decision: str,
        rule_id: str,
        reason: str,
        confidence: float | None = None,
        effective_confidence: float | None = None,
        importance: float | None = None,
        source_type: str | None = None,
        source_trust: float | None = None,
        memory_type: str | None = None,
        scope: str | None = None,
        candidate_memory_id: str | None = None,
        existing_memory_id: str | None = None,
        policy_version: str | None = None,
    ) -> GovernorObservationEvent:
        """Record a Governor policy decision."""
        obs = create_governor_observation(
            run_id=self.run_id,
            candidate_memory_id=candidate_memory_id,
            scope=scope,
            source_type=source_type,
            source_trust=source_trust,
            memory_type=memory_type,
            confidence=confidence,
            effective_confidence=effective_confidence,
            importance=importance,
            decision=decision,
            rule_id=rule_id,
            reason=reason,
            policy_version=policy_version,
            existing_memory_id=existing_memory_id,
        )
        self.governor_observations.append(obs)
        return obs

    def record_conflict_resolution(
        self,
        resolution: str,
        confidence: float,
        reason: str,
        old_memory_id: str | None = None,
        new_memory_id: str | None = None,
        reason_category: str | None = None,
        similarity_score: float | None = None,
        revision: int | None = None,
        superseded: bool | None = None,
    ) -> ConflictObservationEvent:
        """Record a conflict resolution decision."""
        obs = create_conflict_observation(
            run_id=self.run_id,
            old_memory_id=old_memory_id,
            new_memory_id=new_memory_id,
            resolution=resolution,
            confidence=confidence,
            reason=reason,
            reason_category=reason_category,
            similarity_score=similarity_score,
            revision=revision,
            superseded=superseded,
        )
        self.conflict_observations.append(obs)
        return obs

    def record_temporal_intent(
        self,
        intent: str,
        confidence: float,
        target_date: str | None = None,
        memories_filtered: int | None = None,
        memories_returned: int | None = None,
        current_state_only: bool | None = None,
    ) -> TemporalObservationEvent:
        """Record temporal intent extraction."""
        obs = create_temporal_observation(
            run_id=self.run_id,
            query_temporal_intent=intent,
            intent_confidence=confidence,
            target_date=target_date,
            memories_filtered=memories_filtered,
            memories_returned=memories_returned,
            current_state_only=current_state_only,
        )
        self.temporal_observations.append(obs)
        return obs

    def record_context_compilation(
        self,
        memory_count: int | None = None,
        memory_ids: list[str] | None = None,
        total_context_tokens: int | None = None,
        memory_context_tokens: int | None = None,
        duplicates_removed: int | None = None,
        truncated: bool | None = None,
        current_state_memories: int | None = None,
        historical_memories: int | None = None,
        proactive_memories: int | None = None,
    ) -> ContextObservationEvent:
        """Record context compilation metrics."""
        obs = create_context_observation(
            run_id=self.run_id,
            memory_count=memory_count,
            memory_ids=memory_ids,
            total_context_tokens=total_context_tokens,
            memory_context_tokens=memory_context_tokens,
            duplicates_removed=duplicates_removed,
            truncated=truncated,
            current_state_memories=current_state_memories,
            historical_memories=historical_memories,
            proactive_memories=proactive_memories,
        )
        self.context_observation = obs
        return obs

    def record_tool_loop_metrics(
        self,
        tool_rounds: int | None = None,
        memory_tool_calls: int | None = None,
        non_memory_tool_calls: int | None = None,
        abstained_from_memory: bool | None = None,
        tool_failures: int | None = None,
        tool_loop_terminated: bool | None = None,
        total_tool_ms: float | None = None,
    ) -> ToolLoopObservationEvent:
        """Record tool loop metrics."""
        obs = create_tool_loop_observation(
            run_id=self.run_id,
            provider=self.provider,
            model=self.model,
            tool_rounds=tool_rounds,
            memory_tool_calls=memory_tool_calls,
            non_memory_tool_calls=non_memory_tool_calls,
            abstained_from_memory=abstained_from_memory,
            tool_failures=tool_failures,
            tool_loop_terminated=tool_loop_terminated,
            total_tool_ms=total_tool_ms,
        )
        self.tool_loop_observation = obs
        return obs

    def record_outcome(
        self,
        success: bool,
        outcome_type: str,
        details: str | None = None,
    ) -> None:
        """Record the run outcome."""
        from services.memory_result_contract import create_outcome_event
        event = create_outcome_event(
            run_id=self.run_id,
            success=success,
            outcome_type=outcome_type,
            details=details,
        )
        self.outcome_event = event.to_dict()

    def build_summary(self) -> RunObservationSummary:
        """Build the final RunObservationSummary."""
        return create_run_summary(
            run_id=self.run_id,
            provider=self.provider,
            model=self.model,
            conversation_id=self.conversation_id,
            user_id=self.user_id,
            workspace_id=self.workspace_id,
            project_id=self.project_id,
            memory_observations=[obs.to_dict() for obs in self.memory_observations],
            governor_observations=[obs.to_dict() for obs in self.governor_observations],
            conflict_observations=[obs.to_dict() for obs in self.conflict_observations],
            temporal_observations=[obs.to_dict() for obs in self.temporal_observations],
            context_observation=self.context_observation.to_dict() if self.context_observation else None,
            tool_loop_observation=self.tool_loop_observation.to_dict() if self.tool_loop_observation else None,
            outcome_event=self.outcome_event,
            user_feedback=self.user_feedback,
            total_ms=self.total_ms,
        )

    def to_log_dict(self) -> dict[str, Any]:
        """Export as a compact loggable dictionary."""
        summary = self.build_summary()
        return summary.to_dict()
