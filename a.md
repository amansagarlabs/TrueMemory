# KONTEXT Founder-Level Product and Engineering Audit

## Executive assessment

KONTEXT is a functional AI workspace MVP, not yet an AI operating system or
production agent platform. Its strongest implemented loop combines persistent
chat, artifacts, web retrieval, source intelligence, early workspace memory,
and a structured context-preview system.

The product remains aligned with the core vision:

> Memory is foundation. Context is product. Autonomy is destination.

The primary drift is breadth before depth. MCP, databases, APIs, agents,
projects, workflows, and most connectors appear in product surfaces before
their underlying runtime and data model are complete.

Current maturity: **4.6/10 — MVP**

Current trajectory: **Good, but needs correction**

Estimated completion of the long-term platform vision: **35%**

## Vision and positioning

The right problem is not building another general chatbot. KONTEXT should make
AI reliably resume real work with the correct private context, provenance, and
permissions.

The differentiated opportunity is:

- open-source and self-hostable context infrastructure;
- model-independent memory and retrieval;
- inspectable context selection before submission;
- workspace-scoped continuity across chats, files, decisions, and agents;
- source-to-memory-to-decision-to-action provenance;
- portable context through API and MCP.

The current product is not differentiated enough as a general assistant.
Memory, projects, files, connectors, search, and agents are already mature
features in ChatGPT, Claude, Perplexity, Cursor, Gemini, Manus, Cline, and
OpenHands. KONTEXT should become the open context substrate beneath those kinds
of experiences rather than reproduce every surface itself.

## Product scores

| Area | Score | Finding |
| --- | ---: | --- |
| Architecture | 6/10 | Useful abstractions exist, but core files and storage boundaries are inconsistent |
| Backend | 6/10 | Broad FastAPI surface with persistence, SSE, search, crawling, and ownership checks |
| Frontend | 5/10 | Visually strong, but oversized components, duplicate surfaces, and local-only state |
| AI engine | 5/10 | Good deterministic routing; limited model orchestration depth |
| Memory | 4/10 | Profile and durable memory exist; lifecycle, conflict handling, and controls are incomplete |
| Retrieval | 6/10 | Vector, BM25, web, context ranking, deduplication, compression, and provenance |
| Agent runtime | 3/10 | Crawl-oriented agents exist; no secure general execution runtime |
| Workflow engine | 2/10 | Plans and events exist; no durable jobs, retries, schedules, or resumability |
| MCP | 1/10 | Types, scopes, UI, and marketing only |
| Connectors | 2/10 | Connectivity tests and one global-token GitHub provider |
| Knowledge graph | 3/10 | Request-time graph and source relations, not a durable entity graph |
| Search | 7/10 | One of the strongest implemented subsystems |
| UI/UX | 6/10 | Distinctive and capable, but capability truthfulness needs correction |
| Developer experience | 4/10 | Simple stack, but no CI/migration runner and repository lint fails |
| Scalability | 3/10 | Local files, SQLite split, process cache, synchronous work, no workers |
| Security | 3/10 | Good primitives coexist with launch-blocking risks |
| Observability | 3/10 | Rich events, but no trace/metric backend, alerts, or replay |
| Testing | 5/10 | 93 backend tests; little frontend or integration coverage |
| Documentation | 7/10 | Extensive but duplicated and ahead of implementation |
| Production readiness | 3/10 | Local deployment works; security and operations block launch |

## Strong architecture decisions

- Next.js and FastAPI are a reasonable product/API boundary.
- PostgreSQL is the correct authoritative product store.
- Milvus is appropriately isolated to semantic document retrieval.
- The context-provider registry is modular and extensible.
- Context nodes are ranked, deduplicated, compressed, and budgeted.
- SSE exposes bounded route, plan, source, progress, and answer events.
- Source Intelligence stores source identities, snapshots, trust, and answer use.
- URL validation blocks private addresses and revalidates redirects.
- Major Postgres artifact and conversation operations enforce user ownership.
- Search provider selection supports open/free fallbacks and graceful degradation.

