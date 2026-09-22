# Phase 10.3B Portability Implementation

Implemented `backend/services/portable_memory.py` as the single semantic serializer/validator. REST exposes `POST /v1/memory/export` and `POST /v1/memory/import`; the Python and TypeScript SDKs call those endpoints. The import path validates format, version, required fields, revisions and relationship references before mutation, then writes through `MemoryClient.remember`, preserving the existing governance/storage boundary.

Security policy: portable ownership claims are treated as data, never authorization. The authenticated principal and token bindings determine the destination owner/scope. Export uses the authenticated principal and authorized workspace binding. Current limitations are a 500-record export bound, no full transaction wrapper across multiple records, and no completed live cross-deployment/browser evidence.
