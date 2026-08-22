"""Exercise the existing credential onboarding flow without importing app internals."""
import json, os, urllib.error, urllib.request

base, token, workspace, agent = os.environ["TM_BASE_URL"], os.environ["TM_TOKEN"], os.environ["TM_WS"], os.environ["TM_AGENT"]

def call(path, method="GET", bearer=token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base + path, data=data, method=method, headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response: return response.status, json.loads(response.read())

status, created = call("/api/auth/api-tokens", "POST", body={"name":"TrueMemory onboarding probe", "scopes":["memory"], "expires_days":1, "workspace_id":workspace, "agent_id":agent})
assert status == 200 and created.get("token") and created.get("id")
status, health = call("/v1/memory/health", bearer=created["token"])
assert status == 200 and health["status"] == "ok"
status, revoked = call(f"/api/auth/api-tokens/{created['id']}", "DELETE")
assert status == 200 and revoked["revoked"] is True
try:
    call("/v1/memories/retrieve", "POST", bearer=created["token"], body={"query":"revocation-probe", "workspace_id":workspace, "agent_id":agent})
except urllib.error.HTTPError as error:
    assert error.code == 401
else:
    raise AssertionError("revoked onboarding token was accepted")
print(json.dumps({"status":"ok", "credential":"created-scoped-tested-revoked", "endpoint":base, "mcp_endpoint":base + "/mcp", "typescript":"@truememory/memory", "python":"truememory-memory"}))