## Architectural debt

The core implementation is concentrated in very large files:

- `components/chat/ChatInterface.tsx`: approximately 4,300 lines;
- `backend/app/routes/chat.py`: approximately 1,850 lines;
- `components/chat/MessageList.tsx`: approximately 1,700 lines.

Product state is split across PostgreSQL, SQLite, Milvus, JSONL, the filesystem,
and browser localStorage. This prevents a clean model for workspace export,
deletion, access revocation, backup, multi-instance deployment, and tenant
isolation.

Projects, workspace copies, connector configuration, onboarding state, and
enabled skills remain browser-local. Curated knowledge and user-created skills
are application-global. Retrieval providers are defined inside the main chat
route instead of isolated adapters.

There is no durable execution plane: no background queue, job state machine,
worker pool, retry/dead-letter policy, scheduler, sandbox manager, or end-to-end
cancellation.

## Security risks

Launch-blocking issues:

1. Session tokens are available to JavaScript through localStorage and a
   non-HttpOnly cookie.
2. Connector credentials are stored in browser localStorage.
3. Connector URL tests accept arbitrary server-reachable URLs without the
   existing SSRF-safe URL layer.
4. The artifact pipeline endpoint lacks authentication and ownership checks.
5. Any authenticated user can create global filesystem skills.
6. Default users can mutate a global curated knowledge base.
7. GitHub retrieval uses a single server token rather than user-scoped OAuth.
8. No rate limiting protects login, models, crawling, OCR, uploads, or tests.
9. Subscription usage endpoints trust client-provided quantities and costs.
10. There is no production secrets vault, connector encryption, backup policy,
    deletion workflow, or workspace audit trail.
11. There is no CI security or dependency gate.
12. Several marketing and pricing claims exceed working implementation.

Security primitives worth retaining include hashed opaque sessions, refresh
rotation, PBKDF2 password hashing, ownership filters, artifact path containment,
SSRF-safe crawling, untrusted-context boundaries, and tool approval fields.

## AI and context engine

Implemented:

- deterministic query routing;
- automatic and explicit web retrieval;
- PDF vector retrieval;
- curated BM25/dense hybrid retrieval;
- conversation and profile context;
- early durable workspace memory;
- parallel mention provider registry;
- request-time context graph;
- context preview;
- source scoring and persistence;
- bounded progress events.

Incomplete:

- memory extraction is conservative regex classification;
- no semantic consolidation or conflict/supersession model;
- no temporal validity or confidence review;
- durable memory is not displayed in the Memory page;
- no persistent knowledge entity graph;
- most mention resource kinds have no provider;
- no MCP discovery or execution;
- no permission-aware connector ingestion;
- no general agent runtime;
- no workflow resumption.

The menu currently offers projects, agents, files, MCP servers, APIs, databases,
and documents while the backend intentionally reports most as unavailable.
Unsupported resources should be hidden until their providers exist.

## UX assessment

The product currently feels approximately:

- 60% polished chatbot;
- 25% developer/search platform;
- 15% AI operating system.

Strengths:

- rich streaming activity;
- searchable mentions with nested navigation;
- context preview;
- visible citations and source intelligence;
- first-class artifacts;
- clear search/research/document modes;
- distinctive visual identity.

Weaknesses:

- unavailable resources can still be selected;
- memory types and curated knowledge are conceptually mixed;
- durable memories are absent from the Memory page;
- projects and connector status are not authoritative server state;
- Memory, Artifacts, Library, Projects, Workspaces, Connectors, and Integrations
  overlap;
- background activity cannot survive navigation or reconnect;
- agent actions have no diff, checkpoint, or durable execution timeline.

## Execution status

Completed:

