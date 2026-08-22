import asyncio

import httpx

from services import openrouter_free_models


def test_free_catalog_filters_zero_priced_models(monkeypatch):
    original_client = httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL(openrouter_free_models.OPENROUTER_MODELS_URL)
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "free/provider-model:free",
                        "name": "Provider Model (free)",
                        "description": "A free model",
                        "pricing": {"prompt": "0", "completion": "0"},
                        "architecture": {"input_modalities": ["text", "image"]},
                    },
                    {
                        "id": "paid/provider-model",
                        "name": "Paid Model",
                        "pricing": {"prompt": "0.001", "completion": "0.002"},
                    },
                ]
            },
        )

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original_client(transport=httpx.MockTransport(handler))

        async def __aenter__(self):
            return self.client

        async def __aexit__(self, *args):
            await self.client.aclose()

    monkeypatch.setattr(openrouter_free_models.httpx, "AsyncClient", MockClient)
    openrouter_free_models.clear_free_models_cache()

    models, from_cache = asyncio.run(
        openrouter_free_models.get_free_models(force_refresh=True)
    )

    assert from_cache is False
    assert models == [
        {
            "id": "free/provider-model:free",
            "name": "Provider Model (free)",
            "description": "A free model",
            "context_length": None,
            "input_modalities": ["text", "image"],
            "free": True,
        }
    ]


def test_free_catalog_uses_cached_data_when_refresh_fails(monkeypatch):
    openrouter_free_models._catalog = (0, [{"id": "cached/model:free"}])

    class FailingClient:
        def __init__(self, *args, **kwargs):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(openrouter_free_models.httpx, "AsyncClient", FailingClient)

    models, from_cache = asyncio.run(
        openrouter_free_models.get_free_models(force_refresh=True)
    )

    assert from_cache is True
    assert models == [{"id": "cached/model:free"}]
