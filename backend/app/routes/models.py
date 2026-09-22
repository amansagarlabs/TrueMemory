from fastapi import APIRouter, Query
from app.config import get_settings
from services.model_catalog import get_model_catalog

from services.openrouter_free_models import get_free_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/openrouter/free")
async def openrouter_free_models(force_refresh: bool = Query(default=False)):
    models, from_cache = await get_free_models(force_refresh=force_refresh)
    return {
        "provider": "OpenRouter",
        "source": "https://openrouter.ai/collections/free-models",
        "models": models,
        "count": len(models),
        "from_cache": from_cache,
    }


@router.get("")
async def model_catalog(force_refresh: bool = Query(default=False)):
    models, from_cache = await get_model_catalog(get_settings(), force_refresh=force_refresh)
    return {"models": models, "count": len(models), "from_cache": from_cache}


@router.get("/openai/health")
async def openai_health():
    settings = get_settings()
    models, _ = await get_model_catalog(settings)
    available = bool(settings.openai_api_key) and any(item["provider"] == "openai" for item in models)
    return {"available": available, "authenticated": bool(settings.openai_api_key), "model_count": sum(item["provider"] == "openai" for item in models)}
