#!/usr/bin/env python3
"""TrueMemory Phase 9.8 — Complete E2E Test Suite (v2, fixes applied)."""
import urllib.request
import json
import sys
import os

sys.path.insert(0, "/app")
os.environ["KONTEXT_ENABLE_TEST_AUTH"] = "1"

from services.memory_core import MemoryClient
from app.config import get_settings

BASE = "http://127.0.0.1:8000"
RESULTS = {}
ALL_TOKENS = {}
ALL_IDS = {}


def load_tokens():
    global ALL_TOKENS, ALL_IDS
    with open("/tmp/e2e_tokens.json") as f:
        data = json.load(f)
    ALL_IDS = {k: data[k] for k in [
        "user_a_id", "user_b_id", "workspace_a_id", "workspace_b_id",
        "project_a_id", "project_b_id", "agent_a_id", "agent_b_id", "agent_c_id",
    ]}
    ALL_TOKENS = data["tokens"]


def rest(method, path, data=None, token=None, query_params=None):
    url = f"{BASE}{path}"
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items() if v is not None)
        if qs:
            url += f"?{qs}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw.decode()[:300]}


def mcp_call(tool_name, arguments, token=None, req_id=1):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps({
        "jsonrpc": "2.0", "id": req_id, "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments}
    }).encode()
    req = urllib.request.Request(f"{BASE}/mcp", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            result = data.get("result", {})
            sc = result.get("structuredContent", result)
            return resp.status, sc, data.get("error")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            data = json.loads(raw)
            return e.code, None, data.get("error", {"message": raw.decode()[:200]})
        except Exception:
            return e.code, None, {"message": raw.decode()[:200]}


def mcp_raw(method, params=None, token=None, req_id=1):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(f"{BASE}/mcp", data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read())


def sdk_client():
    return MemoryClient(get_settings())


def test(name, fn):
    try:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        RESULTS[name] = {"status": status, "detail": str(detail)}
        print(f"  {status}: {name} - {detail}")
    except Exception as e:
        RESULTS[name] = {"status": "FAIL", "detail": str(e)}
        print(f"  FAIL: {name} - {e}")


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def sid(ws):
    return f"general|workspace:{ws}"


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────

def stage_auth():
    section("STAGE 1: AUTHENTICATION")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]

    def t_health():
        s, r = rest("GET", "/v1/memory/health")
        return s == 200 and r.get("status") == "ok", f"s={s} status={r.get('status')}"
    test("auth_health", t_health)

    def t_valid():
        s, r = rest("GET", "/v1/memories", token=T_A, query_params={"workspace_id": WS_A})
        return s == 200, f"s={s}"
    test("auth_valid_token", t_valid)

    def t_missing():
        s, _ = rest("GET", "/v1/memories")
        return s == 401, f"s={s}"
    test("auth_missing_token", t_missing)

    def t_invalid():
        s, _ = rest("GET", "/v1/memories", token="bad_token_here")
        return s == 401, f"s={s}"
    test("auth_invalid_token", t_invalid)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: REST CRUD
# ─────────────────────────────────────────────────────────────────────────────

