"""
Integrations API - real connectivity checks and API key management.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.connector_store import (
    delete_github_connection,
    github_connection_status,
    save_github_connection,
)
from services.github_oauth import (
    create_oauth_state,
    github_authorize_url,
    verify_oauth_state,
)
from services.postgres_store import resolve_user_id
from services.url_safety import UnsafeUrlError, validate_public_url

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class ConnectorConfig(BaseModel):
    connector_id: str
    api_key: str | None = None
    url: str | None = None


# --- Platform health checks ---

async def _check_platform(name: str, settings: Any) -> dict[str, Any]:
    base = f"http://{settings.backend_host}:{settings.backend_port}"
    checks: dict[str, dict[str, Any]] = {
        "truememory-memory": {"url": f"{base}/health"},
        "AmanCrawl": {"url": f"{base}/api/AmanCrawl/health"},
        "aman-agent-lab": {"url": f"{base}/health"},
        "aman-crawl": {"url": f"{base}/api/AmanCrawl/health"},
    }
    check = checks.get(name)
    if not check:
        return {"connected": False, "latency_ms": 0, "error": "Unknown platform"}
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(check["url"])
            latency = round((time.time() - start) * 1000)
            return {"connected": res.status_code == 200, "latency_ms": latency, "status_code": res.status_code}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


@router.get("/platforms")
async def get_platforms(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    platform_ids = ["truememory-memory", "AmanCrawl", "aman-agent-lab", "aman-crawl"]
    results = []
    for pid in platform_ids:
        status = await _check_platform(pid, settings)
        results.append({"id": pid, **status})
    return {"platforms": results}


# --- Third-party connector checks ---

async def _check_openai(api_key: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "models": len(data.get("data", []))}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_anthropic(api_key: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get("https://api.anthropic.com/v1/models", headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"})
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "models": len(data.get("data", []))}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_google_ai(api_key: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "models": len(data.get("models", []))}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_pinecone(api_key: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get("https://api.pinecone.io/indexes", headers={"Api-Key": api_key})
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "indexes": len(data) if isinstance(data, list) else 0}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_weaviate(url: str, api_key: str | None = None) -> dict[str, Any]:
    start = time.time()
    try:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{url}/v1/.well-known/ready", headers=headers)
            latency = round((time.time() - start) * 1000)
            return {"connected": res.status_code == 200, "latency_ms": latency}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_milvus(settings: Any) -> dict[str, Any]:
    connected = bool(settings.milvus_address and settings.milvus_token)
    return {"connected": connected, "driver": "Milvus / Zilliz", "collection": settings.milvus_collection}


async def _check_github(token: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {token}"})
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "user": data.get("login")}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_slack(webhook_url: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(webhook_url, json={"text": "Kontext integration test - you can ignore this."})
            latency = round((time.time() - start) * 1000)
            return {"connected": res.status_code == 200, "latency_ms": latency}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_notion(api_key: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post("https://api.notion.com/v1/search", headers={"Authorization": f"Bearer {api_key}", "Notion-Version": "2022-06-28"}, json={"page_size": 1})
            latency = round((time.time() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                return {"connected": True, "latency_ms": latency, "results": data.get("total_results", 0)}
            return {"connected": False, "latency_ms": latency, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


async def _check_webhook(url: str) -> dict[str, Any]:
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url)
            latency = round((time.time() - start) * 1000)
            return {"connected": 200 <= res.status_code < 500, "latency_ms": latency, "status_code": res.status_code}
    except Exception as e:
        return {"connected": False, "latency_ms": round((time.time() - start) * 1000), "error": str(e)}


CONNECTOR_CHECKS = {
    "openai": lambda cfg: _check_openai(cfg.api_key),
    "anthropic": lambda cfg: _check_anthropic(cfg.api_key),
    "google": lambda cfg: _check_google_ai(cfg.api_key),
    "pinecone": lambda cfg: _check_pinecone(cfg.api_key),
    "weaviate": lambda cfg: _check_weaviate(cfg.url or "", cfg.api_key),
    "milvus": lambda cfg: _check_milvus(get_settings()),
    "slack": lambda cfg: _check_slack(cfg.url or ""),
    "notion": lambda cfg: _check_notion(cfg.api_key),
    "github": lambda cfg: _check_github(cfg.api_key),
    "webhook": lambda cfg: _check_webhook(cfg.url or ""),
}

_URL_CONNECTORS = frozenset({"weaviate", "slack", "webhook"})


async def _validated_connector_config(config: ConnectorConfig) -> ConnectorConfig:
    if config.connector_id not in _URL_CONNECTORS:
        return config
    if not config.url:
        raise HTTPException(status_code=422, detail="A public connector URL is required")
    try:
        safe_url = await validate_public_url(config.url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return config.model_copy(update={"url": safe_url})


@router.get("/connectors")
async def get_connectors(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    env_keys = {
        "openrouter": bool(settings.openrouter_api_key),
        "milvus": bool(settings.milvus_address and settings.milvus_token),
        "tavily": bool(settings.tavily_api_key),
    }
    return {"env_configured": env_keys}


def _github_result_redirect(settings: Any, status: str, detail: str | None = None) -> RedirectResponse:
    target = str(settings.github_oauth_frontend_url).rstrip("/")
    query = f"?github={status}"
    if detail:
        from urllib.parse import quote
        query += f"&detail={quote(detail[:160])}"
    return RedirectResponse(url=f"{target}{query}", status_code=303)


@router.get("/github/connect")
async def connect_github(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )
    user_id = resolve_user_id(settings, str(auth.user_id)) or str(auth.user_id)
    if not user_id:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    try:
        state = create_oauth_state(settings, user_id)
        return RedirectResponse(github_authorize_url(settings, state), status_code=303)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="GitHub OAuth encryption is not configured.") from exc


@router.get("/github/callback")
async def github_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    settings = get_settings()
    if error:
        return _github_result_redirect(settings, "error", "GitHub authorization was cancelled.")
    if not code or not state:
        return _github_result_redirect(settings, "error", "GitHub authorization was incomplete.")
    try:
        payload = verify_oauth_state(settings, state)
        client_id = settings.github_client_id
        client_secret = settings.github_client_secret
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": settings.github_oauth_redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            access_token = str(token_data.get("access_token") or "")
            if not access_token:
                raise RuntimeError("github_token_missing")
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {access_token}",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            user_response.raise_for_status()
            github_user = user_response.json()
        save_github_connection(
            settings,
            user_id=str(payload["user_id"]),
            access_token=access_token,
            account_id=str(github_user.get("id") or ""),
            account_login=str(github_user.get("login") or ""),
            scopes=[item for item in str(token_data.get("scope") or "").split(",") if item],
        )
        return _github_result_redirect(settings, "connected")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("GitHub OAuth callback failed: %s", exc)
        return _github_result_redirect(settings, "error", "GitHub could not be connected.")


@router.get("/github/status")
async def github_status(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    user_id = resolve_user_id(settings, str(auth.user_id)) or str(auth.user_id)
    return github_connection_status(settings, user_id=user_id)


@router.delete("/github")
async def disconnect_github(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    user_id = resolve_user_id(settings, str(auth.user_id)) or str(auth.user_id)
    return {"disconnected": delete_github_connection(settings, user_id=user_id)}


@router.post("/connectors/test")
async def test_connector(config: ConnectorConfig, auth: AuthContext = Depends(require_auth)):
    validated = await _validated_connector_config(config)
    check_fn = CONNECTOR_CHECKS.get(validated.connector_id)
    if not check_fn:
        raise HTTPException(status_code=400, detail=f"Unknown connector: {validated.connector_id}")
    result = await check_fn(validated)
    return {"connector_id": validated.connector_id, **result}
