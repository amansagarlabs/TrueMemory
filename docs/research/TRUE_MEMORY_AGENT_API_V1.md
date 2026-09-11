# TrueMemory Agent API v1

All operations require authenticated memory scope. The server derives user
ownership from authentication and rejects token-bound workspace or agent scope
changes. Responses are structured memory records with source, scope, temporal
fields, confidence, and revision when available.

REST canonical paths are POST `/v1/memory/search`, `/retrieve`, `/store`,
`/forget`, `/current-state`, `/timeline`, and `/related`. MCP exposes the same
capabilities as tools. SDKs are thin HTTP clients and contain no memory logic.

Errors use HTTP 401/403/409/422/429 and 5xx semantics; MCP maps these to JSON-RPC
errors. Interface telemetry must identify `mcp`, `sdk`, `rest`, or `internal`.
