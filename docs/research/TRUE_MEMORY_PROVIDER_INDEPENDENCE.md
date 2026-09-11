# TRUEMEMORY PROVIDER INDEPENDENCE

**Date:** 2026-09-10
**Status:** IMPLEMENTED

---

## Architecture

### Provider Independence Principle

TrueMemory owns memory intelligence.
The LLM provider owns model inference.

OpenRouter is an implementation detail, not a TrueMemory architectural dependency.

### Target Architecture

```text
                    TrueMemory
                         │
              ┌──────────┴──────────┐
              │                     │
        Memory Harness        Agent/LLM Interface
              │                     │
       ┌──────┴──────┐       Provider Adapter Layer
       │             │              │
   Memory Core    Memory Tools      ├── OpenRouter
       │             │              ├── OpenAI
       │             │              ├── Anthropic / Claude
       │             │              ├── xAI / Grok
       │             │              ├── Qwen
       │             │              ├── Gemini
       │             │              ├── Ollama
       │             │              └── Any future provider
       │
  Storage / Retrieval /
  Temporal / Governor /
  Context / Observability
```

---

## Provider Interface

### LLMProvider Abstract Base Class

```python
class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def name(self) -> str: ...
    
    @abstractmethod
    def capabilities(self) -> set[ProviderCapabilities]: ...
    
    @abstractmethod
    async def chat(self, request: CompletionRequest) -> CompletionResponse: ...
    
    @abstractmethod
    async def stream(self, request: CompletionRequest) -> AsyncGenerator[str, None]: ...
    
    @abstractmethod
    async def stream_with_tools(
        self, request: CompletionRequest
    ) -> AsyncGenerator[str | list[ToolCall], None]: ...
    
    @abstractmethod
    async def chat_with_tools(self, request: CompletionRequest) -> CompletionResponse: ...
```

### Canonical Internal Representation

```text
Agent → LLMProvider → ToolCall → MemoryTool → ToolResult → LLMProvider → Agent
```

### Provider Capabilities

```python
class ProviderCapabilities(Enum):
    STREAMING = "streaming"
    TOOL_CALLING = "tool_calling"
    PARALLEL_TOOL_CALLS = "parallel_tool_calls"
    STRUCTURED_OUTPUT = "structured_output"
    VISION = "vision"
    SYSTEM_MESSAGES = "system_messages"
```

---

## Provider Implementations

### OpenRouterProvider

```text
File: backend/services/providers/openrouter_provider.py

Capabilities:
- STREAMING
- TOOL_CALLING
- PARALLEL_TOOL_CALLS
- VISION
- SYSTEM_MESSAGES

Status: PRODUCTION READY
```

### Future Providers

```text
OpenAIProvider
AnthropicProvider
XAIProvider
QwenProvider
GeminiProvider
OllamaProvider
```

---

## Provider-Independent Components

### Memory Tools

```text
All memory tools are provider-independent:
- memory_search
- memory_current_state
- memory_timeline
- memory_store
- memory_forget
- memory_related

These tools:
- Use canonical ToolDefinition format
- Are registered via get_memory_tool_definitions()
- Can be used with any LLM provider
```

### Tool Calling Loop

```text
File: backend/services/tool_calling_loop.py

The tool calling loop:
1. Accepts any LLMProvider implementation
2. Uses provider.stream_with_tools() for streaming
3. Executes tools via NativeMemoryToolExecutor
4. Returns results to provider
5. Tracks attribution events

No provider-specific code in the loop.
```

### Memory Context

```text
File: backend/services/agent_memory_tools.py

MemoryContext:
- user_id
- workspace_id
- project_id
- conversation_id

This is provider-independent.
```

---

## How to Add a New Provider

### Step 1: Implement LLMProvider

```python
class MyNewProvider(LLMProvider):
    def name(self) -> str:
        return "my_provider"
    
    def capabilities(self) -> set[ProviderCapabilities]:
        return {ProviderCapabilities.STREAMING, ProviderCapabilities.TOOL_CALLING}
    
    async def chat(self, request: CompletionRequest) -> CompletionResponse:
        # Implement chat completion
        ...
    
    async def stream(self, request: CompletionRequest) -> AsyncGenerator[str, None]:
        # Implement streaming
        ...
    
    async def stream_with_tools(
        self, request: CompletionRequest
    ) -> AsyncGenerator[str | list[ToolCall], None]:
        # Implement streaming with tools
        ...
    
    async def chat_with_tools(self, request: CompletionRequest) -> CompletionResponse:
        # Implement chat with tools
        ...
```

### Step 2: Register Provider

```python
# In chat.py or provider registry
provider = MyNewProvider(api_key="...", model="...")
```

### Step 3: Use Provider

```python
# The tool calling loop works with any provider
async for event in run_tool_calling_loop(
    provider=provider,
    model="my-model",
    messages=messages,
    context=memory_context,
    tools=memory_tools,
):
    # Handle events
    ...
```

---

## Provider-Specific Normalization

### Message Formats

```text
OpenAI/OpenRouter:
  {"role": "user", "content": "..."}

Anthropic/Claude:
  {"role": "user", "content": "..."}

All providers normalized to canonical Message format.
```

### Tool Call Formats

```text
OpenAI/OpenRouter:
  {"tool_calls": [{"id": "...", "function": {"name": "...", "arguments": "..."}}]}

Anthropic/Claude:
  {"tool_use": {"id": "...", "name": "...", "input": {...}}}

All providers normalized to canonical ToolCall format.
```

### Streaming Formats

```text
OpenAI/OpenRouter:
  data: {"choices": [{"delta": {"content": "..."}}]}

Anthropic/Claude:
  event: content_block_delta
  data: {"delta": {"text": "..."}}

All providers yield str tokens or list[ToolCall].
```

---

## Certification Requirements

### Provider Independence Certification

To prove provider independence:

1. **Same memory tools work with all providers**
   - Tool definitions are provider-independent
   - Tool execution is provider-independent

2. **Same tool calling loop works with all providers**
   - No provider-specific code in loop
   - Uses only LLMProvider interface

3. **Same attribution tracking works with all providers**
   - Attribution events are provider-independent
   - Tool call IDs are normalized

4. **Same security boundaries work with all providers**
   - Scope enforcement is provider-independent
   - Memory context is provider-independent

### Live Testing Requirements

For each provider:
- Tool registration
- Tool invocation
- Multiple tool calls
- Streaming tool calls
- Result acceptance
- Memory abstention
- Attribution tracking

---

## Status

```text
Provider Interface: IMPLEMENTED
OpenRouter Adapter: IMPLEMENTED
Tool Calling Loop: PROVIDER-INDEPENDENT
Memory Tools: PROVIDER-INDEPENDENT
Chat Integration: PROVIDER-INDEPENDENT

L4 CERTIFICATION: PROVIDER-INDEPENDENT
```
