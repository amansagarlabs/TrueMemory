import urllib.request, json

BASE = "http://127.0.0.1:8000"
TOKEN = "knt_pZOULE2tlYXVsOBeokYQNXYRqsoxy4l96Ylg3K3Lho_yu0UFfn7XHIxoGE6vv9Vf"
WS = "96b143b1-5169-4f5e-a863-b9e54c7ccccf"
headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def call(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

# Store
s, r = call("POST", "/v1/memory/store", {"key": "debug_key", "content": "debug content ABC", "workspace_id": WS})
print(f"Store: {s} {r}")

# Search
s, r = call("POST", "/v1/memory/search", {"query": "debug", "workspace_id": WS, "limit": 10})
print(f"Search: {s} count={r.get('count', 0)} items={r.get('items', [])[:2]}")

# List
s, r = call("GET", "/v1/memories")
print(f"List: {s} count={r.get('count', len(r.get('items', [])))} items={len(r.get('items', []))}")

# Current state
s, r = call("POST", "/v1/memory/current-state", {"workspace_id": WS})
print(f"CurrentState: {s} count={r.get('count', 0)}")
