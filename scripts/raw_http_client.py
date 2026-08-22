"""Framework-free TrueMemory compatibility probe (stdlib HTTP + JSON only)."""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
import uuid


def request(base: str, token: str, path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base.rstrip("/") + path, data=body, method=method, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def main() -> int:
    base, token, workspace, agent = (os.environ.get(key) for key in ("TM_BASE_URL", "TM_TOKEN", "TM_WS", "TM_AGENT"))
    if not all((base, token, workspace, agent)):
        print("TM_BASE_URL, TM_TOKEN, TM_WS, and TM_AGENT are required", file=sys.stderr)
        return 2
    key = "raw-http-" + uuid.uuid4().hex[:10]
    scope = {"workspace_id": workspace, "agent_id": agent}
    assert request(base, token, "/v1/memory/health")[0] == 200
    assert request(base, token, "/v1/memories", "POST", {"key": key, "content": "raw HTTP value", **scope})[0] == 200
    status, result = request(base, token, "/v1/memories/retrieve", "POST", {"query": key, **scope})
    assert status == 200 and result["count"] >= 1
    memory_id = f"profile:workspace:{workspace}:{key}"
    assert request(base, token, "/v1/memories/forget", "POST", {"id": memory_id, **scope})[0] == 200
    print(json.dumps({"status": "ok", "key": key, "transport": "stdlib-http-json"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
