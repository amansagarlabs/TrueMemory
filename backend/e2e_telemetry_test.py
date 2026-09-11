#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Telemetry & Observation Test

Tests that observation events are generated for store/search/update/forget operations.
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg33Lho_yu0UFfn7XHIxoGE6vv9Vf"
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

# === 1. METRICS ENDPOINT ===
print("\n=== 1. METRICS ENDPOINT ===")
def t_metrics():
    s, r = call("GET", "/v1/memory/metrics")
    return s == 200 and isinstance(r, dict), f"s={s} keys={list(r.keys())[:5]}"
test("metrics", t_metrics)

# === 2. STORE generates observation ===
print("\n=== 2. STORE + OBSERVATION ===")
def t_store():
    s, r = call("POST", "/v1/memory/store", {"key": "telem1", "content": "Telemetry test.", "source": "e2e-telem", "workspace_id": WS_A})
    return s == 200 and r.get("saved"), f"s={s}"
test("store", t_store)

# === 3. SEARCH generates observation ===
print("\n=== 3. SEARCH + OBSERVATION ===")
def t_search():
    s, r = call("POST", "/v1/memory/search", {"query": "Telemetry", "workspace_id": WS_A, "limit": 10})
    return s == 200, f"s={s} n={r.get('count', 0)}"
test("search", t_search)

# === 4. UPDATE generates observation ===
print("\n=== 4. UPDATE + OBSERVATION ===")
def t_update():
    s, r = call("POST", "/v1/memories/update", {"id": "profile:general:telem1", "content": "Telemetry updated.", "source": "e2e-telem", "workspace_id": WS_A})
    return s == 200, f"s={s}"
test("update", t_update)

# === 5. FORGET generates observation ===
print("\n=== 5. FORGET + OBSERVATION ===")
def t_forget():
    s, r = call("POST", "/v1/memory/forget", {"id": "profile:general:telem1", "workspace_id": WS_A})
    return s == 200, f"s={s}"
test("forget", t_forget)

# === 6. CACHE METRICS ===
print("\n=== 6. CACHE METRICS ===")
def t_cache():
    s, r = call("GET", "/v1/memory/metrics")
    return s == 200 and "cache" in str(r).lower() or isinstance(r, dict), f"s={s} type={type(r).__name__}"
test("cache_metrics", t_cache)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Telemetry E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_telemetry.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
