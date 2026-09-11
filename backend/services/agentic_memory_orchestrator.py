"""Agentic Memory Orchestrator — coordinates memory operations for the agent.

Provides the main interface for agent-controlled memory retrieval,
decision making, and outcome tracking.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from services.agent_memory_tools import AgentMemoryTools, MemoryContext, MemoryToolResult
from services.memory_decision_engine import (
    classify_memory_need,
    plan_memory_query,
    should_retrieve_memory,
    MemoryDecision,
    MemoryNeed,
)
from services.memory_result_contract import (
    MemoryResult,
    MemoryQueryResult,
    MemoryInfluenceEvent,
    OutcomeEvent,
    create_memory_result,
    create_memory_query_result,
    create_influence_event,
    create_outcome_event,
)

logger = logging.getLogger("truememory.orchestrator")


@dataclass
class AgenticMemoryState:
    """State for an agent execution run."""
    run_id: str
    user_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    conversation_id: str | None = None
    decisions: list[MemoryDecision] = field(default_factory=list)
    queries: list[MemoryQueryResult] = field(default_factory=list)
    influences: list[MemoryInfluenceEvent] = field(default_factory=list)
    outcomes: list[OutcomeEvent] = field(default_factory=list)
    memories_used: set[str] = field(default_factory=set)


class AgenticMemoryOrchestrator:
    """Orchestrates memory operations for the agent."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.tools = AgentMemoryTools(settings)

    def analyze_request(
        self,
        question: str,
        context: MemoryContext,
    ) -> MemoryDecision:
        """Analyze a user request to determine if memory is needed.

        Args:
            question: The user's question.
            context: Agent execution context.

        Returns:
            MemoryDecision with the analysis.
        """
        ctx_dict = {
            "project_id": context.project_id,
            "workspace_id": context.workspace_id,
        }
        decision = classify_memory_need(question, ctx_dict)
        return decision

    def execute_memory_plan(
        self,
        decision: MemoryDecision,
        context: MemoryContext,
        state: AgenticMemoryState,
    ) -> MemoryQueryResult:
        """Execute a memory query plan.

        Args:
            decision: The memory decision.
            context: Agent execution context.
            state: Current agent state.

        Returns:
            MemoryQueryResult with the results.
        """
        start = time.monotonic()
        state.decisions.append(decision)

        try:
            if decision.need == MemoryNeed.NOT_NEEDED:
                return create_memory_query_result(
                    operation="none",
                    memories=[],
                    retrieval_time_ms=0.0,
                    success=True,
                )

            if decision.need == MemoryNeed.EXPLICIT_MEMORY_COMMAND:
                if decision.memory_key:
                    result = self.tools.get_memory_versions(
                        decision.memory_key,
                        context,
                    )
                    if result.success:
                        memories = [
                            create_memory_result(
                                memory_id=item.get("memory_id", ""),
                                content=item.get("content", ""),
                                type=item.get("type", "fact"),
                                state=item.get("state", "current"),
                                scope="workspace",
                                confidence=item.get("confidence", 0.75),
                                valid_from=item.get("valid_from"),
                                valid_until=item.get("valid_until"),
                            )
                            for item in (result.data or [])
                        ]
                        latency = (time.monotonic() - start) * 1000
                        query_result = create_memory_query_result(
                            operation="timeline",
                            memories=memories,
                            retrieval_time_ms=latency,
                            success=True,
                        )
                        state.queries.append(query_result)
                        return query_result

            if decision.need == MemoryNeed.STATE_CHECK:
                result = self.tools.get_current_state(context)
                if result.success:
                    memories = [
                        create_memory_result(
                            memory_id=item.get("memory_id", ""),
                            content=item.get("content", ""),
                            type=item.get("type", "fact"),
                            state=item.get("state", "current"),
                            scope="workspace",
                            confidence=item.get("confidence", 0.75),
                        )
                        for item in (result.data or [])
                    ]
                    latency = (time.monotonic() - start) * 1000
                    query_result = create_memory_query_result(
                        operation="current_state",
                        memories=memories,
                        retrieval_time_ms=latency,
                        success=True,
                    )
                    state.queries.append(query_result)
                    return query_result

            result = self.tools.search_memory(
                query=decision.query,
                context=context,
                scope=decision.scope,
                limit=10,
                current_state_only=decision.need != MemoryNeed.HISTORICAL_CHECK,
            )

            if result.success:
                memories = [
                    create_memory_result(
                        memory_id=item.get("memory_id", ""),
                        content=item.get("content", ""),
                        type=item.get("type", "fact"),
                        state=item.get("state", "current"),
                        scope=item.get("scope", "workspace"),
                        confidence=item.get("confidence", 0.75),
                        valid_from=item.get("valid_from"),
                        valid_until=item.get("valid_until"),
                        source_type=item.get("scope", "user"),
                    )
                    for item in (result.data or [])
                ]
                latency = (time.monotonic() - start) * 1000
                query_result = create_memory_query_result(
                    operation="search",
                    memories=memories,
                    retrieval_time_ms=latency,
                    success=True,
                )
                state.queries.append(query_result)
                return query_result

            latency = (time.monotonic() - start) * 1000
            query_result = create_memory_query_result(
                operation="search",
                memories=[],
                retrieval_time_ms=latency,
                success=False,
                error=result.error,
            )
            state.queries.append(query_result)
            return query_result

        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            query_result = create_memory_query_result(
                operation="search",
                memories=[],
                retrieval_time_ms=latency,
                success=False,
                error=str(exc),
            )
            state.queries.append(query_result)
            return query_result

    def record_influence(
        self,
        state: AgenticMemoryState,
        memory_id: str,
        stage: str,
        evidence: str,
        confidence: float,
    ) -> MemoryInfluenceEvent:
        """Record that memory influenced agent behavior.

        Args:
            state: Current agent state.
            memory_id: The memory that influenced behavior.
            stage: The stage of agent reasoning.
            evidence: Type of evidence.
            confidence: Confidence in the influence.

        Returns:
            MemoryInfluenceEvent.
        """
        event = create_influence_event(
            run_id=state.run_id,
            memory_id=memory_id,
            stage=stage,
            evidence=evidence,
            confidence=confidence,
        )
        state.influences.append(event)
        state.memories_used.add(memory_id)
        return event

    def record_outcome(
        self,
        state: AgenticMemoryState,
        success: bool,
        outcome_type: str,
        details: str | None = None,
        influence_event_id: str | None = None,
    ) -> OutcomeEvent:
        """Record the outcome of an agent action.

        Args:
            state: Current agent state.
            success: Whether the action was successful.
            outcome_type: Type of outcome.
            details: Optional details.
            influence_event_id: Optional influence event ID.

        Returns:
            OutcomeEvent.
        """
        event = create_outcome_event(
            run_id=state.run_id,
            success=success,
            outcome_type=outcome_type,
            details=details,
            influence_event_id=influence_event_id,
        )
        state.outcomes.append(event)
        return event

    def get_memory_context(
        self,
        decision: MemoryDecision,
        query_result: MemoryQueryResult,
        *,
        max_tokens: int = 2000,
    ) -> str:
        """Format memory results for injection into agent context.

        Args:
            decision: The memory decision.
            query_result: The query result.
            max_tokens: Maximum tokens for context.

        Returns:
            Formatted memory context string.
        """
        if not query_result.memories:
            return ""

        lines = []
        current_tokens = 0

        for mem in query_result.memories:
            line = f"- [{mem.state.upper()}] ({mem.type}) {mem.content}"
            estimated_tokens = len(line.split()) + 5

            if current_tokens + estimated_tokens > max_tokens:
                break

            lines.append(line)
            current_tokens += estimated_tokens

        if not lines:
            return ""

        header = f"RELEVANT MEMORY ({decision.need.value}):"
        return header + "\n" + "\n".join(lines)

    def get_run_summary(self, state: AgenticMemoryState) -> dict[str, Any]:
        """Get a summary of memory operations for a run.

        Args:
            state: Current agent state.

        Returns:
            Summary dictionary.
        """
        return {
            "run_id": state.run_id,
            "decisions": len(state.decisions),
            "queries": len(state.queries),
            "influences": len(state.influences),
            "outcomes": len(state.outcomes),
            "memories_used": list(state.memories_used),
            "total_retrieval_ms": sum(q.retrieval_time_ms for q in state.queries),
        }


def create_agentic_memory_orchestrator(settings: Any) -> AgenticMemoryOrchestrator:
    """Factory function to create AgenticMemoryOrchestrator."""
    return AgenticMemoryOrchestrator(settings)
