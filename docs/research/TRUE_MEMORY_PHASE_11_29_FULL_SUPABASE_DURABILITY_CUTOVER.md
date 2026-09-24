# TrueMemory Phase 11.29 Full Supabase Durability Cutover

Date: 2026-09-24

## Executive Summary

Phase 11.29 is **PARTIAL**. Production Supabase is now directly confirmed as the `TrueMemory` project (`dawaodxmamuujrxuhsub`), and Render's active service is confirmed as `TrueMemory` (`srv-dalsihu7bikc73aerl20`). Live read-only inspection finds durable relational rows already in Supabase: 26 messages, 7 conversations, 1 artifact, 1 `user_memories` row, and 0 `profile_memories` rows at inspection time. The hosted migration ledger ends at `20260918113701 add_polar_checkouts`.

Local code now fails closed for production chat/profile/workspace reads and writes instead of falling back to SQLite; production artifact upload requires Cloudinary and all file readers use a storage adapter. Cloudinary credentials were not supplied, its SDK isn't installed in this workstation environment, no Cloudinary upload/download/restart test has run, and Render has not been changed or deployed. Profile migrations remain unapplied. Therefore this is not production-ready and no cutover is claimed.

## Phase 11.28 Baseline

Phase 11.28 introduced a PostgreSQL profile-memory adapter, an additive profile-memory schema change, and tests. It reported 27 focused tests passing; no live migration or database-backed integration verification was available then. This phase caught and fixed a double `RELEASE SAVEPOINT` in profile upsert and several remaining fail-open cache/chat paths. Worktree changes from previous phases were preserved.

## Storage Inventory

| Data | Current storage | Durable? | Production used? | Canonical? | Target |
|---|---|---:|---:|---:|---|
| Account/profile/session/API tokens | Supabase `users`, `user_profiles`, `user_sessions`, `api_tokens` | Yes | Yes, based on live project/schema | Yes | Supabase Postgres |
| Profile memory | Supabase `profile_memories`; optional SQLite in development/tests | Yes in DB; no live profile rows observed | Code path is Postgres when configured; production request not exercised | Intended canonical | Supabase Postgres |
| User/workspace/project/task memory | Supabase `user_memories` | Yes | Live row and schema observed | Yes | Supabase Postgres |
| Chat history | Supabase `messages` joined to `conversations`; legacy SQLite functions remain for local/dev | Yes in Supabase; local DB may be ephemeral | Live 26 messages/7 conversations | `messages` + `conversations` | Supabase Postgres |
| Episodic state | Ingestion source/item records, provenance and temporal fields in Postgres; some runtime collector objects are request-local | Mixed | Worker/service runtime not production-verified | No separate episode table found | Supabase Postgres rows |
| Semantic/current/history state | `user_memories` lifecycle/revision/supersession/temporal/provenance columns; profile revision table is pending migration | Yes when committed | Schema partly live; behavior not end-to-end checked | `user_memories` | Supabase Postgres |
| Entities/relationships | `sources`, `source_relations`, `claim_evidence` plus project/workspace relationship records | Yes | Schema in live inventory; feature flow not checked | Existing tables | Supabase Postgres |
| Embeddings | Milvus/Zilliz for document RAG; memory L2 can compute transient embeddings; no canonical Postgres vector column | External/transient | Configurable; live service use not proven | Deferred | Deferred pending model/dimension/workload decision |
| Jobs/items/events/worker heartbeats | `memory_ingestion_jobs`, `memory_ingestion_items`, `memory_ingestion_events`, `memory_ingestion_worker_heartbeats`; coding-worker tables | Yes | Live schema; no ingestion job/heartbeat rows observed | These Postgres tables | Supabase Postgres |
| Telemetry/audit | `audit_logs`, `usage_records`, `usage_aggregates`; chat message metadata and structured logs. `RunTelemetryCollector` is in-memory and logged | Partly durable | Product paths exist; full persistence not verified | No universal telemetry ledger found | Supabase Postgres where durable; logs for diagnostics |
| Consolidation | Deterministic consolidation flows through existing user-memory rows and ingestion job/event state; candidate/report objects can be transient | Result persists if approved/committed; preview is transient | Mode defaults disabled; production not tested | Existing memory rows/jobs | Supabase Postgres |
| Uploaded files | New adapter: authenticated Cloudinary assets; old records/local development paths remain possible | Cloudinary durable once configured; local path is not Render durable | Not deployed/verified | Existing `artifacts` row for metadata | Cloudinary binaries + Supabase metadata |
| Curated knowledge/indexes/temporary workspaces | Source-controlled JSON/knowledge assets, rebuildable process indexes, temp files and coding workspaces | Not all durable | Yes as application assets/workspaces | Not user memory canonical state | Classify as source, cache, temporary or explicitly user workspace; user uploads must use Cloudinary |

