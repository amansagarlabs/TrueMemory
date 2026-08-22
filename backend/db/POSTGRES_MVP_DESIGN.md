# Postgres MVP Design

## Goal

Use one local PostgreSQL database for the app's core product data before launch:

- users
- login and sessions
- RBAC
- profile settings
- uploaded artifacts
- chat conversations
- chat messages
- retrieval references
- user memory
- profile memory
- API tokens
- audit trail

## Design Principles

- Keep document vectors in `Milvus`
- Keep product and account data in `Postgres`
- Keep the UI simple
- Let the backend decide what conversation memory and profile memory to inject
- Support a clean MVP path first, then expand to full auth and team features later

## Core Domains

### Identity

- `users`
- `user_profiles`
- `auth_identities`
- `user_sessions`
- `api_tokens`

### Authorization

- `roles`
- `permissions`
- `role_permissions`
- `user_roles`

### Product Data

- `artifacts`
- `artifact_pipeline_runs`
- `conversations`
- `conversation_artifacts`
- `messages`
- `message_retrieval_sources`

### Memory

- `user_memories`
- `profile_memories`

### Auditing

- `audit_logs`

## MVP Flow

1. A user signs up or logs in.
2. A row exists in `users`.
3. Profile details live in `user_profiles`.
4. Login sessions live in `user_sessions`.
5. Roles are resolved through `user_roles`.
6. The user uploads a PDF or other artifact into `artifacts`.
7. Each pipeline execution is tracked in `artifact_pipeline_runs`.
8. A chat thread is created in `conversations`.
9. The uploaded artifact is linked to the thread through `conversation_artifacts`.
10. User and assistant messages are stored in `messages`.
11. Retrieved chunk metadata can be logged in `message_retrieval_sources`.
12. Follow-up memory summaries live in `user_memories` and `profile_memories`.

## What Stays Out Of Postgres

- vector embeddings for document chunks
- Milvus retrieval data
- large raw PDF binaries if you keep local filesystem or object storage

Postgres stores metadata and history. Milvus stores semantic retrieval vectors.

## Recommended Auth MVP

For the MVP:

- local email/password login
- hashed passwords in `auth_identities`
- refresh/session tokens in `user_sessions`
- optional personal API tokens in `api_tokens`
- one default role: `user`
- one admin role for internal management

## Recommended RBAC MVP

Seed roles:

- `admin`
- `user`
- `viewer`

Seed permissions:

- `artifact.read`
- `artifact.write`
- `artifact.delete`
- `chat.read`
- `chat.write`
- `chat.delete`
- `memory.read`
- `memory.write`
- `profile.read`
- `profile.write`
- `admin.access`

## Suggested Next Implementation Order

1. Start local Postgres with Docker.
2. Apply `001_mvp_schema.sql`.
3. Build user signup/login routes.
4. Replace temporary local user identity with real `users` and `user_sessions`.
5. Persist artifacts and conversations into Postgres.
6. Save message history and memory summaries into Postgres.
7. Add JWT or session-cookie auth.
8. Add RBAC checks in FastAPI routes.

## Notes

- The current app already uses SQLite for a lightweight memory experiment.
- This Postgres schema is the correct MVP foundation if you want launch-ready product data.
- You can keep SQLite temporarily for local testing, but Postgres should become the primary app database.
