#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E Test Suite - MCP Protocol"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"

results = {}
stored_id = None

def mcp_call(method, params=None, req_id=1):
    headers = {"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(f"{BASE}/v1/mcp", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return resp.status, data.get("result", {}), data.get("error")
    except urllib.error.HTTPError as e:
        return e.code, None, json.loads(e.read())

def test(name, fn):
    try:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        results[name] = {"status": status, "detail": detail}
        print(f"  {status}: {name} - {detail}")
    except Exception as e:
        results[name] = {"status": "FAIL", "detail": str(e)}
        print(f"  FAIL: {name} - {e}")

# === 1. INITIALIZE ===
print("\n=== 1. INITIALIZE ===")
def t_init():
    s, r, err = mcp_call("initialize")
    ok = s == 200 and r.get("protocolVersion") == "2025-03-26" and err is None
    return ok, f"s={s} proto={r.get('protocolVersion')}"
test("initialize", t_init)

# === 2. TOOLS/LIST ===
print("\n=== 2. TOOLS/LIST ===")
def t_tools():
    s, r, err = mcp_call("tools/list")
    tools = r.get("tools", [])
    names = {t["name"] for t in tools}
    expected = {"memory_search", "memory_store", "memory_update", "memory_forget", "memory_current_state", "memory_timeline"}
    return s == 200 and expected.issubset(names), f"s={s} n={len(tools)} missing={expected - names}"
test("tools_list", t_tools)

# === 3. STORE ===
print("\n=== 3. STORE ===")
def t_store():
    global stored_id
    s, r, err = mcp_call("tools/call", {"name": "memory_store", "arguments": {"key": "mcp_test", "content": "MCP stored memory.", "source": "e2e-mcp", "workspace_id": WS_A}})
    sc = r.get("structuredContent", {})
    stored_id = sc.get("memory_id", "")
    return s == 200 and sc.get("saved"), f"s={s} id={stored_id}"
test("mcp_store", t_store)

# === 4. SEARCH ===
print("\n=== 4. SEARCH ===")
def t_search():
    s, r, err = mcp_call("tools/call", {"name": "memory_search", "arguments": {"query": "MCP", "workspace_id": WS_A, "limit": 10}})
    sc = r.get("structuredContent", {})
    items = sc.get("items", [])
    found = any("MCP" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found} n={len(items)}"
test("mcp_search", t_search)

# === 5. PROFILE ===
print("\n=== 5. PROFILE ===")
def t_profile():
    s, r, err = mcp_call("tools/call", {"name": "memory_profile", "arguments": {"workspace_id": WS_A, "limit": 10}})
    sc = r.get("structuredContent", {})
    items = sc.get("items", [])
    return s == 200 and len(items) > 0, f"s={s} n={len(items)}"
test("mcp_profile", t_profile)

# === 6. CURRENT STATE ===
print("\n=== 6. CURRENT STATE ===")
def t_cs():
    s, r, err = mcp_call("tools/call", {"name": "memory_current_state", "arguments": {"workspace_id": WS_A}})
    sc = r.get("structuredContent", {})
    return s == 200, f"s={s} n={sc.get('count', 0)}"
test("mcp_current_state", t_cs)

# === 7. TIMELINE ===
print("\n=== 7. TIMELINE ===")
def t_tl():
    s, r, err = mcp_call("tools/call", {"name": "memory_timeline", "arguments": {"workspace_id": WS_A}})
    sc = r.get("structuredContent", {})
    return s == 200, f"s={s} n={sc.get('count', 0)}"
test("mcp_timeline", t_tl)

# === 8. UPDATE ===
print("\n=== 8. UPDATE ===")
def t_update():
    s, r, err = mcp_call("tools/call", {"name": "memory_update", "arguments": {"id": stored_id, "content": "MCP updated memory v2.", "workspace_id": WS_A}})
    sc = r.get("structuredContent", {})
    return s == 200 and sc.get("updated"), f"s={s}"
test("mcp_update", t_update)

# === 9. VERIFY UPDATE ===
print("\n=== 9. VERIFY UPDATE ===")
def t_verify():
    s, r, err = mcp_call("tools/call", {"name": "memory_search", "arguments": {"query": "v2", "workspace_id": WS_A, "limit": 10}})
    sc = r.get("structuredContent", {})
    items = sc.get("items", [])
    found = any("v2" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found}"
test("mcp_verify_update", t_verify)

# === 10. FORGET ===
print("\n=== 10. FORGET ===")
def t_forget():
    s, r, err = mcp_call("tools/call", {"name": "memory_forget", "arguments": {"id": stored_id, "workspace_id": WS_A}})
    sc = r.get("structuredContent", {})
    return s == 200 and sc.get("forgotten"), f"s={s}"
def t_forget_gone():
    s, r, err = mcp_call("tools/call", {"name": "memory_search", "arguments": {"query": "MCP", "workspace_id": WS_A, "limit": 10}})
    sc = r.get("structuredContent", {})
    items = sc.get("items", [])
    found = any("MCP" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} gone={not found}"
test("mcp_forget", t_forget)
test("mcp_forget_gone", t_forget_gone)

# === 11. ERROR: Missing token ===
print("\n=== 11. ERROR HANDLING ===")
def t_no_auth():
    headers = {"Content-Type": "application/json"}
    body = json.dumps({"jsonrpc": "2.0", "id": 99, "method": "tools/call", "params": {"name": "memory_search", "arguments": {"query": "test"}}}).encode()
    req = urllib.request.Request(f"{BASE}/v1/mcp", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return False, "should reject"
    except urllib.error.HTTPError as e:
        data = json.loads(e.read())
        return e.code == 401 or (e.code == 200 and data.get("error")), f"s={e.code}"
test("mcp_no_auth", t_no_auth)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"MCP E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_mcp.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
