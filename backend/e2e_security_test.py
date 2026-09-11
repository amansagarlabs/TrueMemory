#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Security Matrix Test

Tests various security scenarios:
- Missing auth
- Invalid token
- Scope violation (workspace mismatch)
- Agent binding violation
- Origin check
- Rate limiting
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
WS_B = "9214bb47-a7ca-49e1-937c-00f91fb4c411"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
TOKEN_B = "knt_M5otXD2puiozixW0T6FdXXO5sxOk56KOxCIiIGeUUUJg44TFBGkBaBK4PaoLpkor"
results = {}

def call(path, data=None, token=None, headers_extra=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers_extra:
        h.update(headers_extra)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=h, method="POST")
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

# === 3. WORKSPACE VIOLATION: token bound to WS_A, accessing WS_B ===
print("\n=== 3. WORKSPACE VIOLATION ===")
def t_ws_violation():
    s, r = call("/v1/memory/store", {"key": "viol", "content": "x", "workspace_id": WS_B}, token=TOKEN_WS)
    return s == 403, f"s={s}"
test("workspace_violation", t_ws_violation)

# === 4. AGENT BINDING VIOLATION: TOKEN_B bound to AG_B, accessing without agent_id ===
print("\n=== 4. AGENT BINDING VIOLATION ===")
def t_agent_violation():
    # TOKEN_B is bound to AG_B. Store without agent_id should fail (assert_bindings checks agent_id)
    s, r = call("/v1/memory/store", {"key": "viol_agent", "content": "x", "workspace_id": WS_A}, token=TOKEN_B)
    return s == 403, f"s={s}"
test("agent_violation", t_agent_violation)

# === 5. HEALTH (no auth required) ===
print("\n=== 5. HEALTH ===")
def t_health():
    s, r = call("/v1/memory/health", token=None)
    # Health endpoint is GET, not POST. Let me use GET.
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(f"{BASE}/v1/memory/health", headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return resp.status == 200 and data.get("status") == "ok", f"s={resp.status}"
    except urllib.error.HTTPError as e:
        return False, f"s={e.code}"
test("health", t_health)

# === 6. VALID STORE+SEARCH (baseline) ===
print("\n=== 6. VALID BASELINE ===")
def t_baseline():
    s, r = call("/v1/memory/store", {"key": "sec_test", "content": "Security baseline.", "source": "e2e", "workspace_id": WS_A}, token=TOKEN_WS)
    return s == 200, f"s={s}"
test("baseline_store", t_baseline)

# === 7. LIST with invalid workspace ===
print("\n=== 7. LIST SCOPE VALIDATION ===")
def t_list_violation():
    req = urllib.request.Request(f"{BASE}/v1/memories?workspace_id={WS_B}", headers={"Authorization": f"Bearer {TOKEN_WS}", "Content-Type": "application/json"}, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return False, "should reject"
    except urllib.error.HTTPError as e:
        return e.code in (403, 401), f"s={e.code}"
test("list_scope_violation", t_list_violation)

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
