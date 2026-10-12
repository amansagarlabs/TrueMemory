import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import httpx

from services import agent_service
from app.runtime_config import require_postgres_for_production


def _production_settings() -> SimpleNamespace:
    return SimpleNamespace(
        environment="production",
        database_url="postgresql://configured-but-driver-missing",
        cloudinary_cloud_name="configured",
        cloudinary_api_key="configured",
        cloudinary_api_secret="configured",
        aman_jwt_secret="configured",
        cors_origins=["https://app.example.com"],
        auth_cookie_secure=True,
    )


def test_production_startup_fails_closed_when_postgres_driver_is_unavailable() -> None:
    with pytest.raises(RuntimeError, match="refusing local SQLite fallback"):
        require_postgres_for_production(_production_settings(), postgres_available=False)


def test_production_startup_allows_configured_postgres() -> None:
    require_postgres_for_production(_production_settings(), postgres_available=True)


def test_development_can_run_without_postgres() -> None:
    settings = _production_settings()
    settings.environment = "development"

    require_postgres_for_production(settings, postgres_available=False)


@pytest.mark.parametrize("environment", ["production", "prod", "staging"])
def test_local_model_fallback_is_disabled_in_hosted_environments(monkeypatch, environment) -> None:
    monkeypatch.setattr(
        agent_service,
        "get_settings",
        lambda: SimpleNamespace(environment=environment, ollama_fallback_enabled=True),
    )

    assert not agent_service._local_fallback_allowed()


def test_local_model_fallback_remains_available_in_development(monkeypatch) -> None:
    monkeypatch.setattr(
        agent_service,
        "get_settings",
        lambda: SimpleNamespace(environment="development", ollama_fallback_enabled=True),
    )

    assert agent_service._local_fallback_allowed()


def test_production_provider_http_error_does_not_call_local_model(monkeypatch) -> None:
    monkeypatch.setattr(
        agent_service,
        "get_settings",
        lambda: SimpleNamespace(environment="production", ollama_fallback_enabled=True),
    )
    monkeypatch.setattr(
        agent_service,
        "scrape_url",
        AsyncMock(return_value={"markdown": "disposable test page"}),
    )
    local_model = AsyncMock(side_effect=AssertionError("local model must not be invoked"))
    monkeypatch.setattr(agent_service, "_ollama_extract", local_model)

    class ErrorResponse:
        status_code = 503
        text = "provider unavailable"
        request = httpx.Request("POST", agent_service.OPENROUTER_URL)

        def raise_for_status(self):
            raise httpx.HTTPStatusError("provider unavailable", request=self.request, response=self)

    class FailedOpenRouterClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, *_args, **_kwargs):
            return ErrorResponse()

    monkeypatch.setattr(agent_service.httpx, "AsyncClient", FailedOpenRouterClient)

    result = asyncio.run(
        agent_service.scrape_and_extract(
            url="https://example.invalid/disposable",
            instruction="Extract the sample text",
        )
    )

    assert result["error"] == "LLM error: 503"
    local_model.assert_not_awaited()
