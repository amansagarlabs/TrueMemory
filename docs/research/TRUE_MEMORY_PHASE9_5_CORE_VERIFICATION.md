# Phase 9.5 Core Verification

## Shared implementation

The canonical core entry point is `backend/services/memory_core.py`:
`MemoryClient` is the transport-facing facade and `MemoryCore` is the domain
boundary. REST and hosted MCP instantiate that facade. Python and TypeScript
SDKs are HTTP clients, so they reach the same REST boundary rather than owning
memory behavior.

The repository adapter is `SQLiteMemoryRepository`, with durable workspace
operations delegated to the existing PostgreSQL store. Retrieval uses the
existing L1/L2 hybrid path and temporal reasoning. Governance remains in the
existing Governor/extraction pipeline; authorization is enforced at the API,
MCP boundary, and core context. Telemetry is emitted by the existing
observation/audit services.

## Evidence and limits

Static architecture verification: VERIFIED. TypeScript SDK build: VERIFIED.
Live semantic equivalence across all four interfaces: NOT VERIFIED until a
running authenticated service and database are exercised. Direct Claude Code
and Codex execution: NOT VERIFIED; MCP protocol support must not be presented
as product-level validation.

`agent_id`, provider, and model are execution/provenance metadata. User and
workspace/project scope determine ownership. Agent-private storage is only
created when an explicit agent scope is supplied.

L5 adaptive learning remains NOT IMPLEMENTED.
