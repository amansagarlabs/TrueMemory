"""Agent Memory Capture — captures agent behavior as durable memory.

Integrates with the agent execution path to capture:
- Tool results that should be remembered
- Agent decisions and their reasoning
- Task completions and outcomes
- User corrections and feedback
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from services.agent_memory_tools import AgentMemoryTools, MemoryContext, MemoryToolResult
from services.memory_extraction import extract_memories_sync
from services.memory_governor import GovernorDecision, govern_candidate, MemoryPolicy
from services.memory_pipeline import candidates_to_write_objects

logger = logging.getLogger("truememory.agent_capture")


@dataclass(frozen=True)
class CaptureDecision:
    """Decision about whether to capture agent behavior as memory."""
    should_capture: bool
    capture_type: str  # tool_result, agent_decision, task_completion, user_correction
    content: str
    confidence: float = 0.0
    reason: str = ""


class AgentMemoryCapture:
    """Captures agent behavior as durable memory."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.tools = AgentMemoryTools(settings)
        self.policy = MemoryPolicy()

    def capture_tool_result(
        self,
        tool_name: str,
        result: str,
        context: MemoryContext,
        *,
        should_persist: bool = False,
    ) -> MemoryToolResult:
        """Capture a tool result as an observation.

        Args:
            tool_name: Name of the tool.
            result: Tool result content.
            context: Agent execution context.
            should_persist: Whether to persist as durable memory.

        Returns:
            MemoryToolResult with the observation.
        """
        return self.tools.capture_tool_result(
            tool_name=tool_name,
            result=result,
            context=context,
            should_persist=should_persist,
        )

    def capture_agent_decision(
        self,
        decision: str,
        reasoning: str,
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Capture an agent decision as durable memory.

        Args:
            decision: The decision made.
            reasoning: The reasoning behind the decision.
            context: Agent execution context.

        Returns:
            MemoryToolResult with the stored memory.
        """
        content = f"Decision: {decision}\nReasoning: {reasoning}"

        return self.tools.store_memory(
            key=f"decision:{decision[:50].lower().replace(' ', '_')}",
            content=content,
            context=context,
            memory_type="decision",
            confidence=0.85,
            importance=0.80,
        )

    def capture_task_completion(
        self,
        task_description: str,
        outcome: str,
        context: MemoryContext,
        *,
        success: bool = True,
    ) -> MemoryToolResult:
        """Capture a task completion as durable memory.

        Args:
            task_description: Description of the task.
            outcome: The outcome of the task.
            context: Agent execution context.
            success: Whether the task was successful.

        Returns:
            MemoryToolResult with the stored memory.
        """
        content = f"Task: {task_description}\nOutcome: {outcome}\nSuccess: {success}"

        return self.tools.store_memory(
            key=f"task:{task_description[:50].lower().replace(' ', '_')}",
            content=content,
            context=context,
            memory_type="task_completion",
            confidence=0.90 if success else 0.70,
            importance=0.85 if success else 0.60,
        )

    def capture_user_correction(
        self,
        original_answer: str,
        corrected_answer: str,
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Capture a user correction as durable memory.

        Args:
            original_answer: The original answer given.
            corrected_answer: The corrected answer.
            context: Agent execution context.

        Returns:
            MemoryToolResult with the stored memory.
        """
        content = (
            f"Original: {original_answer}\n"
            f"Corrected: {corrected_answer}"
        )

        return self.tools.store_memory(
            key=f"correction:{corrected_answer[:50].lower().replace(' ', '_')}",
            content=content,
            context=context,
            memory_type="user_correction",
            confidence=0.95,
            importance=0.90,
        )

    def capture_observations(
        self,
        observations: list[str],
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Capture multiple observations as durable memory.

        Args:
            observations: List of observations.
            context: Agent execution context.

        Returns:
            MemoryToolResult with the stored memories.
        """
        results = []
        for obs in observations:
            result = self.tools.store_memory(
                key=f"observation:{obs[:50].lower().replace(' ', '_')}",
                content=obs,
                context=context,
                memory_type="observation",
                confidence=0.75,
                importance=0.70,
            )
            results.append(result)

        success = all(r.success for r in results)
        return MemoryToolResult(
            success=success,
            data=[r.data for r in results if r.success],
            metadata={"count": len(results)},
        )


def create_agent_memory_capture(settings: Any) -> AgentMemoryCapture:
    """Factory function to create AgentMemoryCapture."""
    return AgentMemoryCapture(settings)
