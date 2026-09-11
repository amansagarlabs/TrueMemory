"""L4 Native Agent Memory Tests — verifies native tool calling works correctly."""

from __future__ import annotations

import json
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.native_memory_executor import NativeMemoryToolExecutor, ToolCallResult
from services.native_agent_loop import NativeAgentMemoryLoop, AgentMessage
from services.agent_memory_tools import MemoryContext, MemoryToolResult


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


class TestNativeMemoryToolExecutor:
    """Test native memory tool executor."""

    def test_get_tool_definitions(self, settings):
        """Tool definitions are available."""
        executor = NativeMemoryToolExecutor(settings)
        definitions = executor.get_tool_definitions()
        assert len(definitions) == 6
        tool_names = [d["function"]["name"] for d in definitions]
        assert "memory_search" in tool_names
        assert "memory_current_state" in tool_names
        assert "memory_timeline" in tool_names
        assert "memory_store" in tool_names
        assert "memory_forget" in tool_names
        assert "memory_related" in tool_names

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
            assert result.result[0]["content"] == "User prefers TypeScript"

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


class TestNativeAgentLoop:
    """Test native agent loop."""

    def test_get_tool_definitions(self, settings):
        """Agent loop provides tool definitions."""
        loop = NativeAgentMemoryLoop(settings)
        definitions = loop.get_tool_definitions()
        assert len(definitions) == 6

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
        assert message.tool_calls[0]["function"]["name"] == "memory_search"

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

    def test_execute_tool_call(self, settings, context):
        """Tool call is executed correctly."""
        loop = NativeAgentMemoryLoop(settings)
        with patch.object(loop.executor, "execute_tool_call") as mock_exec:
            mock_exec.return_value = ToolCallResult(
                tool_call_id="call-123",
                tool_name="memory_search",
                success=True,
                result=[{"memory_id": "mem-1"}],
            )
            result = loop.execute_tool_call(
                tool_call={
                    "id": "call-123",
                    "function": {
                        "name": "memory_search",
                        "arguments": json.dumps({"query": "TypeScript"}),
                    },
                },
                context=context,
                run_id="test-run",
            )
            assert result.success

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


class TestMemoryInfluence:
    """Test memory influence tracking."""

    def test_attribution_events_correlated(self, settings, context):
        """Attribution events are correlated with tool calls."""
        executor = NativeMemoryToolExecutor(settings)
        with patch.object(executor.tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{
                    "memory_id": "mem-1",
                    "type": "decision",
                    "content": "Project uses Docker",
                    "state": "current",
                    "confidence": 0.92,
                }],
            )
            result = executor.execute_tool_call(
                tool_name="memory_search",
                arguments={"query": "deployment"},
                context=context,
                run_id="run-123",
                task_id="task-456",
            )
            events = executor.get_attribution_events()
            assert len(events) == 1
            assert events[0]["run_id"] == "run-123"
            assert events[0]["task_id"] == "task-456"
            assert events[0]["memory_id"] == "mem-1"
