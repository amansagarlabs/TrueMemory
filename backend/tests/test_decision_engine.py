from pathlib import Path

import httpx
import pytest

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest
from agent.harness.decision.groq import GroqDecisionError, GroqDecisionProvider
from agent.harness.decision.opa import EmbeddedOpaEngine


def _request():
    return DecisionRequest(
        state={"user_message": "Remember this: I prefer short answers."},
        decision_type="memory_write_triage",
        request_id="req-groq-1",
        run_id="run-groq-1",
        questions={
            "should_remember": DecisionQuestion(
                type="noul",
                instructions="Should this be a durable memory candidate?",
            )
        },
    )


@pytest.mark.asyncio
async def test_groq_missing_key_is_explicit_and_does_not_call_network():
    provider = GroqDecisionProvider(api_key="", transport=httpx.MockTransport(lambda request: httpx.Response(500)))
    with pytest.raises(GroqDecisionError, match="GROQ_API_KEY"):
        await provider.evaluate(_request())


@pytest.mark.asyncio
async def test_groq_structured_response_is_validated_and_coerced():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/openai/v1/chat/completions"
        assert request.headers["authorization"].startswith("Bearer ")
        return httpx.Response(
            200,
            request=request,
            json={
                "choices": [{"message": {"content": '{"answers":[{"name":"should_remember","value":"true","confidence":0.84}],"reason":"explicit"}'}}]
            },
        )

    provider = GroqDecisionProvider(
        api_key="server-only-test-key",
        base_url="https://groq.test/openai/v1",
        transport=httpx.MockTransport(handler),
    )
    result = await provider.evaluate(_request())
    assert result.provider == "groq"
    assert result.values == {"should_remember": True}
    assert result.confidence == pytest.approx(0.84)


@pytest.mark.asyncio
async def test_groq_invalid_choice_falls_out_as_provider_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            request=request,
            json={
                "choices": [{"message": {"content": '{"answers":[{"name":"should_remember","value":"maybe","confidence":0.84}],"reason":"bad"}'}}]
            },
        )

    provider = GroqDecisionProvider(
        api_key="server-only-test-key",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(GroqDecisionError, match="noul"):
        await provider.evaluate(_request())


@pytest.mark.asyncio
async def test_missing_opa_bundle_is_local_and_network_free():
    engine = EmbeddedOpaEngine("backend/policies/bundle/does-not-exist.wasm")
    assert engine.available is False
    assert engine.load_error == "policy_bundle_missing"
    assert await engine.evaluate(_request()) is None


def test_rego_policy_and_build_script_are_versioned():
    assert Path("backend/policies/decision.rego").is_file()
    assert Path("backend/scripts/build_opa_policies.ps1").is_file()
