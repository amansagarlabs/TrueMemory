"""Small measured provider baseline; separates HTTP/MCP transport from SDK calls."""
from __future__ import annotations
import asyncio, json, os, statistics, time, urllib.request, uuid
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1] / "packages" / "truememory-memory" / "src"))
from truememory_memory import TrueMemory

BASE = os.getenv("TM_BASE_URL", "http://localhost:8000")
TOKEN = os.environ["TM_TOKEN"]
WS, AGENT = os.environ["TM_WS"], os.environ["TM_AGENT"]

def raw(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as response: return response.read()

def mcp(name, arguments, request_id):
    body = {"jsonrpc":"2.0", "id":request_id, "method":"tools/call", "params":{"name":name, "arguments":arguments}}
    req = urllib.request.Request(BASE + "/mcp", data=json.dumps(body).encode(), method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=15) as response: return response.read()

def percentile(values, p):
    return sorted(values)[min(len(values)-1, round((len(values)-1) * p / 100))]

async def main():
    key = "bench-" + uuid.uuid4().hex[:8]
    scope = {"workspace_id": WS, "agent_id": AGENT}
    raw("/v1/memories", {"key": key, "content": "benchmark", **scope})
    sdk = TrueMemory(TOKEN, base_url=BASE)
    samples = {"rest_ms": [], "mcp_ms": [], "python_sdk_ms": []}
    for _ in range(10):
        start = time.perf_counter(); raw("/v1/memories/retrieve", {"query": key, **scope}); samples["rest_ms"].append((time.perf_counter()-start)*1000)
        start = time.perf_counter(); mcp("memory_retrieve", {"query": key, **scope}, _ + 1); samples["mcp_ms"].append((time.perf_counter()-start)*1000)
        start = time.perf_counter(); await sdk.retrieve(key, **scope); samples["python_sdk_ms"].append((time.perf_counter()-start)*1000)
    await sdk.forget(f"profile:workspace:{WS}:{key}", **scope)
    print(json.dumps({name: {"p50": round(percentile(values,50),2), "p95": round(percentile(values,95),2), "p99": round(percentile(values,99),2)} for name, values in samples.items()}))

if __name__ == "__main__": asyncio.run(main())
