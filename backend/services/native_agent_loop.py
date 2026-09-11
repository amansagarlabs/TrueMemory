"""Native Agent Memory Loop — handles tool calling with memory tools.

Provides the agent loop that allows the LLM to invoke memory tools.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from services.native_memory_executor import NativeMemoryToolExecutor, ToolCallResult
from services.agent_memory_tools import MemoryContext

logger = logging.getLogger("truememory.agent_loop")


@dataclass
class AgentMessage:
    """Message in the agent conversation."""
    role: str
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class AgentLoopState:
    """State for an agent loop execution."""
    run_id: str
    messages: list[AgentMessage] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[ToolCallResult] = field(default_factory=list)
    iteration: int = 0
    max_iterations: int = 5
    total_tokens: int = 0


class NativeAgentMemoryLoop:
    """Agent loop that supports memory tool calling."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.executor = NativeMemoryToolExecutor(settings)

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """Get tool definitions for the LLM."""
        return self.executor.get_tool_definitions()

    def create_tool_call_message(
        self,
        tool_call_id: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> AgentMessage:
        """Create a tool call message for the LLM."""
        return AgentMessage(
            role="assistant",
            content=None,
            tool_calls=[{
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": json.dumps(arguments),
                },
            }],
        )

    def create_tool_result_message(
        self,
        tool_call_id: str,
        tool_name: str,
        result: ToolCallResult,
    ) -> AgentMessage:
        """Create a tool result message for the LLM."""
        content = json.dumps({
            "success": result.success,
            "data": result.result,
            "error": result.error,
        })
        return AgentMessage(
            role="tool",
            content=content,
            tool_call_id=tool_call_id,
            name=tool_name,
        )

    def execute_tool_call(
        self,
        tool_call: dict[str, Any],
        context: MemoryContext,
        run_id: str | None = None,
    ) -> ToolCallResult:
        """Execute a tool call from the LLM."""
        function = tool_call.get("function", {})
        tool_name = function.get("name", "")
        try:
            arguments = json.loads(function.get("arguments", "{}"))
        except json.JSONDecodeError:
            arguments = {}

        return self.executor.execute_tool_call(
            tool_name=tool_name,
            arguments=arguments,
            context=context,
            run_id=run_id,
        )

    def process_tool_calls(
        self,
        tool_calls: list[dict[str, Any]],
        context: MemoryContext,
        run_id: str | None = None,
    ) -> list[AgentMessage]:
        """Process multiple tool calls and return result messages."""
        results = []
        for tool_call in tool_calls:
            result = self.execute_tool_call(tool_call, context, run_id)
            result_message = self.create_tool_result_message(
                tool_call_id=tool_call.get("id", ""),
                tool_name=tool_call.get("function", {}).get("name", ""),
                result=result,
            )
            results.append(result_message)
        return results

    def format_tool_results_for_prompt(
        self,
        tool_results: list[ToolCallResult],
    ) -> str:
        """Format tool results for injection into the prompt."""
        if not tool_results:
            return ""

        lines = []
        for result in tool_results:
            if result.success and result.result:
                memories = result.result if isinstance(result.result, list) else []
                for mem in memories[:5]:
                    if isinstance(mem, dict):
                        state = mem.get("state", "current")
                        mem_type = mem.get("type", "fact")
                        content = mem.get("content", "")
                        lines.append(f"- [{state.upper()}] ({mem_type}) {content}")

        if not lines:
            return ""

        return "MEMORY RESULTS:\n" + "\n".join(lines)

    def get_attribution_events(self) -> list[dict[str, Any]]:
        """Get attribution events from the executor."""
        return self.executor.get_attribution_events()


def create_native_agent_loop(settings: Any) -> NativeAgentMemoryLoop:
    """Factory function to create NativeAgentMemoryLoop."""
    return NativeAgentMemoryLoop(settings)
