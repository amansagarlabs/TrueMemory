# TrueMemory Phase 11.27 — Production Closure Audit

Date: 2026-09-24

Status: NOT CLOSED — Vercel is serving, but the Supabase production database cannot be identified or inspected with the currently failing connector; Render has no observed ingestion worker; profile memories use SQLite on a Free Render service with an ephemeral filesystem; production end-to-end and current MCP conformance are unverified/partial.

## Executive conclusion

The production chain is not established end to end. Vercel's production alias returned HTTP 200, and its current READY deployment is on local `HEAD` (`de9445906`). Render lists a live API service, but its latest live commit remains `e39b5aa` and the local working tree contains backend changes that are not deployed. No Render worker was present in the service inventory, and no Render Postgres instance was listed.

The Supabase connector tools are present in the tool catalog but every attempted read in this session returned `Unknown tool` before reaching Supabase. Consequently, neither the candidate project from earlier phases nor any TrueMemory production database identity/schema can be confirmed here. No production schema changes, secret reads, deploys, worker creation, or database tests were performed.

The local architecture confirms a production durability defect unless Render has an unobserved `MEMORY_DB_PATH` override to durable storage: profile-memory CRUD goes through SQLite; Render reports the API as Free and no disk is configured in service metadata. Render says Free web services have ephemeral filesystems, lose local SQLite changes on restart/redeploy/spin-down, and cannot attach persistent disks. [Render Free services](https://render.com/docs/free), [Render persistent disks](https://render.com/docs/disks). Production's actual memory path is not visible to this audit, so the conclusion is a high-confidence deployment risk, not proof that any particular production record was lost.

No source-code/storage migration was made. The candidate PostgreSQL `profile_memories` table in repository SQL is not compatible with the current SQLite repository shape, and the live project identity/schema is unavailable. A migration without those facts would risk data loss or a broken deployment. Required production changes are therefore USER ACTION REQUIRED after provider access and target confirmation.

## 1. Git baseline and change ownership

| Item | Recorded value |
|---|---|
| Branch | `master` |
| HEAD | `de9445906da96df71f232162fb64d3451e6b957f` |
| Recent commits | `de9445906`, `4a7f7583c`, `e39b5aa88`, `31d7c9698`, `cb981efdb` |
| `git diff --check` | Clean (Git emitted only existing LF-to-CRLF working-copy warnings). |
| Tracked modified files | `.env.example`, `RUN_ON_NEW_PC.md`, `backend/app/routes/ingestion.py`, `backend/app/routes/memory_mcp.py`, `backend/requirements-dev.txt`, `backend/tests/test_mcp_release_matrix.py`, `cursor_ai_pdf_chat_application_design.md`, `docs/2026-06-17-scraping-architecture.md`, `docs/PRODUCTION_DEPLOYMENT.md`. |
| Untracked files before this report | `backend/scripts/phase11_25_disposable_e2e.py`, Phase 11.24/11.25/11.26 research reports. |
| Phase 11.27 change | This report only; unrelated/user changes were preserved. |
| Render latest live commit | `e39b5aa8896a795095c47538f0b8dd0a81d37144`. |
| Vercel latest production commit | `de9445906da96df71f232162fb64d3451e6b957f`, same as HEAD. |

The Render commit is two documentation commits behind HEAD. More importantly, the local uncommitted backend edits are not present in the deployed Render commit. Any local MCP behavior that depends on those edits is not evidence about production.

## 2. Provider access and production identity

### Supabase

Supabase project listing, organization listing, project details, and table listing were attempted using the connected integration names available to this session. Each call returned `Mcp error -32001: Unknown tool`. Therefore:

- Intended production project/ref: **NOT VERIFIED**.
- Candidate project previously returned in Phase 11.26: DrillPath (`mdetehiwmylcgzanrmnn`), but its relationship to TrueMemory was never confirmed and its current details cannot be queried.
- Live tables, columns, constraints, indexes, foreign keys, triggers, extensions, migration history, RLS, and advisors: **NOT VERIFIED**.
- Render `DATABASE_URL` target, direct-vs-pooler mode, SSL, pool size, timeout, connection limits, and reconnect behavior: **NOT VERIFIED**; the Render connector offers no read-only env-var value tool in this session.
- Supabase project association inferred from local docs or ignored `.env` files is not accepted as production evidence.

Supabase documents direct PostgreSQL connections for persistent backends when network IP support permits, and shared pooler session mode as an IPv4 alternative; transaction pooling is aimed at short-lived/serverless connections and has prepared-statement limitations. The actual TrueMemory connection mode cannot be inferred without the deployed connection configuration. [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

The repository has SQL under `backend/db/init/001`–`019`, but no Supabase CLI project/migration directory was found. `backend/scripts/init_postgres.py` applies ordered SQL files with autocommit and is not a Supabase migration ledger. Supabase's production workflow documents version-controlled migrations and separate environments; adopt that policy only after establishing a baseline from the actual remote schema. Do not replay the current init scripts blindly against an existing production database. [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [managing environments](https://supabase.com/docs/guides/deployment/managing-environments).

Local SQL inventory relevant to the requested production-schema categories (expectations only, not a live Supabase inventory): `users`, `user_profiles`, `messages`, `user_memories`, `profile_memories`, `workspaces`, `projects`, `sources`, `source_snapshots`, `source_relations`, `claim_evidence`, `memory_ingestion_jobs`, `memory_ingestion_items`, `memory_ingestion_events`, and `memory_ingestion_worker_heartbeats`. The SQL models provenance JSON and temporal/revision fields on existing memory/source records; the init set does not establish a separate generic `entities`, `relationships`, `memory_telemetry`, or `consolidation` table under those names. Whether equivalent concepts exist under another schema/name in production is **NOT VERIFIED**.

### Render

Workspace observed: `Aman Sagar's Workspace` (`tea-csps39i3esus73eobh30`). Current service inventory:

| Service | Observed state | Relevant configuration |
|---|---|---|
| `TrueMemory` (`srv-dalsihu7bikc73aerl20`) | Web service, live/not suspended | Repo `amansagarlabs/TrueMemory`, branch `master`, root `backend`, Dockerfile `Dockerfile`, Oregon, Free, one instance, health path `/health`, URL `https://truememory.onrender.com`. |
| `TrueMemory-backend` (`srv-dal7llmk1f9s73dvvhh0`) | Web service, suspended by user | Free, configured `/readiness`, not serving. |
| Background worker | No worker service in returned inventory | **WORKER NOT DEPLOYED (observed inventory)**. |
| Render PostgreSQL | None listed | No evidence Render Postgres is the data source. |

Most recent live Render deploy: `dep-daprldfavr4c73evce0g`, state `live`, commit `e39b5aa...`, finished 2026-09-23 11:42:38 UTC. Its Docker command override is empty, so the image CMD starts Uvicorn on `$PORT`. The connector exposes an environment-variable update operation but not a read operation; no env values were requested or changed. Render health/readiness URLs were inaccessible through the available fetch tool; the current health endpoint response is **NOT VERIFIED**.

### Vercel

Project `true-memory` (`prj_VMneNQ4RAGyVScUCG23YpzdT2pWE`), team `Aman Sagar's projects`. Latest production deployment `dpl_CDcFac5Dnk22whoaBb9ppR8YmCqU` is READY on `master` at commit `de9445906...`. `https://true-memory.vercel.app` returned HTTP 200. The deployment-specific URL returned HTTP 302 to Vercel SSO; that URL is protected, which does not negate the alias result. Vercel project-settings retrieval has a connector argument mismatch, and no environment-variable listing tool is available. Production backend URL and authentication environment settings therefore remain **PARTIAL / NOT VERIFIED**.

## 3. SQLite/profile-memory durability audit

### Current paths

| Path | Local implementation | Production implication |
|---|---|---|
| Profile memory list/count/search/create/update/forget | `MemoryClient` creates `MemoryCore(SQLiteMemoryRepository(settings))`; repository calls `backend/services/memory_store.py` and SQLite `profile_memories`. | Depends on local SQLite file. The code default is `backend/data/memory.db`; Render env override is unknown. |
| Account-profile sync and explicit declaration capture | Same SQLite `profile_memories` repository. | Same filesystem risk. |
| Conversation messages/local artifacts | SQLite `conversation_messages` and `local_artifacts` in `memory_store.py`. Artifact file paths are also local-file paths. | Local file persistence is not durable on Render Free absent external storage. Scope and production use of every artifact path were not live-verified. |
| Workspace durable memories, managed memories, temporal versions/provenance | PostgreSQL through `services/postgres_store.py` and `user_memories` / related tables. | Requires the unverified production PostgreSQL configuration/schema. |
| Async ingestion jobs/items/events/heartbeats | PostgreSQL queue tables and leases via `services/memory_ingestion.py`. | Worker absence means queued jobs cannot be processed continuously; production table state unknown. |
| Hot cache / hybrid retrieval | Cache/retrieval layers use PostgreSQL when configured and local fallback otherwise; core search combines L1 SQLite profile facts with durable workspace records. | Does not make SQLite durable. |

`docker-compose.yml` binds a local `backend/data` directory and uses a separate worker container for development; that bind mount does not apply to Render's web-service filesystem. Render confirms the current API plan is Free; official docs state that local SQLite changes are lost on spin-down, restart, and redeploy and Free web services cannot use persistent disks. [Render Free services](https://render.com/docs/free).

### PostgreSQL schema compatibility and migration boundary

Repository `backend/db/init/001_mvp_schema.sql` defines PostgreSQL `profile_memories` with `user_id`, optional `artifact_id`, `profile_key`, `content`, `source`, timestamps, and uniqueness on `(user_id, artifact_id, profile_key)`. The SQLite profile table instead uses `(user_id, doc_id, memory_key)` uniqueness and stores `valid_from`, `valid_until`, `confidence`, `revision`, plus a separate revision-history table. Existing `user_memories` contains different semantics (memory type, workspace/artifact/conversation fields, temporal/revision/provenance added by later SQL). These are not drop-in equivalent repositories.

The smallest plausible boundary is the profile-memory repository behind `MemoryCore`, mapping existing profile operations to a versioned PostgreSQL representation while preserving scope, source/provenance, confidence, temporal validity, revision history, and forget/update semantics. But we cannot choose between extending the existing profile table and mapping into `user_memories` until actual production DDL and data are inspected. Therefore no schema or adapter migration was made.

### Durability test result

- Unit tests confirm local SQLite profile-memory behavior, but they do not simulate Render's filesystem destruction.
- No restart/redeploy was triggered against production; doing so would be an unsafe destructive test.
- Docker test services could not be inspected or started from this environment: Docker Engine access was denied by Windows permissions. No local PostgreSQL end-to-end or migration/restart test was run in this turn.
- Production profile memory surviving a Render restart/redeploy: **NOT VERIFIED; high-risk by code/config evidence**.
- Existing production memories still present on the local filesystem: **NOT VERIFIED**. Do not attempt to infer or recover records by reading ignored `.env` or production disk data.

## 4. Worker decision and deployment specification

**WORKER NOT DEPLOYED** (no worker in Render service inventory). The worker is required for the async ingestion endpoints: API requests enqueue into PostgreSQL `memory_ingestion_jobs`; `python -m worker.memory_ingestion_worker` claims leased jobs, processes them, commits accepted memories, and writes heartbeat rows. It polls PostgreSQL directly; this path does not require a new queue service or Redis. It is not safe to call the worker healthy or production ingestion operational.

Exact recommended service definition, not applied:

| Setting | Value |
|---|---|
| Name/type | `TrueMemory-memory-ingestion-worker`, Render Background Worker. |
| Repository/branch | Same `amansagarlabs/TrueMemory`, branch `master`; deploy a reviewed commit containing the desired worker/source state. |
| Docker context/root | `backend`; Dockerfile `Dockerfile`. |
| Build command | Use Dockerfile build; no separate shell build command. |
| Start command | `python -m worker.memory_ingestion_worker`. |
| Region | Oregon, colocated with API and confirmed database where possible. |
| Environment | Secret `DATABASE_URL` to the verified same PostgreSQL database used by API; mirror only worker-required non-secret application settings. Do not copy provider secrets unless a selected ingestion source is proven to need them. |
| Dependency/queue | Same PostgreSQL schema/job tables as API; no extra database or queue. |
| Restart/health | Configure restart-on-failure in Render. Worker has no HTTP probe; health means a recent `memory_ingestion_worker_heartbeats.last_seen_at` row and `/readiness` reporting worker `ready`. Monitor lease expiry, queue age, retries/dead-letter counts, and logs. |

Deployment is **USER ACTION REQUIRED** after Supabase project/connection/schema verification. The available integration is insufficient to safely bind the worker's production database secret or validate the target. No service was created.

### Production E2E and failure recovery

| Requested proof | Result |
|---|---|
| API → job row → worker claim/lease → durable memory → completed status, with job/memory IDs and timestamps | **NOT VERIFIED in production**. No worker and no database access. |
| Worker termination → lease expiry → replacement reclaim → exactly-once/idempotent completion | **NOT VERIFIED in production**. Previous Phase 11.25/11.26 local disposable Compose evidence recorded a normal job completing attempt 1 and a recovery job completing attempt 2; that is not production evidence and was not rerun because Docker Engine was inaccessible here. |

## 5. Vercel → Render → Supabase and provider-independent operation

- Vercel alias is reachable (HTTP 200). Current production deployment matches HEAD.
- Repository frontend defaults point to Render, but actual Vercel environment overrides and production auth configuration are inaccessible.
- Render API metadata is live; direct `/health`, `/readiness`, and `/mcp` fetches are inaccessible via available web tooling.
- Supabase identity and schema are not inspectable in this session.
- Therefore a controlled production store/retrieve/update/forget/current-state/timeline operation through Vercel → Render → Supabase was **NOT RUN**. No real-user data was used.
- Static frontend bundle scan found no literal provider-key-shaped strings and no `NEXT_PUBLIC_*` key/token/database variable names. `OPENROUTER_API_KEY` text occurs in bundles as a configuration/error name, not as a detected key value. This is a local build scan, not proof about Vercel's encrypted environment settings.
- `.env` and `backend/.env` exist, are ignored/untracked, and contain variable names including `OPENROUTER_API_KEY` and `DATABASE_URL`; values were not read or printed. `frontend/.env.local` contained no provider/database secret variable names. No key-shaped literal was found in the inspected working tree outside ignored env files, or in the scanned Git history output.

Memory CRUD/core behavior is designed to work without an AI provider: focused local profile/core and provider-independence tests passed. This does **not** prove every product feature works provider-free: conversational generation and selected query/agent routes explicitly return errors when their model-provider key is absent. No live provider call was made. Existing OPA code's prior local Wasm compilation evidence is not a production runtime test; no OPA service is required by the inspected memory-worker entry point. Optional Groq/live model execution remains unverified.

## 6. MCP transport, functional correctness, and conformance

### Implementation and claimed tools

The hosted `/mcp` route is a custom FastAPI POST JSON-RPC handler sharing `MemoryClient` and importing internal authorization/scope helpers from `memory_api`. Despite the module docstring, it is not a current Streamable HTTP implementation. It hardcodes `2025-03-26` and handles legacy `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`; no current per-request `_meta`, `server/discover`, Streamable HTTP response negotiation, GET/SSE, or session semantics were found.

The route advertises 11 tools: `memory_search`, `memory_retrieve`, `memory_store`, `memory_update`, `memory_forget`, `memory_current_state`, `memory_timeline`, `memory_related`, `memory_context`, `memory_profile`, and `memory_entities`. Local `mcp-server/memory.ts` is a stdio adapter using the official TypeScript SDK and calling the REST API; it is not an independent store. Its schemas omit workspace/agent binding arguments, and earlier disposable testing showed a bound-agent token rejected by REST with 403. This turn did not access production MCP.

### Current official revision assessment

The official 2026-07-28 revision removes the initialize handshake/session model for modern clients, carries protocol/client metadata per request, and uses `server/discover`. It defines stdio and Streamable HTTP as standard bindings and specifies modern tool result/list behavior. TrueMemory's hosted route only implements the legacy subset, so the accurate classification is **PARTIAL**—not official conformance verified and not fully compliant. [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [2026-07-28 release overview](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/).

The 2026-07-28 authorization specification requires protected-resource metadata and OAuth authorization-server discovery for servers that implement protected MCP authorization. TrueMemory locally accepts app bearer API tokens and enforces app scopes/bindings, but an MCP OAuth protected-resource discovery flow was not found. This is useful application authentication, but it is not a verified implementation of the spec's OAuth discovery flow. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

| MCP check | Current result |
|---|---|
| Actual hosted transport | POST JSON-RPC only, custom/legacy; production path not fetched. |
| stdio | Local SDK wrapper exists; production client usage not verified. |
| `server/discover`, per-request metadata/version, modern stateless protocol | Not implemented in current hosted route. |
| Legacy initialize/list/call | Locally exercised successfully in prior Phase 11.26 SDK-client tests; not a modern conformance pass. |
| Auth missing/invalid/expired/revoked; memory scope; tool calls and user/workspace/agent denial | Prior local release-matrix evidence passed; production auth not tested. |
| Cross-client/cross-agent durable record | Prior disposable tests passed same-scope visibility and user isolation; stdio agent binding failed. Not production evidence. |
| REST ↔ MCP consistency | Prior local tests passed exercised paths; no production consistency test. |
| Tool schema/output/error coverage | Partial local coverage; not retested end-to-end in this turn because live matrix requires the database/test server. |
| Official Inspector | Not run. Node is 22.16.0; current Inspector README requires Node >=22.19.0. No runtime installation performed. [Official MCP Inspector](https://github.com/modelcontextprotocol/inspector). |

Functional correctness and protocol conformance are separate: previous local tests exercise TrueMemory memory semantics, but they do not establish current-protocol conformance. Production MCP result: **PARTIAL**.

## 7. Separate MCP repository decision

**DEFER** remains the correct decision.

- Dependency surface: small TypeScript SDK + Zod adapter, calling REST; backend route remains in the API.
- Coupling: hosted route imports private `memory_api` helpers and shared `MemoryClient`; it is not yet a stable independent boundary.
- Packaging: `frontend/package.json` bin entries point to `./mcp-server/*`, while MCP source files live at repository-root `mcp-server/*`; root package metadata is absent. This is a packaging mismatch to fix before extraction.
- Independent release frequency, external reuse demand, and security ownership: not evidenced.
- The stdio agent-binding gap and current protocol gap should be fixed before a separate repo multiplies compatibility burden.

## 8. Security and OpenRouter credential

Rotation status remains **USER ACTION REQUIRED**. A previous OpenRouter credential was exposed in IDE context. The local ignored env files contain the `OPENROUTER_API_KEY` variable name; values were intentionally not inspected. The Vercel/Render integrations in this session do not provide safe secret-value reads, and no provider-side revoke/rotate operation or confirmation is available. Treat the previously exposed credential as compromised until the user confirms provider-side revocation/rotation. Refer to it only as `<REDACTED>`.

Local security evidence:

- Root `.env` and `backend/.env` are ignored/untracked, not committed. Their secret values were not read.
- Frontend `.env.local` had no provider/database secret names.
- No literal `sk-or-v1-...` or long `sk-...` key-shaped value was found in scanned tracked/untracked working files outside ignored env files or in the Git history scan.
- No literal provider key was found in built frontend static chunks. This scan does not inspect Vercel encrypted env vars or deployed server bundles.
- No production secrets were requested, revealed, or changed.

## 9. Verification run in this turn

| Check | Result |
|---|---|
| `git diff --check` | Passed; only existing line-ending warnings. |
| `pytest tests/test_profile_memory_store.py tests/test_memory_core.py -q` | 9 passed. |
| `pytest tests/test_provider_independence.py -q` | 22 passed. |
| `pytest tests/test_phase9_7_contract.py -q` | 1 passed (5 dependency deprecation warnings). |
| MCP live release matrix | Not rerun: test reads local `.env` DB settings and requires a reachable test server/database; no Docker Engine access. Prior Phase 11.26 local results are identified as prior evidence only. |
| Docker Compose test DB/worker | Not available: Docker Engine pipe access denied by Windows permissions. |
| Render public health/readiness/MCP | Fetch tool reports URLs inaccessible. |
| Supabase project/schema/advisors | Connector returns `Unknown tool`; no reads succeeded. |
| MCP Inspector | Not run; Node version below official requirement. |
| Provider live request | Not run. |

## 10. Critical questions answered

1. Is Supabase actually the production PostgreSQL source of truth? **NOT VERIFIED.**
2. Is the complete production schema present? **NOT VERIFIED.**
3. Are production memories dependent on Render filesystem state? **POSSIBLY / HIGH RISK.** Code writes profile memory to local SQLite; production override/data not visible.
4. Does profile memory survive Render restart/redeploy? **NOT VERIFIED; Free filesystem is ephemeral, so the default path does not.**
5. Is ingestion worker required and correctly deployed? **Required for async queue processing; no Render worker observed.**
6. Does production ingestion work end-to-end? **NOT VERIFIED.**
7. Is worker failure/recovery operational? **NOT VERIFIED in production; prior disposable local recovery evidence only.**
8. Does authenticated MCP work end-to-end in production? **NOT VERIFIED.** Local legacy authorization tests passed previously.
9. Does MCP match current official spec for claimed features? **PARTIAL; hosted endpoint implements legacy POST JSON, not 2026-07-28 modern behavior.**
10. Does MCP pass Inspector? **NOT VERIFIED; Inspector was not run.**
11. Does cross-agent persistence work through one MemoryCore? **Locally, the shared API/core design and prior disposable scope-isolation tests passed; production durability and stdio agent-bound case are not verified (the latter failed).**
12. Does TrueMemory work without an AI provider? **Core CRUD and memory worker path are provider-independent by design; full conversational/query feature parity is not established and some routes require provider credentials.**
13. Has the exposed OpenRouter credential been revoked/rotated? **NOT CONFIRMED; USER ACTION REQUIRED.**
14. What blocks production closure? **Unknown production DB identity/schema/config; absent worker; SQLite profile-memory durability; no Vercel→Render→Supabase production memory test; incomplete MCP modern protocol/auth compatibility; unconfirmed credential rotation; Render code behind local changes.**

## 11. Required next actions (no production action taken)

1. Restore working Supabase connector access and confirm the exact project ref from the deployed service owner. Then perform read-only schema, migrations, extension, RLS, and advisor inventory.
2. Use a safe Render configuration workflow to confirm only the `DATABASE_URL` host/mode and required key presence—never print its value. Verify direct or session-pooler choice, SSL, driver pool size/timeouts, reconnects, and database connection budget.
3. Capture the live schema baseline into version-controlled migrations. Supabase recommends migrations and distinct environments; do not manually alter production or replay init scripts before diffing.
4. Design/implement the smallest profile-memory repository migration only after schema and target verification. Run old SQLite → PostgreSQL → retrieve/update/forget → process restart against a disposable Supabase branch or local PostgreSQL; compare scope, provenance/source, confidence, validity, and revisions.
5. After DB verification, deploy one Render background worker using the specification above. Verify fresh heartbeats, queue transitions, completed durable memory, and restart recovery with a dedicated test identity.
6. Verify current Render API commit and health/readiness. After worker is live, make the Render health strategy distinguish liveness from dependency readiness; the current `/health` check is liveness-only and `/readiness` reports worker state.
7. Run production-safe Vercel → Render → confirmed Supabase CRUD/MCP smoke tests with disposable user data only.
8. Upgrade Node for official MCP Inspector, test every claimed tool and auth/error/isolation case, and plan current 2026-07-28 support without dropping necessary legacy clients. Avoid calling the route compliant until it passes.
9. Fix stdio binding parameters and npm package paths before deciding whether extraction is justified.
10. Revoke/rotate the exposed OpenRouter key in the provider console and confirm only the rotation status, never the secret value.

## Final status

STATUS: NOT CLOSED. Production readiness cannot be certified. Vercel is serving the current commit, and local SQLite/provider-independence/contract tests passed. P0 closure requires confirmed Supabase identity/schema/connection, durable canonical profile-memory storage, a live PostgreSQL-backed Render worker, and an authorized production E2E. MCP remains PARTIAL against the 2026-07-28 specification; Inspector is not verified. OpenRouter credential rotation is USER ACTION REQUIRED. Separate MCP repository remains DEFERRED.
