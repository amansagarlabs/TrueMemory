# TrueMemory Phase 11.7 — Consolidation Commit

Status: **PARTIAL — controlled experimental commit path implemented**.

`POST /api/v1/memory/consolidate/commit` accepts approval plus source experiences, recomputes the candidate, verifies its deterministic identity, re-reads current memory, invokes Governor and ConflictResolver, and writes through `MemoryClient`. It returns `committed`, `unchanged`, `rejected`, or `stale`. The route is unavailable while `MEMORY_CONSOLIDATION_MODE=disabled`.

Client payloads cannot choose owner or authorization scope. Supporting experience IDs are included in the consolidation source string. Full relational provenance/revision persistence remains dependent on the existing storage deployment.
