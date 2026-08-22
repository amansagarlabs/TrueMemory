"""
Cross-user integration test — verifies usage tracking, rate limits,
and plan enforcement for all three test accounts.
"""

import httpx
import json
import sys

API = "http://localhost:8000"

USERS = {
    "free": {"email": "user3@gmail.com", "password": "12345678"},
    "pro":  {"email": "user2@gmail.com", "password": "12345678"},
    "team": {"email": "user1@gmail.com", "password": "12345678"},
}

RESULTS = []

def log(status, test, detail=""):
    icon = "[PASS]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[WARN]" if status == "WARN" else "[----]"
    RESULTS.append({"status": status, "test": test, "detail": detail})
    print(f"  {icon} {test}" + (f" -- {detail}" if detail else ""))

def login(email, password):
    r = httpx.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json()
        return data.get("session", {}).get("access_token")
    return None

def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def test_user(plan_name, creds):
    print(f"\n{'='*60}")
    print(f"  Testing: {plan_name.upper()} plan ({creds['email']})")
    print(f"{'='*60}")

    token = login(creds["email"], creds["password"])
    if not token:
        log("FAIL", "Login", f"Could not authenticate {creds['email']}")
        return
    log("PASS", "Login", f"Token received")

    h = headers(token)

    # 1. Auth /me
    r = httpx.get(f"{API}/api/auth/me", headers=h)
    if r.status_code == 200:
        data = r.json()
        user_plan = data.get("plan", "unknown")
        log("PASS" if user_plan == plan_name else "FAIL", "GET /me", f"plan={user_plan}")
    else:
        log("FAIL", "GET /me", f"status={r.status_code}")

    # 2. Subscription
    r = httpx.get(f"{API}/api/subscriptions/me", headers=h)
    if r.status_code == 200:
        sub = r.json()
        plan = sub.get("plan", "unknown")
        log("PASS", "GET /subscriptions/me", f"plan={plan}")
    else:
        log("FAIL", "GET /subscriptions/me", f"status={r.status_code}")

    # 3. Usage summary
    r = httpx.get(f"{API}/api/subscriptions/usage", headers=h)
    if r.status_code == 200:
        usage = r.json()
        plan = usage.get("plan", "?")
        resources = usage.get("usage", {})
        log("PASS", "GET /subscriptions/usage", f"plan={plan}, {len(resources)} resources")
        for rk, rv in resources.items():
            log("PASS", f"  {rk}", f"{rv['used']}/{rv['limit']} ({rv['period']})")
    else:
        log("FAIL", "GET /subscriptions/usage", f"status={r.status_code}")

    # 4. Rate limit checks
    for resource in ["crawl:scrape", "crawl:search", "crawl:map", "crawl:crawl"]:
        r = httpx.get(f"{API}/api/subscriptions/check/{resource}", headers=h)
        if r.status_code == 200:
            data = r.json()
            allowed = data.get("allowed", False)
            used = data.get("used", 0)
            limit = data.get("limit", 0)
            log("PASS", f"Rate limit {resource}", f"{used}/{limit}, allowed={allowed}")
        else:
            log("FAIL", f"Rate limit {resource}", f"status={r.status_code}")

    # 5. Dashboard stats
    r = httpx.get(f"{API}/api/dashboard/stats?platform=both", headers=h)
    if r.status_code == 200:
        stats = r.json()
        log("PASS", "GET /dashboard/stats", f"conv={stats.get('conversations',0)}, mem={stats.get('memory_entries',0)}, crawl={stats.get('crawl_jobs',0)}")
        if stats.get("errors"):
            log("WARN", "  Dashboard errors", str(stats["errors"]))
    else:
        log("FAIL", "GET /dashboard/stats", f"status={r.status_code}")

    # 6. Scrape test
    r = httpx.post(f"{API}/api/AmanCrawl/scrape", headers=h, json={
        "url": "https://example.com",
        "formats": ["markdown"],
    }, timeout=30)
    if r.status_code == 200:
        data = r.json()
        title = data.get("title", "")
        log("PASS", "Scrape example.com", f"title='{title[:40]}'")
    elif r.status_code == 429:
        detail = r.json().get("detail", {})
        log("BLOCKED", "Scrape example.com", f"429: {detail.get('message', '')}")
    else:
        log("FAIL", "Scrape example.com", f"status={r.status_code}")

    # 7. Search test
    r = httpx.post(f"{API}/api/AmanCrawl/search", headers=h, json={
        "query": "open source AI",
        "num_results": 3,
    }, timeout=30)
    if r.status_code == 200:
        data = r.json()
        results = data.get("results", [])
        log("PASS", "Search 'open source AI'", f"{len(results)} results")
    elif r.status_code == 429:
        detail = r.json().get("detail", {})
        log("BLOCKED", "Search 'open source AI'", f"429: {detail.get('message', '')}")
    else:
        log("FAIL", "Search 'open source AI'", f"status={r.status_code}")

    # 8. Usage after operations
    r = httpx.get(f"{API}/api/subscriptions/usage", headers=h)
    if r.status_code == 200:
        usage = r.json()
        resources = usage.get("usage", {})
        for rk in ["crawl:scrape", "crawl:search"]:
            if rk in resources:
                rv = resources[rk]
                log("PASS", f"Usage after ops {rk}", f"{rv['used']}/{rv['limit']}")

    # 9. Plans listing
    r = httpx.get(f"{API}/api/subscriptions/plans")
    if r.status_code == 200:
        plans = r.json().get("plans", [])
        log("PASS", "GET /subscriptions/plans", f"{len(plans)} plans available")
    else:
        log("FAIL", "GET /subscriptions/plans", f"status={r.status_code}")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  Kontext — CROSS-USER INTEGRATION TEST")
    print("=" * 60)

    for plan, creds in USERS.items():
        test_user(plan, creds)

    # Summary
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    failed = sum(1 for r in RESULTS if r["status"] == "FAIL")
    blocked = sum(1 for r in RESULTS if r["status"] == "BLOCKED")
    warned = sum(1 for r in RESULTS if r["status"] == "WARN")

    print(f"\n{'='*60}")
    print(f"  RESULTS: {passed} passed, {failed} failed, {blocked} blocked, {warned} warnings")
    print(f"{'='*60}\n")

    sys.exit(0 if failed == 0 else 1)
