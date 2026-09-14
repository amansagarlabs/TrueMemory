"""Live Test Trace Collector — captures complete execution traces for live model tests.

Records every step of the live test execution:
- Provider calls
- Tool invocations
- Decision/action/influence events
- Timing
- Errors
- Classification of failures

Used by Phase 9.9.1 for evidence capture.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4


class FailureClass(str, Enum):
    """Classification of live test failures."""
    CREDENTIAL_MISSING = "credential_missing"
    CREDIT_EXHAUSTED = "credit_exhausted"
    RATE_LIMITED = "rate_limited"
    API_UNREACHABLE = "api_unreachable"
    MODEL_REFUSED = "model_refused"
    TOOL_NOT_CALLED = "tool_not_called"
    TOOL_CALL_MALFORMED = "tool_call_malformed"
    TOOL_EXECUTION_FAILED = "tool_execution_failed"
    TIMEOUT = "timeout"
    NETWORK_ERROR = "network_error"
    UNKNOWN = "unknown"


class TestOutcome(str, Enum):
    """Outcome of a live test."""
    PASS = "pass"
    FAIL = "fail"
    SKIP = "skip"
    BLOCKED = "blocked"
    ERROR = "error"


@dataclass
class ToolCallTrace:
    """Trace of a single tool call."""
    tool_call_id: str
    tool_name: str
    arguments: dict[str, Any]
    round_num: int
    started_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    completed_at: str | None = None
    success: bool | None = None
    result_summary: str | None = None
    execution_time_ms: float = 0.0
    error: str | None = None


@dataclass
class LiveTestTrace:
    """Complete trace for a single live test execution."""
    trace_id: str = field(default_factory=lambda: str(uuid4()))
    test_name: str = ""
    test_class: str = ""
    run_id: str = ""
    provider: str = ""
    model: str = ""
    interface: str = "python_sdk"

    # Request
    user_request: str = ""
    system_prompt: str = ""

    # Execution
    tool_calls: list[ToolCallTrace] = field(default_factory=list)
    decision_events: list[dict] = field(default_factory=list)
    action_events: list[dict] = field(default_factory=list)
    influence_events: list[dict] = field(default_factory=list)

    # Response
    model_response: str = ""
    total_rounds: int = 0

    # Timing
    started_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    completed_at: str | None = None
    total_ms: float = 0.0
    provider_ms: float = 0.0
    tool_ms: float = 0.0

    # Outcome
    outcome: str = TestOutcome.PASS
    failure_class: str | None = None
    error_message: str | None = None

    # Evidence
    evidence_summary: str = ""
    assertions_passed: int = 0
    assertions_failed: int = 0

    def complete(self, outcome: TestOutcome, failure_class: str | None = None, error: str | None = None):
        """Mark trace as complete."""
        self.completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.total_ms = time.time() * 1000 - _parse_iso_ms(self.started_at)
        self.outcome = outcome
        self.failure_class = failure_class
        self.error_message = error

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "test_name": self.test_name,
            "test_class": self.test_class,
            "run_id": self.run_id,
            "provider": self.provider,
            "model": self.model,
            "interface": self.interface,
            "user_request": self.user_request,
            "tool_calls": [
                {
                    "tool_call_id": tc.tool_call_id,
                    "tool_name": tc.tool_name,
                    "arguments": tc.arguments,
                    "round": tc.round_num,
                    "success": tc.success,
                    "execution_time_ms": tc.execution_time_ms,
                    "error": tc.error,
                }
                for tc in self.tool_calls
            ],
            "decision_events": self.decision_events,
            "action_events": self.action_events,
            "influence_events": self.influence_events,
            "model_response": self.model_response[:500],
            "total_rounds": self.total_rounds,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total_ms": self.total_ms,
            "provider_ms": self.provider_ms,
            "tool_ms": self.tool_ms,
            "outcome": self.outcome,
            "failure_class": self.failure_class,
            "error_message": self.error_message,
            "evidence_summary": self.evidence_summary,
            "assertions_passed": self.assertions_passed,
            "assertions_failed": self.assertions_failed,
        }


@dataclass
class LiveTestSuiteTrace:
    """Aggregated trace for an entire live test suite execution."""
    suite_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    completed_at: str | None = None
    traces: list[LiveTestTrace] = field(default_factory=list)
    provider_capability_report: dict[str, Any] | None = None

    @property
    def total_tests(self) -> int:
        return len(self.traces)

    @property
    def passed(self) -> int:
        return sum(1 for t in self.traces if t.outcome == TestOutcome.PASS)

    @property
    def failed(self) -> int:
        return sum(1 for t in self.traces if t.outcome == TestOutcome.FAIL)

    @property
    def blocked(self) -> int:
        return sum(1 for t in self.traces if t.outcome == TestOutcome.BLOCKED)

    @property
    def skipped(self) -> int:
        return sum(1 for t in self.traces if t.outcome == TestOutcome.SKIP)

    @property
    def errors(self) -> int:
        return sum(1 for t in self.traces if t.outcome == TestOutcome.ERROR)

    def complete(self):
        self.completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    def summary(self) -> dict[str, Any]:
        return {
            "suite_id": self.suite_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total": self.total_tests,
            "passed": self.passed,
            "failed": self.failed,
            "blocked": self.blocked,
            "skipped": self.skipped,
            "errors": self.errors,
            "failure_classes": self._failure_classes(),
        }

    def _failure_classes(self) -> dict[str, int]:
        classes: dict[str, int] = {}
        for t in self.traces:
            if t.failure_class:
                classes[t.failure_class] = classes.get(t.failure_class, 0) + 1
        return classes

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.summary(),
            "traces": [t.to_dict() for t in self.traces],
            "provider_capability_report": self.provider_capability_report,
        }

    def save(self, path: str):
        """Save suite trace to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)


def _parse_iso_ms(iso_str: str) -> float:
    """Parse ISO timestamp to milliseconds (approximate)."""
    import datetime
    try:
        dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.timestamp() * 1000
    except Exception:
        return time.time() * 1000
