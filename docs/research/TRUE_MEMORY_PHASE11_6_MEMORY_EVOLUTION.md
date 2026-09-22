# TrueMemory Phase 11.6 — Memory Evolution

The experimental flow is:

`Experience → deterministic candidate → Governor → ConflictResolver → explicit MemoryCore commit`

Candidates retain supporting experience IDs. The service emits lifecycle-shaped candidate/consolidated events and metrics without introducing a broker or autonomous background learner.
