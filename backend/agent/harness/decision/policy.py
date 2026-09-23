"""Policy boundary between advisory decisions and application behavior."""

from __future__ import annotations

from dataclasses import dataclass

from agent.harness.decision.contract import DecisionRequest, FastDecisionResult


@dataclass(frozen=True)
class FastDecisionPolicy:
    active_min_confidence: float = 0.85

    def can_apply(self, request: DecisionRequest, result: FastDecisionResult) -> bool:
        """Allow only reversible, low-risk suggestions to affect behavior."""
        if request.decision_type not in {
            "chat_routing",
            "memory_relevance",
            "model_routing",
            "retrieval_depth",
            "classify",
            "choose",
            "score",
        }:
            return False
        if str(result.values.get("risk") or "").casefold() in {"high", "critical"}:
            return False
        confidence = result.confidence
        return confidence is not None and confidence >= self.active_min_confidence

    def can_apply_tool_risk(self, result: FastDecisionResult) -> bool:
        """Tool-risk output is advisory only; existing authorization remains final."""
        return False
