# TrueMemory Memory Notes

Memory Notes are human-readable source data, distinct from loss-minimizing Portable Memory v1. The API `POST /v1/memory/import/notes` previews extracted candidates by default and persists only explicitly selected indices.

The current conservative parser recognizes explicit user facts, preferences, project names and supported stack facts. Candidates include key, content, type, confidence, subject, segment locator and `source_type=memory_note`. Negations and ambiguous bare numbers are rejected. Persistence reuses `MemoryClient.remember`; it does not create a note-specific repository.

The endpoint is preview-first: extraction is not durable until a confirmation request includes selected candidates. Imported note text is data, not authorization or an administrative command. Full entity resolution, temporal note updates, relationship preview, UI flow and browser E2E remain follow-up work.
