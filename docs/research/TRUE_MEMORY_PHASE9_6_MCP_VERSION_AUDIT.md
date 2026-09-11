# Phase 9.6 MCP Version Audit

| Capability | Current | 2026-07-28 | Gap | Action |
|---|---|---|---|---|
| lifecycle | JSON-RPC initialize/initialized | Stateless; no handshake required | present | retain compatibility; migrate later |
| discovery | `tools/list` | `server/discover` plus tools/list | partial | add contract test |
| tools/call | implemented | implemented with self-describing requests | headers/meta absent | defer migration |
| auth | Bearer/API key + boundary checks | OAuth hardening | protocol gap | retain server auth; audit separately |
| routing | URL only | optional method/name headers | absent | defer |
| cache hints | absent | supported | absent | defer |
| annotations | absent | descriptive tool metadata | absent | add when SDK/server path supports it |
| tasks | absent | extension | intentionally absent | no async memory operation requires it |

Current advertised protocol: `2025-03-26` in the hosted endpoint. The
TypeScript server uses `@modelcontextprotocol/sdk` through the root dependency
tree; exact resolved version must be captured from `package-lock.json` during
deployment. No blind migration performed.

Reference: [MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/).
