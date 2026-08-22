"""Live OpenRouter free-model catalog with a short process-local cache."""

from __future__ import annotations

import time
from typing import Any

import httpx

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
CATALOG_TTL_SECONDS = 300

_catalog: tuple[float, list[dict[str, Any]]] | None = None


def _is_free(model: dict[str, Any]) -> bool:
    pricing = model.get("pricing")
    if not isinstance(pricing, dict):
        return False
    return pricing.get("prompt") == "0" and pricing.get("completion") == "0"


def _normalize(model: dict[str, Any]) -> dict[str, Any] | None:
    model_id = model.get("id")
    name = model.get("name")
    architecture = model.get("architecture")
    if not isinstance(model_id, str) or not model_id or not isinstance(name, str):
        return None
    input_modalities = architecture.get("input_modalities", []) if isinstance(architecture, dict) else []
    return {
        "id": model_id,
        "name": name,
        "description": model.get("description") or "Free OpenRouter model.",
        "context_length": model.get("context_length"),
        "input_modalities": input_modalities if isinstance(input_modalities, list) else [],
        "free": True,
    }


async def get_free_models(*, force_refresh: bool = False) -> tuple[list[dict[str, Any]], bool]:
    """Return `(models, from_cache)` and tolerate temporary catalog failures."""
    global _catalog
    now = time.monotonic()
    if not force_refresh and _catalog and now - _catalog[0] < CATALOG_TTL_SECONDS:
        return _catalog[1], True

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(OPENROUTER_MODELS_URL)
            response.raise_for_status()
            payload = response.json()
        raw_models = payload.get("data", []) if isinstance(payload, dict) else []
        models = [_normalize(item) for item in raw_models if isinstance(item, dict) and _is_free(item)]
        models = [item for item in models if item is not None]
        models.sort(key=lambda item: item["name"].lower())
        if models:
            _catalog = (now, models)
            return models, False
    except (httpx.HTTPError, ValueError, TypeError):
        pass

    if _catalog:
        return _catalog[1], True
    return [], False


def clear_free_models_cache() -> None:
    global _catalog
    _catalog = None
