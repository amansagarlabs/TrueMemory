"""Provider-independent decision orchestration with policy and AI fallback."""

from __future__ import annotations

import time
from dataclasses import dataclass, replace
from typing import Any
from uuid import uuid4

from agent.harness.decision.contract import (
    DecisionQuestion,
    DecisionRequest,
    FastDecisionProvider,
    FastDecisionResult,
)
from agent.harness.decision.deterministic import DeterministicFastDecisionProvider
from agent.harness.decision.groq import GroqDecisionProvider
from agent.harness.decision.opa import EmbeddedOpaEngine
from agent.harness.decision.policy import FastDecisionPolicy
from agent.harness.decision.telemetry import record_fast_decision_event


@dataclass(frozen=True)
class FastDecisionOutcome:
    authoritative: FastDecisionResult
    selected: FastDecisionResult
    advisory: FastDecisionResult | None = None
    shadow_agreement: bool | None = None


class FastDecisionService:
    """Run deterministic decisions, local policy, and optional Groq advice."""

    def __init__(
        self,
        *,
        deterministic: FastDecisionProvider | None = None,
        optional_provider: FastDecisionProvider | None = None,
        provider_name: str = "deterministic",
        mode: str = "disabled",
        policy: FastDecisionPolicy | None = None,
        opa_engine: EmbeddedOpaEngine | None = None,
    ) -> None:
        self.deterministic = deterministic or DeterministicFastDecisionProvider()
        self.optional_provider = optional_provider
        self.provider_name = provider_name.strip().lower() or "deterministic"
        self.mode = mode.strip().lower() or "disabled"
        self.policy = policy or FastDecisionPolicy()
        self.opa_engine = opa_engine

    @classmethod
    def from_settings(cls, settings) -> "FastDecisionService":
        provider_name = str(getattr(settings, "fast_decision_provider", "deterministic")).lower()
        mode = str(getattr(settings, "fast_decision_mode", "disabled")).lower()
        optional_provider: FastDecisionProvider | None = None
        if provider_name == "groq" and bool(getattr(settings, "ai_decision_enabled", False)):
            optional_provider = GroqDecisionProvider(
                api_key=str(getattr(settings, "groq_api_key", "")),
                base_url=str(getattr(settings, "groq_base_url", "https://api.groq.com/openai/v1")),
                model=str(getattr(settings, "groq_decision_model", "openai/gpt-oss-20b")),
                timeout_seconds=float(getattr(settings, "fast_decision_timeout_seconds", 1.5)),
                max_attempts=int(getattr(settings, "fast_decision_max_attempts", 2)),
            )
        return cls(
            provider_name=provider_name,
            mode=mode,
            optional_provider=optional_provider,
            opa_engine=EmbeddedOpaEngine(
                str(getattr(settings, "opa_policy_bundle_path", "backend/policies/bundle/policy.wasm"))
            ),
            policy=FastDecisionPolicy(
                active_min_confidence=float(
                    getattr(settings, "fast_decision_active_min_confidence", 0.85)
                )
            ),
        )

    async def evaluate(self, request: DecisionRequest) -> FastDecisionOutcome:
        started = time.perf_counter()
        deterministic = await self.deterministic.evaluate(request)
        record_fast_decision_event(
            "fast_decision_requested",
            provider=deterministic.provider,
            model=deterministic.model,
            decision_type=request.decision_type,
            latency_ms=None,
            confidence=deterministic.confidence,
            fallback=False,
            request_id=request.request_id,
            run_id=request.run_id,
        )

        if self.opa_engine is not None:
            try:
                opa_result = await self.opa_engine.evaluate(request)
            except Exception as exc:
                record_fast_decision_event(
                    "decision_engine_opa_failed",
                    provider="opa",
                    model=None,
                    decision_type=request.decision_type,
                    latency_ms=None,
                    confidence=None,
                    fallback=True,
                    request_id=request.request_id,
                    run_id=request.run_id,
                    error=type(exc).__name__,
                )
                opa_result = None
            if opa_result is not None:
                record_fast_decision_event(
                    "decision_engine_opa_resolved",
                    provider="opa",
                    model=None,
                    decision_type=request.decision_type,
                    latency_ms=opa_result.latency_ms,
                    confidence=None,
                    fallback=False,
                    request_id=request.request_id,
                    run_id=request.run_id,
                )
                return FastDecisionOutcome(authoritative=opa_result, selected=opa_result)

        if self.mode not in {"shadow", "active"} or self.provider_name != "groq":
            record_fast_decision_event(
                "fast_decision_completed",
                provider=deterministic.provider,
                model=deterministic.model,
                decision_type=request.decision_type,
                latency_ms=round((time.perf_counter() - started) * 1000, 3),
                confidence=deterministic.confidence,
                fallback=False,
                request_id=request.request_id,
                run_id=request.run_id,
            )
            return FastDecisionOutcome(authoritative=deterministic, selected=deterministic)

        if self.optional_provider is None:
            return self._fallback(request, deterministic, "optional_provider_unconfigured")

        try:
            optional_result = await self.optional_provider.evaluate(request)
        except Exception as exc:  # provider failures must not reach MemoryCore
            return self._fallback(request, deterministic, type(exc).__name__)
        if optional_result.status != "ok":
            return self._fallback(
                request,
                deterministic,
                optional_result.error or "optional_provider_error",
            )

        agreement = optional_result.values == deterministic.values
        record_fast_decision_event(
            "fast_decision_completed",
            provider=optional_result.provider,
            model=optional_result.model,
            decision_type=request.decision_type,
            latency_ms=optional_result.latency_ms,
            confidence=optional_result.confidence,
            fallback=False,
            request_id=request.request_id,
            run_id=request.run_id,
        )
        record_fast_decision_event(
            "fast_decision_shadow_agreement" if agreement else "fast_decision_shadow_disagreement",
            provider=optional_result.provider,
            model=optional_result.model,
            decision_type=request.decision_type,
            latency_ms=optional_result.latency_ms,
            confidence=optional_result.confidence,
            fallback=False,
            request_id=request.request_id,
            run_id=request.run_id,
            agreement=agreement,
        )

        if self.mode == "active" and self.policy.can_apply(request, optional_result):
            record_fast_decision_event(
                "fast_decision_active",
                provider=optional_result.provider,
                model=optional_result.model,
                decision_type=request.decision_type,
                latency_ms=optional_result.latency_ms,
                confidence=optional_result.confidence,
                fallback=False,
                request_id=request.request_id,
                run_id=request.run_id,
            )
            return FastDecisionOutcome(
                authoritative=deterministic,
                selected=optional_result,
                advisory=optional_result,
                shadow_agreement=agreement,
            )

        return FastDecisionOutcome(
            authoritative=deterministic,
            selected=deterministic,
            advisory=optional_result,
            shadow_agreement=agreement,
        )

    async def evaluate_chat_routing(
        self,
        *,
        user_message: str,
        project_id: str | None = None,
        request_id: str = "",
        run_id: str = "",
    ) -> FastDecisionOutcome:
        state = {
            "user_message": user_message[:4_000],
            "task_type": "chat",
            "project_id": project_id,
            "retrieval_available": True,
        }
        return await self.evaluate(
            DecisionRequest(
                state=state,
                decision_type="chat_routing",
                request_id=request_id or str(uuid4()),
                run_id=run_id or str(uuid4()),
                questions={
                    "memory_depth": DecisionQuestion(
                        type="choice",
                        instructions="How much saved memory is relevant to this user request?",
                        criteria={
                            "none": "No saved memory is needed.",
                            "current_state": "Only current user or project state is needed.",
                            "shallow": "A small amount of recent context is enough.",
                            "semantic": "Saved decisions or stable facts are relevant.",
                            "episodic": "Past events or timeline context is relevant.",
                            "deep": "Broad historical context is required.",
                        },
                    ),
                    "model_route": DecisionQuestion(
                        type="choice",
                        instructions="Should this request use a fast model or a reasoning model?",
                        criteria={
                            "fast": "A short, direct response is sufficient.",
                            "reasoning": "The task needs multi-step reasoning or careful synthesis.",
                        },
                    ),
                },
            )
        )

    async def evaluate_tool_risk(
        self,
        *,
        candidate_tool: str,
        request_id: str = "",
        run_id: str = "",
    ) -> FastDecisionOutcome:
        """Return an advisory risk signal; existing authorization stays final."""
        return await self.evaluate(
            DecisionRequest(
                state={"candidate_tool": candidate_tool[:160]},
                decision_type="tool_risk",
                request_id=request_id or str(uuid4()),
                run_id=run_id or str(uuid4()),
                questions={
                    "risk": DecisionQuestion(
                        type="choice",
                        instructions="Classify the operational risk of the proposed tool call.",
                        criteria={
                            "low": "Read-only and reversible.",
                            "medium": "May change local state or have a limited side effect.",
                            "high": "Destructive, external, or difficult to reverse.",
                        },
                    )
                },
            )
        )

    async def evaluate_memory_write_candidate(
        self,
        *,
        user_message: str,
        request_id: str = "",
        run_id: str = "",
    ) -> FastDecisionOutcome:
        """Return a candidate signal, never a persistence authorization."""
        return await self.evaluate(
            DecisionRequest(
                state={"user_message": user_message[:4_000]},
                decision_type="memory_write_triage",
                request_id=request_id or str(uuid4()),
                run_id=run_id or str(uuid4()),
                questions={
                    "should_remember": DecisionQuestion(
                        type="noul",
                        instructions="Does the user explicitly ask the system to remember this?",
                    )
                },
            )
        )

    def _fallback(
        self,
        request: DecisionRequest,
        deterministic: FastDecisionResult,
        reason: str,
    ) -> FastDecisionOutcome:
        fallback = replace(
            deterministic,
            status="fallback",
            fallback_used=True,
            error=reason,
        )
        record_fast_decision_event(
            "fast_decision_failed",
            provider=self.provider_name,
            model=None,
            decision_type=request.decision_type,
            latency_ms=deterministic.latency_ms,
            confidence=deterministic.confidence,
            fallback=True,
            request_id=request.request_id,
            run_id=request.run_id,
            error=reason,
        )
        record_fast_decision_event(
            "fast_decision_fallback",
            provider=deterministic.provider,
            model=deterministic.model,
            decision_type=request.decision_type,
            latency_ms=deterministic.latency_ms,
            confidence=deterministic.confidence,
            fallback=True,
            request_id=request.request_id,
            run_id=request.run_id,
            error=reason,
        )
        return FastDecisionOutcome(authoritative=deterministic, selected=fallback)
