"""Deterministic fast-decision baseline.

This provider has no network or model dependency. It is intentionally
conservative and remains the authoritative fallback for every optional
provider integration.
"""

from __future__ import annotations

import re
import time
from typing import Any

from services.memory_decision_engine import MemoryNeed, classify_memory_need

from agent.harness.decision.contract import (
    DecisionQuestion,
    DecisionRequest,
    FastDecisionProvider,
    FastDecisionResult,
)


_COMPLEX_SIGNALS = (
    "architecture",
    "design",
    "debug",
    "refactor",
    "compare",
    "tradeoff",
    "migration",
    "security",
    "production",
    "database",
    "multiple files",
)
_DESTRUCTIVE_SIGNALS = (
    "delete",
    "remove",
    "forget",
    "drop",
    "destroy",
    "publish",
    "send",
    "execute",
    "shell",
    "write",
    "update",
)
_READ_SIGNALS = ("read", "list", "get", "search", "inspect", "retrieve", "view")


def _state_text(state: dict[str, Any]) -> str:
    values = [
        str(state.get("user_message") or ""),
        str(state.get("candidate_tool") or ""),
        str(state.get("task_type") or ""),
    ]
    return " ".join(values).strip().casefold()


def _result(
    request: DecisionRequest,
    *,
    values: dict[str, Any],
    confidences: dict[str, float],
    started: float,
) -> FastDecisionResult:
    return FastDecisionResult(
        values=values,
        provider="deterministic",
        model="rules-v1",
        latency_ms=round((time.perf_counter() - started) * 1000, 3),
        request_id=request.request_id,
        run_id=request.run_id,
        confidences=confidences,
    )


class DeterministicFastDecisionProvider(FastDecisionProvider):
    provider_name = "deterministic"

    async def evaluate(self, request: DecisionRequest) -> FastDecisionResult:
        started = time.perf_counter()
        values: dict[str, Any] = {}
        confidences: dict[str, float] = {}
        state_text = _state_text(request.state)

        if request.decision_type in {"memory_relevance", "chat_routing"}:
            memory = classify_memory_need(
                str(request.state.get("user_message") or ""),
                context={"project_id": request.state.get("project_id")},
            )
            message = str(request.state.get("user_message") or "").casefold()
            # Temporal language must take precedence over a generic decision
            # signal: "what did we decide last month" needs episodic context.
            if any(token in message for token in ("last month", "last year", "previously", "used to", "in the past")):
                depth = "episodic"
            elif re.search(r"\bmy\s+(current|default|usual|preferred)\b", message):
                depth = "current_state"
            else:
                depth = self._memory_depth(memory.need)
            values["memory_needed"] = depth != "none"
            values["memory_depth"] = depth
            confidences["memory_needed"] = max(0.0, min(1.0, memory.confidence))
            confidences["memory_depth"] = max(0.0, min(1.0, memory.confidence))

        if request.decision_type in {"model_routing", "chat_routing"}:
            complex_request = len(state_text) > 180 or any(
                signal in state_text for signal in _COMPLEX_SIGNALS
            )
            values["model_route"] = "reasoning" if complex_request else "fast"
            confidences["model_route"] = 0.82 if complex_request else 0.78

        if request.decision_type in {"tool_risk", "chat_routing"} and (
            "candidate_tool" in request.state or request.decision_type == "tool_risk"
        ):
            tool = str(request.state.get("candidate_tool") or "").casefold()
            if any(signal in tool for signal in _DESTRUCTIVE_SIGNALS):
                risk, confidence = "high", 0.9
            elif any(signal in tool for signal in _READ_SIGNALS):
                risk, confidence = "low", 0.82
            else:
                risk, confidence = "medium", 0.62
            values["risk"] = risk
            confidences["risk"] = confidence

        if request.decision_type == "memory_write_triage":
            message = str(request.state.get("user_message") or "").casefold()
            explicit = any(
                phrase in message
                for phrase in ("remember this", "save this", "keep this in mind")
            )
            values["should_remember"] = explicit
            values["memory_category"] = "user_declared" if explicit else "none"
            values["temporary_or_durable"] = "durable" if explicit else "temporary"
            confidences["should_remember"] = 0.9 if explicit else 0.72

        for name, question in request.questions.items():
            if name in values:
                continue
            value, confidence = self._answer_generic(question, state_text)
            values[name] = value
            confidences[name] = confidence

        return _result(
            request,
            values=values,
            confidences=confidences,
            started=started,
        )

    @staticmethod
    def _memory_depth(need: MemoryNeed) -> str:
        if need == MemoryNeed.NOT_NEEDED:
            return "none"
        if need in {MemoryNeed.PREFERENCE_CHECK, MemoryNeed.STATE_CHECK}:
            return "current_state"
        if need in {MemoryNeed.DECISION_CHECK, MemoryNeed.PROJECT_CONTEXT}:
            return "semantic"
        if need in {MemoryNeed.HISTORICAL_CHECK, MemoryNeed.AGENT_HISTORY}:
            return "episodic"
        return "deep"

    @staticmethod
    def _answer_generic(question: DecisionQuestion, state_text: str) -> tuple[Any, float]:
        if question.type == "noul":
            positive = any(
                phrase in state_text
                for phrase in ("urgent", "remember", "delete", "current", "previous")
            )
            value = 0.8 if positive else 0.2
            return value, 0.8
        if question.type == "score":
            levels = question.criteria or []
            if not levels:
                return 0.0, 0.4
            index = min(len(levels) - 1, max(0, len(state_text) // 120))
            return float(index), 0.55
        options = list((question.criteria or {}).keys())
        if not options:
            return None, 0.0
        for option in options:
            if re.search(rf"\b{re.escape(option.casefold())}\b", state_text):
                return option, 0.7
        fallback = next(
            (option for option in options if option.casefold() in {"none", "other", "unknown"}),
            options[0],
        )
        return fallback, 0.35