## SQLite Audit

`backend/services/memory_store.py` is the SQLite adapter for local `conversation_messages`, `profile_memories`, `profile_memory_revisions`, and `local_artifacts`. It is used by tests, local Memory API/dev mode, and the benchmark. Production startup selects PostgreSQL and now checks runtime configuration. `_connect()` rejects access whenever a `DATABASE_URL` is configured, preventing accidental SQLite calls alongside Postgres. `memory_main.py` also refuses production/staging startup without psycopg/Postgres. Production chat no longer imports local message write/update helpers, and its only local artifact lookup is behind the development-only branch. SQLite remains for explicit development and tests, not as a production fallback.

## Chat SQLite Fallback

SQLite existed to make local single-process development possible before the hosted Postgres path was universal. It stored durable-by-application-intent chat rows, but on Render its filesystem is ephemeral. It was production-reachable when a production request had no usable Postgres identity or when reads silently substituted empty/local state. Production chat now rejects missing database configuration, catches identity/read errors, fails if history reads fail, and refuses to continue answer generation after initial history persistence fails. The history endpoint returns 503 rather than an empty successful list when Postgres is unavailable. Request-local hot cache does not substitute for Postgres in production; shared-cache connection errors surface rather than falling back to process-local cache.

## Chat History

Canonical live path: `messages` rows associated with `conversations`. Writers: `save_message` and `update_streaming_message` in `services/postgres_store.py`; reader: `load_conversation_messages`. The SQLite adapter is local/test-only. Live counts were 26 messages and 7 conversations on 2026-09-24. No production SQL writes were performed in this phase.

## Supabase PostgreSQL

Read-only integration evidence: project `TrueMemory`, ref `dawaodxmamuujrxuhsub`, organization slug `zzearbkjyuglqbuqhwdl`, region `ap-southeast-1`, status `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.166`. Organization plan is Free (`tier_free`). The current app connection URL used by Render was not retrieved, so the service-to-project binding is strongly indicated by user confirmation and current integration target, but not verified from live Render secrets or a successful Render query.

## Supabase Schema

Live migration history ends with `20260918113701 add_polar_checkouts`. The local profile changes and this phase's `021_artifact_storage_metadata.sql` are not in that ledger. Live `artifacts` already has `workspace_id`, `project_id`, and `checksum_sha256`; `deleted_at` is absent. Live `profile_memories` has `user_id`, `artifact_id`, `profile_key`, `content`, `source`, `created_at`, and `updated_at`, but lacks `doc_id`, validity fields, confidence, and revision. `profile_memory_revisions` was not found. Live counts: artifacts 1; conversations 7; messages 26; profile memories 0; user memories 1; ingestion jobs/items/events/heartbeats each 0. These are point-in-time counts, not an export/recovery guarantee.

All 45 public tables have RLS enabled; checked business tables have no policies. The backend must continue to use a server-only database role with application ownership checks; never expose direct browser table access under the current policy model. Security advisor reports 45 RLS-enabled/no-policy notices, public-schema `citext`, and externally executable SECURITY DEFINER `public.rls_auto_enable()` warnings. They were not altered in this phase.

## Profile Memory

