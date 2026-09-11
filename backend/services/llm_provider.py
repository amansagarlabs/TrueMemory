"""LLM Provider Interface — provider-independent abstraction for LLM inference.

TrueMemory owns memory intelligence. The LLM provider owns model inference.
This interface ensures TrueMemory is not coupled to any specific provider.

The provider layer handles:
- Tool/function calling
- Streaming
- Message formats
- Tool result formats
- Model capabilities
- Parallel tool calls
- Structured output
- Provider-specific limitations/errors

TrueMemory reasons in terms of:
  Agent → LLMProvider → ToolCall → MemoryTool → ToolResult → LLMProvider → Agent
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator


class ProviderCapabilities(Enum):
    """Capabilities that a provider may or may not support."""
    STREAMING = "streaming"
    TOOL_CALLING = "tool_calling"
    PARALLEL_TOOL_CALLS = "parallel_tool_calls"
    STRUCTURED_OUTPUT = "structured_output"
    VISION = "vision"
    SYSTEM_MESSAGES = "system_messages"


@dataclass
class ToolCall:
    """Canonical representation of a tool call from the LLM."""
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    """Canonical representation of a tool result to return to the LLM."""
    tool_call_id: str
    content: str
    success: bool = True


@dataclass
class Message:
    """Canonical message format for LLM communication."""
    role: str  # "system", "user", "assistant", "tool"
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None  # For tool role messages
    name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to provider-agnostic dictionary."""
        result: dict[str, Any] = {"role": self.role}
        if self.content is not None:
            result["content"] = self.content
        if self.tool_calls:
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": tc.arguments if isinstance(tc.arguments, str) else (
                            __import__("json").dumps(tc.arguments)
                        ),
                    },
                }
                for tc in self.tool_calls
            ]
        if self.tool_call_id:
            result["tool_call_id"] = self.tool_call_id
        if self.name:
            result["name"] = self.name
        return result


@dataclass
class ToolDefinition:
    """Canonical tool definition for LLM tool calling."""
    name: str
    description: str
    parameters: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Convert to OpenAI-compatible format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass
class CompletionRequest:
    """Request to complete a chat conversation."""
    model: str
    messages: list[Message]
    tools: list[ToolDefinition] | None = None
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = True


@dataclass
class CompletionResponse:
    """Response from a chat completion."""
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    usage: dict[str, int] = field(default_factory=dict)
    model: str = ""
    finish_reason: str = ""


class LLMProvider(ABC):
    """Abstract base class for LLM providers.
    
    All LLM providers must implement this interface.
    TrueMemory memory tools and agent runtime depend only on this interface,
    not on any specific provider implementation.
    """

    @abstractmethod
    def name(self) -> str:
        """Return the provider name."""
        ...

    @abstractmethod
    def capabilities(self) -> set[ProviderCapabilities]:
        """Return the capabilities this provider supports."""
        ...

    @abstractmethod
    async def chat(self, request: CompletionRequest) -> CompletionResponse:
        """Non-streaming chat completion.
        
        Args:
            request: The completion request.
            
        Returns:
            CompletionResponse with content and/or tool calls.
        """
        ...

    @abstractmethod
    async def stream(self, request: CompletionRequest) -> AsyncGenerator[str, None]:
        """Streaming chat completion.
        
        Args:
            request: The completion request.
            
        Yields:
            Text tokens as they are generated.
        """
        ...

    @abstractmethod
    async def stream_with_tools(
        self, request: CompletionRequest
    ) -> AsyncGenerator[str | list[ToolCall], None]:
        """Streaming chat completion with tool support.
        
        Args:
            request: The completion request with tools.
            
        Yields:
            str tokens for text, or list[ToolCall] when tool calls are complete.
        """
        ...

    @abstractmethod
    async def chat_with_tools(self, request: CompletionRequest) -> CompletionResponse:
        """Non-streaming chat completion with tool support.
        
        Args:
            request: The completion request with tools.
            
        Returns:
            CompletionResponse with content and/or tool calls.
        """
        ...

    def format_tools(self, tools: list[ToolDefinition]) -> list[dict[str, Any]]:
        """Format tool definitions for this provider.
        
        Default implementation uses OpenAI format.
        Override for providers with different formats.
        """
        return [tool.to_dict() for tool in tools]

    def format_messages(self, messages: list[Message]) -> list[dict[str, Any]]:
        """Format messages for this provider.
        
        Default implementation uses OpenAI format.
        Override for providers with different formats.
        """
        return [msg.to_dict() for msg in messages]

    def parse_tool_calls(self, raw_response: Any) -> list[ToolCall]:
        """Parse tool calls from raw provider response.
        
        Default implementation handles OpenAI format.
        Override for providers with different formats.
        """
        if not isinstance(raw_response, dict):
            return []
        
        message = raw_response.get("message") or raw_response
        tool_calls_raw = message.get("tool_calls") or []
        
        tool_calls = []
        for tc in tool_calls_raw:
            fn = tc.get("function", {})
            args = fn.get("arguments", "{}")
            if isinstance(args, str):
                try:
                    import json
                    args = json.loads(args)
                except (json.JSONDecodeError, TypeError):
                    args = {}
            
            tool_calls.append(ToolCall(
                id=tc.get("id", ""),
                name=fn.get("name", ""),
                arguments=args,
            ))
        
        return tool_calls

    def format_tool_results(self, results: list[ToolResult]) -> list[Message]:
        """Format tool results as messages for this provider.
        
        Default implementation creates tool-role messages.
        Override for providers with different formats.
        """
        return [
            Message(
                role="tool",
                content=result.content,
                tool_call_id=result.tool_call_id,
            )
            for result in results
        ]
