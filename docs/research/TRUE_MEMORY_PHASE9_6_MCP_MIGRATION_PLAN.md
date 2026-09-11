# MCP Migration Plan

Decision: DEFER migration; retain current `2025-03-26` JSON-RPC path while
adding contract tests. Target `2026-07-28` is a breaking, explicit opt-in
revision with stateless requests, changed discovery, header routing, and
authorization changes.

Migration gate: protocol fixture tests, auth tests, tool schema snapshots,
dual-client interoperability, and rollback to the existing `/mcp` handler.
No Tasks extension is needed for synchronous memory operations.

Reference: https://blog.modelcontextprotocol.io/posts/2026-07-28/
