"""Reviewable artifacts for the feedback -> regression -> measurement loop."""

from __future__ import annotations

import hashlib
from typing import Any


def regression_case_from_feedback(
    *,
    question: str,
    route: dict[str, Any],
    failure_type: str,
    report_reason: str | None = None,
) -> dict[str, Any]:
    """Turn a reviewed failure into a deterministic benchmark candidate.

    This proposes a test only. It never edits routing rules or production data.
    """
    normalized = " ".join(str(question).split())
    digest = hashlib.sha256(normalized.casefold().encode("utf-8")).hexdigest()[:12]
    expected = {
        "mode": route.get("mode"),
        "needs_web": route.get("needs_web", False),
    }
    if route.get("subject"):
        expected["subject"] = route["subject"]
    if route.get("domain"):
        expected["domain"] = route["domain"]
    return {
        "id": f"feedback-{digest}",
        "question": normalized,
        "expected": expected,
        "critical": False,
        "review": {
            "failure_type": failure_type,
            "report_reason": report_reason,
            "status": "pending",
        },
    }


def routing_metrics(report: dict[str, Any]) -> dict[str, Any]:
    """Calculate routing-quality metrics from a deterministic report."""
    results = list(report.get("results") or [])
    if not results:
        return {
            "intent_accuracy": 0.0,
            "subject_accuracy": 0.0,
            "web_accuracy": 0.0,
            "unnecessary_web_searches": 0,
            "unnecessary_web_rate": 0.0,
        }

    def accuracy(field: str) -> float:
        comparable = [
            result for result in results
            if any(item.get("field") == field for item in result.get("assertions", []))
        ]
        if not comparable:
            return 0.0
        passed = sum(
            1
            for result in comparable
            for item in result.get("assertions", [])
            if item.get("field") == field and item.get("passed")
        )
        return round(passed / len(comparable), 4)

    unnecessary = sum(
        1
        for result in results
        for item in result.get("assertions", [])
        if item.get("field") == "needs_web"
        and item.get("expected") is False
        and item.get("actual") is True
    )
    no_web_cases = sum(
        1
        for result in results
        for item in result.get("assertions", [])
        if item.get("field") == "needs_web" and item.get("expected") is False
    )
    return {
        "intent_accuracy": accuracy("intent"),
        "subject_accuracy": accuracy("subject"),
        "web_accuracy": accuracy("needs_web"),
        "unnecessary_web_searches": unnecessary,
        "unnecessary_web_rate": round(unnecessary / no_web_cases, 4) if no_web_cases else 0.0,
    }
