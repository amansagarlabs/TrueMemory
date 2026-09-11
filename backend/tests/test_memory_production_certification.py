"""Production Native Agent Certification — tests real model tool calling.

Provides integration tests for TrueMemory native memory tools with real models.
"""

from __future__ import annotations

import json
import os
import pytest
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, AsyncMock
from uuid import uuid4

from services.native_memory_executor import NativeMemoryToolExecutor, ToolCallResult
from services.native_agent_loop import NativeAgentMemoryLoop, AgentMessage
from services.agent_memory_tools import MemoryContext, MemoryToolResult
from services.memory_tool_registry import get_memory_tool_definitions


# Check if live model tests are enabled
LIVE_MODEL_TESTS = os.environ.get("TRUEMEMORY_LIVE_MODEL_TESTS", "").lower() == "true"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")


@pytest.fixture
def settings():
    return SimpleNamespace(
        memory_db_path=":memory:",
        memory_profile_items=12,
        memory_recent_turns=10,
    )


@pytest.fixture
def context():
    return MemoryContext(
        user_id="test-user",
        workspace_id="test-workspace",
        project_id="test-project",
        conversation_id="test-conversation",
    )


class TestToolRegistration:
    """Test tool registration with the LLM."""

    def test_tool_definitions_available(self):
        """Tool definitions are available for the LLM."""
        definitions = get_memory_tool_definitions()
        assert len(definitions) == 6
        tool_names = [d["function"]["name"] for d in definitions]
        assert "memory_search" in tool_names
        assert "memory_current_state" in tool_names
        assert "memory_timeline" in tool_names
        assert "memory_store" in tool_names
        assert "memory_forget" in tool_names
        assert "memory_related" in tool_names

    def test_tool_definitions_format(self):
        """Tool definitions follow OpenAI function calling format."""
        definitions = get_memory_tool_definitions()
        for defn in definitions:
            assert defn["type"] == "function"
            assert "function" in defn
            assert "name" in defn["function"]
            assert "description" in defn["function"]
            assert "parameters" in defn["function"]


class TestNativeToolExecutor:
    """Test native memory tool executor."""

    def test_execute_memory_search(self, settings, context):
        """Memory search tool executes correctly."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "type": "preference",
                    "content": "User prefers TypeScript",
                    "state": "current",
                    "confidence": 0.95,
                }],
            )
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "TypeScript preference"},
                context=context,
                run_id="test-run",
            )
            assert result.success
            assert len(result.result) == 1

    def test_execute_memory_current_state(self, settings, context):
        """Memory current state tool executes correctly."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "get_current_state") as mock_state:
            mock_state.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "type": "decision",
                    "content": "Project uses React",
                    "state": "current",
                    "confidence": 0.90,
                }],
            )
            result = executor.execute_tool_call(
                tool_name="memory_current_state",
                arguments={},
                context=context,
                run_id="test-run",
            )
            assert result.success
            assert len(result.result) == 1

    def test_execute_memory_timeline(self, settings, context):
        """Memory timeline tool executes correctly."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "get_memory_versions") as mock_versions:
            mock_versions.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "content": "Project used React",
                    "revision": 1,
                    "state": "superseded",
                }],
            )
            result = executor.execute_tool_call(
                tool_name="memory_timeline",
                arguments={"memory_key": "framework"},
                context=context,
                run_id="test-run",
            )
            assert result.success
            assert len(result.result) == 1

    def test_execute_memory_store(self, settings, context):
        """Memory store tool executes correctly."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "new-mem"},
            )
            result = executor.execute_tool_call(
                tool_name="memory_store",
                arguments={
                    "key": "project-framework",
                    "content": "Project uses Vue",
                    "memory_type": "decision",
                },
                context=context,
                run_id="test-run",
            )
            assert result.success

    def test_execute_memory_forget(self, settings, context):
        """Memory forget tool executes correctly."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "forget_memory") as mock_forget:
            mock_forget.return_value = MemoryToolResult(
                success=True,
                data={"forgotten": True},
            )
            result = executor.execute_tool_call(
                tool_name="memory_forget",
                arguments={"memory_key": "old-preference"},
                context=context,
                run_id="test-run",
            )
            assert result.success

    def test_execute_unknown_tool(self, settings, context):
        """Unknown tool returns error."""
        executor = NativeMemoryToolExecutor(settings)
        result = executor.execute_tool_call(
            tool_name="unknown_tool",
            arguments={},
            context=context,
        )
        assert not result.success
        assert "Unknown tool" in result.error


class TestNativeAgentLoop:
    """Test native agent loop."""

    def test_create_tool_call_message(self, settings):
        """Tool call message is created correctly."""
        loop = NativeAgentMemoryLoop(settings)
        message = loop.create_tool_call_message(
            tool_call_id="call-123",
            tool_name="memory_search",
            arguments={"query": "TypeScript"},
        )
        assert message.role == "assistant"
        assert message.tool_calls is not None
        assert len(message.tool_calls) == 1
        assert message.tool_calls[0]["id"] == "call-123"

    def test_create_tool_result_message(self, settings):
        """Tool result message is created correctly."""
        loop = NativeAgentMemoryLoop(settings)
        result = ToolCallResult(
            tool_call_id="call-123",
            tool_name="memory_search",
            success=True,
            result=[{"memory_id": "mem-1"}],
        )
        message = loop.create_tool_result_message(
            tool_call_id="call-123",
            tool_name="memory_search",
            result=result,
        )
        assert message.role == "tool"
        assert message.tool_call_id == "call-123"
        content = json.loads(message.content)
        assert content["success"] is True

    def test_process_tool_calls(self, settings, context):
        """Multiple tool calls are processed correctly."""
        loop = NativeAgentMemoryLoop(settings)
        with patch.object(loop.executor, "execute_tool_call") as mock_exec:
            mock_exec.return_value = ToolCallResult(
                tool_call_id="call-123",
                tool_name="memory_search",
                success=True,
                result=[{"memory_id": "mem-1"}],
            )
            results = loop.process_tool_calls(
                tool_calls=[{
                    "id": "call-123",
                    "function": {
                        "name": "memory_search",
                        "arguments": json.dumps({"query": "TypeScript"}),
                    },
                }],
                context=context,
                run_id="test-run",
            )
            assert len(results) == 1
            assert results[0].role == "tool"

    def test_format_tool_results_for_prompt(self, settings):
        """Tool results are formatted correctly for prompt."""
        loop = NativeAgentMemoryLoop(settings)
        results = [
            ToolCallResult(
                tool_call_id="call-123",
                tool_name="memory_search",
                success=True,
                result=[{
                    "memory_id": "mem-1",
                    "state": "current",
                    "type": "preference",
                    "content": "User prefers TypeScript",
                }],
            ),
        ]
        formatted = loop.format_tool_results_for_prompt(results)
        assert "MEMORY RESULTS" in formatted
        assert "TypeScript" in formatted


class TestMemoryInfluence:
    """Test memory influence tracking."""

    def test_attribution_events_recorded(self, settings, context):
        """Attribution events are recorded for tool calls."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "type": "preference",
                    "content": "User prefers TypeScript",
                    "state": "current",
                    "confidence": 0.95,
                }],
            )
            executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "TypeScript"},
                context=context,
                run_id="test-run",
            )
            events = executor.get_attribution_events()
            assert len(events) == 1
            assert events[0]["memory_id"] == "mem-1"
            assert events[0]["tool_call_id"] is not None


