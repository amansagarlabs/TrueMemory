"""Hosted Streamable HTTP MCP boundary for the TrueMemory Memory provider.

This module owns protocol translation only. Memory semantics remain in
``MemoryClient`` and ``MemoryCore`` and are shared with the REST API.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.auth_middleware import AuthContext, get_auth_context
from app.routes.memory_api import _authorize_bindings, _effective_scope
from app.config import get_settings
from services.memory_core import MemoryClient
from services.rate_limiter import get_rate_limiter

logger = logging.getLogger("TrueMemory.memory.mcp")
router = APIRouter(tags=["memory-mcp"])

MODERN_PROTOCOL_VERSION = "2026-07-28"
LEGACY_PROTOCOL_VERSION = "2025-03-26"
SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION]
SERVER_INFO = {"name": "truememory-memory", "version": "0.1.0"}
PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion"
SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo"

TOOLS: list[dict[str, Any]] = [
    {"name": "memory_search", "description": "Search authorized memories.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "as_of": {"type": "string"}, "include_history": {"type": "boolean"}}, "additionalProperties": False}},
    {"name": "memory_retrieve", "description": "Retrieve authorized memories for context.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "as_of": {"type": "string"}, "include_history": {"type": "boolean"}}, "additionalProperties": False}},
    {"name": "memory_store", "description": "Store an authorized memory.", "inputSchema": {"type": "object", "required": ["key", "content"], "properties": {"key": {"type": "string", "minLength": 1}, "content": {"type": "string", "minLength": 1}, "scope": {"type": "string"}, "source": {"type": "string"}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "valid_from": {"type": "string"}, "valid_until": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "additionalProperties": False}},
    {"name": "memory_update", "description": "Update an authorized memory.", "inputSchema": {"type": "object", "required": ["id", "content"], "properties": {"id": {"type": "string"}, "content": {"type": "string"}, "scope": {"type": "string"}, "source": {"type": "string"}, "valid_from": {"type": "string"}, "valid_until": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "additionalProperties": False}},
    {"name": "memory_forget", "description": "Forget an authorized memory.", "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}, "scope": {"type": "string"}}, "additionalProperties": False}},
    {"name": "memory_current_state", "description": "Return the current authorized project memory state.", "inputSchema": {"type": "object", "required": ["workspace_id"], "properties": {"workspace_id": {"type": "string"}, "project_id": {"type": "string"}}, "additionalProperties": False}},
    {"name": "memory_timeline", "description": "Return ordered authorized memory version events.", "inputSchema": {"type": "object", "required": ["workspace_id"], "properties": {"workspace_id": {"type": "string"}, "project_id": {"type": "string"}, "memory_key": {"type": "string"}, "start": {"type": "string"}, "end": {"type": "string"}, "as_of": {"type": "string"}, "order": {"type": "string", "enum": ["asc", "desc"]}, "limit": {"type": "integer", "minimum": 1, "maximum": 200}}, "additionalProperties": False}},
    {"name": "memory_related", "description": "Find memories related to a memory ID, or search by query when no workspace is supplied.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}, "workspace_id": {"type": "string"}, "agent_id": {"type": "string"}, "project_id": {"type": "string"}}, "additionalProperties": False}},
    {"name": "memory_context", "description": "Build relevant authorized memory context.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
    {"name": "memory_profile", "description": "List authorized profile memories.", "inputSchema": {"type": "object", "properties": {"scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
    {"name": "memory_entities", "description": "Return entities found in authorized memories.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}}, "additionalProperties": False}},
]


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
    status = {"unauthorized": 401, "origin_not_allowed": 403, "forbidden": 403, "rate_limited": 429}.get(message, 200)
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}, status_code=status)


def _modern_error(request_id: Any, code: int, message: str, *, status: int, data: Any = None) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": error}, status_code=status)


def _header_error(request_id: Any, message: str) -> JSONResponse:
    return _modern_error(request_id, -32020, message, status=400)


def _modern_metadata(body: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    params = body.get("params") or {}
    metadata = params.get("_meta") if isinstance(params, dict) else None
    if not isinstance(metadata, dict):
        return None, None
    version = metadata.get(PROTOCOL_VERSION_META_KEY)
    return (version if isinstance(version, str) else None), metadata


def _discovery_result() -> dict[str, Any]:
    return {
        "supportedVersions": SUPPORTED_PROTOCOL_VERSIONS,
        "capabilities": {"tools": {"listChanged": False}},
        "ttlMs": 0,
        "cacheScope": "private",
    }


def _decode_mcp_header_value(value: str) -> str:
    prefix, suffix = "=?base64?", "?="
    if value.startswith(prefix) and value.endswith(suffix):
        encoded = value[len(prefix):-len(suffix)]
        try:
            return base64.b64decode(encoded, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise ValueError("invalid encoded MCP header") from exc
    return value


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
    if name == "memory_current_state":
        if not workspace_id:
            raise ValueError("workspace_id_required")
        items = client.current_state(user_id=user_id, workspace_id=workspace_id, project_id=args.get("project_id"))
        return {"items": items, "count": len(items), "as_of": "now", "scope": scope}
    if name == "memory_timeline":
        if not workspace_id:
            raise ValueError("workspace_id_required")
        items = client.timeline(user_id=user_id, workspace_id=workspace_id,
            project_id=args.get("project_id"), memory_key=args.get("memory_key"),
            start=args.get("start"), end=args.get("end"), as_of=args.get("as_of"),
            order=str(args.get("order") or "desc"), limit=int(args.get("limit") or 50))
        return {"items": items, "count": len(items), "as_of": args.get("as_of"), "scope": scope}
    if name == "memory_related":
        query = str(args.get("query") or "")
        if workspace_id:
            items = client.related(
                user_id=user_id,
                workspace_id=workspace_id,
                memory_id=query,
                project_id=args.get("project_id"),
                limit=int(args.get("limit") or 10),
            )
            return {"items": items, "count": len(items), "scope": scope, "relationship": "same_key_or_memory_type"}
        items = client.search(user_id=user_id, scope=scope, query=query, limit=int(args.get("limit") or 10), agent_id=agent_id)
        return {"items": items, "count": len(items), "scope": scope, "relationship": "query_match"}
    if name == "memory_store":
        client.remember(user_id=user_id, scope=scope, key=str(args["key"]), content=str(args["content"]), source=str(args.get("source") or "mcp"), valid_from=args.get("valid_from"), valid_until=args.get("valid_until"), confidence=float(args["confidence"] if args.get("confidence") is not None else 0.75), workspace_id=workspace_id, agent_id=agent_id)
        key = str(args["key"]).strip()
        return {"saved": True, "memory_id": f"profile:{scope}:{key}", "key": key, "scope": scope, "provenance": str(args.get("source") or "mcp"), "confidence": 0.75, "temporal_state": "current"}
    memory_id = str(args["id"])
    if not memory_id.startswith("profile:"):
        raise ValueError("invalid_memory_id")
    remainder = memory_id[len("profile:"):]
    target_scope, _, key = remainder.rpartition(":")
    if not target_scope or not key:
        raise ValueError("invalid_memory_id")
    target_scope = target_scope.split("|", 1)[0]
    # Memory IDs may use the legacy `workspace:<id>` scope, while reads and
    # writes with a workspace-bound token canonicalize through `general` and
    # add workspace/agent dimensions in MemoryClient._storage_scope. Apply the
    # same authorization and canonicalization here so mutation targets the
    # exact same durable row and cache key as REST.
    try:
        target_scope = _effective_scope(auth, target_scope)
    except Exception as exc:
        raise PermissionError("forbidden") from exc
    if name == "memory_update":
        return {"updated": client.update(user_id=user_id, scope=target_scope, key=key, content=str(args["content"]), source=str(args.get("source") or "mcp"), valid_from=args.get("valid_from"), valid_until=args.get("valid_until"), confidence=float(args["confidence"] if args.get("confidence") is not None else 0.75), workspace_id=workspace_id, agent_id=agent_id), "memory_id": memory_id, "scope": target_scope}
    return {"forgotten": client.forget(user_id=user_id, scope=target_scope, key=key, workspace_id=workspace_id, agent_id=agent_id), "memory_id": memory_id, "scope": target_scope}


@router.api_route("/mcp", methods=["GET", "POST", "DELETE"])
async def memory_mcp(request: Request, auth: AuthContext = Depends(get_auth_context)) -> JSONResponse:
    request_id: Any = None
    modern = request.headers.get("mcp-protocol-version") == MODERN_PROTOCOL_VERSION
    try:
        _check_boundary(request, auth)
        if request.method != "POST":
            return JSONResponse({"error": "Method Not Allowed"}, status_code=405, headers={"Allow": "POST"})
        if "application/json" not in request.headers.get("content-type", "").lower():
            return JSONResponse({"error": "Content-Type must be application/json"}, status_code=415)
        body = await request.json()
        if not isinstance(body, dict):
            return _modern_error(None, -32600, "Invalid Request", status=400)
        if body.get("jsonrpc") != "2.0" or not isinstance(body.get("method"), str):
            return _modern_error(body.get("id"), -32600, "Invalid Request", status=400)
        request_id = body.get("id")
        method = body.get("method")
        if body.get("params") is not None and not isinstance(body.get("params"), dict):
            return _modern_error(request_id, -32600, "Invalid Request", status=400)
        protocol_version, metadata = _modern_metadata(body)
        protocol_header = request.headers.get("mcp-protocol-version")
        method_header = request.headers.get("mcp-method")
        modern = bool(protocol_version or protocol_header)
        accepted_types = {
            part.split(";", 1)[0].strip().lower()
            for part in request.headers.get("accept", "").split(",")
        }
        if modern and not {"application/json", "text/event-stream"} <= accepted_types:
            return JSONResponse({"error": "Accept must include application/json and text/event-stream"}, status_code=406)

        # Legacy 2025-03-26 clients use the initialization handshake and do not
        # send modern per-request metadata or mirrored routing headers.
        if modern:
            if "id" not in body:
                return _modern_error(None, -32600, "Notifications are not supported over Streamable HTTP", status=400)
            if not protocol_version or not metadata or not isinstance(metadata.get("io.modelcontextprotocol/clientCapabilities"), dict):
                return _header_error(request_id, "Modern requests require protocolVersion and clientCapabilities metadata")
            if protocol_version != protocol_header:
                return _header_error(request_id, "MCP-Protocol-Version does not match request metadata")
            if method_header != method:
                return _header_error(request_id, "Mcp-Method does not match request method")
            if protocol_version not in SUPPORTED_PROTOCOL_VERSIONS:
                return _modern_error(request_id, -32022, "Unsupported protocol version", status=400, data={"supported": SUPPORTED_PROTOCOL_VERSIONS, "requested": protocol_version})
            if protocol_version != MODERN_PROTOCOL_VERSION:
                modern = False

        if modern and method == "tools/call":
            params = body.get("params") or {}
            header_name = request.headers.get("mcp-name")
            try:
                header_name = _decode_mcp_header_value(header_name) if header_name is not None else None
            except ValueError:
                return _header_error(request_id, "Mcp-Name has invalid encoding")
            if header_name != params.get("name"):
                return _header_error(request_id, "Mcp-Name does not match tools/call name")

        if modern and method == "server/discover":
            result = _discovery_result()
        elif method == "initialize" and not modern:
            result = {"protocolVersion": LEGACY_PROTOCOL_VERSION, "capabilities": {"tools": {"listChanged": False}}, "serverInfo": SERVER_INFO}
        elif method == "notifications/initialized" and not modern:
            return JSONResponse({}, status_code=202)
        elif method == "tools/list":
            result = {"tools": TOOLS}
            if modern:
                result.update({"ttlMs": 0, "cacheScope": "private"})
        elif method == "tools/call":
            params = body.get("params") or {}
            structured = _call(str(params.get("name")), params.get("arguments") or {}, auth)
            result = {"content": [{"type": "text", "text": json.dumps(structured, default=str)}], "structuredContent": structured}
        else:
            if modern:
                return _modern_error(request_id, -32601, "Method not found", status=404)
            return _error(request_id, -32601, "Method not found")
        logger.info("memory_mcp_request", extra={"request_id": request_id, "operation": method, "user_id": auth.user_id})
        if modern:
            result["resultType"] = "complete"
            result["_meta"] = {SERVER_INFO_META_KEY: SERVER_INFO}
        response: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "result": result}
        return JSONResponse(jsonable_encoder(response))
    except json.JSONDecodeError:
        return _modern_error(request_id, -32700, "Parse error", status=400) if modern else _error(request_id, -32700, "Parse error")
    except PermissionError as exc:
        return _error(request_id, -32001, str(exc))
    except (KeyError, TypeError, ValueError):
        return _modern_error(request_id, -32602, "Invalid tool arguments", status=200) if modern else _error(request_id, -32602, "Invalid tool arguments")
    except Exception:
        logger.exception("memory_mcp_failure", extra={"request_id": request_id, "user_id": auth.user_id})
        return _modern_error(request_id, -32603, "Internal memory provider error", status=200) if modern else _error(request_id, -32603, "Internal memory provider error")
