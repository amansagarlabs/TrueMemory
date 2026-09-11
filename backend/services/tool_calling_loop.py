"""Tool calling loop for the chat endpoint.

Handles the LLM tool calling loop with native memory tools.
Provider-independent: uses LLMProvider interface, not OpenRouter directly.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from services.native_memory_executor import NativeMemoryToolExecutor, ToolCallResult
from services.memory_tool_registry import get_memory_tool_definitions
from services.agent_memory_tools import MemoryContext
from services.memory_result_contract import (
    create_decision_event,
    create_action_event,
    create_influence_event,
    create_outcome_event,
)
from services.llm_provider import (
    LLMProvider,
    ProviderCapabilities,
    CompletionRequest,
    CompletionResponse,
    ToolCall,
    ToolDefinition,
    Message,
)
from services.memory_telemetry_collector import RunTelemetryCollector

logger = logging.getLogger(__name__)


@dataclass
class ToolCallLoopResult:
    """Result of a tool calling loop."""
    content: str
    tool_calls_executed: int
    attribution_events: list[dict]
    total_tool_ms: float
    tool_calls_made: list[dict] = field(default_factory=list)
    decision_events: list[dict] = field(default_factory=list)
    action_events: list[dict] = field(default_factory=list)
    influence_events: list[dict] = field(default_factory=list)


async def run_tool_calling_loop(
    *,
    provider: LLMProvider,
    model: str,
    messages: list[Message],
    context: MemoryContext,
    tools: list[ToolDefinition] | None = None,
    max_tool_rounds: int = 5,
    max_tokens: int = 2048,
    on_token: Any | None = None,
    run_id: str | None = None,
    settings: Any | None = None,
    telemetry: RunTelemetryCollector | None = None,
) -> AsyncGenerator[str | dict, None]:
    """Run the tool calling loop with memory tools.
    
    This is an async generator that yields:
    - str tokens for streaming text
    - dict with "tool_started" key when tool execution starts
    - dict with "tool_completed" key when tool execution completes
    
    This function is provider-independent. It uses the LLMProvider interface
    and does not depend on any specific provider implementation.
    
    Args:
        provider: LLM provider implementation (OpenRouter, OpenAI, Claude, etc.)
        model: Model identifier
        messages: Message history
        context: Memory context
        tools: Tool definitions (defaults to memory tools)
        max_tool_rounds: Maximum number of tool calling rounds
        max_tokens: Max tokens per LLM call
        on_token: Optional callback for streaming tokens
        run_id: Optional run ID for attribution
        settings: Application settings (for executor)
        telemetry: Optional telemetry collector for observation events
        
    Yields:
        str tokens or dict events
    """
    if tools is None:
        from services.memory_tool_registry import MEMORY_TOOLS
        tools = [
            ToolDefinition(
                name=tool.name,
                description=f"{tool.description}\n\nWhen to use: {tool.when_to_use}",
                parameters=tool.input_schema,
            )
            for tool in MEMORY_TOOLS
        ]
    
    executor = NativeMemoryToolExecutor(settings) if settings else None
    current_messages = list(messages)
    total_tool_calls = 0
    total_tool_ms = 0.0
    all_attribution_events = []
    all_tool_calls_made = []
    all_decision_events = []
    all_action_events = []
    all_influence_events = []
    memory_ids_used: set[str] = set()
    
    for round_num in range(max_tool_rounds):
        round_start = time.perf_counter()
        
        # Create completion request
        request = CompletionRequest(
            model=model,
            messages=current_messages,
            tools=tools,
            max_tokens=max_tokens,
            stream=True,
        )
        
        # Call LLM with tools using provider interface
        content = ""
        tool_calls: list[ToolCall] = []
        
        if ProviderCapabilities.TOOL_CALLING in provider.capabilities():
            # Use streaming with tools
            collected_content = []
            async for item in provider.stream_with_tools(request):
                if isinstance(item, list):
                    # Tool calls received
                    tool_calls = item
                elif isinstance(item, str):
                    # Text token
                    collected_content.append(item)
                    if on_token:
                        await on_token(item)
                    yield item
            content = "".join(collected_content)
        else:
            # Provider doesn't support tool calling, use plain streaming
            async for token in provider.stream(request):
                if on_token:
                    await on_token(token)
                yield token
            content = "".join([token async for token in provider.stream(request)])
        
        # If no tool calls, we're done
        if not tool_calls:
            # Record tool loop metrics even when abstaining
            if telemetry:
                telemetry.record_tool_loop_metrics(
                    tool_rounds=round_num + 1,
                    memory_tool_calls=0,
                    non_memory_tool_calls=0,
                    abstained_from_memory=True,
                    tool_failures=0,
                    tool_loop_terminated=False,
                    total_tool_ms=total_tool_ms,
                )
                telemetry.total_ms = total_tool_ms
                yield {"telemetry_summary": telemetry.to_log_dict()}
            return
        
        # Execute tool calls
        tool_results: list[Message] = []
        for tc in tool_calls:
            tool_start = time.perf_counter()
            tc_id = tc.id
            tool_name = tc.name
            arguments = tc.arguments
            
            # Yield tool start event
            yield {"tool_started": tool_name, "tool_call_id": tc_id, "arguments": arguments}
            
            # Record decision event: model decided to call memory tool
            decision_event = create_decision_event(
                run_id=run_id or f"round-{round_num}",
                decision_type="recall",
                memory_ids=[],
                evidence="tool_call",
                confidence=0.8,
                reasoning=f"Model decided to call {tool_name} with arguments: {json.dumps(arguments)[:200]}",
            )
            all_decision_events.append(decision_event.to_dict())
            yield {"decision_event": decision_event.to_dict()}
            
            # Record decision in telemetry
            if telemetry:
                telemetry.record_selection(
                    memory_id=f"decision-{decision_event.id}",
                    selected=True,
                )
            
            if executor:
                result = executor.execute_tool_call(
                    tool_name=tool_name,
                    arguments=arguments,
                    context=context,
                    run_id=run_id or f"round-{round_num}",
                )
            else:
                # No executor available, return error
                result = ToolCallResult(
                    tool_call_id=tc_id,
                    tool_name=tool_name,
                    success=False,
                    error="No memory executor available",
                )
            
            tool_ms = round((time.perf_counter() - tool_start) * 1000, 2)
            total_tool_ms += tool_ms
            total_tool_calls += 1
            
            # Track this tool call
            all_tool_calls_made.append({
                "tool_call_id": tc_id,
                "tool_name": tool_name,
                "arguments": arguments,
                "success": result.success,
                "execution_time_ms": tool_ms,
                "round": round_num,
            })
            
            # Yield tool end event
            yield {
                "tool_completed": tool_name,
                "tool_call_id": tc_id,
                "success": result.success,
                "execution_time_ms": tool_ms,
            }
            
            # Record action event: tool was executed
            action_event = create_action_event(
                run_id=run_id or f"round-{round_num}",
                action_type="tool_call",
                success=result.success,
                tool_name=tool_name,
                decision_event_id=decision_event.id,
                memory_ids=[],
                details=f"Tool {tool_name} executed in {tool_ms}ms",
            )
            all_action_events.append(action_event.to_dict())
            yield {"action_event": action_event.to_dict()}
            
            # Record action in telemetry
            if telemetry:
                telemetry.record_influence(
                    memory_id=f"action-{action_event.id}",
                    action_influenced=True,
                )
            
            # Record attribution
            if result.success and executor:
                memories = result.result if isinstance(result.result, list) else []
                for rank_idx, mem in enumerate(memories):
                    if isinstance(mem, dict) and "memory_id" in mem:
                        mem_id = mem["memory_id"]
                        memory_ids_used.add(mem_id)
                        all_attribution_events.append({
                            "memory_id": mem_id,
                            "tool_call_id": tc_id,
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "round": round_num,
                            "tool_ms": tool_ms,
                            "run_id": run_id,
                        })
                        
                        # Record influence event: memory was retrieved
                        influence_event = create_influence_event(
                            run_id=run_id or f"round-{round_num}",
                            memory_id=mem_id,
                            stage="retrieved",
                            evidence="tool_call",
                            confidence=0.9,
                            retrieval_event_id=tc_id,
                        )
                        all_influence_events.append(influence_event.to_dict())
                        yield {"influence_event": influence_event.to_dict()}
                        
                        # Record retrieval in telemetry collector
                        if telemetry:
                            telemetry.record_retrieval(
                                memory_id=mem_id,
                                tool_call_id=tc_id,
                                tool_name=tool_name,
                                rank=rank_idx + 1,
                                score=mem.get("confidence") if isinstance(mem, dict) else None,
                                memory_type=mem.get("type") if isinstance(mem, dict) else None,
                                memory_state=mem.get("state") if isinstance(mem, dict) else None,
                                scope=mem.get("scope") if isinstance(mem, dict) else None,
                            )
            
            # Format tool result for messages
            tool_results.append(Message(
                role="tool",
                content=json.dumps({
                    "success": result.success,
                    "result": result.data if hasattr(result, 'data') else result.result,
                    "error": result.error,
                }),
                tool_call_id=tc_id,
            ))
        
        # Add assistant message with tool calls
        current_messages.append(Message(
            role="assistant",
            content=content or None,
            tool_calls=tool_calls,
        ))
        
        # Add tool results
        current_messages.extend(tool_results)
        
        logger.info(
            "tool_call_round",
            extra={
                "round": round_num,
                "tool_calls": len(tool_calls),
                "tool_ms": total_tool_ms,
                "run_id": run_id,
                "provider": provider.name(),
            },
        )
    
    # Record tool loop metrics in telemetry
    if telemetry:
        memory_calls = sum(1 for tc in all_tool_calls_made if tc["tool_name"].startswith("memory_"))
        non_memory_calls = sum(1 for tc in all_tool_calls_made if not tc["tool_name"].startswith("memory_"))
        failures = sum(1 for tc in all_tool_calls_made if not tc["success"])
        telemetry.record_tool_loop_metrics(
            tool_rounds=round_num + 1 if all_tool_calls_made else 0,
            memory_tool_calls=memory_calls,
            non_memory_tool_calls=non_memory_calls,
            abstained_from_memory=not bool(all_tool_calls_made),
            tool_failures=failures,
            tool_loop_terminated=round_num >= max_tool_rounds - 1 and bool(all_tool_calls_made),
            total_tool_ms=total_tool_ms,
        )
        telemetry.total_ms = total_tool_ms
        yield {"telemetry_summary": telemetry.to_log_dict()}
    
    # Max rounds reached
    return


def build_memory_tool_system_prompt(
    memory_context_str: str | None = None,
    proactive_context: str | None = None,
) -> str:
    """Build system prompt for memory tool usage.
    
    This creates a system message that informs the model about available
    memory tools and provides any proactive memory context.
    """
    parts = [
        "You have access to memory tools that let you search, store, and manage "
        "the user's memories and preferences. Use these tools when appropriate to "
        "provide personalized responses.",
        "",
        "Available memory tools:",
        "- memory_search: Search for specific memories by query",
        "- memory_current_state: Get current state of all memories",
        "- memory_timeline: Get version history of a memory",
        "- memory_store: Store a new memory through governance",
        "- memory_forget: Remove a memory",
        "- memory_related: Find memories related to a topic",
        "",
        "When to use memory tools:",
        "- When the task depends on user preferences or decisions",
        "- When you need to know the current project configuration",
        "- When you need to understand how decisions changed over time",
        "- When you learned something important about the user",
        "",
        "When NOT to use memory tools:",
        "- Generic factual questions (what is recursion?)",
        "- Simple calculations",
        "- Tasks with no user-specific dependency",
    ]
    
    if proactive_context:
        parts.extend([
            "",
            "Proactive memory context (already retrieved):",
            proactive_context,
        ])
    
    if memory_context_str:
        parts.extend([
            "",
            "Current memory context:",
            memory_context_str,
        ])
    
    return "\n".join(parts)


def build_tool_calling_messages(
    base_messages: list[Message],
    memory_context_str: str | None = None,
    proactive_context: str | None = None,
) -> list[Message]:
    """Build messages with memory tools context.
    
    This prepends a system message indicating the model has memory tools
    and includes any proactive memory context as reference.
    """
    system_content = build_memory_tool_system_prompt(
        memory_context_str=memory_context_str,
        proactive_context=proactive_context,
    )
    system_msg = Message(
        role="system",
        content=system_content,
    )
    return [system_msg] + base_messages


def get_memory_tool_definitions_as_tool_defs() -> list[ToolDefinition]:
    """Get memory tool definitions as ToolDefinition objects."""
    from services.memory_tool_registry import MEMORY_TOOLS
    return [
        ToolDefinition(
            name=tool.name,
            description=f"{tool.description}\n\nWhen to use: {tool.when_to_use}",
            parameters=tool.input_schema,
        )
        for tool in MEMORY_TOOLS
    ]
