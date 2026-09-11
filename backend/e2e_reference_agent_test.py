#!/usr/bin/env python3
"""TrueMemory Phase 9.8 E2E - Reference Agent Test

Demonstrates a complete agent lifecycle using TrueMemory:
1. Agent initializes and stores context
2. Agent searches for relevant memories
3. Agent updates memories based on conversation
4. Agent forgets stale memories
5. Agent retrieves timeline of changes
"""
import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"
WS_A = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
TOKEN_WS = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
results = {}
mem_ids = {}

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

# === Step 1: Agent stores initial context ===
print("\n=== Step 1: INITIAL CONTEXT ===")
def t_init_ctx():
    s, r = call("POST", "/v1/memory/store", {
        "key": "project_requirements",
        "content": "User wants a React dashboard with real-time WebSocket updates.",
        "source": "conversation",
        "workspace_id": WS_A,
        "confidence": 0.85
    })
    mem_ids["requirements"] = r.get("id", "")
    return s == 200 and r.get("saved"), f"s={s} id={mem_ids['requirements']}"
test("store_requirements", t_init_ctx)

def t_store_arch():
    s, r = call("POST", "/v1/memory/store", {
        "key": "tech_stack",
        "content": "Backend: FastAPI + PostgreSQL. Frontend: React + TypeScript.",
        "source": "conversation",
        "workspace_id": WS_A,
        "confidence": 0.9
    })
    mem_ids["tech_stack"] = r.get("id", "")
    return s == 200, f"s={s}"
test("store_tech_stack", t_store_arch)

# === Step 2: Agent searches for relevant memories ===
print("\n=== Step 2: SEARCH FOR CONTEXT ===")
def t_search_context():
    s, r = call("POST", "/v1/memory/search", {"query": "React", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("React" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found} n={len(items)}"
test("search_react", t_search_context)

def t_search_arch():
    s, r = call("POST", "/v1/memory/search", {"query": "FastAPI", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    found = any("FastAPI" in (i.get("content") or "") for i in items)
    return s == 200 and found, f"s={s} found={found}"
test("search_fastapi", t_search_arch)

# === Step 3: Agent updates memories ===
print("\n=== Step 3: UPDATE MEMORIES ===")
def t_update_req():
    s, r = call("POST", "/v1/memories/update", {
        "id": mem_ids["requirements"],
        "content": "User wants a React dashboard with real-time WebSocket updates and dark mode.",
        "source": "conversation",
        "workspace_id": WS_A,
        "confidence": 0.95
    })
    return s == 200, f"s={s}"
test("update_requirements", t_update_req)

# === Step 4: Agent stores additional context ===
print("\n=== Step 4: ADDITIONAL CONTEXT ===")
def t_store_deploy():
    s, r = call("POST", "/v1/memory/store", {
        "key": "deploy_config",
        "content": "Deploy to AWS ECS with Fargate. Use RDS PostgreSQL.",
        "source": "planning",
        "workspace_id": WS_A,
        "confidence": 0.8
    })
    return s == 200, f"s={s}"
test("store_deploy", t_store_deploy)

# === Step 5: Agent forgets stale memories ===
print("\n=== Step 5: FORGET STALE ===")
def t_forget_stale():
    # Store a temporary memory and forget it
    s1, r1 = call("POST", "/v1/memory/store", {"key": "temp_note", "content": "Temporary note.", "source": "e2e", "workspace_id": WS_A})
    s2, r2 = call("POST", "/v1/memory/forget", {"id": r1.get("id", ""), "workspace_id": WS_A})
    return s2 == 200, f"s={s2}"
test("forget_stale", t_forget_stale)

# === Step 6: Verify final state ===
print("\n=== Step 6: FINAL STATE ===")
def t_final():
    s, r = call("POST", "/v1/memory/search", {"query": "React", "workspace_id": WS_A, "limit": 10})
    items = r.get("items", [])
    has_dark_mode = any("dark mode" in (i.get("content") or "").lower() for i in items)
    return s == 200 and has_dark_mode, f"s={s} dark_mode={has_dark_mode}"
test("final_state", t_final)

# === Step 7: Timeline ===
print("\n=== Step 7: TIMELINE ===")
def t_timeline():
    s, r = call("POST", "/v1/memory/timeline", {"workspace_id": WS_A})
    return s == 200, f"s={s} n={r.get('count', 0)}"
test("timeline", t_timeline)

# === Cleanup ===
print("\n=== CLEANUP ===")
def t_cleanup():
    for k in ["project_requirements", "tech_stack", "deploy_config"]:
        call("POST", "/v1/memory/forget", {"id": f"profile:general:{k}", "workspace_id": WS_A})
    return True, "cleaned"
test("cleanup", t_cleanup)

# === SUMMARY ===
print("\n" + "=" * 60)
passed = sum(1 for v in results.values() if v["status"] == "PASS")
failed = sum(1 for v in results.values() if v["status"] == "FAIL")
print(f"Reference Agent E2E: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
with open("/tmp/e2e_reference_agent.json", "w") as f:
    json.dump(results, f, indent=2)
sys.exit(0 if failed == 0 else 1)
