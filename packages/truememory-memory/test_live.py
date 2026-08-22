import asyncio, os
from truememory_memory import TrueMemory

async def main():
    client = TrueMemory(api_key=os.environ["TM_TOKEN"], base_url="http://localhost:8000")
    key = "py-sdk-" + os.urandom(4).hex()
    assert (await client.health())["status"] == "ok"
    await client.remember(key, "Python SDK memory", workspace_id=os.environ["TM_WS"], agent_id=os.environ["TM_AGENT"])
    assert (await client.retrieve(key, workspace_id=os.environ["TM_WS"], agent_id=os.environ["TM_AGENT"]))["count"] == 1
    await client.forget(f"profile:workspace:{os.environ['TM_WS']}:{key}", workspace_id=os.environ["TM_WS"], agent_id=os.environ["TM_AGENT"])

asyncio.run(main())