REST/MCP/Python/agent routes share `MemoryClient` and `PostgresProfileMemoryRepository` when Postgres is configured. Stable logical IDs are `profile:<scope>:<key>`. SQLite is explicit local/test-only. Profile list/search/history now bypass stale in-process caches on Postgres, and unavailable Postgres raises instead of selecting local state. Savepoint history/upsert logic was corrected locally. Migration `020_profile_memory_postgres.sql` is not applied, so production profile-memory schema parity and live profile CRUD/restart are **NOT VERIFIED**.

## MemoryCore Storage

`MemoryClient` remains the common facade. Existing Postgres-backed profile and governed user/workspace-memory paths are authoritative when configured. The implementation uses a bounded local L0 cache in local development and a shared Postgres cache when available. Production with configured Postgres does not use local cache as a fallback on shared-cache/database errors. One canonical logical memory ID contract exists for profile rows; worker/telemetry/export consistency across every category has not been end-to-end verified.

## Jobs

Live job/item/event/worker-heartbeat tables exist in the same Supabase project. They were empty at inspection time. Local schema/code includes lease, retry, checkpoint and idempotency handling. There is no Render worker service in the current Render inventory, and no production worker recovery run was performed. Durable worker recovery is **NOT VERIFIED**.

## Telemetry

Audit logs, usage records/aggregates, ingestion events, message metadata and platform logs provide several durable/diagnostic paths. `RunTelemetryCollector` accumulates observations/decisions/actions in request memory and emits a structured log summary; there is no generic durable `memory_telemetry` table in the local migration set. Do not describe every collector observation as a persisted database record.

## Consolidation

Consolidation is deterministic and conservative. Preview/candidate/report objects can be transient; approved durable memories flow to existing `user_memories`, with ingestion jobs/events providing orchestration state. No separate generic consolidation/evidence ledger was found. The configured mode defaults to disabled. Candidate/evidence/approval/revision restart acceptance was not run.

## Provenance

Durable provenance is represented by existing `user_memories.provenance`, `memory_ingestion_items.provenance`, source snapshots/relations and claim evidence, not a newly introduced generic provenance store. Live schema contains these existing structures; application-level cross-transport checks remain partial.

## Uploaded Files

Current writers are authenticated `/api/upload` and `/api/ocr/image`; old `save_pdf_upload` wrote `backend/uploads`. Readers include authenticated artifact content/preview, chat image inputs, the pipeline visualization, and document ingestion-worker extraction. Render local filesystem does not survive replacement/redeploy on the Free service. The local development/test adapter remains. No local/Render legacy file inventory was available from the live service, so the production migration set and any need to copy old local binaries are unknown.

## Supabase Storage

User-directed target is Cloudinary (not Supabase Storage). New adapter in `backend/services/artifact_storage.py` stores files as `authenticated` Cloudinary assets under the configured `CLOUDINARY_FOLDER` and an artifact UUID path. The existing `artifacts` table remains metadata source of truth; it already holds filename, owner, scope, path, MIME, size and SHA-256. Local `021_artifact_storage_metadata.sql` adds a soft-delete timestamp/index. Production upload requires Cloudinary; legacy local storage paths are rejected in production. Content/preview routes authorize artifact ownership through the backend DB, then proxy bytes; they do not expose service credentials or durable public URLs. Workers use the same metadata lookup and materialize a request/job-scoped temp file for path-only parsers. No new file table is created.

Cloudinary authenticated delivery protects both original assets and derived assets. The adapter uses short-lived signed backend download access and does not return the URL as an authorization mechanism. No production bucket/folder/asset has been created. Cloudinary cloud name/API key/API secret are absent; SDK was declared in `backend/requirements.txt` but not installed into this Python environment. Upload/download/delete API calls and authenticated-vs-unauthorized tests remain unverified. The user should provide credentials only via a secret manager/Render environment, never in source or chat.

## Render Filesystem Audit

