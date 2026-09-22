# Portable Memory Format v1

Canonical format identifier: `truememory-memory-v1`. The backend serializer and REST endpoints are implemented. Export is semantic and excludes storage internals. Import validates the complete document before writes and maps ownership to the authenticated principal.

```json
{
  "format": "truememory.memory.v1",
  "memory_id": "...",
  "content": "...",
  "type": "fact",
  "scope": {"tenant_id": "...", "user_id": "...", "workspace_id": "...", "agent_id": "..."},
  "revision": 1,
  "valid_from": null,
  "valid_until": null,
  "source": {"type": "user_message", "id": "...", "locator": null},
  "provenance": {"observed_at": "...", "ingested_at": "...", "actor_type": "user"},
  "relationships": []
}
```

Import must re-enter authorization, Governor and conflict resolution. Storage-internal vector ids and credentials are excluded.

The REST endpoints are `POST /v1/memory/export` and `POST /v1/memory/import`. SDK clients expose `export_memory`/`import_memory` and `exportMemory`/`importMemory`. Current export is bounded to 500 records; pagination and full transactional import remain follow-up work.
