#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E Test Suite - Python SDK (memory_client.py)"""
import sys
import os
import json
sys.path.insert(0, "/app")
os.environ["TrueMemory_ENABLE_TEST_AUTH"] = "1"

from services.memory_core import MemoryClient, MemoryCore, SQLiteMemoryRepository, MemoryAuthorization
from app.config import get_settings

settings = get_settings()
client = MemoryClient(settings)
results = {}
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
USER = "sdk-test-user"

def test(name, fn):
    try:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        results[name] = {"status": status, "detail": detail}
        print(f"  {status}: {name} - {detail}")
    except Exception as e:
        results[name] = {"status": "FAIL", "detail": str(e)}
        print(f"  FAIL: {name} - {e}")

# === 1. STORE ===
print("\n=== 1. SDK STORE ===")
def t_store():
    client.remember(user_id=USER, scope="general", key="sdk_key", content="SDK memory content.", source="e2e-sdk", workspace_id=WS_A, confidence=0.9)
    return True, "stored"
test("sdk_store", t_store)

# === 2. LIST ===
print("\n=== 2. SDK LIST ===")
def t_list():
    items = client.list(user_id=USER, scope="general", limit=50, workspace_id=WS_A)
    found = any(i.get("key") == "sdk_key" for i in items)
    return found, f"n={len(items)} found={found}"
test("sdk_list", t_list)

# === 3. SEARCH ===
print("\n=== 3. SDK SEARCH ===")
def t_search():
    items = client.search(user_id=USER, scope="general", query="SDK", limit=10, workspace_id=WS_A)
    found = any("SDK" in (i.get("content") or "") for i in items)
    return found, f"n={len(items)} found={found}"
test("sdk_search", t_search)

# === 4. UPDATE ===
print("\n=== 4. SDK UPDATE ===")
def t_update():
    ok = client.update(user_id=USER, scope="general", key="sdk_key", content="SDK memory updated v2.", source="e2e-sdk", workspace_id=WS_A, confidence=0.95)
    return ok, f"updated={ok}"
test("sdk_update", t_update)

# === 5. VERIFY UPDATE ===
print("\n=== 5. SDK VERIFY UPDATE ===")
def t_verify():
    items = client.search(user_id=USER, scope="general", query="v2", limit=10, workspace_id=WS_A)
    found = any("v2" in (i.get("content") or "") for i in items)
    return found, f"found={found}"
test("sdk_verify_update", t_verify)

# === 6. FORGET ===
print("\n=== 6. SDK FORGET ===")
def t_forget():
    ok = client.forget(user_id=USER, scope="general", key="sdk_key", workspace_id=WS_A)
    return ok, f"forgotten={ok}"
def t_forget_gone():
    items = client.search(user_id=USER, scope="general", query="SDK", limit=10, workspace_id=WS_A)
    found = any("SDK" in (i.get("content") or "") for i in items)
    return not found, f"gone={not found}"
test("sdk_forget", t_forget)
test("sdk_forget_gone", t_forget_gone)

# === 7. CONTEXT BUILDER ===
print("\n=== 7. SDK CONTEXT ===")
def t_context():
    client.remember(user_id=USER, scope="general", key="ctx1", content="Context test memory.", source="e2e-sdk", workspace_id=WS_A)
    ctx = client.context(user_id=USER, scope="general", workspace_id=WS_A)
    return ctx is not None and hasattr(ctx, "scope"), f"type={type(ctx).__name__}"
test("sdk_context", t_context)

# === 8. HOT CACHE ===
print("\n=== 8. SDK HOT CACHE ===")
def t_cache():
    client.remember(user_id=USER, scope="general", key="cache1", content="Cache test.", source="e2e-sdk", workspace_id=WS_A)
    items1 = client.search(user_id=USER, scope="general", query="Cache", limit=10, workspace_id=WS_A)
    items2 = client.search(user_id=USER, scope="general", query="Cache", limit=10, workspace_id=WS_A)
    metrics = client.cache_metrics()
    return len(items1) > 0 and isinstance(metrics, dict), f"n={len(items1)} metrics={list(metrics.keys())[:3]}"
test("sdk_hot_cache", t_cache)

# === 9. CACHE INVALIDATION ===
print("\n=== 9. SDK CACHE INVALIDATION ===")
def t_invalidate():
    client.forget(user_id=USER, scope="general", key="cache1", workspace_id=WS_A)
    items = client.search(user_id=USER, scope="general", query="Cache", limit=10, workspace_id=WS_A)
    found = any("Cache" in (i.get("content") or "") for i in items)
    return not found, f"gone={not found}"
test("sdk_cache_invalidate", t_invalidate)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Python SDK E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_python_sdk.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
