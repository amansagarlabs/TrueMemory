from evaluation.continuous_improvement import (
    regression_case_from_feedback,
    routing_metrics,
)


def test_feedback_becomes_reviewable_regression_case() -> None:
    case = regression_case_from_feedback(
        question="What do I do?",
        route={
            "mode": "search",
            "needs_web": True,
            "domain": "professional",
            "subject": {"type": "current_user"},
        },
        failure_type="web_failure",
        report_reason="wrong_web",
    )
    assert case["id"].startswith("feedback-")
    assert case["review"]["status"] == "pending"
    assert case["expected"]["subject"] == {"type": "current_user"}


def test_metrics_measure_unnecessary_web_searches() -> None:
    result = routing_metrics({
        "results": [{
            "assertions": [{
                "field": "needs_web",
                "expected": False,
                "actual": True,
                "passed": False,
            }],
        }],
    })
    assert result["unnecessary_web_searches"] == 1
    assert result["unnecessary_web_rate"] == 1.0
