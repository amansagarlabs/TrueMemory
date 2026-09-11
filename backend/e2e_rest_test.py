#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E Test Suite - REST API (final v3)"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
TOKEN_B = "knt_M5otXD2puiozixW0T6FdXXO5sxOk56KOxCIiIGeUUUJg44TFBGkBaBK4PaoLpkor"
TOKEN_C = "knt_4ItDHHlAZFsK1SwpdWmBJx8TinFLnW43xmY8mF4B7Wtw1ZRWfhlbrS5vsJPNgr2i"
TOKEN_USER_B = "knt_368vegUqDdGc1-KN4vrW0I_aVNMwey5DrH8yKeyRrK0ZKXk-8qniHpYwKWW-mZjj"
WS_B = "9214bb47-a7ca-49e1-937c-00f91fb4c411"
AG_B = "7f7ceb98-8ffb-4822-943b-6c217d6398dd"
AG_C = "8cc0581c-ac84-4949-9fe0-74d360b28b2d"

results = {}
store_ids = {}

def call(method, path, data=None, token=TOKEN_WS):
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

# === 1. AUTH ===
print("\n=== 1. AUTHENTICATION ===")
def t_health():
    s, r = call("GET", "/v1/memory/health")
    return s == 200 and r.get("status") == "ok", f"s={s}"
def t_missing():
    try:
        urllib.request.urlopen(urllib.request.Request(f"{BASE}/v1/memories"))
        return False, "should reject"
    except urllib.error.HTTPError as e:
        return e.code == 401, f"s={e.code}"
def t_invalid():
    try:
        urllib.request.urlopen(urllib.request.Request(f"{BASE}/v1/memories", headers={"Authorization": "Bearer bad"}))
        return False, "should reject"
    except urllib.error.HTTPError as e:
        return e.code == 401, f"s={e.code}"
def t_valid():
    s, r = call("GET", "/v1/memories")
    return s == 200, f"s={s}"
test("health", t_health)
test("missing_token", t_missing)
test("invalid_token", t_invalid)
test("valid_auth", t_valid)

# === 2. STORE ===
print("\n=== 2. REST STORE ===")
def t_store_db():
    s, r = call("POST", "/v1/memory/store", {"key": "proj_db", "content": "Project X uses PostgreSQL.", "source": "e2e", "workspace_id": WS_A, "confidence": 0.9})
    store_ids["db"] = r.get("id", "")
    return s == 200 and r.get("saved"), f"s={s}"
def t_store_fw():
    s, r = call("POST", "/v1/memory/store", {"key": "proj_fw", "content": "Project X uses React.", "source": "e2e", "workspace_id": WS_A, "confidence": 0.85})
    store_ids["fw"] = r.get("id", "")
    return s == 200 and r.get("saved"), f"s={s}"
test("store_db", t_store_db)
test("store_fw", t_store_fw)

# === 3. SEARCH (text LIKE - query must match content substring) ===
print("\n=== 3. SEARCH ===")
def t_search():
    s, r = call("POST", "/v1/memory/search", {"query": "PostgreSQL", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("PostgreSQL" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found} n={len(items)}"
test("search", t_search)

# === 4. UPDATE ===
print("\n=== 4. UPDATE ===")
def t_update():
    mid = store_ids.get("db", "")
    s, r = call("POST", "/v1/memories/update", {"id": mid, "content": "Project X migrated to PostgreSQL 17.", "source": "e2e", "workspace_id": WS_A, "confidence": 0.95})
    return s == 200 and r.get("updated"), f"s={s}"
test("update", t_update)

# === 5. VERIFY UPDATE ===
print("\n=== 5. VERIFY UPDATE ===")
def t_verify():
    s, r = call("POST", "/v1/memory/search", {"query": "PostgreSQL 17", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("PostgreSQL 17" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} pg17={found}"
test("verify_update", t_verify)

# === 6. RELATED ===
print("\n=== 6. RELATED ===")
def t_related():
    s, r = call("POST", "/v1/memory/related", {"query": "proj_db", "workspace_id": WS_A, "limit": 10})
    return s == 200, f"s={s} n={r.get('count', 0)}"
test("related", t_related)

# === 7. VERSIONS ===
print("\n=== 7. VERSIONS ===")
def t_versions():
    # versions queries PostgreSQL user_memories (workspace memories via ingestion pipeline).
    # Profile memories stored via /memory/store use SQLite and have no version history.
    s, r = call("POST", "/v1/memories/versions", {"workspace_id": WS_A, "memory_key": "proj_db"})
    return s == 200, f"s={s} v={r.get('count', 0)}"
test("versions", t_versions)

# === 8. FORGET ===
print("\n=== 8. FORGET ===")
def t_forget():
    mid = store_ids.get("fw", "")
    s, r = call("POST", "/v1/memory/forget", {"id": mid, "workspace_id": WS_A})
    return s == 200 and r.get("forgotten"), f"s={s}"
def t_verify_forget():
    s, r = call("POST", "/v1/memory/search", {"query": "React", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("React" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} gone={not found}"
test("forget", t_forget)
test("verify_forget", t_verify_forget)

# === 9. CROSS-AGENT ===
print("\n=== 9. CROSS-AGENT (same workspace) ===")
def t_xa_store():
    s, r = call("POST", "/v1/memory/store", {"key": "deploy", "content": "Deploy on AWS.", "source": "e2e", "workspace_id": WS_A})
    return s == 200 and r.get("saved"), f"s={s}"
def t_xa_search():
    s, r = call("POST", "/v1/memory/search", {"query": "AWS", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("AWS" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found} n={len(items)}"
test("cross_agent_store", t_xa_store)
test("cross_agent_search", t_xa_search)

# === 10. CROSS-USER ===
print("\n=== 10. CROSS-USER ===")
def t_xu_store():
    s, r = call("POST", "/v1/memory/store", {"key": "pref", "content": "Prefers VS Code.", "source": "user-b", "workspace_id": WS_B}, token=TOKEN_USER_B)
    return s == 200 and r.get("saved"), f"s={s}"
def t_xu_isolation():
    s, r = call("POST", "/v1/memory/search", {"query": "VS Code", "workspace_id": WS_B}, token=TOKEN_WS)
    items = r.get("items", [])
    found = any("VS Code" in (i.get("content") or "") for i in items)
    return s == 200 and not found, f"s={s} isolated={not found}"
test("cross_user_store", t_xu_store)
test("cross_user_isolation", t_xu_isolation)

# === 11. CURRENT STATE ===
print("\n=== 11. CURRENT STATE ===")
def t_cs():
    s, r = call("POST", "/v1/memory/current-state", {"workspace_id": WS_A})
    return s == 200, f"s={s}"
test("current_state", t_cs)

# === 12. TIMELINE ===
print("\n=== 12. TIMELINE ===")
def t_tl():
    s, r = call("POST", "/v1/memory/timeline", {"workspace_id": WS_A})
    return s == 200, f"s={s}"
test("timeline", t_tl)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"REST E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_rest_final.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
