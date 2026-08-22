from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import models


def test_openrouter_free_models_http_shape(monkeypatch):
    async def fake_catalog(*, force_refresh=False):
        assert force_refresh is True
        return ([
            {
                "id": "provider/model:free",
                "name": "Model",
                "description": "Free model",
                "context_length": 8192,
                "input_modalities": ["text"],
                "free": True,
            }
        ], False)

    monkeypatch.setattr(models, "get_free_models", fake_catalog)
    app = FastAPI()
    app.include_router(models.router)

    response = TestClient(app).get("/api/models/openrouter/free?force_refresh=true")

    assert response.status_code == 200
    assert response.json() == {
        "provider": "OpenRouter",
        "source": "https://openrouter.ai/collections/free-models",
        "models": [
            {
                "id": "provider/model:free",
                "name": "Model",
                "description": "Free model",
                "context_length": 8192,
                "input_modalities": ["text"],
                "free": True,
            }
        ],
        "count": 1,
        "from_cache": False,
    }