Active service: `TrueMemory`, `srv-dalsihu7bikc73aerl20`, `https://truememory.onrender.com`, Free plan, Oregon, one instance, repo `amansagarlabs/TrueMemory`, branch `master`, root `backend`, Dockerfile, health path `/health`, auto-deploy on commit. The separate `TrueMemory-backend` service is suspended. No worker is listed. Render environment values were not read. `docker-compose.yml` still mounts `backend/uploads`, `backend/data`, knowledge assets, coding workspaces and model caches for local development. Production file uploads must not rely on those mounts; coding workspace durability is a separate user workspace feature and is not claimed migrated by this phase.

## Vector Database

Document retrieval currently integrates Milvus/Zilliz (`pymilvus==2.5.4`); memory L2 retrieval can compute embeddings transiently. The local configured embedding default is `all-MiniLM-L6-v2` / 384 dimensions, while another OpenAI embedding setting defaults to `text-embedding-3-small`; the workloads don't yet share a single recorded embedding contract. No vector migration or second vector system was introduced.

## pgvector Evaluation

Live Supabase lists `vector` as available (`0.8.2`) but it is not installed. Classification: **MIGRATE LATER / DEFERRED** until model, dimensions, corpus size, filter/query patterns, and representative recall/latency are measured. Do not enable the extension as part of this durability phase.

## Migration Plan

The existing repository workflow is `backend/db/init/*.sql`, replayed by `backend/scripts/init_postgres.py` in sorted order with autocommit; this is not a migration ledger and must not be replayed blindly on production. Supabase's hosted ledger already has timestamped names and drift from current repository files. Before any DDL, establish a live-schema baseline, reconcile existing migrations, choose one versioned workflow, run on isolated Postgres 17, compare constraints/indexes/grants/data, then apply only reviewed additive SQL. `020_profile_memory_postgres.sql` and `021_artifact_storage_metadata.sql` need that reconciliation.

## Migration Execution

No production DDL, object storage setup, or live row write occurred in Phase 11.29. `020` profile migration and `021` artifact metadata migration remain local and **NOT APPLIED**. No production migration result is claimed.

## Restart Durability

Local contract tests exercise development file round-trip through the adapter's local branch, plus guards that production refuses local paths. They do not simulate Render restart or Cloudinary. Production file and profile/chat restart acceptance is **NOT VERIFIED**. Live chat rows in Supabase demonstrate that some existing chat state is already in the canonical DB, but do not prove this new app version is deployed or that history survives a newly deployed request.

## Worker

