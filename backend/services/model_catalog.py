"""Canonical, cached model catalog for the model picker."""

from __future__ import annotations

import time
from typing import Any

import httpx

CATALOG_TTL_SECONDS = 300
_cache: tuple[float, list[dict[str, Any]]] | None = None


def _pricing(raw: dict[str, Any]) -> tuple[dict[str, float], str]:
    p = raw.get("pricing") if isinstance(raw.get("pricing"), dict) else {}
    values = {key: float(p[key]) for key in ("prompt", "completion", "input", "output", "cached_input") if isinstance(p.get(key), (int, float, str)) and str(p[key]).replace(".", "", 1).isdigit()}
    return values, "free" if values and all(value == 0 for value in values.values()) else ("paid" if values else "unknown")


def _normalize(raw: dict[str, Any], provider: str, label: str) -> dict[str, Any] | None:
    model_id = raw.get("id")
    if not isinstance(model_id, str) or not model_id:
        return None
    pricing, pricing_type = _pricing(raw)
    return {
        "id": model_id, "name": raw.get("name") or model_id, "provider": provider,
        "provider_label": label, "pricing": pricing, "pricing_type": pricing_type,
        "context_length": raw.get("context_length") or raw.get("context_window"),
        "supports": {"streaming": True, "tool_calling": True, "structured_output": True,
                      "vision": "vision" in str(raw.get("architecture", {})).lower() or "image" in str(raw.get("input_modalities", [])).lower()},
        "availability": "available",
    }


async def _fetch(url: str, headers: dict[str, str] | None = None) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        payload = response.json()
    return payload.get("data", []) if isinstance(payload, dict) and isinstance(payload.get("data"), list) else []


async def get_model_catalog(settings, *, force_refresh: bool = False) -> tuple[list[dict[str, Any]], bool]:
    global _cache
    now = time.monotonic()
    if _cache and not force_refresh and now - _cache[0] < CATALOG_TTL_SECONDS:
        return _cache[1], True
    result = [{"id": "openrouter-free", "name": "OpenRouter Auto", "provider": "openrouter", "provider_label": "OpenRouter", "pricing": {"input": 0, "output": 0}, "pricing_type": "free", "supports": {"streaming": True, "tool_calling": True, "structured_output": True, "vision": True}, "availability": "available"}]
    try:
        if settings.openrouter_api_key:
            result.extend(filter(None, (_normalize(item, "openrouter", "OpenRouter") for item in await _fetch("https://openrouter.ai/api/v1/models"))))
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    try:
        if settings.openai_api_key:
            result.extend(filter(None, (_normalize(item, "openai", "OpenAI") for item in await _fetch(f"{settings.openai_base_url}/models", {"Authorization": f"Bearer {settings.openai_api_key}"}))))
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    _cache = (now, result)
    return result, False


def clear_model_catalog_cache() -> None:
    global _cache
    _cache = None
