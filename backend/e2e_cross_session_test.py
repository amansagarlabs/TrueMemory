#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Cross-Session Isolation Test

Tests workspace isolation: data stored in WS_A is not visible from WS_B.
Uses unbound tokens to avoid server-side workspace override.
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
WS_B = "9214bb47-a7ca-49e1-937c-00f91fb4c411"
TOKEN_USER_B = "knt_368vegUqDdGc1-KN4vrW0I_aVNMwey5DrH8yKeyRrK0ZKXk-8qniHpYwKWW-mZjj"
results = {}

def call(method, path, data=None, token=TOKEN_USER_B):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
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

# Store in WS_A (TOKEN_USER_B is unbound, so it can access any workspace)
print("\n=== CROSS-SESSION ISOLATION ===")
def t_store_a():
    s, r = call("POST", "/v1/memory/store", {"key": "session_a_secret", "content": "Session A private data.", "source": "e2e", "workspace_id": WS_A})
    return s == 200 and r.get("saved"), f"s={s}"
test("store_a", t_store_a)

# Store in WS_B
def t_store_b():
    s, r = call("POST", "/v1/memory/store", {"key": "session_b_secret", "content": "Session B private data.", "source": "e2e", "workspace_id": WS_B})
    return s == 200 and r.get("saved"), f"s={s}"
test("store_b", t_store_b)

# Search WS_A for WS_A data — should find it
def t_find_a():
    s, r = call("POST", "/v1/memory/search", {"query": "session_a_secret", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("Session A" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found}"
test("find_a", t_find_a)

# Search WS_A for WS_B data — should NOT find it
def t_isolation_a():
    s, r = call("POST", "/v1/memory/search", {"query": "session_b_secret", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("Session B" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} isolated={not found}"
test("isolation_a", t_isolation_a)

# Search WS_B for WS_A data — should NOT find it
def t_isolation_b():
    s, r = call("POST", "/v1/memory/search", {"query": "session_a_secret", "workspace_id": WS_B, "limit": 10})
    items = r.get("items", [])
    found = any("Session A" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} isolated={not found}"
test("isolation_b", t_isolation_b)

# Search WS_B for WS_B data — should find it
def t_find_b():
    s, r = call("POST", "/v1/memory/search", {"query": "session_b_secret", "workspace_id": WS_B, "limit": 10})
    items = r.get("items", [])
    found = any("Session B" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found}"
test("find_b", t_find_b)

# Cleanup
def t_cleanup():
    call("POST", "/v1/memory/forget", {"id": "profile:general:session_a_secret", "workspace_id": WS_A})
    call("POST", "/v1/memory/forget", {"id": "profile:general:session_b_secret", "workspace_id": WS_B})
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
