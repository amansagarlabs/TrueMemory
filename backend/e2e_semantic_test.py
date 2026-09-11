#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Semantic Equivalence Test (REST vs MCP vs Python SDK)

Verifies that all three access paths return equivalent results for the same query.
"""
import urllib.request
import json
import sys
import os
sys.path.insert(0, "/app")
os.environ["KONTEXT_ENABLE_TEST_AUTH"] = "1"

from services.memory_core import MemoryClient
from app.config import get_settings

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
USER = "equiv-test-user"
results = {}

def rest_call(method, path, data=None):
    headers = {"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def mcp_call(method_name, args=None, req_id=1):
    headers = {"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": "tools/call", "params": {"name": method_name, "arguments": args or {}}}).encode()
    req = urllib.request.Request(f"{BASE}/v1/mcp", data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        return data.get("result", {}).get("structuredContent", {})

def test(name, fn):
    try:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        results[name] = {"status": status, "detail": detail}
        print(f"  {status}: {name} - {detail}")
    except Exception as e:
        results[name] = {"status": "FAIL", "detail": str(e)}
        print(f"  FAIL: {name} - {e}")

# === SETUP ===
print("\n=== SETUP ===")
def t_setup():
    # Store via REST
    rest_call("POST", "/v1/memory/store", {"key": "equiv_test", "content": "Equivalence test memory.", "source": "e2e-equiv", "workspace_id": WS_A})
    # Store via MCP
    mcp_call("memory_store", {"key": "equiv_mcp", "content": "MCP equivalence memory.", "source": "e2e-mcp", "workspace_id": WS_A})
    # Store via SDK
    client = MemoryClient(get_settings())
    client.remember(user_id=USER, scope="general", key="equiv_sdk", content="SDK equivalence memory.", source="e2e-sdk", workspace_id=WS_A)
    return True, "setup done"
test("setup", t_setup)

# === REST vs MCP: search ===
print("\n=== REST vs MCP: search ===")
def t_rest_mcp_search():
    _, rest_r = rest_call("POST", "/v1/memory/search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    mcp_r = mcp_call("memory_search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    rest_keys = {i.get("key") for i in rest_r.get("items", [])}
    mcp_keys = {i.get("key") for i in mcp_r.get("items", [])}
    overlap = rest_keys & mcp_keys
    return len(overlap) >= 1, f"rest_keys={rest_keys} mcp_keys={mcp_keys} overlap={overlap}"
test("rest_mcp_search", t_rest_mcp_search)

# === REST vs SDK: list ===
print("\n=== REST vs SDK: list ===")
def t_rest_sdk_list():
    _, rest_r = rest_call("GET", "/v1/memories", {"workspace_id": WS_A})
    client = MemoryClient(get_settings())
    sdk_items = client.list(user_id=USER, scope="general", limit=50, workspace_id=WS_A)
    rest_keys = {i.get("key") for i in rest_r.get("items", [])}
    sdk_keys = {i.get("key") for i in sdk_items}
    return rest_keys == sdk_keys, f"rest={rest_keys} sdk={sdk_keys}"
test("rest_sdk_list", t_rest_sdk_list)

# === MCP vs SDK: search ===
print("\n=== MCP vs SDK: search ===")
def t_mcp_sdk_search():
    mcp_r = mcp_call("memory_search", {"query": "memory", "workspace_id": WS_A, "limit": 10})
    client = MemoryClient(get_settings())
    sdk_items = client.search(user_id=USER, scope="general", query="memory", limit=10, workspace_id=WS_A)
    mcp_keys = {i.get("key") for i in mcp_r.get("items", [])}
    sdk_keys = {i.get("key") for i in sdk_items}
    return mcp_keys == sdk_keys, f"mcp={mcp_keys} sdk={sdk_keys}"
test("mcp_sdk_search", t_mcp_sdk_search)

# === All paths return same content for store+search ===
print("\n=== All paths: same content ===")
def t_all_same_content():
    query = "equivalence"
    _, rest_r = rest_call("POST", "/v1/memory/search", {"query": query, "workspace_id": WS_A, "limit": 10})
    mcp_r = mcp_call("memory_search", {"query": query, "workspace_id": WS_A, "limit": 10})
    client = MemoryClient(get_settings())
    sdk_items = client.search(user_id=USER, scope="general", query=query, limit=10, workspace_id=WS_A)
    rest_contents = {i.get("content") for i in rest_r.get("items", [])}
    mcp_contents = {i.get("content") for i in mcp_r.get("items", [])}
    sdk_contents = {i.get("content") for i in sdk_items}
    all_match = rest_contents == mcp_contents == sdk_contents
    return all_match, f"rest={rest_contents} mcp={mcp_contents} sdk={sdk_contents}"
test("all_same_content", t_all_same_content)

# === CLEANUP ===
print("\n=== CLEANUP ===")
def t_cleanup():
    client = MemoryClient(get_settings())
    for k in ["equiv_test", "equiv_mcp", "equiv_sdk"]:
        client.forget(user_id=USER, scope="general", key=k, workspace_id=WS_A)
    return True, "cleaned"
test("cleanup", t_cleanup)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Semantic Equivalence E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_semantic.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
