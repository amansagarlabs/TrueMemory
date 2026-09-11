"""Native Memory Tool Executor — handles memory tool calls from the LLM.

Provides the execution layer for memory tools that the model can invoke.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from services.agent_memory_tools import AgentMemoryTools, MemoryContext, MemoryToolResult
from services.memory_tool_registry import MEMORY_TOOLS, get_memory_tool_by_name

logger = logging.getLogger("truememory.native_executor")


@dataclass
class ToolCallResult:
    """Result from executing a tool call."""
    tool_call_id: str
    tool_name: str
    success: bool
    result: Any = None
    error: str | None = None
    execution_time_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AttributionEvent:
    """Event tracking memory attribution."""
    id: str
    run_id: str
    task_id: str | None = None
    session_id: str | None = None
    memory_id: str | None = None
    tool_call_id: str | None = None
    retrieval_event_id: str | None = None
    stage: str = "reasoning"
    evidence: str = "unknown"
    confidence: float = 0.0
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "session_id": self.session_id,
            "memory_id": self.memory_id,
            "tool_call_id": self.tool_call_id,
            "retrieval_event_id": self.retrieval_event_id,
            "stage": self.stage,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
        }


class NativeMemoryToolExecutor:
    """Executes memory tool calls from the LLM."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.tools = AgentMemoryTools(settings)
        self.attribution_events: list[AttributionEvent] = []

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """Get memory tool definitions for the LLM."""
        from services.memory_tool_registry import get_memory_tool_definitions
        return get_memory_tool_definitions()

    def execute_tool_call(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        context: MemoryContext,
        *,
        run_id: str | None = None,
        task_id: str | None = None,
    ) -> ToolCallResult:
        """Execute a memory tool call.

        Args:
            tool_name: Name of the tool to execute.
            arguments: Tool arguments.
            context: Memory context with user/workspace/project IDs.
            run_id: Optional run ID for attribution.
            task_id: Optional task ID for attribution.

        Returns:
            ToolCallResult with the execution result.
        """
        start = time.monotonic()
        tool_call_id = str(uuid4())

        try:
            tool_def = get_memory_tool_by_name(tool_name)
            if not tool_def:
                return ToolCallResult(
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    success=False,
                    error=f"Unknown tool: {tool_name}",
                    execution_time_ms=(time.monotonic() - start) * 1000,
                )

            result = self._execute_tool(tool_name, arguments, context)
            execution_time = (time.monotonic() - start) * 1000

            if result.success and result.data:
                self._record_attribution(
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    result=result,
                    run_id=run_id,
                    task_id=task_id,
                )

            return ToolCallResult(
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                success=result.success,
                result=result.data,
                error=result.error,
                execution_time_ms=execution_time,
                metadata=result.metadata,
            )

        except Exception as exc:
            execution_time = (time.monotonic() - start) * 1000
            logger.warning("Tool execution failed: %s", exc)
            return ToolCallResult(
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                success=False,
                error=str(exc),
                execution_time_ms=execution_time,
            )

    def _execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        context: MemoryContext,
    ) -> MemoryToolResult:
        """Execute the actual tool operation."""
        if tool_name == "memory_search":
            return self.tools.search_memory(
                query=arguments.get("query", ""),
                context=context,
                scope=arguments.get("scope", "workspace"),
                limit=arguments.get("limit", 10),
                current_state_only=arguments.get("current_state_only", True),
            )

        elif tool_name == "memory_current_state":
            return self.tools.get_current_state(
                context=context,
                entity_type=arguments.get("entity_type"),
            )

        elif tool_name == "memory_timeline":
            return self.tools.get_memory_versions(
                memory_key=arguments.get("memory_key", ""),
                context=context,
            )

        elif tool_name == "memory_store":
            return self.tools.store_memory(
                key=arguments.get("key", ""),
                content=arguments.get("content", ""),
                context=context,
                memory_type=arguments.get("memory_type", "fact"),
                confidence=arguments.get("confidence", 0.85),
                importance=arguments.get("importance", 0.75),
            )

        elif tool_name == "memory_forget":
            return self.tools.forget_memory(
                memory_key=arguments.get("memory_key", ""),
                context=context,
            )

        elif tool_name == "memory_related":
            return self.tools.search_memory(
                query=arguments.get("topic", ""),
                context=context,
                scope="workspace",
                limit=arguments.get("limit", 10),
                current_state_only=True,
            )

        else:
            return MemoryToolResult(
                success=False,
                error=f"Unknown tool: {tool_name}",
            )

    def _record_attribution(
        self,
        tool_call_id: str,
        tool_name: str,
        result: MemoryToolResult,
        run_id: str | None,
        task_id: str | None,
    ) -> None:
        """Record attribution for memory retrieval."""
        if not result.data:
            return

        memories = result.data if isinstance(result.data, list) else []
        for mem in memories[:3]:  # Limit to top 3 for attribution
            memory_id = mem.get("memory_id", "") if isinstance(mem, dict) else ""
            if memory_id:
                event = AttributionEvent(
                    id=str(uuid4()),
                    run_id=run_id or "unknown",
                    task_id=task_id,
                    memory_id=memory_id,
                    tool_call_id=tool_call_id,
                    stage="retrieval",
                    evidence="tool_call",
                    confidence=mem.get("confidence", 0.0) if isinstance(mem, dict) else 0.0,
                )
                self.attribution_events.append(event)

    def get_attribution_events(self) -> list[dict[str, Any]]:
        """Get all attribution events."""
        return [e.to_dict() for e in self.attribution_events]

    def clear_attribution_events(self) -> None:
        """Clear attribution events."""
        self.attribution_events.clear()


def create_native_memory_executor(settings: Any) -> NativeMemoryToolExecutor:
    """Factory function to create NativeMemoryToolExecutor."""
    return NativeMemoryToolExecutor(settings)
