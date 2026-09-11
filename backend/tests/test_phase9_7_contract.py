from app.routes.memory_mcp import TOOLS

def test_canonical_mcp_contract():
    names = {tool["name"] for tool in TOOLS}
    assert {"memory_search", "memory_retrieve", "memory_store", "memory_forget", "memory_current_state", "memory_timeline", "memory_related"} <= names
    timeline = next(tool for tool in TOOLS if tool["name"] == "memory_timeline")
    props = timeline["inputSchema"]["properties"]
    assert {"memory_key", "start", "end", "as_of", "order", "limit"} <= props.keys()
