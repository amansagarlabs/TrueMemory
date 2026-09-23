"""Experimental provider-as-judge evaluation, isolated from runtime memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest, FastDecisionProvider, FastDecisionResult


@dataclass(frozen=True)
class TraceEvaluation:
    """A structured advisory evaluation of an already-completed agent trace."""

    result: FastDecisionResult
    trace_id: str


class FastDecisionEvaluator:
    """Ask a fast-decision provider to judge a trace without changing runtime state.

    This is a research/evaluation helper. It is deliberately not imported by
    MemoryCore, chat routing, authorization, retrieval, or write paths.
    """

    def __init__(self, provider: FastDecisionProvider) -> None:
        self.provider = provider

    async def evaluate_trace(
        self,
        *,
        trace_id: str,
        state: dict[str, Any],
        request_id: str = "",
        run_id: str = "",
    ) -> TraceEvaluation:
        result = await self.provider.evaluate(
            DecisionRequest(
                state=state,
                decision_type="trace_evaluation",
                request_id=request_id,
                run_id=run_id,
                questions={
                    "response_satisfied": DecisionQuestion(
                        type="noul",
                        instructions="Did the response satisfy the user's request?",
                    ),
                    "memory_supported": DecisionQuestion(
                        type="noul",
                        instructions="Did the response use relevant saved memory when it was available?",
                    ),
                    "tool_appropriate": DecisionQuestion(
                        type="noul",
                        instructions="Were the tools used appropriate for the request?",
                    ),
                    "grounded": DecisionQuestion(
                        type="noul",
                        instructions="Is the response grounded in the supplied trace evidence?",
                    ),
                },
            )
        )
        return TraceEvaluation(result=result, trace_id=trace_id)
