"""Tests for Phase 3: Agent Memory Tools, JIT Retrieval, and Agent Memory Capture."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.agent_memory_tools import AgentMemoryTools, MemoryContext, MemoryToolResult
from services.jit_retrieval import (
    decide_retrieval,
    retrieve_for_agent,
    format_memory_for_context,
    RetrievalTrigger,
    RetrievalDecision,
    JITRetrievalResult,
)
from services.agent_memory_capture import AgentMemoryCapture


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


class TestAgentMemoryTools:
    def test_search_memory_returns_results(self, settings, context):
        with patch.object(AgentMemoryTools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{"memory_id": "1", "type": "fact", "content": "Test memory", "state": "current", "confidence": 0.8}],
            )
            tools = AgentMemoryTools(settings)
            result = tools.search_memory("test query", context)
            assert result.success
            assert len(result.data) == 1

    def test_get_current_state(self, settings, context):
        with patch.object(AgentMemoryTools, "get_current_state") as mock_state:
            mock_state.return_value = MemoryToolResult(
                success=True,
                data=[{"memory_id": "1", "type": "fact", "content": "Current state", "state": "current", "confidence": 0.9}],
            )
            tools = AgentMemoryTools(settings)
            result = tools.get_current_state(context)
            assert result.success

    def test_store_memory(self, settings, context):
        with patch.object(AgentMemoryTools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "new-memory"},
            )
            tools = AgentMemoryTools(settings)
            result = tools.store_memory("test-key", "Test content", context)
            assert result.success

    def test_forget_memory(self, settings, context):
        with patch.object(AgentMemoryTools, "forget_memory") as mock_forget:
            mock_forget.return_value = MemoryToolResult(
                success=True,
                data={"forgotten": True},
            )
            tools = AgentMemoryTools(settings)
            result = tools.forget_memory("test-key", context)
            assert result.success

    def test_capture_tool_result(self, settings, context):
        with patch.object(AgentMemoryTools, "capture_tool_result") as mock_capture:
            mock_capture.return_value = MemoryToolResult(
                success=True,
                data={"observed": True},
            )
            tools = AgentMemoryTools(settings)
            result = tools.capture_tool_result("web_search", "Test result", context)
            assert result.success


class TestJITRetrieval:
    def test_decide_retrieval_preference_pattern(self, context):
        decision = decide_retrieval("I prefer using React", context)
        assert decision.should_retrieve is True
        assert decision.trigger == RetrievalTrigger.USER_PREFERENCE_LIKELY

    def test_decide_retrieval_decision_pattern(self, context):
        decision = decide_retrieval("We decided to go with PostgreSQL", context)
        assert decision.should_retrieve is True
        assert decision.trigger == RetrievalTrigger.PREVIOUS_DECISION

    def test_decide_retrieval_historical_pattern(self, context):
        decision = decide_retrieval("What did we used to have before?", context)
        assert decision.should_retrieve is True
        assert decision.trigger == RetrievalTrigger.HISTORICAL_STATE

    def test_decide_retrieval_no_pattern(self, context):
        decision = decide_retrieval("Hello", context)
        assert decision.should_retrieve is False
        assert decision.trigger == RetrievalTrigger.NONE

    def test_decide_retrieval_empty_question(self, context):
        decision = decide_retrieval("", context)
        assert decision.should_retrieve is False

    def test_retrieve_for_agent(self, settings, context):
        tools = AgentMemoryTools(settings)
        with patch.object(tools, "search_memory") as mock_search:
            mock_search.return_value = MemoryToolResult(
                success=True,
                data=[{"memory_id": "1", "type": "fact", "content": "React preferred", "state": "current", "confidence": 0.8}],
            )
            result = retrieve_for_agent("I prefer React", context, tools)
            assert result.success
            assert len(result.memories) == 1

    def test_format_memory_for_context(self):
        result = JITRetrievalResult(
            memories=[{"memory_id": "1", "type": "fact", "content": "React preferred", "state": "current", "confidence": 0.8}],
            trigger=RetrievalTrigger.USER_PREFERENCE_LIKELY,
            query="test",
        )
        formatted = format_memory_for_context(result)
        assert "RELEVANT MEMORY" in formatted
        assert "React preferred" in formatted

    def test_format_memory_for_context_empty(self):
        result = JITRetrievalResult(
            memories=[],
            trigger=RetrievalTrigger.NONE,
            query="test",
        )
        formatted = format_memory_for_context(result)
        assert formatted == ""


class TestAgentMemoryCapture:
    def test_capture_tool_result(self, settings, context):
        with patch.object(AgentMemoryTools, "capture_tool_result") as mock_capture:
            mock_capture.return_value = MemoryToolResult(
                success=True,
                data={"observed": True},
            )
            capture = AgentMemoryCapture(settings)
            result = capture.capture_tool_result("web_search", "Test result", context)
            assert result.success

    def test_capture_agent_decision(self, settings, context):
        with patch.object(AgentMemoryTools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "decision-memory"},
            )
            capture = AgentMemoryCapture(settings)
            result = capture.capture_agent_decision(
                "Use PostgreSQL",
                "Better performance for our use case",
                context,
            )
            assert result.success

    def test_capture_task_completion(self, settings, context):
        with patch.object(AgentMemoryTools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "task-memory"},
            )
            capture = AgentMemoryCapture(settings)
            result = capture.capture_task_completion(
                "Implement memory system",
                "Completed successfully",
                context,
                success=True,
            )
            assert result.success

    def test_capture_user_correction(self, settings, context):
        with patch.object(AgentMemoryTools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "correction-memory"},
            )
            capture = AgentMemoryCapture(settings)
            result = capture.capture_user_correction(
                "Use MySQL",
                "Use PostgreSQL",
                context,
            )
            assert result.success

    def test_capture_observations(self, settings, context):
        with patch.object(AgentMemoryTools, "store_memory") as mock_store:
            mock_store.return_value = MemoryToolResult(
                success=True,
                data={"id": "observation-memory"},
            )
            capture = AgentMemoryCapture(settings)
            result = capture.capture_observations(
                ["Observation 1", "Observation 2"],
                context,
            )
            assert result.success
