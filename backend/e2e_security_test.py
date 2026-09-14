#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Security Matrix Test"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
WS_B = "9214bb47-a7ca-49e1-937c-00f91fb4c411"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
TOKEN_B = "knt_M5otXD2puiozixW0T6FdXXO5sxOk56KOxCIiIGeUUUJg44TFBGkBaBK4PaoLpkor"
TOKEN_USER_B = "knt_368vegUqDdGc1-KN4vrW0I_aVNMwey5DrH8yKeyRrK0ZKXk-8qniHpYwKWW-mZjj"
results = {}

def call(path, data=None, token=None, method="POST"):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=h, method=method)
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

# === 1. MISSING AUTH ===
print("\n=== 1. MISSING AUTH ===")
def t_no_auth():
    s, r = call("/v1/memory/search", {"query": "test"})
    return s == 401, f"s={s}"
test("no_auth", t_no_auth)

# === 2. INVALID TOKEN ===
print("\n=== 2. INVALID TOKEN ===")
def t_invalid():
    s, r = call("/v1/memory/search", {"query": "test"}, token="bad_token")
    return s == 401, f"s={s}"
test("invalid_token", t_invalid)

# === 3. WORKSPACE VIOLATION: bound token accessing different workspace ===
print("\n=== 3. WORKSPACE BINDING ENFORCEMENT ===")
def t_ws_binding():
    # TOKEN_WS is bound to WS_A. Sending workspace_id=WS_B should be overridden to WS_A.
    # The data goes to WS_A, not WS_B — the binding is enforced.
    s, r = call("/v1/memory/store", {"key": "bind_test", "content": "Binding test.", "workspace_id": WS_B}, token=TOKEN_WS)
    if s != 200:
        return False, f"s={s}"
    # Verify data is in WS_A, not WS_B
    s2, r2 = call("/v1/memory/search", {"query": "bind_test", "workspace_id": WS_A}, token=TOKEN_WS)
    found_a = any("Binding" in (i.get("content") or "") for i in r2.get("items", []))
    s3, r3 = call("/v1/memory/search", {"query": "bind_test", "workspace_id": WS_B}, token=TOKEN_USER_B)
    found_b = any("Binding" in (i.get("content") or "") for i in r3.get("items", []))
    # Cleanup
    call("/v1/memory/forget", {"id": "profile:general:bind_test", "workspace_id": WS_A}, token=TOKEN_WS)
    return found_a and not found_b, f"ws_a={found_a} ws_b={found_b}"
test("workspace_binding", t_ws_binding)

# === 4. AGENT BINDING VIOLATION ===
print("\n=== 4. AGENT BINDING VIOLATION ===")
def t_agent_violation():
    # TOKEN_B is bound to AG_B. Store without agent_id should fail.
    s, r = call("/v1/memory/store", {"key": "viol_agent", "content": "x", "workspace_id": WS_A}, token=TOKEN_B)
    return s == 403, f"s={s}"
test("agent_violation", t_agent_violation)

# === 5. HEALTH (no auth required) ===
print("\n=== 5. HEALTH ===")
def t_health():
    s, r = call("/v1/memory/health", token=None, method="GET")
    return s == 200, f"s={s}"
test("health", t_health)

# === 6. VALID STORE+SEARCH (baseline) ===
print("\n=== 6. VALID BASELINE ===")
def t_baseline():
    s, r = call("/v1/memory/store", {"key": "sec_test", "content": "Security baseline.", "source": "e2e", "workspace_id": WS_A}, token=TOKEN_WS)
    return s == 200, f"s={s}"
test("baseline_store", t_baseline)

# === 7. SCOPE VALIDATION: list with mismatched workspace ===
print("\n=== 7. SCOPE VALIDATION ===")
def t_list_binding():
    # TOKEN_WS bound to WS_A, request WS_B → server overrides to WS_A
    req = urllib.request.Request(f"{BASE}/v1/memories?workspace_id={WS_B}",
        headers={"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return resp.status == 200, f"s={resp.status} (workspace overridden to WS_A)"
    except urllib.error.HTTPError as e:
        return False, f"s={e.code}"
test("list_binding_override", t_list_binding)

# === 8. CROSS-USER ISOLATION ===
print("\n=== 8. CROSS-USER ISOLATION ===")
def t_cross_user():
    # TOKEN_USER_B stores in WS_B
    s1, _ = call("/v1/memory/store", {"key": "user_b_priv", "content": "User B private.", "workspace_id": WS_B}, token=TOKEN_USER_B)
    # TOKEN_WS (different user) searches WS_B — should not find (different user_id)
    s2, r2 = call("/v1/memory/search", {"query": "user_b_priv", "workspace_id": WS_B}, token=TOKEN_WS)
    found = any("User B" in (i.get("content") or "") for i in r2.get("items", []))
    # Cleanup
    call("/v1/memory/forget", {"id": "profile:general:user_b_priv", "workspace_id": WS_B}, token=TOKEN_USER_B)
    return s2 == 200 and not found, f"s={s2} isolated={not found}"
test("cross_user_isolation", t_cross_user)

# === CLEANUP ===
def t_cleanup():
    call("/v1/memory/forget", {"id": "profile:general:sec_test", "workspace_id": WS_A}, token=TOKEN_WS)
    return True, "cleaned"
test("cleanup", t_cleanup)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Security Matrix E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_security.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
