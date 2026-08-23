# TrueMemory frontend route audit

This audit records the public information architecture after the TrueMemory product pivot. “Real” means the route is backed by an existing frontend service and backend endpoint; it does not imply every external provider is configured.

| Route | Purpose / current dependency | Decision |
| --- | --- | --- |
| `/` | Public positioning, signup/login entry points | REDESIGN — TrueMemory infrastructure landing |
| `/login` | Authenticated session entry | KEEP — update public identity |
| `/signup` | Account creation | REDESIGN — provider-first onboarding entry |
| `/onboarding` | Persona, connection, and Space setup; `/api/auth/me` | REDESIGN — provider flow implemented |
| `/dashboard` | Authenticated stats, recent memories and conversations; dashboard APIs | REDESIGN — TrueMemory Home implemented |
| `/memory` | Memory list/search/import/export/edit/archive; `/api/dashboard/memories` | REDESIGN — primary Memory workspace implemented |
| `/workspaces` | Workspace persistence and selection | MOVE — user-facing name is Spaces |
| `/connectors` | Connector testing and GitHub OAuth; integrations APIs | MOVE — user-facing name is Connections |
| `/api-sdk` | REST, SDK, and MCP integration guidance | KEEP/ADD — provider developer surface implemented |
| `/activity` | Conversations, memories, and artifacts from dashboard APIs | REDESIGN — operational Activity framing implemented |
| `/credits` | Authenticated subscription usage APIs | MOVE — user-facing name is Usage |
| `/chat` | First-party assistant client and conversation APIs | MOVE — Assistant, not platform identity |
| `/artifacts` | Uploaded artifact management | KEEP — supporting Assistant/Memory surface |
| `/library` | Uploaded document/library surface | MERGE — consolidate with Memory/Artifacts over time |
| `/projects` | Legacy project context boundary | MOVE — consolidate into Spaces when backend model permits |
| `/integrations` | Legacy platform integration directory | MERGE — Connections is canonical |
| `/skills` | Agent skill registry APIs | DEFER — retain only as Assistant capability |
| `/coding` and `/coding/*` | Coding client and coding APIs | DEFER — first-party Assistant capability |
| `/research` and `/research/*` | Research content/client surface | DEFER — do not promote to platform navigation |
| `/amancrawl`, `/amancrwal` | Web retrieval tools and web APIs | DEFER — legacy tool surface; no new platform navigation |
| `/benchmarks` | Internal/provider evaluation UI | DEFER — operational/admin surface |
| `/status` | Service status UI | KEEP — operational surface, not primary product navigation |
| `/profile` | User profile and preferences | KEEP — account settings |
| `/pricing`, `/subscription` | Plans and billing surfaces | KEEP — account/business surfaces |
| `/admin/metrics` | Admin-only metrics | KEEP — restricted operational surface |
| `/archive` | Legacy archived content | MERGE — expose history from Memory/Activity |
| `/demo`, `/v2` | Legacy marketing/demo variants | DEFER — no canonical navigation link |
| `/dashabord`, `/artifcat` | Misspelled legacy aliases | REMOVE — retain only if redirect compatibility is required |

## Canonical navigation

Home → Memory → Spaces → Connections → API & SDK → Activity → Usage → Assistant

MCP is currently represented in API & SDK because the backend endpoint exists but there is no separate MCP management route. It should become a dedicated surface only when connected-client management is backed by real APIs.

## Compatibility boundary

Legacy route names, internal event names, persisted workspace platform values, storage keys, package names, database identifiers, and backend contracts remain unchanged unless an explicit migration is required. Public labels and metadata use TrueMemory terminology.

## Remaining legacy-reference classification

- `kontext-*` browser events and toast/CSS class names: PRESERVE — runtime compatibility identifiers, not user-visible product identity.
- `kontext-*` local-storage keys and Monaco virtual paths: PRESERVE — persisted client state and editor implementation details.
- `Kontext Memory` workspace platform union values: PRESERVE — serialized/API compatibility value; rendered UI uses TrueMemory/Space terminology.
- Assistant/chat internal error IDs and download filenames: PRESERVE unless surfaced as visible copy; visible Assistant copy should say TrueMemory Assistant.
- Legacy research, coding, web-retrieval, demo, and integration pages: DEFER/MOVE — keep functional routes available, but do not expose them as the platform identity or primary navigation.
- Public metadata, page titles, landing copy, auth copy, onboarding copy, Memory, Spaces, Connections, Activity, Usage, and API & SDK surfaces: MIGRATED to TrueMemory terminology.
