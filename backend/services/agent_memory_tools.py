"""Agent Memory Tools — first-class memory capability for the agent.

Provides structured memory operations that the agent can call during execution.
Integrates with existing memory infrastructure without duplication.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from services.memory_core import MemoryClient
from services.memory_extraction import ExtractionResult, extract_memories_sync
from services.memory_governor import GovernorDecision, govern_candidate, MemoryPolicy
from services.memory_pipeline import candidates_to_write_objects

logger = logging.getLogger("truememory.agent_tools")


@dataclass(frozen=True)
class MemoryToolResult:
    """Structured result from a memory tool operation."""
    success: bool
    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MemoryContext:
    """Context for memory operations during agent execution."""
    user_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    conversation_id: str | None = None
    run_id: str | None = None
    task_id: str | None = None


class AgentMemoryTools:
    """Memory interface for the agent during execution."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.client = MemoryClient(settings)
        self.policy = MemoryPolicy()

    def search_memory(
        self,
        query: str,
        context: MemoryContext,
        *,
        scope: str = "workspace",
        limit: int = 10,
        current_state_only: bool = True,
    ) -> MemoryToolResult:
        """Search for relevant memories based on query.

        Args:
            query: Natural language query or search terms.
            context: Agent execution context.
            scope: Memory scope (workspace, user, general).
            limit: Maximum results to return.
            current_state_only: If True, return only current state (not historical).

        Returns:
            MemoryToolResult with relevant memories.
        """
        try:
            workspace_id = context.workspace_id if scope == "workspace" else None
            items = self.client.search(
                user_id=context.user_id,
                scope=scope,
                query=query,
                limit=limit,
                workspace_id=workspace_id,
                project_id=context.project_id,
                include_history=not current_state_only,
            )

            results = []
            for item in items:
                results.append({
                    "memory_id": item.get("id") or item.get("key", ""),
                    "type": item.get("memory_type", "fact"),
                    "content": item.get("content", ""),
                    "state": "superseded" if item.get("lifecycle_status") == "superseded" else "current",
                    "confidence": float(item.get("confidence_score", 0.75)),
                    "scope": item.get("source", "user"),
                    "valid_from": item.get("valid_from"),
                    "valid_until": item.get("valid_until"),
                })

            return MemoryToolResult(
                success=True,
                data=results,
                metadata={"count": len(results), "query": query},
            )
        except Exception as exc:
            logger.warning("Memory search failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))

    def get_current_state(
        self,
        context: MemoryContext,
        *,
        entity_type: str | None = None,
    ) -> MemoryToolResult:
        """Get the current state of all relevant memories.

        Args:
            context: Agent execution context.
            entity_type: Optional filter by memory type.

        Returns:
            MemoryToolResult with current state.
        """
        try:
            if not context.workspace_id:
                return MemoryToolResult(success=False, error="workspace_id required")

            items = self.client.current_state(
                user_id=context.user_id,
                workspace_id=context.workspace_id,
                project_id=context.project_id,
            )

            if entity_type:
                items = [i for i in items if i.get("memory_type") == entity_type]

            results = []
            for item in items:
                results.append({
                    "memory_id": item.get("id") or item.get("key", ""),
                    "type": item.get("memory_type", "fact"),
                    "content": item.get("content", ""),
                    "state": "current",
                    "confidence": float(item.get("confidence_score", 0.75)),
                })

            return MemoryToolResult(
                success=True,
                data=results,
                metadata={"count": len(results)},
            )
        except Exception as exc:
            logger.warning("Get current state failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))

    def get_memory_versions(
        self,
        memory_key: str,
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Get the version history of a specific memory.

        Args:
            memory_key: The memory key to get versions for.
            context: Agent execution context.

        Returns:
            MemoryToolResult with version history.
        """
        try:
            if not context.workspace_id:
                return MemoryToolResult(success=False, error="workspace_id required")

            items = self.client.memory_versions(
                user_id=context.user_id,
                workspace_id=context.workspace_id,
                memory_key=memory_key,
                project_id=context.project_id,
            )

            results = []
            for item in items:
                results.append({
                    "memory_id": item.get("id") or item.get("key", ""),
                    "type": item.get("memory_type", "fact"),
                    "content": item.get("content", ""),
                    "revision": int(item.get("revision", 1)),
                    "state": item.get("lifecycle_status", "approved"),
                    "valid_from": item.get("valid_from"),
                    "valid_until": item.get("valid_until"),
                })

            return MemoryToolResult(
                success=True,
                data=results,
                metadata={"count": len(results), "memory_key": memory_key},
            )
        except Exception as exc:
            logger.warning("Get memory versions failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))

    def store_memory(
        self,
        key: str,
        content: str,
        context: MemoryContext,
        *,
        memory_type: str = "fact",
        confidence: float = 0.85,
        importance: float = 0.75,
    ) -> MemoryToolResult:
        """Store a new memory through the governance pipeline.

        Args:
            key: Memory key (identifier).
            content: Memory content.
            context: Agent execution context.
            memory_type: Type of memory.
            confidence: Confidence in the memory.
            importance: Importance score.

        Returns:
            MemoryToolResult with the stored memory.
        """
        try:
            from services.experience_capture import capture_agent_observation, Experience

            experience = capture_agent_observation(
                content,
                run_id=context.run_id,
                task_id=context.task_id,
            )

            extraction = extract_memories_sync(
                content,
                source_type="agent_observation",
            )

            accepted = []
            for candidate in extraction.candidates:
                result = govern_candidate(candidate, policy=self.policy)
                if result.decision not in (
                    GovernorDecision.REJECT,
                    GovernorDecision.NOOP,
                    GovernorDecision.EXPIRE,
                ):
                    accepted.append(candidate)

            if not accepted:
                from dataclasses import dataclass as dc

                @dc
                class SimpleCandidate:
                    memory_type: str
                    memory_key: str
                    content: str
                    importance_score: float

                accepted = [SimpleCandidate(
                    memory_type=memory_type,
                    memory_key=key,
                    content=content,
                    importance_score=importance,
                )]

            write_candidates = candidates_to_write_objects(
                accepted,
                user_id=context.user_id,
                workspace_id=context.workspace_id or "",
                conversation_id=context.conversation_id,
                project_id=context.project_id,
            )

            saved = self.client.save_workspace_candidates(
                user_id=context.user_id,
                workspace_id=context.workspace_id or "",
                conversation_id=context.conversation_id or "",
                source_message_id=None,
                candidates=write_candidates,
                project_id=context.project_id,
            )

            return MemoryToolResult(
                success=True,
                data=saved[0] if saved else None,
                metadata={"operation": "store", "key": key},
            )
        except Exception as exc:
            logger.warning("Memory store failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))

    def forget_memory(
        self,
        memory_key: str,
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Forget a specific memory.

        Args:
            memory_key: The memory key to forget.
            context: Agent execution context.

        Returns:
            MemoryToolResult with the result.
        """
        try:
            forgotten = self.client.forget(
                user_id=context.user_id,
                scope="workspace",
                key=memory_key,
                workspace_id=context.workspace_id,
            )
            return MemoryToolResult(
                success=True,
                data={"forgotten": forgotten},
                metadata={"operation": "forget", "key": memory_key},
            )
        except Exception as exc:
            logger.warning("Memory forget failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))

    def capture_tool_result(
        self,
        tool_name: str,
        result: str,
        context: MemoryContext,
        *,
        should_persist: bool = False,
    ) -> MemoryToolResult:
        """Capture a tool result as an observation.

        If should_persist is True, also attempts to extract and store durable memory.

        Args:
            tool_name: Name of the tool.
            result: Tool result content.
            context: Agent execution context.
            should_persist: Whether to persist as durable memory.

        Returns:
            MemoryToolResult with the observation.
        """
        try:
            from services.experience_capture import capture_tool_result as capture

            experience = capture(
                tool_name=tool_name,
                result=result,
                run_id=context.run_id,
                task_id=context.task_id,
            )

            if not should_persist:
                return MemoryToolResult(
                    success=True,
                    data={"observed": True, "source": "tool_result"},
                    metadata={"tool_name": tool_name},
                )

            extraction = extract_memories_sync(
                f"[{tool_name}] {result}",
                source_type="tool_result",
            )

            accepted = []
            for candidate in extraction.candidates:
                gov_result = govern_candidate(candidate, policy=self.policy)
                if gov_result.decision not in (
                    GovernorDecision.REJECT,
                    GovernorDecision.NOOP,
                    GovernorDecision.EXPIRE,
                ):
                    accepted.append(candidate)

            if accepted:
                write_candidates = candidates_to_write_objects(
                    accepted,
                    user_id=context.user_id,
                    workspace_id=context.workspace_id or "",
                    conversation_id=context.conversation_id,
                    project_id=context.project_id,
                )
                self.client.save_workspace_candidates(
                    user_id=context.user_id,
                    workspace_id=context.workspace_id or "",
                    conversation_id=context.conversation_id or "",
                    source_message_id=None,
                    candidates=write_candidates,
                    project_id=context.project_id,
                )

            return MemoryToolResult(
                success=True,
                data={"observed": True, "persisted": len(accepted) > 0},
                metadata={"tool_name": tool_name},
            )
        except Exception as exc:
            logger.warning("Tool result capture failed: %s", exc)
            return MemoryToolResult(success=False, error=str(exc))


def create_agent_memory_tools(settings: Any) -> AgentMemoryTools:
    """Factory function to create AgentMemoryTools."""
    return AgentMemoryTools(settings)
