"""Memory Tool Registry — defines memory tools available to the agent.

Provides structured tool definitions that the agent can use to decide
when and how to retrieve memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class MemoryToolDefinition:
    """Definition of a memory tool available to the agent."""
    name: str
    description: str
    when_to_use: str
    input_schema: dict[str, Any]
    scope_options: list[str] = field(default_factory=lambda: ["workspace", "project", "user"])
    output_schema: dict[str, Any] = field(default_factory=dict)


MEMORY_TOOLS: list[MemoryToolDefinition] = [
    MemoryToolDefinition(
        name="memory_search",
        description="Search for relevant memories based on a natural language query.",
        when_to_use="When you need to find specific information the user or system has stored before.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language search query",
                },
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "project", "user"],
                    "description": "Memory scope to search in",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default: 10)",
                },
                "current_state_only": {
                    "type": "boolean",
                    "description": "If True, return only current state (not historical)",
                },
            },
            "required": ["query"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "memories": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "memory_id": {"type": "string"},
                            "type": {"type": "string"},
                            "content": {"type": "string"},
                            "state": {"type": "string", "enum": ["current", "historical", "uncertain", "superseded"]},
                            "confidence": {"type": "number"},
                            "scope": {"type": "string"},
                            "valid_from": {"type": "string"},
                            "valid_until": {"type": "string"},
                        },
                    },
                },
            },
        },
    ),
    MemoryToolDefinition(
        name="memory_current_state",
        description="Get the current state of all relevant memories for the workspace/project.",
        when_to_use="When you need to know the current state of the user's preferences, project configuration, or ongoing decisions.",
        input_schema={
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "description": "Optional filter by memory type (e.g., 'preference', 'decision', 'fact')",
                },
            },
        },
        output_schema={
            "type": "object",
            "properties": {
                "memories": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "memory_id": {"type": "string"},
                            "type": {"type": "string"},
                            "content": {"type": "string"},
                            "state": {"type": "string"},
                            "confidence": {"type": "number"},
                        },
                    },
                },
            },
        },
    ),
    MemoryToolDefinition(
        name="memory_timeline",
        description="Get the version history of a specific memory over time.",
        when_to_use="When you need to understand how a decision or preference has changed over time.",
        input_schema={
            "type": "object",
            "properties": {
                "memory_key": {
                    "type": "string",
                    "description": "The memory key to get history for",
                },
            },
            "required": ["memory_key"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "versions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "memory_id": {"type": "string"},
                            "content": {"type": "string"},
                            "revision": {"type": "integer"},
                            "state": {"type": "string"},
                            "valid_from": {"type": "string"},
                            "valid_until": {"type": "string"},
                        },
                    },
                },
            },
        },
    ),
    MemoryToolDefinition(
        name="memory_store",
        description="Store a new memory through the governance pipeline.",
        when_to_use="When you learn something important about the user, their preferences, project decisions, or task outcomes.",
        input_schema={
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Memory key (identifier)",
                },
                "content": {
                    "type": "string",
                    "description": "Memory content",
                },
                "memory_type": {
                    "type": "string",
                    "enum": ["fact", "preference", "decision", "task_completion", "observation"],
                    "description": "Type of memory",
                },
                "confidence": {
                    "type": "number",
                    "description": "Confidence in the memory (0-1)",
                },
                "importance": {
                    "type": "number",
                    "description": "Importance score (0-1)",
                },
            },
            "required": ["key", "content"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "stored": {"type": "boolean"},
                "memory_id": {"type": "string"},
            },
        },
    ),
    MemoryToolDefinition(
        name="memory_forget",
        description="Forget a specific memory.",
        when_to_use="When the user explicitly asks to forget something, or when information is no longer relevant.",
        input_schema={
            "type": "object",
            "properties": {
                "memory_key": {
                    "type": "string",
                    "description": "The memory key to forget",
                },
            },
            "required": ["memory_key"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "forgotten": {"type": "boolean"},
            },
        },
    ),
    MemoryToolDefinition(
        name="memory_related",
        description="Find memories related to a specific topic or entity.",
        when_to_use="When you need to find all memories related to a specific project, technology, or concept.",
        input_schema={
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Topic or entity to find related memories for",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default: 10)",
                },
            },
            "required": ["topic"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "memories": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "memory_id": {"type": "string"},
                            "type": {"type": "string"},
                            "content": {"type": "string"},
                            "relevance": {"type": "number"},
                        },
                    },
                },
            },
        },
    ),
]


def get_memory_tool_definitions() -> list[dict[str, Any]]:
    """Get memory tool definitions as dictionaries for LLM tool calling."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": f"{tool.description}\n\nWhen to use: {tool.when_to_use}",
                "parameters": tool.input_schema,
            },
        }
        for tool in MEMORY_TOOLS
    ]


def get_memory_tool_by_name(name: str) -> MemoryToolDefinition | None:
    """Get a memory tool definition by name."""
    for tool in MEMORY_TOOLS:
        if tool.name == name:
            return tool
    return None
