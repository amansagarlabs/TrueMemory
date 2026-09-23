import ast
import os
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest, FastDecisionProvider, FastDecisionResult
from agent.harness.decision.deterministic import DeterministicFastDecisionProvider
from agent.harness.decision.jev import JevClient, JevFastDecisionProvider
from agent.harness.decision.policy import FastDecisionPolicy
from agent.harness.decision.service import FastDecisionService
from agent.harness.evaluator import FastDecisionEvaluator


def _question_request(*, decision_type="classify"):
    return DecisionRequest(
        state={"user_message": "Please inspect the current project decision."},
        decision_type=decision_type,
        request_id="req-fast-1",
        run_id="run-fast-1",
        questions={
            "classification": DecisionQuestion(
                type="choice",
                instructions="Choose the category.",
                criteria={"memory": "Saved context is relevant.", "none": "No context is relevant."},
            )
        },
    )


@pytest.mark.asyncio
async def test_deterministic_provider_requires_no_external_key():
    provider = DeterministicFastDecisionProvider()

    result = await provider.evaluate(
        DecisionRequest(
            state={"user_message": "Use what we decided last month."},
            decision_type="memory_relevance",
            request_id="req-1",
            run_id="run-1",
            questions={
                "memory_depth": DecisionQuestion(
                    type="choice",
                    instructions="Choose memory depth.",
                    criteria={"none": "none", "episodic": "past events"},
                )
            },
        )
    )

    assert result.provider == "deterministic"
    assert result.values["memory_depth"] == "episodic"
    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_missing_groq_key_falls_back_without_changing_deterministic_path():
    settings = SimpleNamespace(
        fast_decision_provider="groq",
        fast_decision_mode="shadow",
        ai_decision_enabled=True,
        groq_api_key="",
        groq_base_url="https://api.groq.com/openai/v1",
        groq_decision_model="openai/gpt-oss-20b",
        opa_policy_bundle_path="backend/policies/bundle/does-not-exist.wasm",
        fast_decision_timeout_seconds=0.1,
        fast_decision_max_attempts=1,
        fast_decision_active_min_confidence=0.85,
    )

    outcome = await FastDecisionService.from_settings(settings).evaluate(_question_request())

    assert outcome.selected.fallback_used is True
    assert outcome.selected.provider == "deterministic"
    assert outcome.advisory is None


@pytest.mark.asyncio
async def test_jev_retries_transient_503_then_parses_typed_answers():
    calls = 0

    async def no_sleep(_attempt, _retry_after):
        return None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(
            200,
            request=request,
            json={
                "model": "jev-test-1",
                "answers": {
                    "classification": {
                        "type": "choice",
                        "choice": "memory",
                        "confidence": 0.91,
                        "probabilities": {"memory": 0.91, "none": 0.09},
                    }
                },
            },
        )

    client = JevClient(
        api_key="server-only-test-key",
        base_url="https://typesafe.test",
        max_attempts=2,
        transport=httpx.MockTransport(handler),
    )
    client._sleep = no_sleep
    result = await JevFastDecisionProvider(client).evaluate(_question_request())

    assert calls == 2
    assert result.provider == "jev"
    assert result.model == "jev-test-1"
    assert result.values == {"classification": "memory"}
    assert result.confidence == pytest.approx(0.91)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 502, 503, 504])
async def test_jev_retries_all_transient_provider_statuses(status):
    calls = 0

    async def no_sleep(_attempt, _retry_after):
        return None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(status, request=request, headers={"Retry-After": "0"})
        return httpx.Response(
            200,
            request=request,
            json={"answers": {"classification": {"choice": "memory", "confidence": 0.9}}},
        )

    client = JevClient(
        api_key="server-only-test-key",
        max_attempts=2,
        transport=httpx.MockTransport(handler),
    )
    client._sleep = no_sleep
    result = await JevFastDecisionProvider(client).evaluate(_question_request())

    assert calls == 2
    assert result.values["classification"] == "memory"


@pytest.mark.asyncio
async def test_malformed_jev_result_is_rejected():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, request=request, json={"answers": {}})

    client = JevClient(
        api_key="server-only-test-key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(Exception, match="missing answer"):
        await JevFastDecisionProvider(client).evaluate(_question_request())


class _FakeOptionalProvider(FastDecisionProvider):
    provider_name = "fake"

    async def evaluate(self, request):
        return FastDecisionResult(
            values={"classification": "memory"},
            provider="fake",
            model="fake-v1",
            latency_ms=1.0,
            request_id=request.request_id,
            run_id=request.run_id,
            confidences={"classification": 0.95},
        )


@pytest.mark.asyncio
async def test_shadow_is_observational_and_active_policy_is_low_risk_only():
    shadow = FastDecisionService(
        optional_provider=_FakeOptionalProvider(),
        provider_name="groq",
        mode="shadow",
    )
    shadow_outcome = await shadow.evaluate(_question_request())
    assert shadow_outcome.selected.provider == "deterministic"
    assert shadow_outcome.advisory is not None

    policy = FastDecisionPolicy(active_min_confidence=0.85)
    assert policy.can_apply(_question_request(), shadow_outcome.advisory) is True
    assert policy.can_apply_tool_risk(shadow_outcome.advisory) is False

    active = FastDecisionService(
        optional_provider=_FakeOptionalProvider(),
        provider_name="groq",
        mode="active",
        policy=policy,
    )
    active_outcome = await active.evaluate(_question_request())
    assert active_outcome.selected.provider == "fake"


@pytest.mark.asyncio
async def test_tool_risk_and_memory_write_are_advisory_only():
    service = FastDecisionService()
    tool = await service.evaluate_tool_risk(candidate_tool="memory_forget")
    candidate = await service.evaluate_memory_write_candidate(
        user_message="Remember this: I prefer PostgreSQL."
    )

    assert tool.authoritative.values["risk"] == "high"
    assert service.policy.can_apply_tool_risk(tool.authoritative) is False
    assert candidate.authoritative.values["should_remember"] is True


@pytest.mark.asyncio
async def test_trace_evaluator_is_advisory_and_provider_neutral():
    evaluation = await FastDecisionEvaluator(
        DeterministicFastDecisionProvider()
    ).evaluate_trace(
        trace_id="trace-1",
        state={"user_message": "What did we decide?", "response": "We chose PostgreSQL."},
        request_id="req-eval-1",
        run_id="run-eval-1",
    )

    assert evaluation.trace_id == "trace-1"
    assert evaluation.result.provider == "deterministic"
    assert set(evaluation.result.values) == {
        "response_satisfied",
        "memory_supported",
        "tool_appropriate",
        "grounded",
    }


def test_typesafe_key_is_not_exposed_to_frontend_sources():
    source_suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
    for root, directories, filenames in os.walk("frontend"):
        directories[:] = [
            name for name in directories
            if name not in {"node_modules", ".next", "dist", "build", "coverage"}
        ]
        for filename in filenames:
            path = Path(root) / filename
            if path.suffix in source_suffixes:
                source = path.read_text(encoding="utf-8", errors="ignore")
                assert "TYPESAFE_API_KEY" not in source
                assert "NEXT_PUBLIC_TYPESAFE_API_KEY" not in source


def test_memory_core_has_no_fast_decision_or_jev_imports():
    for filename in ("backend/services/memory_core.py", "backend/services/memory_store.py"):
        tree = ast.parse(open(filename, encoding="utf-8").read(), filename=filename)
        imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
        imported = " ".join(
            alias.name
            for node in imports
            for alias in getattr(node, "names", [])
        ).casefold()
        assert "jev" not in imported
        assert "fast_decision" not in imported