Supabase ingestion tables and worker heartbeat schema exist. Render has no separate worker service in the listed services. Existing backend image can run worker entrypoints, but there is no current production worker evidence; worker is **NOT VERIFIED** (not optional for the architecture's ingestion/recovery objective).

## Worker Recovery

No claim/kill/lease-expiry/reclaim test ran. Local phase 11.25 disposable recovery script exists, but its result is not evidence of the current Render worker. **NOT VERIFIED**.

## MCP

MCP code calls the same `MemoryClient`/`MemoryCore` as REST. Local memory/API regression tests pass. Live cross-agent, auth-scope, current-state/history and REST↔MCP persistence against the confirmed deployed backend were not run. Current-protocol protected-resource OAuth discovery remains partial per prior phase audit. MCP is **PARTIAL**.

## MCP Cross-Agent

No new cross-agent production test ran. Existing automated/live MCP release test requires a running backend and was not runnable here. Isolation is locally tested by existing tests but production cross-agent persistence is **NOT VERIFIED**.

## REST/MCP Consistency

Both transports share `MemoryClient`, but production read/write equivalence and restart behavior were not observed in this phase. **NOT VERIFIED**.

## Vercel → Render → Supabase

Render service identity is confirmed, and the Supabase target project/schema are confirmed through direct integrations. Render's secret-bearing environment (including its actual `DATABASE_URL` target) was not inspected, and Vercel production was not queried. No end-to-end request proving Vercel→Render→this Supabase ref ran. **NOT VERIFIED**.

## Production Cutover

Not performed. Render remains on deployed `master`; no environment variables were changed and no deployment triggered. Cloudinary credentials are missing, migrations are unapplied, and current local changes are not deployed. No production health/memory/profile/chat/job/worker/MCP smoke test was made against the new code.

## Security

Backend authorization checks artifact owner before obtaining bytes; workspace/project scoping is stored in existing metadata and workspace/project membership validation remains in the upload route. Cloudinary objects use non-public authenticated delivery and obscure paths are not the security boundary. Production config requires server-only Cloudinary credentials. Supabase RLS policy warnings are substantial and must be contained by never exposing privileged connection credentials or direct browser data access. Review `rls_auto_enable()` execute grants and `citext` schema placement in a separate reviewed migration. No secret values were added to files or report.

## Credential Remediation

An OpenRouter credential was previously exposed in IDE context and remains **USER ACTION REQUIRED** until provider rotation is confirmed. Cloudinary secrets were not provided or copied. Do not paste secrets into chat or commit them; set Render values through its secret environment UI/integration after user supplies them securely.

## Backup / Recovery

The confirmed Supabase organization is Free tier. No paid-plan backup/PITR capability is inferred. This phase did not inspect an account-specific backup configuration or execute a restore. Treat automated backup retention/PITR as **NOT VERIFIED**; maintain an independently tested, encrypted, access-controlled export/restore process for application data and Cloudinary asset inventory/metadata. Render Free service storage is not a backup. Cloudinary media backup/retention terms for the account are not verified.

## Full Regression

- Backend full suite excluding the live service test: **556 passed, 15 skipped, 1 deselected**.
- Direct full-suite invocation: the sole failure was `test_live_mcp_release_matrix`, which waited 30 seconds for `http://127.0.0.1:8000/health`; no backend was running. It is environmental/not runnable in this invocation, not counted as a code regression.
- Focused artifact/chat/profile/cache/pipeline tests: **39 passed**.
- `compileall` for touched Python modules: **PASS** (bytecode cache redirected to a temporary path).
- `git diff --check`: **PASS** (Git emitted only LF→CRLF working-copy notices).
- Frontend typecheck/lint: **NOT RUN**; no frontend files changed.
- Cloudinary network/API, production Supabase E2E, worker recovery and Render deployment: **NOT RUN**.
- Latest full backend result: **556 passed, 15 skipped**; 1 live MCP test not runnable locally.

## Final Storage Matrix

| Data | Intended final store | Durable | Restart safe | Production verified |
|---|---|---:|---:|---:|
| Profile memory | Supabase PostgreSQL | Yes when migration applied | Expected, not tested | Partial (table exists, migration pending) |
| User/project/task memory | Supabase PostgreSQL | Yes | Schema supports it; restart not exercised | Partial |
| Chat history | Supabase PostgreSQL `messages`/`conversations` | Yes; 26 messages/7 conversations live | Existing rows durable; new code not tested | Partial |
| Episodic memory | Supabase PostgreSQL ingestion items/memory rows | Yes for committed rows | Not tested | Partial |
| Semantic/current/history | Supabase `user_memories`; profile history migration pending | Yes for committed rows | Not tested | Partial |
| Embeddings | Milvus/existing external RAG; Postgres deferred | External/transient | Not tested | Not verified |
| Entities/relationships | Supabase source/project/workspace relations | Yes | Not tested | Partial schema evidence |
| Jobs | Supabase ingestion/coding tables | Yes | Recovery not tested | Schema verified, worker absent |
| Telemetry | Supabase audit/usage/events plus logs; collector may be transient | Mixed | Not tested | Partial |
| Consolidation | Supabase approved memory rows and ingestion state | Committed result durable | Not tested | Not verified |
| Provenance | Supabase memory/item/source JSON and relation rows | Yes for persisted rows | Not tested | Partial |
| Uploaded files | Cloudinary authenticated folder | Intended; no credentials yet | Not tested | Not verified |

## Final Architecture

```text
Vercel frontend → Render API + worker → MemoryClient/MemoryCore → Supabase PostgreSQL
                                                    └──────────→ Cloudinary authenticated artifacts
```

The API authorizes users from Postgres metadata and proxies Cloudinary bytes. Render local disk is only for local development, temporary parser files, cache and explicitly noncanonical runtime workspaces; it is not the production upload source of truth.

## Remaining Gaps

- Supply Cloudinary cloud name/key/secret securely; install SDK through deployment build; test upload/download/auth isolation and worker retrieval, including restart.
- Reconcile and test profile migration `020` and artifact soft-delete migration `021` against a disposable Postgres 17 environment and the live migration ledger; do not replay init SQL blindly.
- Decide/migrate any legacy production local files only after inventory; old local metadata paths will return 503 until copied and verified.
- Verify Render's actual DB connection target and secure envs; create/verify the memory ingestion worker; run worker recovery tests.
- Deploy through reviewed existing workflow, then exercise safe disposable memory/profile/chat/job/MCP writes and reads after a normal deploy/restart.
- Confirm OpenRouter rotation; inspect actual backup/PITR configuration and conduct a restore drill; address Supabase security advisor findings with separate review.
- Full cross-agent/MCP protected-resource OAuth, REST↔MCP equality, Vercel→Render→Supabase, frontend checks, zero-local-DB acceptance and current/history conflict scenarios remain outstanding.

## Production Readiness

Not ready for cutover. Local backend suite passes excluding one live-server-dependent check, but migrations, Cloudinary, Render env/deploy, worker and E2E durability are incomplete.

## Final Status

Phase:
11.29

Status:
PARTIAL

Supabase PostgreSQL:
VERIFIED (target project confirmed; Render connection binding not verified)

Supabase schema:
PARTIAL

Profile memory:
NOT VERIFIED

Chat history:
SUPABASE (live rows observed); new code/restart not verified

SQLite production usage:
NONE in patched code path; deployed runtime not verified

SQLite fallback:
REMOVED from production chat; development/test adapter remains

Other durable database:
NONE intended; Milvus remains an external vector index, not relational state

Persistent uploaded files:
CLOUDINARY intended; not verified or configured

Render durable filesystem dependency:
PRESENT in current deployed version for uploads (local code now rejects production local artifacts)

Vector storage:
EXTERNAL / DEFERRED

Worker:
NOT VERIFIED

Worker recovery:
NOT VERIFIED

MCP:
PARTIAL

MCP authentication:
PARTIAL (application bearer scope checks; current OAuth discovery not verified)

MCP isolation:
NOT VERIFIED in production

Cross-agent:
NOT VERIFIED

REST/MCP consistency:
NOT VERIFIED in production

Restart durability:
NOT VERIFIED end-to-end

Zero-local-database operation:
NOT VERIFIED

DecisionEngine:
PARTIAL (backend tests pass; production path not exercised)

OPA-Wasm:
NOT VERIFIED live

Groq:
NOT VERIFIED live

OpenRouter credential:
USER ACTION REQUIRED

Production cutover:
NOT VERIFIED

Backend regression:
556 passed, 15 skipped, 1 live MCP test deselected after backend-unavailable timeout

Frontend regression:
NOT RUN

New failures:
None in backend suite excluding environment-dependent live MCP test

Pre-existing/environmental failures:
Live MCP release test couldn't connect to `127.0.0.1:8000`

Core blockers:
Profile migration not applied; Cloudinary not configured/verified; legacy files unknown; zero-local-database and restart checks pending

Operational blockers:
No Render worker; Render DB binding/env and production deployment not verified; account-specific backup/restore not verified

Deferred items:
pgvector, generic durable telemetry ledger, consolidation candidate ledger, MCP current-spec OAuth discovery

Final recommendation:
Do not declare or deploy the production cutover yet. Securely configure Cloudinary, validate migrations on isolated Postgres 17, provision/verify worker service, then perform a controlled deploy and durable restart E2E. Keep the current Render deployment unchanged until these gates pass.
