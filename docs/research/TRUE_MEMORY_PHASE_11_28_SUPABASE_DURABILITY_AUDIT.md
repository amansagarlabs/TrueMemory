# TrueMemory Phase 11.28 — Supabase Durability Audit

Date: 2026-09-24

## Outcome

The profile-memory repository now selects Supabase PostgreSQL when `DATABASE_URL` is configured. REST, MCP, Python, and agent calls share the same `MemoryClient` and therefore the same persisted row contract and public logical ID (`profile:<scope>:<key>`). SQLite remains only as an explicit local/test fallback when Postgres is not configured. A configured Postgres outage fails closed for profile-memory operations; it does not silently read or write a competing local profile store.

The repository migration is `backend/db/init/020_profile_memory_postgres.sql`. It adds profile scope, temporal/confidence/revision fields, revision history, scoped uniqueness that preserves artifact-key semantics, and RLS/default-deny grants. It has **not** been applied to production. The Supabase CLI is not installed, and Docker daemon access was denied, so the required isolated PostgreSQL migration/E2E verification could not be run here.

## Live Supabase evidence (read-only)

- Project: `TrueMemory`, ref `dawaodxmamuujrxuhsub`, healthy PostgreSQL 17, Singapore (`ap-southeast-1`).
- 45 public tables have RLS enabled; the checked `profile_memories`, `user_memories`, `messages`, `conversations`, and ingestion tables have no RLS policies. This matches the current architecture where the backend connects directly to Postgres and owns authorization. Keep these tables unexposed to browser clients unless an explicit ownership-policy design is added.
- Live `profile_memories` had zero rows when inspected; `user_memories` contained one row. Counts do not establish whether historical profile facts still exist in Render's ephemeral filesystem.
- `vector` is available but not installed; `citext` and `pgcrypto` are installed. No production extension or embedding schema was changed.
- The public `SECURITY DEFINER` function `rls_auto_enable()` is attached to a `ddl_command_end` event trigger for CREATE TABLE variants. Its broad execute grants should be reviewed and narrowed with care; this audit did not invoke it or alter grants.
- Supabase migrations exist in the hosted project, but this repository uses `backend/db/init/*.sql` and has no Supabase CLI migration directory. Normalize to a single migration source before production deployment rather than maintaining two divergent migration ledgers.

## Storage inventory

| Data class | Current source of truth | Durability/readiness |
| --- | --- | --- |
| Account/auth/session/token/profile/workspaces/projects | Supabase/Postgres | Durable; backend authorization remains authoritative. |
| Governed workspace memories, lifecycle, temporal provenance | Supabase `user_memories` | Durable Postgres path already exists; worker jobs/items/events/heartbeats are also Postgres-backed. No separate worker service appeared in Render's service inventory during the prior read-only check. |
| Profile memories and account-profile mirrors | SQLite before this change; Supabase `profile_memories` after deployment | Code change ready; production DB migration and Render deployment remain pending. |
| Conversation chat messages | Supabase when the caller resolves a Postgres user; SQLite fallback otherwise | Verify every production chat entry path supplies the resolved UUID; remove production fallback after rollout proves coverage. |
| Uploaded PDF/image binaries | Local `uploads/` paths | Not made durable by this phase. Migrate to Supabase Storage or another durable object store before claiming uploaded documents survive restarts. Keep Postgres for artifact metadata, not large binaries. |
| Curated knowledge base, code index, temporary extraction/benchmark files | JSON/local filesystem and process memory | Treat as source-controlled content, rebuildable indexes, or temporary artifacts—not canonical user memory. Any user-authored production knowledge needs a separately designed durable source. |
| Dense document vectors | Milvus/Zilliz for the document pipeline; memory L2 also computes embeddings transiently in process | Vector technology and embedding model remain unresolved. Supabase `pgvector` is not installed. |
| Hot memory cache, rate-limit shared state, worker queue | Postgres shared tables, bounded local cache fallback | Cache is not authoritative; the worker queue and checkpoints are durable. |
| Telemetry, audit, ingestion provenance | Postgres tables and structured logs | Audit the retention/PII policy; avoid duplicating full memory content in telemetry. |

## Vector decision

Do not create a vector column until we choose one canonical embedding model and record model/version and dimension per embedding. The configured local retrieval model is `all-MiniLM-L6-v2` (384 dimensions); the separate OpenAI embedding setting defaults to `text-embedding-3-small`, but the document pipeline uses `EMBEDDING_MODEL`/`EMBEDDING_DIMENSION`. Those vectors cannot be compared across models. Supabase documentation recommends explicitly enabling `vector` in the `extensions` schema and matching the declared dimension to the model. For now, Postgres rows remain canonical and current profile L2 retrieval may compute transient embeddings. Preserve Milvus document retrieval until a tested migration/reindex is designed.

## Rollout, migration, and rollback

1. Rotate the OpenRouter key shown in the user's `.env` context before any live testing. No key value is reproduced here.
2. Select one migration system: import/reconcile this additive migration into the hosted Supabase migration ledger, or move the existing `backend/db/init` history to Supabase CLI migrations. Do not apply both histories independently.
3. Apply the additive migration first in an isolated Postgres 17 database and run the full backend tests plus REST/MCP/Python same-row, temporal/history, forget, scope-isolation, restart, and export/import checks.
4. After migration, point the Render web service and a dedicated worker at the same Supabase project using server-only credentials. Never put a service-role/database secret in Vercel/browser env. Confirm Render's actual variable names/host fingerprint without printing secrets.
5. Deploy API and worker; perform synthetic writes using a disposable user and verify rows after API and worker restart. Check health, queue heartbeat, migration version, and a read-only query. Only then remove production SQLite fallback and migrate binaries to durable object storage.
6. Rollback app code to the prior release if behavior regresses. Keep additive columns/tables during rollback; do not drop them. Restore any pre-cutover data from an explicit, scoped export. Do not automatically merge stale local SQLite rows back after cutover because this could resurrect forgotten memories.

Current local profile tests: `26 passed` across `test_memory_core.py`, `test_profile_memory_store.py`, `test_memory_api.py`, and `test_memory_hybrid.py`. These are not a substitute for live-Postgres integration verification.

## Security and credential handling

The pasted OpenRouter credential should be considered exposed: revoke/rotate it at the provider, update only the required server-side Render secret, and remove the old value from local secret stores. Supabase is accessed by the backend's server-side `DATABASE_URL`; direct browser access remains denied. The live public-schema RLS advisor warnings and SECURITY DEFINER event-trigger grants require a separate reviewed security change. Avoid fetching full table contents during migration planning; use row counts, checksums, and scoped exports.

## Current blockers / not claimed complete

- Supabase CLI is missing and Docker daemon access is restricted; migration syntax and DB-backed integration were not verified locally.
- The migration has not been applied to Supabase; Render has not been redeployed, environment variables were not read, and no worker was created.
- Existing local/Render ephemeral profile records cannot be recovered or migrated from this read-only audit. Production Render was previously observed on the Free plan without a persistent disk; actual `MEMORY_DB_PATH` override was not visible.
- Conversation SQLite fallback and local uploaded files remain potential restart-loss paths; durable object storage and full cutover are future required work.
- Restore/export/import/restart acceptance has not been run for the migrated repository.
