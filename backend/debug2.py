import urllib.request, json

BASE = "http://127.0.0.1:8000"
TOKEN = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
WS = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def call(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(f"{BASE}{path}", data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

# Store
s, r = call("POST", "/v1/memory/store", {"key": "proj_db", "content": "Project X uses PostgreSQL.", "workspace_id": WS, "confidence": 0.9})
print(f"Store: {s} id={r.get('id')}")

# List
s, r = call("GET", "/v1/memories")
print(f"List: {s} count={len(r.get('items', []))}")

# Search
s, r = call("POST", "/v1/memory/search", {"query": "database", "workspace_id": WS, "limit": 10})
print(f"Search: {s} count={r.get('count', 0)} items={r.get('items', [])[:1]}")

# Update
mid = f"profile:general|workspace:{WS}:proj_db"
s, r = call("POST", "/v1/memories/update", {"id": mid, "content": "Project X migrated to PostgreSQL 17.", "workspace_id": WS, "confidence": 0.95})
print(f"Update: {s} updated={r.get('updated')}")

# Search again
s, r = call("POST", "/v1/memory/search", {"query": "database", "workspace_id": WS, "limit": 10})
print(f"Search2: {s} count={r.get('count', 0)} items={r.get('items', [])[:1]}")

# Versions
s, r = call("POST", "/v1/memories/versions", {"workspace_id": WS, "memory_key": "proj_db"})
print(f"Versions: {s} count={r.get('count', 0)}")
