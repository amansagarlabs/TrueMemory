"""Just-in-Time Memory Retrieval — memory retrieval during agent execution.

Provides on-demand memory access that the agent can use during planning,
tool selection, and task execution.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from services.agent_memory_tools import AgentMemoryTools, MemoryContext, MemoryToolResult
from services.temporal_reasoning import extract_temporal_intent, TemporalIntent

logger = logging.getLogger("truememory.jit")


class RetrievalTrigger(Enum):
    """Triggers for JIT memory retrieval."""
    USER_PREFERENCE_LIKELY = "user_preference_likely"
    PROJECT_SPECIFIC_TASK = "project_specific_task"
    PREVIOUS_DECISION = "previous_decision"
    HISTORICAL_STATE = "historical_state"
    EXISTING_TASK = "existing_task"
    KNOWN_ENTITY = "known_entity"
    USER_INSTRUCTION = "user_instruction"
    ONGOING_WORKFLOW = "ongoing_workflow"
    PREVIOUS_AGENT_WORK = "previous_agent_work"
    NONE = "none"


@dataclass(frozen=True)
class RetrievalDecision:
    """Decision about whether to retrieve memory."""
    should_retrieve: bool
    trigger: RetrievalTrigger
    query: str
    scope: str = "workspace"
    current_state_only: bool = True
    confidence: float = 0.0
    reason: str = ""


@dataclass(frozen=True)
class JITRetrievalResult:
    """Result from JIT memory retrieval."""
    memories: list[dict[str, Any]]
    trigger: RetrievalTrigger
    query: str
    retrieval_time_ms: float = 0.0
    success: bool = True
    error: str | None = None


_PREFERENCE_PATTERNS = re.compile(
    r"\b(?:prefer|like|use|always|never|usually|typically|standard|stack|"
    r"technology|framework|language|tool|editor|IDE|database|deploy)\b",
    re.IGNORECASE,
)

_PROJECT_PATTERNS = re.compile(
    r"\b(?:project|app|application|service|server|client|frontend|backend|"
    r"API|database|deployment|repository|repo)\b",
    re.IGNORECASE,
)

_DECISION_PATTERNS = re.compile(
    r"\b(?:decided|agreed|chose|selected|picked|going with|will use|"
    r"should use|let's use|we use)\b",
    re.IGNORECASE,
)

_HISTORICAL_PATTERNS = re.compile(
    r"\b(?:before|previously|used to|was|were|last year|last month|"
    r"ago|earlier|formerly|in the past|switched|changed|moved)\b",
    re.IGNORECASE,
)

_TASK_PATTERNS = re.compile(
    r"\b(?:implement|build|create|add|fix|update|refactor|deploy|"
    r"set up|configure|install|migrate|upgrade)\b",
    re.IGNORECASE,
)

_AGENT_WORK_PATTERNS = re.compile(
    r"\b(?:did|completed|finished|built|implemented|created|added|"
    r"fixed|updated|deployed|configured)\b",
    re.IGNORECASE,
)


def _extract_entities(text: str) -> list[str]:
    """Extract potential entity names from text."""
    words = text.split()
    entities = []
    for word in words:
        if word[0:1].isupper() and len(word) > 2 and word.isalpha():
            entities.append(word)
    return entities[:5]


def decide_retrieval(
    question: str,
    context: MemoryContext,
    *,
    has_recent_memory: bool = False,
) -> RetrievalDecision:
    """Decide whether JIT memory retrieval is needed.

    Args:
        question: The user's question or request.
        context: Agent execution context.
        has_recent_memory: Whether memory was already loaded at conversation start.

    Returns:
        RetrievalDecision with the decision and reasoning.
    """
    if not question or not question.strip():
        return RetrievalDecision(
            should_retrieve=False,
            trigger=RetrievalTrigger.NONE,
            query="",
            confidence=0.0,
            reason="empty_question",
        )

    temporal_intent = extract_temporal_intent(question)

    if _PREFERENCE_PATTERNS.search(question):
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.USER_PREFERENCE_LIKELY,
            query=question,
            scope="workspace",
            current_state_only=not temporal_intent.has_temporal,
            confidence=0.85,
            reason="preference_pattern_detected",
        )

    if _DECISION_PATTERNS.search(question):
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.PREVIOUS_DECISION,
            query=question,
            scope="workspace",
            current_state_only=not temporal_intent.has_temporal,
            confidence=0.80,
            reason="decision_pattern_detected",
        )

    if _HISTORICAL_PATTERNS.search(question):
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.HISTORICAL_STATE,
            query=question,
            scope="workspace",
            current_state_only=False,
            confidence=0.80,
            reason="historical_pattern_detected",
        )

    if context.project_id and _PROJECT_PATTERNS.search(question):
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.PROJECT_SPECIFIC_TASK,
            query=question,
            scope="workspace",
            current_state_only=True,
            confidence=0.75,
            reason="project_specific_pattern",
        )

    if _TASK_PATTERNS.search(question) and context.workspace_id:
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.ONGOING_WORKFLOW,
            query=question,
            scope="workspace",
            current_state_only=True,
            confidence=0.70,
            reason="task_pattern_with_workspace",
        )

    if _AGENT_WORK_PATTERNS.search(question):
        return RetrievalDecision(
            should_retrieve=True,
            trigger=RetrievalTrigger.PREVIOUS_AGENT_WORK,
            query=question,
            scope="workspace",
            current_state_only=True,
            confidence=0.65,
            reason="agent_work_pattern",
        )

    return RetrievalDecision(
        should_retrieve=False,
        trigger=RetrievalTrigger.NONE,
        query=question,
        confidence=0.0,
        reason="no_pattern_matched",
    )


def retrieve_for_agent(
    question: str,
    context: MemoryContext,
    tools: AgentMemoryTools,
    *,
    decision: RetrievalDecision | None = None,
) -> JITRetrievalResult:
    """Execute JIT memory retrieval for the agent.

    Args:
        question: The user's question.
        context: Agent execution context.
        tools: AgentMemoryTools instance.
        decision: Pre-computed retrieval decision (optional).

    Returns:
        JITRetrievalResult with memories.
    """
    import time
    start = time.monotonic()

    if decision is None:
        decision = decide_retrieval(question, context)

    if not decision.should_retrieve:
        return JITRetrievalResult(
            memories=[],
            trigger=RetrievalTrigger.NONE,
            query=question,
            retrieval_time_ms=(time.monotonic() - start) * 1000,
            success=True,
        )

    result = tools.search_memory(
        query=decision.query,
        context=context,
        scope=decision.scope,
        limit=8,
        current_state_only=decision.current_state_only,
    )

    latency = (time.monotonic() - start) * 1000

    if not result.success:
        return JITRetrievalResult(
            memories=[],
            trigger=decision.trigger,
            query=decision.query,
            retrieval_time_ms=latency,
            success=False,
            error=result.error,
        )

    memories = result.data or []

    memories.sort(key=lambda m: m.get("confidence", 0), reverse=True)

    return JITRetrievalResult(
        memories=memories[:8],
        trigger=decision.trigger,
        query=decision.query,
        retrieval_time_ms=latency,
        success=True,
    )


def format_memory_for_context(
    result: JITRetrievalResult,
    *,
    max_tokens: int = 2000,
) -> str:
    """Format JIT retrieval results for injection into agent context.

    Args:
        result: JITRetrievalResult to format.
        max_tokens: Approximate max tokens for the formatted output.

    Returns:
        Formatted memory string for context injection.
    """
    if not result.memories:
        return ""

    lines = []
    current_tokens = 0

    for mem in result.memories:
        content = mem.get("content", "")
        mem_type = mem.get("type", "fact")
        state = mem.get("state", "current")
        confidence = mem.get("confidence", 0.0)

        line = f"- [{state.upper()}] ({mem_type}) {content}"
        estimated_tokens = len(line.split()) + 5

        if current_tokens + estimated_tokens > max_tokens:
            break

        lines.append(line)
        current_tokens += estimated_tokens

    if not lines:
        return ""

    header = f"RELEVANT MEMORY ({result.trigger.value}):"
    return header + "\n" + "\n".join(lines)