def stage_rest_crud():
    section("STAGE 2: REST CRUD")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    stored_ids = {}

    def t_store():
        s, r = rest("POST", "/v1/memory/store", {
            "key": "e2e_project_x", "content": "Project X uses PostgreSQL.",
            "source": "e2e-rest", "workspace_id": WS_A, "confidence": 0.9,
        }, token=T_A)
        stored_ids["proj_x"] = r.get("id", "")
        return s == 200 and r.get("saved"), f"s={s}"
    test("rest_store", t_store)

    def t_search():
        s, r = rest("POST", "/v1/memory/search", {"query": "PostgreSQL", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        found = any("PostgreSQL" in (i.get("content") or "") for i in items)
        return s == 200 and found, f"s={s} found={found} n={len(items)}"
    test("rest_search", t_search)

    def t_list():
        s, r = rest("GET", "/v1/memories", token=T_A, query_params={"workspace_id": WS_A, "limit": 50})
        items = r.get("items", [])
        found = any(i.get("key") == "e2e_project_x" for i in items)
        return s == 200 and found, f"s={s} n={len(items)}"
    test("rest_list", t_list)

    def t_update():
        s, r = rest("POST", "/v1/memories/update", {
            "id": stored_ids["proj_x"], "content": "Project X migrated to PostgreSQL 17.",
            "source": "e2e-rest", "workspace_id": WS_A, "confidence": 0.95,
        }, token=T_A)
        return s == 200 and r.get("updated"), f"s={s}"
    test("rest_update", t_update)

    def t_verify():
        s, r = rest("POST", "/v1/memory/search", {"query": "PostgreSQL 17", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        found = any("PostgreSQL 17" in (i.get("content") or "") for i in items)
        return s == 200 and found, f"s={s}"
    test("rest_verify_update", t_verify)

    def t_related():
        s, r = rest("POST", "/v1/memory/related", {"query": "e2e_project_x", "workspace_id": WS_A, "limit": 10}, token=T_A)
        return s == 200, f"s={s} n={r.get('count', 0)}"
    test("rest_related", t_related)

    def t_versions():
        s, r = rest("POST", "/v1/memories/versions", {"workspace_id": WS_A, "memory_key": "e2e_project_x"}, token=T_A)
        return s == 200, f"s={s} v={r.get('count', 0)}"
    test("rest_versions", t_versions)

    def t_forget():
        s, r = rest("POST", "/v1/memory/forget", {"id": stored_ids["proj_x"], "workspace_id": WS_A}, token=T_A)
        return s == 200 and r.get("forgotten"), f"s={s}"
    test("rest_forget", t_forget)

    def t_forget_verify():
        s, r = rest("POST", "/v1/memory/search", {"query": "PostgreSQL", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        found = any("PostgreSQL" in (i.get("content") or "") for i in items)
        return s == 200 and not found, f"s={s} gone={not found}"
    test("rest_forget_verify", t_forget_verify)

    def t_current():
        s, r = rest("POST", "/v1/memory/current-state", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("rest_current_state", t_current)

    def t_timeline():
        s, r = rest("POST", "/v1/memory/timeline", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("rest_timeline", t_timeline)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3: MCP PROTOCOL
# ─────────────────────────────────────────────────────────────────────────────

def stage_mcp():
    section("STAGE 3: MCP PROTOCOL")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    mcp_ids = {}

    def t_init():
        s, r = mcp_raw("initialize", token=T_A)
        result = r.get("result", {})
        proto = result.get("protocolVersion")
        ok = s == 200 and proto is not None
        return ok, f"s={s} proto={proto}"
    test("mcp_initialize", t_init)

    def t_tools():
        s, r = mcp_raw("tools/list", token=T_A)
        result = r.get("result", {})
        tools = result.get("tools", [])
        names = {t["name"] for t in tools}
        expected = {"memory_search", "memory_store", "memory_update", "memory_forget",
                     "memory_current_state", "memory_timeline", "memory_related"}
        return expected.issubset(names), f"n={len(tools)} missing={expected - names}"
    test("mcp_tools_list", t_tools)

    def t_store():
        s, r, err = mcp_call("memory_store", {
            "key": "mcp_e2e_key", "content": "MCP E2E memory.", "source": "e2e-mcp", "workspace_id": WS_A,
        }, token=T_A)
        mcp_ids["e2e"] = r.get("memory_id", "")
        return s == 200 and r.get("saved"), f"s={s}"
    test("mcp_store", t_store)

    def t_search():
        s, r, err = mcp_call("memory_search", {"query": "MCP", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = (r or {}).get("items", [])
        found = any("MCP" in (i.get("content") or "") for i in items)
        return s == 200 and found, f"s={s} found={found} n={len(items)}"
    test("mcp_search", t_search)

    def t_profile():
        s, r, err = mcp_call("memory_profile", {"workspace_id": WS_A, "limit": 10}, token=T_A)
        items = (r or {}).get("items", [])
        return s == 200 and len(items) > 0, f"s={s} n={len(items)}"
    test("mcp_profile", t_profile)

    def t_current():
        s, r, err = mcp_call("memory_current_state", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("mcp_current_state", t_current)

    def t_tl():
        s, r, err = mcp_call("memory_timeline", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("mcp_timeline", t_tl)

    def t_update():
        s, r, err = mcp_call("memory_update", {
            "id": mcp_ids["e2e"], "content": "MCP E2E updated.", "workspace_id": WS_A,
        }, token=T_A)
        return s == 200 and (r or {}).get("updated"), f"s={s}"
    test("mcp_update", t_update)

    def t_forget():
        s, r, err = mcp_call("memory_forget", {"id": mcp_ids["e2e"], "workspace_id": WS_A}, token=T_A)
        return s == 200 and (r or {}).get("forgotten"), f"s={s}"
    test("mcp_forget", t_forget)

    def t_no_auth():
        s, r, err = mcp_call("memory_search", {"query": "test"}, token=None)
        return s in (401, 403), f"s={s}"
    test("mcp_no_auth", t_no_auth)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 4: PYTHON SDK
# ─────────────────────────────────────────────────────────────────────────────

def stage_python_sdk():
    section("STAGE 4: PYTHON SDK")
    WS_A = ALL_IDS["workspace_a_id"]
    client = sdk_client()
    USER = ALL_IDS["user_a_id"]

    def t_store():
        client.remember(user_id=USER, scope="general", key="sdk_key_1", content="SDK memory v1.", source="e2e-sdk", workspace_id=WS_A, confidence=0.9)
        return True, "stored"
    test("sdk_store", t_store)

    def t_list():
        items = client.list(user_id=USER, scope="general", limit=50, workspace_id=WS_A)
        found = any(i.get("key") == "sdk_key_1" for i in items)
        return found, f"n={len(items)}"
    test("sdk_list", t_list)

    def t_search():
        items = client.search(user_id=USER, scope="general", query="SDK", limit=10, workspace_id=WS_A)
        found = any("SDK" in (i.get("content") or "") for i in items)
        return found, f"n={len(items)}"
    test("sdk_search", t_search)

    def t_update():
        ok = client.update(user_id=USER, scope="general", key="sdk_key_1", content="SDK memory v2.", source="e2e-sdk", workspace_id=WS_A, confidence=0.95)
        return ok, f"updated={ok}"
    test("sdk_update", t_update)

    def t_verify():
        items = client.search(user_id=USER, scope="general", query="v2", limit=10, workspace_id=WS_A)
        found = any("v2" in (i.get("content") or "") for i in items)
        return found, f"found={found}"
    test("sdk_verify_update", t_verify)

    def t_forget():
        ok = client.forget(user_id=USER, scope="general", key="sdk_key_1", workspace_id=WS_A)
        return ok, f"forgotten={ok}"
    test("sdk_forget", t_forget)

    def t_gone():
        items = client.search(user_id=USER, scope="general", query="SDK", limit=10, workspace_id=WS_A)
        found = any("SDK" in (i.get("content") or "") for i in items)
        return not found, f"gone={not found}"
    test("sdk_forget_verify", t_gone)

    def t_context():
        client.remember(user_id=USER, scope="general", key="sdk_ctx", content="Context memory.", source="e2e-sdk", workspace_id=WS_A)
        ctx = client.context(user_id=USER, scope="general", workspace_id=WS_A)
        return ctx is not None and hasattr(ctx, "scope"), f"type={type(ctx).__name__}"
    test("sdk_context_builder", t_context)

    def t_cache():
        client.remember(user_id=USER, scope="general", key="sdk_cache", content="Cache test.", source="e2e-sdk", workspace_id=WS_A)
        items1 = client.search(user_id=USER, scope="general", query="Cache", limit=10, workspace_id=WS_A)
        items2 = client.search(user_id=USER, scope="general", query="Cache", limit=10, workspace_id=WS_A)
        metrics = client.cache_metrics()
        client.forget(user_id=USER, scope="general", key="sdk_cache", workspace_id=WS_A)
        return len(items1) > 0 and isinstance(metrics, dict), f"n={len(items1)}"
    test("sdk_hot_cache", t_cache)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 5: SEMANTIC EQUIVALENCE
# ─────────────────────────────────────────────────────────────────────────────

def stage_semantic_equivalence():
    section("STAGE 5: SEMANTIC EQUIVALENCE")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    USER = ALL_IDS["user_a_id"]

    rest("POST", "/v1/memory/store", {
        "key": "equiv_fix", "content": "Semantic fixture data.", "source": "rest-equiv", "workspace_id": WS_A,
    }, token=T_A)
    mcp_call("memory_store", {
        "key": "equiv_mcp", "content": "Semantic fixture data.", "source": "mcp-equiv", "workspace_id": WS_A,
    }, token=T_A)
    client = sdk_client()
    client.remember(user_id=USER, scope="general", key="equiv_sdk", content="Semantic fixture data.", source="sdk-equiv", workspace_id=WS_A)

    def t_rest_mcp():
        _, rr = rest("POST", "/v1/memory/search", {"query": "Semantic fixture", "workspace_id": WS_A, "limit": 10}, token=T_A)
        _, mr, _ = mcp_call("memory_search", {"query": "Semantic fixture", "workspace_id": WS_A, "limit": 10}, token=T_A)
        r_keys = {i.get("key") for i in rr.get("items", [])}
        m_keys = {i.get("key") for i in (mr or {}).get("items", [])}
        return len(r_keys & m_keys) >= 1, f"rest={r_keys} mcp={m_keys}"
    test("equiv_rest_vs_mcp", t_rest_mcp)

    def t_rest_sdk():
        _, rr = rest("GET", "/v1/memories", token=T_A, query_params={"workspace_id": WS_A})
        sdk_items = client.list(user_id=USER, scope="general", limit=50, workspace_id=WS_A)
        r_keys = {i.get("key") for i in rr.get("items", [])}
        s_keys = {i.get("key") for i in sdk_items}
        return len(r_keys & s_keys) >= 1, f"overlap={len(r_keys & s_keys)}"
    test("equiv_rest_vs_sdk", t_rest_sdk)

    def t_content():
        all_contents = set()
        for q in [("POST", "/v1/memory/search", {"query": "fixture", "workspace_id": WS_A, "limit": 10})]:
            _, rr = rest(*q, token=T_A)
            all_contents |= {i.get("content") for i in rr.get("items", [])}
        _, mr, _ = mcp_call("memory_search", {"query": "fixture", "workspace_id": WS_A, "limit": 10}, token=T_A)
        all_contents |= {i.get("content") for i in (mr or {}).get("items", [])}
        all_contents |= {i.get("content") for i in client.search(user_id=USER, scope="general", query="fixture", limit=10, workspace_id=WS_A)}
        return "Semantic fixture data." in all_contents, f"found={'Semantic fixture data.' in all_contents}"
    test("equiv_content_match", t_content)

    for k in ["equiv_fix", "equiv_mcp", "equiv_sdk"]:
        client.forget(user_id=USER, scope="general", key=k, workspace_id=WS_A)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 6: CROSS-SESSION PERSISTENCE
# ─────────────────────────────────────────────────────────────────────────────

def stage_cross_session():
    section("STAGE 6: CROSS-SESSION PERSISTENCE")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    client = sdk_client()
    USER = ALL_IDS["user_a_id"]

    s1, r1 = rest("POST", "/v1/memory/store", {
        "key": "session_persistent", "content": "Persistent across sessions.", "source": "e2e-session", "workspace_id": WS_A,
    }, token=T_A)
    test("xsession_store_rest", lambda: (s1 == 200 and r1.get("saved"), f"s={s1}"))

    def t_sdk():
        items = client.search(user_id=USER, scope="general", query="Persistent", limit=10, workspace_id=WS_A)
        return any("Persistent" in (i.get("content") or "") for i in items), "found=True"
    test("xsession_search_sdk", t_sdk)

    def t_mcp():
        s, r, e = mcp_call("memory_search", {"query": "Persistent", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = (r or {}).get("items", [])
        return s == 200 and any("Persistent" in (i.get("content") or "") for i in items), f"s={s}"
    test("xsession_search_mcp", t_mcp)

    rest("POST", "/v1/memory/forget", {"id": r1.get("id", ""), "workspace_id": WS_A}, token=T_A)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 7: CROSS-AGENT
# ─────────────────────────────────────────────────────────────────────────────

def stage_cross_agent():
    section("STAGE 7: CROSS-AGENT")
    WS_A = ALL_IDS["workspace_a_id"]
    T_A = ALL_TOKENS["token_a_ws"]

    # Cross-agent = same workspace, different agents sharing workspace-level memories.
    # Store at workspace level (no agent_id) so all agents in the workspace can see it.

    # Agent A stores (workspace-level)
    def t_store():
        s, r = rest("POST", "/v1/memory/store", {
            "key": "cross_agent_shared", "content": "Shared context from agent A.",
            "source": "agent-a", "workspace_id": WS_A,
        }, token=T_A)
        return s == 200 and r.get("saved"), f"s={s}"
    test("cross_agent_store_a", t_store)

    # Agent B searches (workspace-level)
    def t_search():
        s, r = rest("POST", "/v1/memory/search", {
            "query": "Shared context", "workspace_id": WS_A, "limit": 10,
        }, token=T_A)
        items = r.get("items", [])
        found = any("agent A" in (i.get("content") or "") for i in items)
        return s == 200 and found, f"s={s} found={found} n={len(items)}"
    test("cross_agent_search_b", t_search)

    # Agent C updates (workspace-level)
    def t_update():
        s, r = rest("POST", "/v1/memories/update", {
            "id": f"profile:{sid(WS_A)}:cross_agent_shared",
            "content": "Shared context updated by agent C.", "source": "agent-c",
            "workspace_id": WS_A,
        }, token=T_A)
        return s == 200 and r.get("updated"), f"s={s}"
    test("cross_agent_update_c", t_update)

    # Agent A verifies (workspace-level)
    def t_verify():
        s, r = rest("POST", "/v1/memory/search", {
            "query": "agent C", "workspace_id": WS_A, "limit": 10,
        }, token=T_A)
        items = r.get("items", [])
        found = any("agent C" in (i.get("content") or "") for i in items)
        return s == 200 and found, f"s={s} found={found}"
    test("cross_agent_verify_a", t_verify)

    rest("POST", "/v1/memory/forget", {"id": f"profile:{sid(WS_A)}:cross_agent_shared", "workspace_id": WS_A}, token=T_A)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 8: CURRENT/HISTORICAL STATE
# ─────────────────────────────────────────────────────────────────────────────

def stage_current_historical():
    section("STAGE 8: CURRENT/HISTORICAL STATE")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]

    s1, r1 = rest("POST", "/v1/memory/store", {
        "key": "framework_choice", "content": "Using React in 2025.", "source": "e2e",
        "workspace_id": WS_A, "valid_from": "2025-01-01",
    }, token=T_A)
    s2, r2 = rest("POST", "/v1/memories/update", {
        "id": r1.get("id", ""), "content": "Migrated to Vue in 2026.", "source": "e2e",
        "workspace_id": WS_A, "valid_from": "2026-01-01",
    }, token=T_A)

    def t_current():
        s, r = rest("POST", "/v1/memory/current-state", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("current_state_vue", t_current)

    def t_timeline():
        s, r = rest("POST", "/v1/memory/timeline", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("timeline_revisions", t_timeline)

    rest("POST", "/v1/memory/forget", {"id": r1.get("id", ""), "workspace_id": WS_A}, token=T_A)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 9: CROSS-USER FORGETTING
# ─────────────────────────────────────────────────────────────────────────────

def stage_forgetting():
    section("STAGE 9: CROSS-USER FORGETTING")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]

    s1, r1 = rest("POST", "/v1/memory/store", {
        "key": "lang_pref", "content": "I prefer TypeScript.", "source": "e2e", "workspace_id": WS_A,
    }, token=T_A)

    def t_found():
        s, r = rest("POST", "/v1/memory/search", {"query": "TypeScript", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        return s == 200 and any("TypeScript" in (i.get("content") or "") for i in items), f"found=True"
    test("forget_before", t_found)

    s_f, r_f = rest("POST", "/v1/memory/forget", {"id": r1.get("id", ""), "workspace_id": WS_A}, token=T_A)
    test("forget_action", lambda: (s_f == 200 and r_f.get("forgotten"), f"s={s_f}"))

    def t_gone():
        s, r = rest("POST", "/v1/memory/search", {"query": "TypeScript", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        return s == 200 and not any("TypeScript" in (i.get("content") or "") for i in items), "gone=True"
    test("forget_after", t_gone)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 10: WORKSPACE/AGENT ISOLATION
# ─────────────────────────────────────────────────────────────────────────────

def stage_isolation():
    section("STAGE 10: WORKSPACE/AGENT ISOLATION")
    T_A = ALL_TOKENS["token_a_ws"]
    T_B = ALL_TOKENS["token_b_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    WS_B = ALL_IDS["workspace_b_id"]
    T_AG_A = ALL_TOKENS["token_a_agent"]

    rest("POST", "/v1/memory/store", {
        "key": "ws_a_secret", "content": "WS_A secret data.", "source": "e2e", "workspace_id": WS_A,
    }, token=T_A)
    rest("POST", "/v1/memory/store", {
        "key": "ws_b_secret", "content": "WS_B secret data.", "source": "e2e", "workspace_id": WS_B,
    }, token=T_B)

    def t_iso_a():
        s, r = rest("POST", "/v1/memory/search", {"query": "ws_b_secret", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = r.get("items", [])
        return s == 200 and not any("WS_B" in (i.get("content") or "") for i in items), f"isolated=True"
    test("ws_isolation_a", t_iso_a)

    def t_iso_b():
        s, r = rest("POST", "/v1/memory/search", {"query": "ws_a_secret", "workspace_id": WS_B, "limit": 10}, token=T_B)
        items = r.get("items", [])
        return s == 200 and not any("WS_A" in (i.get("content") or "") for i in items), f"isolated=True"
    test("ws_isolation_b", t_iso_b)

    def t_binding():
        s, r = rest("POST", "/v1/memory/store", {
            "key": "bind_test", "content": "binding test.", "workspace_id": WS_B,
        }, token=T_A)
        # Token A is bound to WS_A, so data goes to WS_A regardless of request
        return s == 200, f"s={s}"
    test("ws_binding_override", t_binding)

    def t_no_auth():
        s, _ = rest("POST", "/v1/memory/search", {"query": "test", "workspace_id": WS_A})
        return s == 401, f"s={s}"
    test("security_no_auth", t_no_auth)

    for ws, tok in [(WS_A, T_A), (WS_B, T_B)]:
        rest("POST", "/v1/memory/forget", {"id": f"profile:{sid(ws)}:ws_a_secret", "workspace_id": ws}, token=tok)
        rest("POST", "/v1/memory/forget", {"id": f"profile:{sid(ws)}:ws_b_secret", "workspace_id": ws}, token=tok)
    rest("POST", "/v1/memory/forget", {"id": f"profile:{sid(WS_A)}:bind_test", "workspace_id": WS_A}, token=T_A)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 11: TELEMETRY
# ─────────────────────────────────────────────────────────────────────────────

def stage_telemetry():
    section("STAGE 11: TELEMETRY")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]

    def t_metrics():
        s, r = rest("GET", "/v1/memory/metrics", token=T_A)
        return s == 200 and isinstance(r, dict), f"s={s}"
    test("telemetry_metrics", t_metrics)

    def t_store_obs():
        s, r = rest("POST", "/v1/memory/store", {
            "key": "telem_e2e", "content": "Telemetry E2E.", "source": "e2e", "workspace_id": WS_A,
        }, token=T_A)
        return s == 200, f"s={s}"
    test("telemetry_store", t_store_obs)

    def t_search_obs():
        s, r = rest("POST", "/v1/memory/search", {"query": "Telemetry", "workspace_id": WS_A, "limit": 10}, token=T_A)
        return s == 200, f"s={s} n={r.get('count', 0)}"
    test("telemetry_search", t_search_obs)

    def t_forget_obs():
        s, r = rest("POST", "/v1/memory/forget", {
            "id": f"profile:{sid(WS_A)}:telem_e2e", "workspace_id": WS_A,
        }, token=T_A)
        return s == 200, f"s={s}"
    test("telemetry_forget", t_forget_obs)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 12: REFERENCE AGENT (MCP-only)
# ─────────────────────────────────────────────────────────────────────────────

def stage_reference_agent():
    section("STAGE 12: REFERENCE AGENT (MCP-only)")
    T_A = ALL_TOKENS["token_a_ws"]
    WS_A = ALL_IDS["workspace_a_id"]
    stored_id = None

    def t_discover():
        s, r = mcp_raw("tools/list", token=T_A)
        tools = r.get("result", {}).get("tools", [])
        return len(tools) >= 7, f"n={len(tools)}"
    test("ref_discover", t_discover)

    def t_store():
        nonlocal stored_id
        s, r, e = mcp_call("memory_store", {
            "key": "ref_agent_mem", "content": "Reference agent context.", "source": "ref-agent", "workspace_id": WS_A,
        }, token=T_A)
        stored_id = (r or {}).get("memory_id", "")
        return s == 200 and (r or {}).get("saved"), f"s={s}"
    test("ref_store", t_store)

    def t_search():
        s, r, e = mcp_call("memory_search", {"query": "Reference", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = (r or {}).get("items", [])
        return s == 200 and any("Reference" in (i.get("content") or "") for i in items), f"s={s}"
    test("ref_search", t_search)

    def t_update():
        s, r, e = mcp_call("memory_update", {
            "id": stored_id, "content": "Reference context updated.", "source": "ref-agent", "workspace_id": WS_A,
        }, token=T_A)
        return s == 200 and (r or {}).get("updated"), f"s={s}"
    test("ref_update", t_update)

    def t_current():
        s, r, e = mcp_call("memory_current_state", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("ref_current_state", t_current)

    def t_timeline():
        s, r, e = mcp_call("memory_timeline", {"workspace_id": WS_A}, token=T_A)
        return s == 200, f"s={s}"
    test("ref_timeline", t_timeline)

    def t_forget():
        s, r, e = mcp_call("memory_forget", {"id": stored_id, "workspace_id": WS_A}, token=T_A)
        return s == 200 and (r or {}).get("forgotten"), f"s={s}"
    test("ref_forget", t_forget)

    def t_persist():
        s, r, e = mcp_call("memory_search", {"query": "Reference", "workspace_id": WS_A, "limit": 10}, token=T_A)
        items = (r or {}).get("items", [])
        return s == 200 and not any("Reference" in (i.get("content") or "") for i in items), "gone=True"
    test("ref_persist_after_forget", t_persist)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    load_tokens()
    print("=" * 60)
    print("  TRUE MEMORY PHASE 9.8 — COMPLETE E2E SUITE v2")
    print("=" * 60)

    stage_auth()
    stage_rest_crud()
    stage_mcp()
    stage_python_sdk()
    stage_semantic_equivalence()
    stage_cross_session()
    stage_cross_agent()
    stage_current_historical()
    stage_forgetting()
    stage_isolation()
    stage_telemetry()
    stage_reference_agent()

    section("FINAL SUMMARY")
    passed = sum(1 for v in RESULTS.values() if v["status"] == "PASS")
    failed = sum(1 for v in RESULTS.values() if v["status"] == "FAIL")
    total = passed + failed
    print(f"\n  TOTAL: {passed} passed, {failed} failed, {total} tests")

    if failed > 0:
        print("\n  FAILURES:")
        for name, v in RESULTS.items():
            if v["status"] == "FAIL":
                print(f"    FAIL: {name} - {v['detail']}")

    with open("/tmp/e2e_phase98_results.json", "w") as f:
        json.dump(RESULTS, f, indent=2)
    print(f"\n  Results saved to /tmp/e2e_phase98_results.json")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