- authentication and sessions;
- PostgreSQL core schema;
- workspace-scoped conversations;
- profile synchronization;
- initial durable memory;
- artifact upload, preview, and PDF retrieval;
- hybrid knowledge retrieval;
- web search, scrape, crawl, and map;
- Source Intelligence;
- context mentions, provider registry, context graph, and preview;
- basic skill injection;
- server-token GitHub retrieval;
- streaming route/plan/source/answer events;
- backend unit suite and production frontend build.

Partially completed:

- memory lifecycle;
- workspace model;
- projects;
- skills;
- connectors;
- evaluations;
- billing;
- deep research;
- approval gates;
- agent orchestration;
- observability;
- knowledge graph;
- responsive/accessibility QA.

Missing:

- real MCP;
- server-backed projects;
- workspace membership and teams;
- OAuth connectors and encrypted secrets;
- incremental connector synchronization;
- API/database resource providers;
- durable workflow engine and background workers;
- sandboxed execution;
- schedules;
- memory conflicts and supersession;
- workspace memory management UI;
- Redis and multi-worker support;
- object storage;
- versioned migrations;
- OpenTelemetry;
- CI/CD and security scanning;
- rate limiting;
- backup/restore;
- comprehensive E2E testing.

## Technical direction

Make PostgreSQL authoritative for all production user/workspace data. Keep
SQLite only as an explicit offline-development mode.

Create canonical server-owned records for workspace, project, artifact,
connector, memory, conversation, and task. Move provider implementations out of
the chat route. Add durable background jobs before background agents. Make all
connectors encrypted, user-scoped, permission-aware, and server-managed.

Implement MCP instead of inventing another connector protocol. Integrate an
existing sandbox/runtime such as OpenHands rather than building a general code
execution environment. Use an established durable job/workflow system rather
than creating a scheduler from scratch.

Hide unsupported product surfaces and consolidate Connectors and Integrations.
Keep the Source Intelligence contracts, context-provider abstraction, context
graph, SSE model, URL safety, ownership patterns, router, and open-source search
architecture.

## Real competitive moat

The defensible category is:

> Open-source context continuity infrastructure for people and agents.

The moat is a permission-aware longitudinal context graph that knows what the
user is working on, what changed, what was decided, what remains unresolved,
which evidence supports it, which agent acted, and exactly which context should
be sent to a model.

Required moat-building assets:

- longitudinal memory evaluation data;
- conflict and supersession logic;
- cross-resource entity resolution;
- source-to-memory-to-decision-to-action provenance;
- a portable API/MCP contract;
- excellent self-hosting and privacy;
- inspectable context selection;
- measured continuity better than chat-history retrieval.

## Highest-priority milestones

1. Correct product truth and launch-blocking security.
2. Create one authoritative workspace data model.
3. Complete memory controls, conflict handling, and evaluations.
4. Ship two real connectors: GitHub OAuth and one document system.
5. Implement real MCP resource discovery before tool execution.
6. Add Redis jobs, migrations, OpenTelemetry, CI, and security gates.
7. Refactor the chat frontend and backend incrementally while shipping.

## Founding engineer: next 30 days

### Days 1–7

Hide unsupported capabilities, protect artifact processing, move auth and
connector credentials out of browser storage, add SSRF protection, rate limits,
CI, and migration smoke tests.

### Days 8–14

Persist projects and all workspace relationships in PostgreSQL. Finish the
durable-memory management UI and extract retrieval providers from the chat
route.

### Days 15–21

Ship user-scoped GitHub OAuth and repository ingestion. Make one continuity
demo excellent: connect a repository, record a decision and next task, leave,
return in a new chat, and reconstruct the relevant files, decision, task, and
evidence with an inspectable context preview.

### Days 22–30

Add memory/retrieval evaluations, cross-user isolation tests, traces,
Redis-backed jobs, cancellation/retry behavior, and deployment smoke tests.

The release gate should require no workspace leakage, high memory precision,
correct decision/task recall, valid provenance, context-preview/model-context
parity, reconnectable streams, and passing lint, build, migrations, and E2E.
