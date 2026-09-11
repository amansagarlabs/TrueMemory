"""Memory Decision Engine — helps the agent decide when memory is needed.

Provides semantic analysis of user requests to determine if memory retrieval
would be beneficial, without relying on regex patterns.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any

logger = logging.getLogger("truememory.decision")


class MemoryNeed(Enum):
    """Classification of memory need."""
    NOT_NEEDED = "not_needed"
    PREFERENCE_CHECK = "preference_check"
    STATE_CHECK = "state_check"
    DECISION_CHECK = "decision_check"
    HISTORICAL_CHECK = "historical_check"
    PROJECT_CONTEXT = "project_context"
    AGENT_HISTORY = "agent_history"
    EXPLICIT_MEMORY_COMMAND = "explicit_memory_command"


@dataclass(frozen=True)
class MemoryDecision:
    """Decision about whether memory is needed."""
    need: MemoryNeed
    confidence: float
    query: str
    scope: str
    reason: str
    entity_type: str | None = None
    memory_key: str | None = None


# High-confidence signals that memory is needed
_EXPLICIT_MEMORY_KEYWORDS = {
    "remember this", "forget this", "what do you remember", "what have you stored",
    "clear memory", "delete memory", "remove memory",
}

# Signals that user preferences may be relevant
_PREFERENCE_SIGNALS = {
    "i prefer", "i like", "i always", "i never", "i usually",
    "i typically", "my favorite", "my default", "use my",
}

# Signals that project state may be relevant
_PROJECT_SIGNALS = {
    "this project", "the project", "project uses", "project has",
    "our project", "current project",
}

# Signals that decisions may be relevant
_DECISION_SIGNALS = {
    "we decided", "we agreed", "we chose", "we selected",
    "going with", "will use", "should use", "let's use",
    "we use", "switched to", "changed to", "migrated to",
}

# Signals that historical state may be relevant
_HISTORICAL_SIGNALS = {
    "before", "previously", "used to", "last year", "last month",
    "ago", "earlier", "formerly", "in the past", "history",
    "what did we use", "what was", "what were",
}

# Signals that agent history may be relevant
_AGENT_HISTORY_SIGNALS = {
    "what did we implement", "what did we build", "what did we create",
    "what did we add", "what did we fix", "what did we update",
    "what did we deploy", "what did we configure", "what did we set up",
}

# Signals that memory is NOT needed
_NO_MEMORY_SIGNALS = {
    "what is", "what are", "how do", "how to", "explain",
    "define", "meaning of", "difference between", "compare",
    "simple", "basic", "general", "generic",
}


def _extract_entities(text: str) -> list[str]:
    """Extract potential entity names from text."""
    words = text.split()
    entities = []
    for word in words:
        if word[0:1].isupper() and len(word) > 2 and word.isalpha():
            entities.append(word)
    return entities[:5]


def _has_signal(text: str, signals: set[str]) -> bool:
    """Check if text contains any of the given signals."""
    text_lower = text.lower()
    return any(signal in text_lower for signal in signals)


def classify_memory_need(
    question: str,
    context: dict[str, Any] | None = None,
) -> MemoryDecision:
    """Classify whether memory is needed for a given question.

    Args:
        question: The user's question or request.
        context: Optional context about the current session.

    Returns:
        MemoryDecision with the classification.
    """
    if not question or not question.strip():
        return MemoryDecision(
            need=MemoryNeed.NOT_NEEDED,
            confidence=0.0,
            query="",
            scope="workspace",
            reason="empty_question",
        )

    question_lower = question.lower().strip()

    # Explicit memory commands always need memory
    if _has_signal(question_lower, _EXPLICIT_MEMORY_KEYWORDS):
        entities = _extract_entities(question)
        memory_key = entities[0].lower() if entities else None
        return MemoryDecision(
            need=MemoryNeed.EXPLICIT_MEMORY_COMMAND,
            confidence=0.95,
            query=question,
            scope="workspace",
            reason="explicit_memory_keyword_detected",
            memory_key=memory_key,
        )

    # Check for preference signals
    if _has_signal(question_lower, _PREFERENCE_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.PREFERENCE_CHECK,
            confidence=0.85,
            query=question,
            scope="workspace",
            reason="preference_signal_detected",
            entity_type="preference",
        )

    # Check for decision signals
    if _has_signal(question_lower, _DECISION_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.DECISION_CHECK,
            confidence=0.80,
            query=question,
            scope="workspace",
            reason="decision_signal_detected",
            entity_type="decision",
        )

    # Check for historical signals
    if _has_signal(question_lower, _HISTORICAL_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.HISTORICAL_CHECK,
            confidence=0.80,
            query=question,
            scope="workspace",
            reason="historical_signal_detected",
        )

    # Check for project signals with project context
    project_id = (context or {}).get("project_id")
    if project_id and _has_signal(question_lower, _PROJECT_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.PROJECT_CONTEXT,
            confidence=0.75,
            query=question,
            scope="project",
            reason="project_signal_with_context",
            entity_type="project",
        )

    # Check for agent history signals
    if _has_signal(question_lower, _AGENT_HISTORY_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.AGENT_HISTORY,
            confidence=0.65,
            query=question,
            scope="workspace",
            reason="agent_history_signal_detected",
        )

    # Check for project signals without project context (lower confidence)
    if _has_signal(question_lower, _PROJECT_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.PROJECT_CONTEXT,
            confidence=0.50,
            query=question,
            scope="workspace",
            reason="project_signal_without_context",
        )

    # Check for no-memory signals (generic questions)
    if _has_signal(question_lower, _NO_MEMORY_SIGNALS):
        return MemoryDecision(
            need=MemoryNeed.NOT_NEEDED,
            confidence=0.70,
            query=question,
            scope="workspace",
            reason="generic_question_detected",
        )

    # Default: low confidence that memory might be useful
    return MemoryDecision(
        need=MemoryNeed.NOT_NEEDED,
        confidence=0.30,
        query=question,
        scope="workspace",
        reason="no_clear_memory_signal",
    )


def should_retrieve_memory(
    question: str,
    context: dict[str, Any] | None = None,
    *,
    threshold: float = 0.60,
) -> bool:
    """Determine if memory retrieval should be triggered.

    Args:
        question: The user's question.
        context: Optional context.
        threshold: Confidence threshold for triggering retrieval.

    Returns:
        True if memory retrieval should be triggered.
    """
    decision = classify_memory_need(question, context)
    return decision.confidence >= threshold and decision.need != MemoryNeed.NOT_NEEDED


def plan_memory_query(
    decision: MemoryDecision,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Plan a memory query based on the decision.

    Args:
        decision: The memory decision.
        context: Optional context.

    Returns:
        Query plan with parameters.
    """
    query_plan = {
        "operation": "search",
        "query": decision.query,
        "scope": decision.scope,
        "current_state_only": decision.need != MemoryNeed.HISTORICAL_CHECK,
        "entity_type": decision.entity_type,
        "memory_key": decision.memory_key,
    }

    if decision.need == MemoryNeed.EXPLICIT_MEMORY_COMMAND and decision.memory_key:
        query_plan["operation"] = "timeline"
    elif decision.need == MemoryNeed.STATE_CHECK:
        query_plan["operation"] = "current_state"
    elif decision.need == MemoryNeed.HISTORICAL_CHECK:
        query_plan["operation"] = "timeline"
        query_plan["current_state_only"] = False

    return query_plan
