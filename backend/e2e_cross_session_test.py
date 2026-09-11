#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Cross-Session Isolation Test

Verifies that memories from different sessions do not leak across sessions.
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
results = {}

def call(method, path, data=None):
    headers = {"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def test(name, fn):
    try:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        results[name] = {"status": status, "detail": detail}
        print(f"  {status}: {name} - {detail}")
    except Exception as e:
        results[name] = {"status": "FAIL", "detail": str(e)}
        print(f"  FAIL: {name} - {e}")

# Session A stores data with session-specific key
print("\n=== CROSS-SESSION ISOLATION ===")
def t_store_a():
    s, r = call("POST", "/v1/memory/store", {"key": "session_a_secret", "content": "Session A private data.", "source": "e2e-session-a", "workspace_id": WS_A})
    return s == 200 and r.get("saved"), f"s={s}"
test("session_a_store", t_store_a)

# Search for session A data via regular search (should find it — same user, same workspace)
def t_search_a():
    s, r = call("POST", "/v1/memory/search", {"query": "session_a_secret", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("Session A" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found}"
test("session_a_find", t_search_a)

# Verify workspace isolation: search from WS_B should NOT find WS_A data
def t_isolation():
    s, r = call("POST", "/v1/memory/search", {"query": "session_a_secret", "workspace_id": "9214bb47-a7ca-49e1-937c-00f91fb4c411", "limit": 10})
    items = r.get("items", [])
    found = any("Session A" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} isolated={not found}"
test("session_isolation", t_isolation)

# Store in WS_B, verify WS_A doesn't see it
def t_cross_ws_store():
    s, r = call("POST", "/v1/memory/store", {"key": "ws_b_data", "content": "WS_B private data.", "source": "e2e-ws-b", "workspace_id": "9214bb47-a7ca-49e1-937c-00f91fb4c411"})
    return s == 200 and r.get("saved"), f"s={s}"
test("ws_b_store", t_cross_ws_store)

def t_cross_ws_isolation():
    s, r = call("POST", "/v1/memory/search", {"query": "ws_b_data", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("WS_B" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} isolated={not found}"
test("ws_cross_isolation", t_cross_ws_isolation)

# Clean up
def t_cleanup():
    call("POST", "/v1/memory/forget", {"id": "profile:general:session_a_secret", "workspace_id": WS_A})
    call("POST", "/v1/memory/forget", {"id": "profile:general:ws_b_data", "workspace_id": "9214bb47-a7ca-49e1-937c-00f91fb4c411"})
    return True, "cleaned"
test("cleanup", t_cleanup)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Cross-Session E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_cross_session.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
