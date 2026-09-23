"""Provider-neutral contract for fast, structured agent decisions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DecisionQuestion:
    """A provider-neutral typed question.

    The shape intentionally mirrors the common subset of System One-style
    providers without exposing a vendor SDK type to the harness.
    """

    type: str
    instructions: str
    criteria: dict[str, str] | list[str] | None = None

    def __post_init__(self) -> None:
        if self.type not in {"noul", "choice", "score"}:
            raise ValueError(f"Unsupported decision question type: {self.type}")
        if not self.instructions.strip():
            raise ValueError("Decision question instructions cannot be empty")
        if self.type == "choice" and (not isinstance(self.criteria, dict) or not self.criteria):
            raise ValueError("Choice questions require a criteria mapping")
        if self.type == "score" and (not isinstance(self.criteria, list) or not self.criteria):
            raise ValueError("Score questions require an ordered criteria list")

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": self.type,
            "instructions": self.instructions,
        }
        if self.criteria is not None:
            payload["criteria"] = self.criteria
        return payload


@dataclass(frozen=True)
class DecisionRequest:
    state: dict[str, Any]
    questions: dict[str, DecisionQuestion]
    decision_type: str = "evaluate"
    request_id: str = ""
    run_id: str = ""

    def __post_init__(self) -> None:
        if not self.questions:
            raise ValueError("At least one decision question is required")
        if any(not name.strip() for name in self.questions):
            raise ValueError("Decision question ids cannot be empty")

    def to_payload(self, *, model: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "state": self.state,
            "questions": {
                name: question.to_payload()
                for name, question in self.questions.items()
            },
        }
        if model:
            payload["model"] = model
        return payload


@dataclass(frozen=True)
class FastDecisionResult:
    """Normalized provider output safe for policy and telemetry."""

    values: dict[str, Any]
    provider: str
    model: str | None
    latency_ms: float
    request_id: str
    run_id: str
    status: str = "ok"
    confidences: dict[str, float] = field(default_factory=dict)
    fallback_used: bool = False
    error: str | None = None

    @property
    def confidence(self) -> float | None:
        if not self.confidences:
            return None
        return sum(self.confidences.values()) / len(self.confidences)

    @property
    def decision(self) -> dict[str, Any]:
        return self.values


class FastDecisionProvider(ABC):
    """Small provider-neutral interface used only by the agent harness."""

    provider_name = "unknown"

    @abstractmethod
    async def evaluate(self, request: DecisionRequest) -> FastDecisionResult:
        """Evaluate typed questions against minimal state."""

    async def classify(
        self,
        *,
        state: dict[str, Any],
        labels: dict[str, str],
        instructions: str,
        request_id: str = "",
        run_id: str = "",
        decision_type: str = "classify",
    ) -> FastDecisionResult:
        return await self.evaluate(
            DecisionRequest(
                state=state,
                questions={
                    "classification": DecisionQuestion(
                        type="choice",
                        instructions=instructions,
                        criteria=labels,
                    )
                },
                decision_type=decision_type,
                request_id=request_id,
                run_id=run_id,
            )
        )

    async def choose(
        self,
        *,
        state: dict[str, Any],
        options: dict[str, str],
        instructions: str,
        request_id: str = "",
        run_id: str = "",
    ) -> FastDecisionResult:
        return await self.classify(
            state=state,
            labels=options,
            instructions=instructions,
            request_id=request_id,
            run_id=run_id,
            decision_type="choose",
        )

    async def score(
        self,
        *,
        state: dict[str, Any],
        levels: list[str],
        instructions: str,
        request_id: str = "",
        run_id: str = "",
    ) -> FastDecisionResult:
        return await self.evaluate(
            DecisionRequest(
                state=state,
                questions={
                    "score": DecisionQuestion(
                        type="score",
                        instructions=instructions,
                        criteria=levels,
                    )
                },
                decision_type="score",
                request_id=request_id,
                run_id=run_id,
            )
        )
