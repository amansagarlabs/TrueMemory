"""Hosted Streamable HTTP MCP boundary for the KONTEXT Memory provider.

This module owns protocol translation only. Memory semantics remain in
``MemoryClient`` and ``MemoryCore`` and are shared with the REST API.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.auth_middleware import AuthContext, get_auth_context
from app.routes.memory_api import _authorize_bindings, _effective_scope
from app.config import get_settings
from services.memory_core import MemoryClient
from services.rate_limiter import get_rate_limiter

logger = logging.getLogger("kontext.memory.mcp")
router = APIRouter(tags=["memory-mcp"])

TOOLS: list[dict[str, Any]] = [
    {"name": "memory_search", "description": "Search authorized memories.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "as_of": {"type": "string"}, "include_history": {"type": "boolean"}}, "additionalProperties": False}},
    {"name": "memory_retrieve", "description": "Retrieve authorized memories for context.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "as_of": {"type": "string"}, "include_history": {"type": "boolean"}}, "additionalProperties": False}},
    {"name": "memory_store", "description": "Store an authorized memory.", "inputSchema": {"type": "object", "required": ["key", "content"], "properties": {"key": {"type": "string", "minLength": 1}, "content": {"type": "string", "minLength": 1}, "scope": {"type": "string"}, "source": {"type": "string"}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "valid_from": {"type": "string"}, "valid_until": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "additionalProperties": False}},
    {"name": "memory_update", "description": "Update an authorized memory.", "inputSchema": {"type": "object", "required": ["id", "content"], "properties": {"id": {"type": "string"}, "content": {"type": "string"}, "scope": {"type": "string"}, "source": {"type": "string"}, "valid_from": {"type": "string"}, "valid_until": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "additionalProperties": False}},
    {"name": "memory_forget", "description": "Forget an authorized memory.", "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}, "scope": {"type": "string"}}, "additionalProperties": False}},
    {"name": "memory_context", "description": "Build relevant authorized memory context.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
    {"name": "memory_profile", "description": "List authorized profile memories.", "inputSchema": {"type": "object", "properties": {"scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
    {"name": "memory_entities", "description": "Return entities found in authorized memories.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
]


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
    status = {"unauthorized": 401, "origin_not_allowed": 403, "forbidden": 403, "rate_limited": 429}.get(message, 200)
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}, status_code=status)


def _check_boundary(request: Request, auth: AuthContext) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().cors_origins:
        raise PermissionError("origin_not_allowed")
    if not auth.authenticated or not auth.user_id:
        raise PermissionError("unauthorized")
    if "memory" not in auth.scopes:
        raise PermissionError("forbidden")
    decision = get_rate_limiter(get_settings(), limit=get_settings().memory_rate_limit, window_seconds=get_settings().memory_rate_window_seconds).check(f"memory-mcp:{auth.user_id}")
    if not decision["allowed"]:
        raise PermissionError("rate_limited")


def _scope(args: dict[str, Any], auth: AuthContext) -> tuple[str, str | None, str | None]:
    workspace_id = args.get("workspace_id") or auth.token_bindings.get("workspace_id")
    agent_id = args.get("agent_id") or auth.token_bindings.get("agent_id")
    try:
        _authorize_bindings(auth, workspace_id=workspace_id, agent_id=agent_id)
        scope = _effective_scope(auth, str(args.get("scope") or "general"))
    except Exception as exc:
        raise PermissionError("forbidden") from exc
    return scope, workspace_id, agent_id


def _call(name: str, args: dict[str, Any], auth: AuthContext) -> dict[str, Any]:
    client = MemoryClient(get_settings())
    scope, workspace_id, agent_id = _scope(args, auth)
    user_id = str(auth.user_id)
    if name in {"memory_search", "memory_retrieve", "memory_context", "memory_entities"}:
        items = client.search(user_id=user_id, scope=scope, query=str(args.get("query") or ""), limit=int(args.get("limit") or 10), workspace_id=workspace_id, agent_id=agent_id, as_of=args.get("as_of"), include_history=bool(args.get("include_history")), token_bindings={k: str(v) for k, v in auth.token_bindings.items() if v})
        result: dict[str, Any] = {"items": items, "count": len(items), "scope": scope}
        if name == "memory_entities":
            result["entities"] = sorted({str(i.get("key")) for i in items if i.get("key")})
        return result
    if name == "memory_profile":
        return {"items": client.list(user_id=user_id, scope=scope, limit=int(args.get("limit") or 50), workspace_id=workspace_id, agent_id=agent_id), "scope": scope}
    if name == "memory_store":
        client.remember(user_id=user_id, scope=scope, key=str(args["key"]), content=str(args["content"]), source=str(args.get("source") or "mcp"), valid_from=args.get("valid_from"), valid_until=args.get("valid_until"), confidence=float(args["confidence"] if args.get("confidence") is not None else 0.75), workspace_id=workspace_id, agent_id=agent_id)
        key = str(args["key"]).strip()
        return {"saved": True, "memory_id": f"profile:{scope}:{key}", "key": key, "scope": scope, "provenance": str(args.get("source") or "mcp"), "confidence": 0.75, "temporal_state": "current"}
    memory_id = str(args["id"])
    parts = memory_id.split(":", 3)
    if len(parts) == 4 and parts[0] == "profile" and parts[1] == "workspace":
        target_scope, key = f"workspace:{parts[2]}", parts[3]
    elif len(parts) == 3 and parts[0] == "profile":
        target_scope, key = parts[1], parts[2]
    else:
        raise ValueError("invalid_memory_id")
    if name == "memory_update":
        return {"updated": client.update(user_id=user_id, scope=target_scope, key=key, content=str(args["content"]), source=str(args.get("source") or "mcp"), valid_from=args.get("valid_from"), valid_until=args.get("valid_until"), confidence=float(args["confidence"] if args.get("confidence") is not None else 0.75), workspace_id=workspace_id, agent_id=agent_id), "memory_id": memory_id, "scope": target_scope}
    return {"forgotten": client.forget(user_id=user_id, scope=target_scope, key=key, workspace_id=workspace_id, agent_id=agent_id), "memory_id": memory_id, "scope": target_scope}


@router.post("/mcp")
async def memory_mcp(request: Request, auth: AuthContext = Depends(get_auth_context)) -> JSONResponse:
    request_id: Any = None
    try:
        _check_boundary(request, auth)
        body = await request.json()
        request_id = body.get("id")
        method = body.get("method")
        if method == "initialize":
            result = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {"listChanged": False}}, "serverInfo": {"name": "truememory-memory", "version": "0.1.0"}}
        elif method == "notifications/initialized":
            return JSONResponse({}, status_code=202)
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            params = body.get("params") or {}
            structured = _call(str(params.get("name")), params.get("arguments") or {}, auth)
            result = {"content": [{"type": "text", "text": json.dumps(structured, default=str)}], "structuredContent": structured}
        else:
            return _error(request_id, -32601, "Method not found")
        logger.info("memory_mcp_request", extra={"request_id": request_id, "operation": method, "user_id": auth.user_id})
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result})
    except PermissionError as exc:
        return _error(request_id, -32001, str(exc))
    except (KeyError, TypeError, ValueError):
        return _error(request_id, -32602, "Invalid tool arguments")
    except Exception:
        logger.exception("memory_mcp_failure", extra={"request_id": request_id, "user_id": auth.user_id})
        return _error(request_id, -32603, "Internal memory provider error")
