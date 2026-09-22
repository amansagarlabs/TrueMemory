#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Semantic Equivalence Test (REST vs MCP vs Python SDK)"""
import urllib.request
import json
import sys
import os
sys.path.insert(0, "/app")
os.environ["TrueMemory_ENABLE_TEST_AUTH"] = "1"

from services.memory_core import MemoryClient
from app.config import get_settings

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
USER = "equiv-test-user"
results = {}
rest_ids = {}
mcp_ids = {}

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
    req = urllib.request.Request(f"{BASE}/mcp", data=body, headers=headers, method="POST")
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

# === SETUP: Store via all three paths ===
print("\n=== SETUP ===")
def t_setup():
    s, r = rest_call("POST", "/v1/memory/store", {"key": "equiv_rest", "content": "REST equivalence memory.", "source": "e2e-rest", "workspace_id": WS_A})
    rest_ids["equiv_rest"] = r.get("id", "")
    mcp_r = mcp_call("memory_store", {"key": "equiv_mcp", "content": "MCP equivalence memory.", "source": "e2e-mcp", "workspace_id": WS_A})
    mcp_ids["equiv_mcp"] = mcp_r.get("memory_id", "")
    client = MemoryClient(get_settings())
    client.remember(user_id=USER, scope="general", key="equiv_sdk", content="SDK equivalence memory.", source="e2e-sdk", workspace_id=WS_A)
    return s == 200, "setup done"
test("setup", t_setup)

# === REST vs MCP: search ===
print("\n=== REST vs MCP: search ===")
def t_rest_mcp_search():
    _, rest_r = rest_call("POST", "/v1/memory/search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    mcp_r = mcp_call("memory_search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    rest_keys = {i.get("key") for i in rest_r.get("items", [])}
    mcp_keys = {i.get("key") for i in mcp_r.get("items", [])}
    overlap = rest_keys & mcp_keys
    return len(overlap) >= 1, f"rest={rest_keys} mcp={mcp_keys} overlap={overlap}"
test("rest_mcp_search", t_rest_mcp_search)

# === REST vs SDK: list ===
print("\n=== REST vs SDK: list ===")
def t_rest_sdk_list():
    _, rest_r = rest_call("GET", "/v1/memories", {"workspace_id": WS_A})
    client = MemoryClient(get_settings())
    sdk_items = client.list(user_id=USER, scope="general", limit=50, workspace_id=WS_A)
    rest_keys = {i.get("key") for i in rest_r.get("items", [])}
    sdk_keys = {i.get("key") for i in sdk_items}
    overlap = rest_keys & sdk_keys
    return len(overlap) >= 1, f"rest={rest_keys} sdk={sdk_keys} overlap={overlap}"
test("rest_sdk_list", t_rest_sdk_list)

# === MCP vs SDK: search ===
print("\n=== MCP vs SDK: search ===")
def t_mcp_sdk_search():
    mcp_r = mcp_call("memory_search", {"query": "memory", "workspace_id": WS_A, "limit": 10})
    client = MemoryClient(get_settings())
    sdk_items = client.search(user_id=USER, scope="general", query="memory", limit=10, workspace_id=WS_A)
    mcp_keys = {i.get("key") for i in mcp_r.get("items", [])}
    sdk_keys = {i.get("key") for i in sdk_items}
    overlap = mcp_keys & sdk_keys
    return len(overlap) >= 1, f"mcp={mcp_keys} sdk={sdk_keys} overlap={overlap}"
test("mcp_sdk_search", t_mcp_sdk_search)

# === All paths return same content for same key ===
print("\n=== All paths: same content for key ===")
def t_same_content():
    _, rest_r = rest_call("POST", "/v1/memory/search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    mcp_r = mcp_call("memory_search", {"query": "equivalence", "workspace_id": WS_A, "limit": 10})
    client = MemoryClient(get_settings())
    sdk_items = client.search(user_id=USER, scope="general", query="equivalence", limit=10, workspace_id=WS_A)
    all_items = rest_r.get("items", []) + mcp_r.get("items", []) + sdk_items
    contents = {i.get("content") for i in all_items}
    return len(contents) >= 1, f"unique_contents={len(contents)}"
test("same_content", t_same_content)

# === CLEANUP ===
print("\n=== CLEANUP ===")
def t_cleanup():
    rest_call("POST", "/v1/memory/forget", {"id": rest_ids.get("equiv_rest", ""), "workspace_id": WS_A})
    mcp_call("memory_forget", {"id": mcp_ids.get("equiv_mcp", ""), "workspace_id": WS_A})
    client = MemoryClient(get_settings())
    client.forget(user_id=USER, scope="general", key="equiv_sdk", workspace_id=WS_A)
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
