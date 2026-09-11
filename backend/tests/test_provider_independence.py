"""Provider-agnostic tests for TrueMemory.

Tests the provider interface, tool calling loop, and attribution chain
without depending on any specific provider implementation.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any
from uuid import uuid4

from services.llm_provider import (
    LLMProvider,
    ProviderCapabilities,
    CompletionRequest,
    CompletionResponse,
    Message,
    ToolCall,
    ToolResult,
    ToolDefinition,
)
from services.tool_calling_loop import (
    run_tool_calling_loop,
    build_tool_calling_messages,
    get_memory_tool_definitions_as_tool_defs,
    ToolCallLoopResult,
)
from services.memory_result_contract import (
    DecisionEvent,
    ActionEvent,
    MemoryInfluenceEvent,
    create_decision_event,
    create_action_event,
    create_influence_event,
)
from services.agent_memory_tools import MemoryContext


class MockLLMProvider(LLMProvider):
    """Mock LLM provider for testing."""
    
    def __init__(
        self,
        tool_calls: list[ToolCall] | None = None,
        content: str = "Test response",
        capabilities: set[ProviderCapabilities] | None = None,
    ):
        self._tool_calls = tool_calls or []
        self._content = content
        self._capabilities = capabilities or {ProviderCapabilities.STREAMING, ProviderCapabilities.TOOL_CALLING}
        self._chat_calls: list[CompletionRequest] = []
        self._stream_calls: list[CompletionRequest] = []
    
    def name(self) -> str:
        return "mock"
    
    def capabilities(self) -> set[ProviderCapabilities]:
        return self._capabilities
    
    async def chat(self, request: CompletionRequest) -> CompletionResponse:
        self._chat_calls.append(request)
        return CompletionResponse(
            content=self._content,
            tool_calls=self._tool_calls,
            usage={"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
            model="mock-model",
        )
    
    async def stream(self, request: CompletionRequest):
        self._stream_calls.append(request)
        yield self._content
    
    async def stream_with_tools(self, request: CompletionRequest):
        self._stream_calls.append(request)
        yield self._content
        if self._tool_calls:
            yield self._tool_calls
    
    def format_tools(self, tools: list[ToolDefinition]) -> Any:
        return [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}} for t in tools]
    
    def format_messages(self, messages: list[Message]) -> Any:
        return [{"role": m.role, "content": m.content or ""} for m in messages]
    
    def parse_tool_calls(self, raw: Any) -> list[ToolCall]:
        return self._tool_calls
    
    def format_tool_results(self, results: list[ToolResult]) -> Any:
        return [{"role": "tool", "content": r.content, "tool_call_id": r.tool_call_id} for r in results]
    
    async def chat_with_tools(self, request: CompletionRequest) -> CompletionResponse:
        return await self.chat(request)


class TestProviderInterface:
    """Test LLMProvider interface."""
    
    def test_provider_has_required_methods(self):
        """Provider must have all required methods."""
        provider = MockLLMProvider()
        assert hasattr(provider, "name")
        assert hasattr(provider, "capabilities")
        assert hasattr(provider, "chat")
        assert hasattr(provider, "stream")
        assert hasattr(provider, "stream_with_tools")
        assert hasattr(provider, "chat_with_tools")
        assert hasattr(provider, "format_tools")
        assert hasattr(provider, "format_messages")
        assert hasattr(provider, "parse_tool_calls")
        assert hasattr(provider, "format_tool_results")
    
    def test_provider_name(self):
        """Provider name must return string."""
        provider = MockLLMProvider()
        assert isinstance(provider.name(), str)
    
    def test_provider_capabilities(self):
        """Provider capabilities must return set."""
        provider = MockLLMProvider()
        caps = provider.capabilities()
        assert isinstance(caps, set)
        assert ProviderCapabilities.STREAMING in caps
    
    @pytest.mark.asyncio
    async def test_provider_chat(self):
        """Provider chat must return CompletionResponse."""
        provider = MockLLMProvider(content="Hello")
        request = CompletionRequest(
            model="test-model",
            messages=[Message(role="user", content="Hi")],
        )
        response = await provider.chat(request)
        assert isinstance(response, CompletionResponse)
        assert response.content == "Hello"
    
    @pytest.mark.asyncio
    async def test_provider_stream(self):
        """Provider stream must yield strings."""
        provider = MockLLMProvider(content="Hello")
        request = CompletionRequest(
            model="test-model",
            messages=[Message(role="user", content="Hi")],
        )
        tokens = [token async for token in provider.stream(request)]
        assert len(tokens) == 1
        assert tokens[0] == "Hello"
    
    @pytest.mark.asyncio
    async def test_provider_stream_with_tools(self):
        """Provider stream_with_tools must yield strings and tool calls."""
        tool_calls = [ToolCall(id="1", name="test_tool", arguments={"arg": "value"})]
        provider = MockLLMProvider(tool_calls=tool_calls)
        request = CompletionRequest(
            model="test-model",
            messages=[Message(role="user", content="Hi")],
        )
        items = [item async for item in provider.stream_with_tools(request)]
        assert len(items) == 2
        assert items[0] == "Test response"
        assert isinstance(items[1], list)


class TestProviderIndependence:
    """Test that tool calling loop is provider-independent."""
    
    @pytest.mark.asyncio
    async def test_tool_calling_loop_accepts_any_provider(self):
        """Tool calling loop must work with any LLMProvider implementation."""
        provider = MockLLMProvider(tool_calls=[])
        context = MemoryContext(user_id="test-user")
        
        # Should not raise any errors
        events = []
        async for event in run_tool_calling_loop(
            provider=provider,
            model="test-model",
            messages=[Message(role="user", content="Hi")],
            context=context,
            max_tool_rounds=1,
        ):
            events.append(event)
        
        # Should have at least one text token
        assert any(isinstance(e, str) for e in events)
    
    @pytest.mark.asyncio
    async     def test_tool_calling_loop_no_openrouter_dependency(self):
        """Tool calling loop must not import or use OpenRouter directly."""
        import inspect
        from services import tool_calling_loop
        
        source = inspect.getsource(tool_calling_loop)
        # Check that the source doesn't import from openrouter module
        lines = source.split('\n')
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('from ') or stripped.startswith('import '):
                assert 'openrouter' not in stripped.lower(), f"Tool calling loop imports from openrouter: {stripped}"
    
    def test_memory_tools_are_provider_agnostic(self):
        """Memory tool definitions must be provider-agnostic."""
        tools = get_memory_tool_definitions_as_tool_defs()
        assert len(tools) > 0
        
        for tool in tools:
            assert isinstance(tool, ToolDefinition)
            assert tool.name.startswith("memory_")
            assert tool.description
            assert tool.parameters


class TestDecisionEvent:
    """Test DecisionEvent creation and serialization."""
    
    def test_create_decision_event(self):
        """DecisionEvent can be created."""
        event = create_decision_event(
            run_id="run-123",
            decision_type="recall",
            memory_ids=["mem-1", "mem-2"],
            evidence="tool_call",
            confidence=0.9,
        )
        assert isinstance(event, DecisionEvent)
        assert event.run_id == "run-123"
        assert event.decision_type == "recall"
        assert event.memory_ids == ["mem-1", "mem-2"]
        assert event.evidence == "tool_call"
        assert event.confidence == 0.9
    
    def test_decision_event_to_dict(self):
        """DecisionEvent can be serialized to dict."""
        event = create_decision_event(
            run_id="run-123",
            decision_type="recall",
            memory_ids=["mem-1"],
            evidence="tool_call",
            confidence=0.8,
        )
        d = event.to_dict()
        assert d["run_id"] == "run-123"
        assert d["decision_type"] == "recall"
        assert d["memory_ids"] == ["mem-1"]
        assert "timestamp" in d


class TestActionEvent:
    """Test ActionEvent creation and serialization."""
    
    def test_create_action_event(self):
        """ActionEvent can be created."""
        event = create_action_event(
            run_id="run-123",
            action_type="tool_call",
            success=True,
            tool_name="memory_search",
        )
        assert isinstance(event, ActionEvent)
        assert event.run_id == "run-123"
        assert event.action_type == "tool_call"
        assert event.success is True
        assert event.tool_name == "memory_search"
    
    def test_action_event_to_dict(self):
        """ActionEvent can be serialized to dict."""
        event = create_action_event(
            run_id="run-123",
            action_type="tool_call",
            success=True,
        )
        d = event.to_dict()
        assert d["run_id"] == "run-123"
        assert d["action_type"] == "tool_call"
        assert d["success"] is True
        assert "timestamp" in d


class TestInfluenceEvent:
    """Test MemoryInfluenceEvent creation and serialization."""
    
    def test_create_influence_event(self):
        """MemoryInfluenceEvent can be created."""
        event = create_influence_event(
            run_id="run-123",
            memory_id="mem-456",
            stage="retrieved",
            evidence="tool_call",
            confidence=0.9,
        )
        assert isinstance(event, MemoryInfluenceEvent)
        assert event.run_id == "run-123"
        assert event.memory_id == "mem-456"
        assert event.stage == "retrieved"
        assert event.evidence == "tool_call"
        assert event.confidence == 0.9
    
    def test_influence_event_to_dict(self):
        """MemoryInfluenceEvent can be serialized to dict."""
        event = create_influence_event(
            run_id="run-123",
            memory_id="mem-456",
            stage="retrieved",
            evidence="tool_call",
            confidence=0.9,
        )
        d = event.to_dict()
        assert d["run_id"] == "run-123"
        assert d["memory_id"] == "mem-456"
        assert d["stage"] == "retrieved"
        assert "timestamp" in d


class TestToolCallingLoopAttribution:
    """Test that tool calling loop emits attribution events."""
    
    @pytest.mark.asyncio
    async def test_tool_calling_loop_emits_decision_events(self):
        """Tool calling loop must emit DecisionEvents when tools are called."""
        tool_calls = [ToolCall(id="tc-1", name="memory_search", arguments={"query": "test"})]
        provider = MockLLMProvider(tool_calls=tool_calls)
        context = MemoryContext(user_id="test-user")
        
        decision_events = []
        async for event in run_tool_calling_loop(
            provider=provider,
            model="test-model",
            messages=[Message(role="user", content="Search for test")],
            context=context,
            max_tool_rounds=1,
        ):
            if isinstance(event, dict) and "decision_event" in event:
                decision_events.append(event["decision_event"])
        
        assert len(decision_events) > 0
        assert decision_events[0]["decision_type"] == "recall"
        assert decision_events[0]["evidence"] == "tool_call"
    
    @pytest.mark.asyncio
    async def test_tool_calling_loop_emits_action_events(self):
        """Tool calling loop must emit ActionEvents when tools are executed."""
        tool_calls = [ToolCall(id="tc-1", name="memory_search", arguments={"query": "test"})]
        provider = MockLLMProvider(tool_calls=tool_calls)
        context = MemoryContext(user_id="test-user")
        
        action_events = []
        async for event in run_tool_calling_loop(
            provider=provider,
            model="test-model",
            messages=[Message(role="user", content="Search for test")],
            context=context,
            max_tool_rounds=1,
        ):
            if isinstance(event, dict) and "action_event" in event:
                action_events.append(event["action_event"])
        
        assert len(action_events) > 0
        assert action_events[0]["action_type"] == "tool_call"
        assert action_events[0]["tool_name"] == "memory_search"
    
    @pytest.mark.asyncio
    async def test_tool_calling_loop_emits_tool_events(self):
        """Tool calling loop must emit tool_started and tool_completed events."""
        tool_calls = [ToolCall(id="tc-1", name="memory_search", arguments={"query": "test"})]
        provider = MockLLMProvider(tool_calls=tool_calls)
        context = MemoryContext(user_id="test-user")
        
        tool_started_events = []
        tool_completed_events = []
        async for event in run_tool_calling_loop(
            provider=provider,
            model="test-model",
            messages=[Message(role="user", content="Search for test")],
            context=context,
            max_tool_rounds=1,
        ):
            if isinstance(event, dict):
                if "tool_started" in event:
                    tool_started_events.append(event)
                elif "tool_completed" in event:
                    tool_completed_events.append(event)
        
        assert len(tool_started_events) > 0
        assert len(tool_completed_events) > 0
        assert tool_started_events[0]["tool_started"] == "memory_search"
        assert tool_completed_events[0]["tool_completed"] == "memory_search"


class TestBuildToolCallingMessages:
    """Test build_tool_calling_messages function."""
    
    def test_build_messages_with_proactive_context(self):
        """build_tool_calling_messages must include proactive context."""
        base_messages = [Message(role="user", content="Hello")]
        proactive = "role: Software Engineer\nproject: TrueMemory"
        
        result = build_tool_calling_messages(
            base_messages=base_messages,
            proactive_context=proactive,
        )
        
        assert len(result) == 2
        assert result[0].role == "system"
        assert "Software Engineer" in result[0].content
        assert "TrueMemory" in result[0].content
    
    def test_build_messages_without_proactive_context(self):
        """build_tool_calling_messages must work without proactive context."""
        base_messages = [Message(role="user", content="Hello")]
        
        result = build_tool_calling_messages(base_messages=base_messages)
        
        assert len(result) == 2
        assert result[0].role == "system"
        assert "memory tools" in result[0].content.lower()


class TestMemoryToolDefinitions:
    """Test memory tool definitions are provider-agnostic."""
    
    def test_get_memory_tool_definitions_as_tool_defs(self):
        """get_memory_tool_definitions_as_tool_defs must return ToolDefinition list."""
        tools = get_memory_tool_definitions_as_tool_defs()
        assert isinstance(tools, list)
        assert len(tools) > 0
        
        for tool in tools:
            assert isinstance(tool, ToolDefinition)
            assert tool.name
            assert tool.description
            assert tool.parameters
    
    def test_memory_tool_names(self):
        """Memory tool names must follow naming convention."""
        tools = get_memory_tool_definitions_as_tool_defs()
        tool_names = [t.name for t in tools]
        
        expected_tools = [
            "memory_search",
            "memory_current_state",
            "memory_timeline",
            "memory_store",
            "memory_forget",
            "memory_related",
        ]
        
        for expected in expected_tools:
            assert expected in tool_names, f"Missing memory tool: {expected}"
