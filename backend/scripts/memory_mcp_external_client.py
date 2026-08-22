"""Dependency-free external MCP smoke client.

It intentionally knows only the provider URL, bearer credential, and MCP tool
protocol. It does not import any KONTEXT application module.
"""

from __future__ import annotations

import json
import os
import sys
from urllib.request import Request, urlopen


def call(endpoint: str, token: str, request_id: int, method: str, params: dict | None = None) -> dict:
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        payload["params"] = params
    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - endpoint is operator supplied
        body = json.loads(response.read().decode("utf-8"))
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


def main() -> int:
    endpoint = os.environ.get("KONTEXT_MEMORY_MCP_URL", "http://localhost:8010/mcp")
    token = os.environ.get("KONTEXT_MEMORY_TOKEN", "")
    if not token:
        print("KONTEXT_MEMORY_TOKEN is required", file=sys.stderr)
        return 2
    bindings = {}
    if os.environ.get("KONTEXT_MEMORY_WORKSPACE_ID"):
        bindings["workspace_id"] = os.environ["KONTEXT_MEMORY_WORKSPACE_ID"]
    if os.environ.get("KONTEXT_MEMORY_AGENT_ID"):
        bindings["agent_id"] = os.environ["KONTEXT_MEMORY_AGENT_ID"]
    call(endpoint, token, 1, "initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "external-smoke", "version": "1.0"}})
    tools = call(endpoint, token, 2, "tools/list")["tools"]
    expected = {"memory_search", "memory_retrieve", "memory_store", "memory_update", "memory_forget", "memory_context", "memory_profile", "memory_entities"}
    actual = {tool["name"] for tool in tools}
    missing = expected - actual
    if missing:
        raise RuntimeError(f"missing tools: {sorted(missing)}")
    stored = call(endpoint, token, 3, "tools/call", {"name": "memory_store", "arguments": {"key": "external-smoke", "content": "external MCP validation memory", "source": "external-smoke", **bindings}})
    stored_data = json.loads(stored["content"][0]["text"])
    memory_id = stored_data["memory_id"]
    for request_id, name in ((4, "memory_search"), (5, "memory_retrieve"), (6, "memory_context"), (7, "memory_profile"), (8, "memory_entities")):
        call(endpoint, token, request_id, "tools/call", {"name": name, "arguments": {"query": "external-smoke", "limit": 10, **bindings}})
    call(endpoint, token, 9, "tools/call", {"name": "memory_update", "arguments": {"id": memory_id, "content": "external MCP validation memory updated", **bindings}})
    call(endpoint, token, 10, "tools/call", {"name": "memory_forget", "arguments": {"id": memory_id, **bindings}})
    print(json.dumps({"endpoint": endpoint, "tools": sorted(actual)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
