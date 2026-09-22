# TrueMemory Phase 10.2 — Differentiation

TrueMemory should own an open, provider-neutral, agent-neutral memory substrate rather than a branded agent surface.

| Property | Status | Evidence / boundary |
|---|---|---|
| Open-source memory substrate | PARTIALLY REAL | Repository, Docker and SDKs exist; packaging/release guarantees are not audited here |
| Provider-neutral memory | REAL | Provider interfaces and L4 architecture; live proof remains partial |
| Agent-neutral memory | REAL | REST, MCP, Python and TypeScript surfaces; named clients not directly validated |
| Cross-agent persistence | REAL | Scope model and generic E2E evidence |
| Portable self-hosted memory | PARTIALLY REAL | Docker/local deployment; export format is not yet a stable contract |
| MCP-first interoperability | REAL | MCP implementation and tests |
| Temporal/versioned memory | REAL | Revisions, supersession, valid intervals and timeline retrieval |
| Transparent governance | REAL | Governor decisions, conflict observations, audit events |
| Source-aware memory | PARTIALLY REAL | Sources/provenance exist; unified source envelope is missing |
| Agent behavior observability | REAL | Run observations, tool-loop, context and influence telemetry |
| Pluggable storage | PARTIALLY REAL | Core/repository boundary exists; production adapters are limited |
| Pluggable retrieval | PARTIALLY REAL | L1/L2/hybrid interfaces exist; retrieval policy is still implementation-coupled |

The product boundary is layered: a memory API at the contract layer, an agent memory runtime for governance/retrieval/observation, and memory infrastructure for deployment/storage. The runtime is the differentiating engineering layer; the API and infrastructure make it portable.

The source-intelligence direction should be a normalized `SourceEnvelope → Experience → MemoryCandidate → governed Memory` pipeline. It should support documents, URLs, connectors, agent observations and tool results without putting source-specific logic in MemoryCore.

Do not build a graph database, automatic learning policy, or vendor-specific core paths as differentiation work.

