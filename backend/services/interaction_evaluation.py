"""Deterministic observability and feedback classification for chat turns."""

from __future__ import annotations

from typing import Any


FEEDBACK_FAILURE_TYPES = {
    "incorrect": "intent_failure",
    "unhelpful": "retrieval_failure",
    "unsafe": "authorization_failure",
    "citation": "web_failure",
    "missing_context": "retrieval_failure",
    "wrong_web": "web_failure",
    "forgot_memory": "memory_failure",
    "wrong_memory": "retrieval_failure",
    "other": "intent_failure",
}


def evaluate_answer(
    *,
    question: str,
    answer: str,
    decision: Any,
    memory_count: int,
    web_used: bool,
) -> dict[str, Any]:
    """Cheap production baseline; optional model evaluation can layer on later."""
    normalized = str(answer or "").strip()
    score = 100
    failure_type = None
    if not normalized:
        score, failure_type = 0, "tool_failure"
    elif normalized.casefold().startswith(("here's a thinking process", "thinking process:")):
        score, failure_type = 0, "prompt_injection_failure"
    elif decision.subject.get("type") == "current_user" and memory_count == 0:
        score, failure_type = 60, "memory_failure"
    elif decision.needs_web and not web_used:
        score, failure_type = 50, "web_failure"
    elif not decision.needs_web and web_used:
        score, failure_type = 50, "web_failure"
    return {
        "quality_score": score,
        "failure_type": failure_type,
        "evaluator": "deterministic-baseline-v1",
        "improvement_suggestion": (
            "Review route and memory evidence before changing prompts."
            if failure_type else None
        ),
    }


def classify_feedback_failure(
    report_reason: str | None,
) -> str | None:
    """Map user-facing feedback to a stable evaluation category."""
    if not report_reason:
        return None
    return FEEDBACK_FAILURE_TYPES.get(report_reason, "intent_failure")


def build_interaction_observability(
    *,
    request_id: str,
    user_id: str,
    conversation_id: str,
    question: str,
    decision: Any,
    memory_count: int,
    conversation_count: int,
    vector_hits: int,
    web_used: bool,
    latency_ms: float,
) -> dict[str, Any]:
    """Create JSON-safe, provider-independent turn telemetry."""
    return {
        "request_id": request_id,
        "user_id": user_id,
        "conversation_id": conversation_id,
        "query": question,
        "intent": decision.intent,
        "subject": decision.subject,
        "source_selection": decision.source,
        "web_allowed": decision.web_allowed,
        "web_used": web_used,
        "retrieved_memory_count": memory_count,
        "retrieved_conversation_count": conversation_count,
        "vector_hits": vector_hits,
        "latency_ms": latency_ms,
        "confidence": decision.confidence,
        "quality_score": None,
    }
