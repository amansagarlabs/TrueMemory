"""Compare raw HTTP and Python SDK semantics over the provider contract."""
from __future__ import annotations
import asyncio, json, os, urllib.request, uuid
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1] / "packages" / "truememory-memory" / "src"))
from truememory_memory import TrueMemory

BASE, TOKEN = os.environ["TM_BASE_URL"], os.environ["TM_TOKEN"]
WS, AGENT = os.environ["TM_WS"], os.environ["TM_AGENT"]
SCOPE = {"workspace_id": WS, "agent_id": AGENT}

def raw(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type":"application/json"})
    with urllib.request.urlopen(request, timeout=15) as response: return json.loads(response.read())

def shape(value):
    if isinstance(value, dict): return sorted(value.keys())
    return type(value).__name__

async def main():
    sdk = TrueMemory(TOKEN, base_url=BASE)
    key = "contract-" + uuid.uuid4().hex[:8]
    raw_store = raw("/v1/memories", "POST", {"key":key, "content":"before", **SCOPE})
    sdk_retrieve = await sdk.retrieve(key, **SCOPE)
    raw_retrieve = raw("/v1/memories/retrieve", "POST", {"query":key, **SCOPE})
    assert sdk_retrieve["count"] == raw_retrieve["count"] and sdk_retrieve["items"][0]["content"] == raw_retrieve["items"][0]["content"]
    memory_id = f"profile:workspace:{WS}:{key}"
    sdk_update = await sdk.update(memory_id, "after", **SCOPE)
    raw_search = raw("/v1/memories/search", "POST", {"query":key, **SCOPE})
    assert sdk_update.get("updated") is True and raw_search["items"] and raw_search["items"][0]["content"] == "after", (sdk_update, raw_search)
    raw_profile = raw("/v1/memories?workspace_id=" + WS + "&agent_id=" + AGENT, "GET")
    sdk_profile = await sdk.profile(**SCOPE)
    assert shape(raw_profile) == shape(sdk_profile)
    assert (await sdk.health())["status"] == raw("/v1/memory/health")["status"] == "ok"
    assert isinstance(await sdk.usage(), dict) and isinstance(raw("/v1/memory/metrics"), dict)
    assert raw("/v1/memories/forget", "POST", {"id":memory_id, **SCOPE})["forgotten"]
    assert (await sdk.retrieve(key, **SCOPE))["count"] == 0
    print(json.dumps({"status":"ok", "operations":["remember","retrieve","search","update","forget","profile","health","usage"], "raw_store":raw_store["saved"], "parity":"raw-http/python-sdk"}))

if __name__ == "__main__": asyncio.run(main())
