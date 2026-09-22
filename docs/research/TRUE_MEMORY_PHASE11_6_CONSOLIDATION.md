# TrueMemory Phase 11.6 — Consolidation

Status: **PARTIAL — deterministic experimental foundation**.

`backend/services/memory_consolidation.py` groups supported episodic facts by canonical key, preserves experience IDs, emits stability/novelty signals, invokes the existing Governor and ConflictResolver, and supports dry-run preview. It does not create a repository or write without an explicit commit callback. `MEMORY_CONSOLIDATION_MODE` defaults to `disabled`; `experimental` is deterministic only.

Current supported deterministic fixtures cover preferences, project databases and age. Broader extraction remains bounded and should expand only with tests.
