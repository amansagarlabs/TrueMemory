# TrueMemory Phase 11.26 — Production Readiness, Render, Supabase, and MCP

Date: 2026-09-24

Status: PARTIAL — Vercel production deployment and local regressions verified; Render service and worker readiness incomplete; Supabase association/schema access unverified; MCP legacy behavior passes but current 2026-07-28 conformance is incomplete.

## Executive summary

The Vercel production deployment is serving successfully and its deployed commit matches local `master` (`de9445906`). Render has a live API service, but its latest deployment is two documentation commits behind that HEAD. No Render background worker was found. The API's configured `/health` check is liveness-only; `/readiness` checks PostgreSQL and reports worker heartbeat state. We did not read Render environment variable values or make any production changes.

The Supabase connector identifies one active project, DrillPath (`mdetehiwmylcgzanrmnn`, ap-northeast-1), but does not establish that it is TrueMemory's database. Project-level calls to read project details, tables, migrations, extensions, and security/performance advisors were denied. Consequently, the live schema, migration state, RLS, and Render-to-Supabase connectivity are not verified. No database was created or modified.

A high-severity architecture concern exists in local code: profile memories are persisted through SQLite while durable workspace memories and ingestion records use PostgreSQL. Render's current API is on the Free plan with no disk configured in service metadata. Render documents Free services' filesystem as ephemeral and excludes persistent disks; absent a confirmed external SQLite path/store, profile memories are at risk on restarts and deploys. [Render Free services](https://render.com/docs/free), [Render disks](https://render.com/docs/disks).

Local app/MCP regression is strong: backend suite 549 passed / 15 skipped; frontend typecheck passed; lint passed with warnings only; official MCP Python SDK legacy-client tests passed for HTTP and the isolated stdio adapter. The stdio adapter fails agent-bound authentication compatibility (403). The current HTTP MCP implementation is a legacy POST JSON protocol, not the stateless 2026-07-28 transport contract. Official MCP Inspector was not run because installed Node is 22.16.0 while the Inspector requires >=22.19.0. [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [official Inspector](https://github.com/modelcontextprotocol/inspector).

Recommendation: DEFER a separate MCP repository. Keep MCP adapters in this monorepo until the auth, agent binding, protocol, and package contracts are stabilized. Do not certify production readiness yet.

## Scope and evidence boundaries

This was a read-only production audit. No cloud configuration, secrets, deploys, database objects, or user data were changed. Render/Vercel/Supabase integration access was used where available. No Cloudflare bypass was attempted. Local disposable services and tokens were used for protocol checks only.

Observed means returned directly by the provider integration or a local test. Inferred means indicated by source/configuration, not live cloud state. Not verified means access or instrumentation was unavailable. The DrillPath project must not be treated as confirmed TrueMemory production storage until its owner/connection is verified.

## Production topology and platform inventory

| Layer | Observed production state | Readiness / limitation |
|---|---|---|
| Frontend | Vercel project `true-memory`; production deployment READY, Next.js, repo `amansagarlabs/TrueMemory`, branch master, commit `de9445906`; authenticated fetch returned HTTP 200 and the TrueMemory page. | Verified serving and commit identity. Environment overrides and build settings unavailable through connector. |
| API | Render service `TrueMemory` (`srv-dalsihu7bikc73aerl20`), `https://truememory.onrender.com`, Oregon, Free, Docker from backend root, branch master, health path `/health`, auto-deploy on commit. Latest live deploy `e39b5aa8896a795095c47538f0b8dd0a81d37144`, two commits behind local HEAD. | Service/deploy metadata verified; public health endpoint could not be fetched through available web tool. No secret/env values read. |
| Legacy API | Render `TrueMemory-backend` (`srv-dal7llmk1f9s73dvvhh0`), Free and user-suspended; prior deploys failed. | Not serving; avoid resuming without explicit operational need. |
| Worker | No Render background worker found. | Production asynchronous ingestion processing is not established. |
| Database | Render integration returned no Render Postgres instances. Supabase lists DrillPath as one active project, PostgreSQL 17.6.1.166. | Candidate only; association with TrueMemory and runtime connectivity not verified. Project reads denied. |
| Queue | Local worker uses PostgreSQL job tables/leases and heartbeat; no Redis dependency in this path. | Production queue tables/worker state not verified. |

Vercel's frontend example/default API URL points to `https://truememory.onrender.com`; this is repository configuration evidence, not proof of the live environment override. The Vercel and Render deployments are on the same repository/branch, but Render trails Vercel's current commit.

## Render API and health/readiness review

The active Render API uses Docker and starts Uvicorn on `$PORT`. Render is configured to check `/health`; code shows this is liveness-only and does not prove the database or worker is ready. `/readiness` checks database access and ingestion heartbeat, but the worker is currently absent. Current API deploy is live and not suspended; memory metrics show an active instance. Request logs for the health endpoints were not returned and direct HTTP inspection was unavailable, so a successful live readiness response is not claimed.

There is no `render.yaml` in the repository. Render service metadata showed no persistent disk. Since the service is Free, SQLite must not be treated as durable unless production configuration proves that profile memory is redirected to a durable external service. Free services cannot attach persistent disks; filesystem contents are ephemeral. [Render Free services](https://render.com/docs/free), [Render disks](https://render.com/docs/disks).

## Supabase audit

The connected Supabase integration listed one healthy active project named DrillPath, ref `mdetehiwmylcgzanrmnn`, in ap-northeast-1. The user's message confirmed the Supabase plugin is connected, but did not affirm that DrillPath is the TrueMemory production project. Project-scoped `get_project`, table, migration, extension, and advisor reads each failed with a permission error, including a retry after the user tagged the plugin.

Therefore this report does not claim:

- that DrillPath is TrueMemory's live database;
- that required tables, indexes, policies, extensions, or migrations exist in production;
- that RLS is enabled/disabled or safe for the deployed access path;
- that Render's `DATABASE_URL` targets Supabase or that it can connect;
- that production schema matches local SQL.

Repository evidence: schema SQL is under `backend/db/init/001` through `019`; `backend/scripts/init_postgres.py` applies lexically sorted SQL with autocommit and does not maintain a Supabase migration ledger. There is no local Supabase CLI config/migrations directory. These are source facts only, not live schema evidence. Backend persistence uses direct psycopg/PostgreSQL, not a frontend Supabase client. No RLS statements were found in the tracked init SQL, but that does not establish live RLS state.

Supabase's upcoming Data API default exposure change is documented for October 30, 2026; this audit date is September 24, 2026. The app's direct PostgreSQL path does not use the Data API, and this change is not evidence of current app exposure. [Supabase breaking-change changelog](https://supabase.com/changelog?types=breaking-change).

## Storage, persistence, and worker readiness

The local implementation has two persistence tiers, not two independent MemoryCore instances:

- `MemoryClient` routes profile `remember/update/forget` operations to `MemoryCore` backed by SQLite `profile_memories`.
- Workspace durable memories and ingestion records/jobs/items/events use PostgreSQL tables such as `user_memories` and `memory_ingestion_jobs`.
- Search combines profile-memory SQLite results and durable workspace PostgreSQL results. Ordinary profile writes are not shown to be copied into the PostgreSQL durable tables.
- The ingestion worker is `python -m worker.memory_ingestion_worker`; it polls PostgreSQL leases, renews a 180-second lease every 45 seconds, and records heartbeats. It does not require Redis.

This split creates a material production durability risk on a Free Render filesystem. Resolve the canonical-write path before declaring production data safe. Prefer PostgreSQL as the canonical durable store or explicitly make SQLite a rebuildable cache; do not assume a Render disk exists.

Recommended worker deployment specification (not applied):

| Setting | Recommendation |
|---|---|
| Service type | Render Background Worker; one instance initially. |
| Source/build | Same repository and branch as API; Docker context/root `backend`, existing `Dockerfile`. |
| Start command | `python -m worker.memory_ingestion_worker`. |
| Region | Oregon, colocated with current API/database endpoint where possible. |
| Required secret/config | `DATABASE_URL` to the confirmed production PostgreSQL endpoint; `APP_ENV=production` and only worker-required settings. Do not copy provider keys unless code proves the worker needs them. |
| Queue | Existing PostgreSQL queue tables; do not provision Redis or a second database for this worker. |
| Sizing/operations | Choose instance size from expected concurrency and job cost, not guesswork. Verify clean shutdown, restart policy, heartbeat freshness, queue age, retry/dead-letter counts, and API readiness after the worker is deployed. |

Before creation, confirm the actual Supabase project and endpoint, validate schema, and authorize a controlled production smoke test. No worker was created during this audit.

## MCP architecture and isolation prototype

The HTTP `/mcp` adapter lives in the API and calls shared `MemoryClient` functionality, while importing private helpers from `memory_api`. It is tightly coupled to backend implementation. It supports bearer API-token authorization, scope checks, workspace/agent binding checks, origin allowlisting, rate limits, and sanitized provider errors. It provides 11 tools, including search/store/update/forget/current-state/timeline/related.

The root `mcp-server/memory.ts` is an official TypeScript SDK stdio adapter that calls the REST API rather than owning a database. The adapter's schemas omit workspace/agent/project binding parameters; an agent-bound token test received 403 `memory_agent_id_forbidden`. `frontend/package.json` bin paths point into `frontend/mcp-server`, but the files are in repository-root `mcp-server`, a packaging mismatch. `mcp-server/index.ts` is web research functionality, not a memory store.

A temporary source-only isolation prototype was run in `.tmp_phase1126_mcp_isolation` and removed after verification. Two independent official Python MCP SDK 1.28.1 stdio sessions verified same-scope store/retrieve consistency, user isolation, and REST visibility with disposable credentials. The bound-agent stdio case failed as described above. Local HTTP tests with the official Python MCP SDK verified legacy initialize, tools/list, store/retrieve, current-state, timeline, related, and forget. No token was printed or returned in the checks.

## MCP conformance matrix (current official revision 2026-07-28)

The current official protocol documents specify stateless HTTP behavior, request metadata/protocol-version signaling, and server discovery. The app route instead implements a legacy initialize/initialized POST-JSON lifecycle and hardcodes `2025-03-26`. HTTP authorization is optional in MCP generally; where implemented, the authorization spec recommends the OAuth-based protected-resource framework. [Versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

| Capability | Result | Evidence / gap |
|---|---|---|
| Legacy initialize + initialized | PASS (legacy client) | Local SDK-client test. Not the current stateless lifecycle. |
| Current protocol negotiation and request metadata | FAIL / absent | No current `_meta` negotiation or required request identity/capability metadata. |
| `server/discover` | FAIL / absent | No implementation found. |
| `tools/list`, `tools/call` | PASS (legacy) | Local HTTP SDK client and stdio prototype. |
| Tool errors/output | PARTIAL | Basic structured responses and sanitized API errors; no full current resultType/annotations behavior demonstrated. |
| Pagination/cache hints | NOT IMPLEMENTED / not verified | No modern pagination/cache contract found. |
| Streamable HTTP, SSE/GET, sessions | PARTIAL/FAIL | POST JSON legacy route only; no current transport/session behavior demonstrated. |
| Bearer app token and scope enforcement | PASS locally | Backend route release-matrix tests; no live production auth test. |
| OAuth protected-resource discovery | NOT IMPLEMENTED | No MCP OAuth discovery integration found. |
| Workspace/agent isolation | PASS for backend HTTP local tests; FAIL in stdio bound-agent scenario | HTTP accepts binding arguments; stdio tool schema omits them and API rejects bound token. |
| Resources/prompts | Not implemented / not claimed | No such server capabilities advertised. |
| Logging | PARTIAL | Server-side request/user logging; MCP logging protocol methods not implemented. No secret values logged in tests. |
| Official MCP Inspector | NOT VERIFIED | Installed Node 22.16.0; official Inspector README requires Node >=22.19.0. No runtime install performed. |

Official Python SDK reference: [MCP Python SDK quickstart](https://py.sdk.modelcontextprotocol.io/get-started/). Official conformance tracker: [MCP conformance](https://plan.modelcontextprotocol.io/conformance).

## Cross-agent and tool interoperability results

| Client / path | Result |
|---|---|
| Official MCP Python SDK → local HTTP `/mcp` | Legacy initialize, list, and the exercised memory tools passed with a disposable token. |
| Independent official Python SDK stdio clients → isolated adapter → REST | Same-scope shared record and REST visibility passed; different-user access denied. |
| Agent-bound API token → stdio adapter | Failed with 403 `memory_agent_id_forbidden`; binding contract gap. |
| Existing backend release matrix | Passed local auth, scope, tool coverage, binding isolation, REST/MCP consistency, origins, and rate-limit checks. |
| Render/Supabase/Vercel live MCP path | Not tested; production API credentials and Supabase runtime association were not available. |

Separate repository decision: DEFER. The stdio adapter is a thin REST client, not an independent memory implementation. Stabilize protocol/auth contracts, fix agent binding and packaging, and demonstrate independent release needs before extracting it. Do not duplicate MemoryCore or create a second data store.

## Security and credential recheck

The user-facing IDE context exposed an OpenRouter key earlier in the session. Treat it as compromised and revoke/rotate it in the OpenRouter account; rotation has not been confirmed. Do not paste a replacement into chat. This audit did not inspect or mutate cloud secret values. Render environment-variable read access and Vercel environment settings were unavailable; Supabase project reads were denied.

A targeted local scan for common provider-key shapes found matches only in two tests that construct values from environment variables; it did not identify a literal key value. This does not prove absence from all remote systems or all historical Git revisions. No key material is reproduced here. PostgreSQL URL-shaped test fixtures were deliberately excluded from the provider-key scan and must not be conflated with provider credentials.

MCP tests verified token omission from returned tool results and binding checks locally. Production OAuth, RLS, exposed Data API surface, production origin policy, rate limits, and secret rotation remain unverified.

## Regression and validation results

| Check | Result |
|---|---|
| Backend full suite | 549 passed, 15 skipped, 7 warnings. |
| Frontend TypeScript | `npm run typecheck` passed. |
| Frontend lint | `npm run lint` passed; 69 warnings, zero errors. |
| Existing MCP release matrix | Passed, including local authorization/binding and tools coverage. |
| Official MCP Python SDK HTTP legacy client | Passed exercised initialize/list/calls. |
| Isolated stdio MCP prototype | Same-scope and cross-user isolation passed; bound-agent case failed as documented. |
| Disposable ingestion end-to-end | Previous local evidence: normal job completed attempt 1; recovery job completed attempt 2. Not production evidence. |
| OPA Wasm compilation | Passed previously with OPA 1.20.2; Wasmer runtime verification unavailable. |
| Live Groq/provider request | Not run; no live provider credentials used. |
| MCP Inspector | Not run; Node version below Inspector requirement. |
| Production API/database roundtrip | Not verified. |

Local Docker test services were intentionally left running: API on port 18000, test Postgres on 55432, and the test ingestion worker. They use disposable test data, not production.

## Production capability matrix

| Capability | Local code/test | Production observation | Status |
|---|---|---|---|
| Vercel frontend serving | Verified | READY deployment and HTTP 200 | PASS |
| Render API serving | Code and service metadata verified | Live deploy metadata; direct health fetch unavailable | PARTIAL |
| Frontend-to-API target | Repo defaults point to Render | Vercel env override unreadable | PARTIAL |
| API-to-Postgres | Local test DB suite passes | Supabase association and runtime URL unverified | NOT VERIFIED |
| Profile memory durability | SQLite-backed local behavior | Render Free ephemeral filesystem; path override unknown | FAIL RISK / P0 |
| Workspace memory persistence | PostgreSQL implementation and tests | Live tables/schema not readable | PARTIAL |
| Async ingestion worker | Local normal/recovery tests pass | No Render worker found | FAIL / P0 |
| MCP legacy memory tools | Local HTTP and stdio legacy clients pass | No production MCP invocation | PARTIAL |
| MCP 2026-07-28 compatibility | Several required transport/discovery features absent | Not deployed/verified | FAIL |
| Agent-bound stdio interoperability | Local test returns 403 | Same contract applies unless separately changed | FAIL |
| Credential remediation | No literal key in targeted working-tree scan | Previously exposed key rotation unconfirmed | ACTION REQUIRED |

## Required follow-up checklist

- [ ] Revoke/rotate the OpenRouter key exposed in IDE context; confirm completion without sharing the new value.
- [ ] Confirm the exact Supabase project/ref used by Render TrueMemory; authorize read-only project/schema access.
- [ ] Inventory live schema, indexes, extensions, constraints, RLS, and migrations; compare against backend SQL and review advisors.
- [ ] Verify Render `DATABASE_URL` target and perform an authorized production connectivity/readiness check without revealing secret values.
- [ ] Resolve SQLite profile-memory durability: make PostgreSQL canonical or formally make SQLite a rebuildable cache.
- [ ] Deploy a dedicated Render worker only after database/schema confirmation; use the worker spec above and monitor heartbeats and dead-letter state.
- [ ] After worker is healthy, use `/readiness` as Render's readiness check and confirm semantics/HTTP status with an authorized live probe.
- [ ] Fix stdio agent binding/schema support and package paths; add regression tests.
- [ ] Decide and implement the desired MCP 2026-07-28 transport/discovery/auth compatibility while retaining legacy compatibility as needed.
- [ ] Run official MCP Inspector when a compatible Node runtime is available.
- [ ] Re-run end-to-end checks against production using a dedicated test identity and explicit approval; verify Vercel → Render → confirmed Supabase → worker.

## Answers to the 23 production-readiness questions

1. Is the Vercel production frontend deployed? **YES** — READY and HTTP 200 verified.
2. Does Vercel match the current repository HEAD? **YES** — deployment commit equals `de9445906`.
3. Is the Render API service configured and live? **PARTIAL** — service/deploy live metadata yes; direct health/readiness response not verified.
4. Is Render running the current HEAD? **NO** — latest live commit is `e39b5aa`; local HEAD is `de9445906`.
5. Is the frontend's production API target confirmed? **PARTIAL** — repository defaults point to Render; Vercel env override inaccessible.
6. Is the TrueMemory Supabase production project identified? **NO** — DrillPath is a candidate, association unconfirmed.
7. Is Supabase schema readable and verified? **NO** — project-level permission denied.
8. Are production migrations/drift verified? **NO** — local SQL is not a live migration history and project reads were denied.
9. Is production RLS verified? **NO** — neither live policies nor Data API exposure were inspected.
10. Is Render-to-Supabase connectivity verified? **NO** — no secret read or production DB operation.
11. Is a Render Postgres instance being used? **NO OBSERVED** — integration listed none; Supabase may be used but not confirmed.
12. Is the production ingestion worker running? **NO OBSERVED** — no Render worker found.
13. Is there a queue implementation ready to run? **YES LOCALLY** — PostgreSQL-backed queue/lease worker; production tables unverified.
14. Does current health check prove readiness? **NO** — `/health` is liveness-only.
15. Are profile memories demonstrably durable in production? **NO** — SQLite path/store not verified and Free filesystem is ephemeral.
16. Is there a second independent MCP memory store? **NO** — adapters use the same API/client path; persistence tiers are split.
17. Is MCP app-token auth present? **YES LOCALLY** — bearer API tokens and scope checks; production invocation untested.
18. Is MCP OAuth discovery implemented? **NO** — no MCP protected-resource discovery found.
19. Is MCP current 2026-07-28 transport conformance complete? **NO** — legacy POST JSON protocol lacks current discovery/metadata behavior.
20. Does stdio MCP support agent-bound credentials? **NO** — local bound-token test returned 403.
21. Did official MCP SDK tests pass? **YES, LEGACY PATHS** — Python SDK HTTP/stdio tests passed for exercised compatible cases.
22. Did official MCP Inspector pass? **NOT VERIFIED** — not run due Node version below requirement.
23. Is the service production-ready overall? **NO** — P0 worker, storage durability, and Supabase identity/schema/connectivity remain unresolved.

## Final status

STATUS: PARTIAL — local regressions and Vercel serving are verified; production readiness is not certified. Highest-priority blockers are (1) confirm TrueMemory's actual Supabase database and validate schema/connectivity, (2) establish durable canonical profile-memory storage, and (3) deploy/verify the PostgreSQL-backed ingestion worker. Credential rotation remains outstanding. MCP repository extraction is DEFERRED; MCP protocol modernization and stdio agent binding remain required before claiming broad interoperability.
