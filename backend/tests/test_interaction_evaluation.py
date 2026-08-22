from types import SimpleNamespace

from services.interaction_evaluation import (
    build_interaction_observability,
    classify_feedback_failure,
    evaluate_answer,
)


def test_feedback_is_classified_by_failure_family() -> None:
    assert classify_feedback_failure("wrong_web") == "web_failure"
    assert classify_feedback_failure("forgot_memory") == "memory_failure"


def test_observability_contains_routing_and_retrieval_metrics() -> None:
    decision = SimpleNamespace(
        intent="professional.role",
        subject={"type": "current_user"},
        source={"primary": "user_memory"},
        web_allowed=False,
        confidence=0.98,
    )
    result = build_interaction_observability(
        request_id="req-1",
        user_id="user-1",
        conversation_id="conv-1",
        question="What do I do?",
        decision=decision,
        memory_count=2,
        conversation_count=4,
        vector_hits=0,
        web_used=False,
        latency_ms=42.5,
    )
    assert result["intent"] == "professional.role"
    assert result["retrieved_memory_count"] == 2
    assert result["web_used"] is False
    assert result["quality_score"] is None


def test_deterministic_evaluator_flags_missing_memory_evidence() -> None:
    decision = SimpleNamespace(subject={"type": "current_user"}, needs_web=False)
    result = evaluate_answer(
        question="What do I do?",
        answer="I do not have that saved.",
        decision=decision,
        memory_count=0,
        web_used=False,
    )
    assert result["quality_score"] == 60
    assert result["failure_type"] == "memory_failure"
