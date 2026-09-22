# TrueMemory Phase 11.8 — Memory Evolution

Status: **PARTIAL**.

The existing `/memory` page now includes an explicit experimental Memory Evolution panel. Users enter deterministic episode fixtures, request a preview, inspect the candidate ID/evidence/reason, and explicitly approve a commit. Commit results are rendered as committed, unchanged, stale, or rejected; stale results do not retry automatically. The backend preview re-reads current memory and the commit endpoint recomputes the candidate before routing through Governor, ConflictResolver and MemoryClient.

The UI deliberately does not expose internal scores by default and does not claim adaptive learning. Full revision-history/provenance panels, disposable authenticated browser E2E, and production performance measurements remain unverified.