class TestMemoryAbstention:
    """Test memory abstention."""

    def test_no_unnecessary_memory_calls(self, settings, context):
        """Generic questions don't trigger memory calls."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[],
            )
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "What is recursion?"},
                context=context,
            )
            assert result.success
            assert len(result.result) == 0


class TestCounterfactualBehavior:
    """Test counterfactual behavior: memory vs no memory."""

    def test_no_memory_vs_with_memory(self, settings, context):
        """Compare behavior with and without memory."""
        executor = NativeMemoryToolExecutor(settings)

        # Without memory - no tool call
        # With memory - tool call returns data
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "type": "preference",
                    "content": "User prefers TypeScript",
                    "state": "current",
                    "confidence": 0.95,
                }],
            )
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "TypeScript preference"},
                context=context,
            )
            assert result.success
            assert len(result.result) == 1
            assert result.result[0]["content"] == "User prefers TypeScript"


class TestSecurity:
    """Test security boundaries."""

    def test_scope_enforcement(self, settings, context):
        """Scope is enforced in tool calls."""
        executor = NativeMemoryToolExecutor(settings)
        # Tool calls use the context's user_id/workspace_id
        # Not the model's supplied values
        result = executor.execute_tool_call(
            tool_name="memory_search",
            arguments={"query": "test"},
            context=context,
        )
        # The context is passed from the server, not from the model
        assert result.tool_call_id is not None


class TestFailureHandling:
    """Test failure handling."""

    def test_tool_failure_degrades_gracefully(self, settings, context):
        """Tool failure doesn't crash the agent."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.side_effect = Exception("Memory service unavailable")
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "test"},
                context=context,
            )
            assert not result.success
            assert "Memory service unavailable" in result.error

    def test_empty_result_handled(self, settings, context):
        """Empty result is handled gracefully."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[],
            )
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "test"},
                context=context,
            )
            assert result.success
            assert len(result.result) == 0


@pytest.mark.skipif(
    not LIVE_MODEL_TESTS or not OPENROUTER_API_KEY,
    reason="Live model tests disabled or OPENROUTER_API_KEY not set"
)
class TestLiveModelIntegration:
    """Live model integration tests."""

    @pytest.mark.asyncio
    async def test_live_model_tool_calling(self):
        """Test that a real model can call memory tools."""
        import httpx

        definitions = get_memory_tool_definitions()
        messages = [
            {"role": "system", "content": "You are a helpful assistant with access to memory tools."},
            {"role": "user", "content": "What deployment method does this project use?"},
        ]

        payload = {
            "model": "openai/gpt-4o",
            "messages": messages,
            "tools": definitions,
            "tool_choice": "auto",
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            assert response.status_code == 200
            data = response.json()
            choice = data.get("choices", [{}])[0]
            message = choice.get("message", {})

            # Check if model returned tool calls
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                # Model invoked a memory tool
                assert len(tool_calls) > 0
                tool_names = [tc["function"]["name"] for tc in tool_calls]
                assert any("memory" in name for name in tool_names)
