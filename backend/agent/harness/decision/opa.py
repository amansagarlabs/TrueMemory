"""Optional in-process OPA-Wasm policy evaluation.

No network or OPA server is used. The compiled artifact is optional so local
development and CI remain functional before the bundle is built.
"""

from __future__ import annotations

import asyncio
import importlib
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agent.harness.decision.contract import DecisionRequest, FastDecisionResult


@dataclass(frozen=True)
class OpaDecision:
    value: Any
    policy: str
    reason: str | None
    resolved: bool


class EmbeddedOpaEngine:
    """Evaluate a compiled OPA Wasm policy in-process when available."""

    provider_name = "opa"

    def __init__(self, bundle_path: str = "backend/policies/bundle/policy.wasm") -> None:
        self.bundle_path = Path(bundle_path)
        self._policy = None
        self._load_error: str | None = None
        if not self.bundle_path.is_file():
            self._load_error = "policy_bundle_missing"
            return
        try:
            module = importlib.import_module("opa_wasm")
            self._policy = module.OPAPolicy(str(self.bundle_path))
        except Exception as exc:  # optional runtime/artifact must not break startup
            self._load_error = type(exc).__name__

    @property
    def available(self) -> bool:
        return self._policy is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    async def evaluate(self, request: DecisionRequest) -> FastDecisionResult | None:
        if self._policy is None:
            return None
        started = time.perf_counter()
        result = await asyncio.to_thread(
            self._policy.evaluate,
            self._policy_input(request),
        )
        decision = self._normalize(result)
        if decision is None or not decision.resolved:
            return None
        return FastDecisionResult(
            values={self._value_name(request): decision.value},
            provider="opa",
            model=None,
            latency_ms=round((time.perf_counter() - started) * 1000, 3),
            request_id=request.request_id,
            run_id=request.run_id,
            confidences={},
        )

    @staticmethod
    def _value_name(request: DecisionRequest) -> str:
        if request.decision_type == "tool_risk":
            return "risk"
        if request.decision_type == "memory_write_triage":
            return "should_remember"
        if request.decision_type == "model_routing":
            return "model_route"
        return next(iter(request.questions))

    @staticmethod
    def _policy_input(request: DecisionRequest) -> dict[str, Any]:
        state = dict(request.state)
        message = str(state.get("user_message") or "").casefold()
        if request.decision_type == "memory_write_triage":
            state["explicit"] = any(
                phrase in message for phrase in ("remember this", "save this", "keep this in mind")
            )
        if request.decision_type == "model_routing":
            state["complex"] = len(message) > 180 or any(
                word in message for word in ("architecture", "debug", "refactor", "migration", "security")
            )
        state["decision_type"] = request.decision_type
        return state

    @staticmethod
    def _normalize(raw: Any) -> OpaDecision | None:
        value = raw
        if isinstance(raw, list):
            value = raw[0].get("result") if raw and isinstance(raw[0], dict) else None
        if isinstance(value, dict) and "result" in value and len(value) == 1:
            value = value["result"]
        if not isinstance(value, dict):
            return None
        return OpaDecision(
            value=value.get("value"),
            policy=str(value.get("policy") or "opa.policy.unknown"),
            reason=value.get("reason"),
            resolved=bool(value.get("resolved")),
        )
