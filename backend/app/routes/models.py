from fastapi import APIRouter, Query

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
