# Recent Developer Changes

This file summarizes the recent implementation changes across the frontend, backend, Docker, authentication, and PostgreSQL integration.

## Overview

The project now supports:

- the new chat-first UI
- PDF upload and RAG pipeline integration in that UI
- Postgres-backed auth and chat history
- Docker Postgres and pgAdmin support
- local mode vs Docker mode database switching
- backend health reporting for database status

## Frontend Changes

## Chat UI

The main page uses the new chat experience through:

- [app/page.tsx](./app/page.tsx)
- [components/chat/ChatInterface.tsx](./components/chat/ChatInterface.tsx)

The chat UI now includes:

- compact composer
- Lucide icons
- upload from `+`
- attachment chip states
- model picker
- service status dropdown
- pipeline visualization
- recent chats in the sidebar
- current logged-in user in the sidebar
- hover-only logout button

## Chat Behavior

The chat interface now works with backend features instead of only demo UI behavior:

- uploads call the backend upload API
- pipeline visualization runs against the backend
- RAG chat uses the existing backend stream API
- recent conversations load from Postgres
- prior conversation messages can be reopened from the sidebar

Related files:

- [components/chat/ChatInterface.tsx](./components/chat/ChatInterface.tsx)
- [components/chat/MessageList.tsx](./components/chat/MessageList.tsx)
- [services/api.ts](./services/api.ts)
- [lib/storage.ts](./lib/storage.ts)
- [lib/auth.ts](./lib/auth.ts)

## Answer Quality Improvements

RAG responses were improved so answers feel more product-like and less like raw retrieval output.

Changes:

- removed chunk-style phrasing such as `According to chunk...`
- added stronger summary highlighting in the UI
- improved prompt guidance for concise and natural answers

Related files:

- [backend/rag/prompt_builder.py](./backend/rag/prompt_builder.py)
- [components/chat/MessageList.tsx](./components/chat/MessageList.tsx)
- [components/chat/types.ts](./components/chat/types.ts)

## Backend Changes

## Auth

Email/password auth was added with Postgres-backed persistence.

Implemented endpoints:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Features:

- password hashing with PBKDF2
- access token hashing in session storage
- refresh token hashing
- session rotation on refresh
- session revocation on logout

Related files:

- [backend/app/routes/auth.py](./backend/app/routes/auth.py)
- [backend/services/auth_store.py](./backend/services/auth_store.py)
- [app/login/page.tsx](./app/login/page.tsx)
- [app/signup/page.tsx](./app/signup/page.tsx)
- [components/auth/AuthForm.tsx](./components/auth/AuthForm.tsx)
- [services/auth.ts](./services/auth.ts)

## Postgres Persistence

Postgres persistence was added for:

- users
- sessions
- conversations
- messages
- retrieval sources
- memory foundations

Related files:

- [backend/services/postgres_store.py](./backend/services/postgres_store.py)
- [backend/db/init/001_mvp_schema.sql](./backend/db/init/001_mvp_schema.sql)
- [backend/scripts/init_postgres.py](./backend/scripts/init_postgres.py)

## Memory

A lightweight memory layer was added for short-term and profile-style memory.

Behavior:

- recent conversation turns stored in SQLite
- small profile memory store
- injected into prompt building alongside retrieved PDF chunks

Related files:

- [backend/services/memory_store.py](./backend/services/memory_store.py)
- [backend/rag/prompt_builder.py](./backend/rag/prompt_builder.py)

## Database Mode Switching

The backend now supports two Postgres modes:

- `local`
- `docker`

This is controlled by:

```env
USE_DOCKER_POSTGRES=true|false
```

Behavior:

- `false` means host-based backend connects to `localhost`
- `true` means Docker-based backend connects to service name `postgres`

Related files:

- [backend/app/config.py](./backend/app/config.py)
- [backend/app/routes/health.py](./backend/app/routes/health.py)
- [services/api.ts](./services/api.ts)
- [.env](./.env)
- [.env.example](./.env.example)

## Health Endpoint Changes

`/health` now reports Postgres state too.

Response fields include:

- `postgres_connected`
- `postgres_mode`
- `postgres_database`
- `postgres_host`
- `postgres_user`
- `postgres_reason`

This makes it easy to verify whether signup/login and persistence are using local or Docker Postgres.

## Docker Changes

## Services

Docker Compose now supports:

- `postgres`
- `pgadmin`
- `backend`

Related file:

- [docker-compose.yml](./docker-compose.yml)

## pgAdmin

pgAdmin was added for browser-based database inspection.

Default access:

- URL: `http://localhost:5050`
- Email: `admin@local.dev`
- Password: `admin123`

## Backend Docker Build Improvements

The backend Docker image was improved to avoid unnecessary GPU-related downloads.

Changes:

- preinstalls CPU-only `torch`
- avoids CUDA-heavy NVIDIA wheel downloads
- added backend Docker ignore rules

Related files:

- [backend/Dockerfile](./backend/Dockerfile)
- [backend/.dockerignore](./backend/.dockerignore)

## Documentation Added

The repo now includes these setup/reference files:

- [PGADMIN_SETUP.md](./PGADMIN_SETUP.md)
- [DOCKER_SETUP.md](./DOCKER_SETUP.md)
- [BACKEND_SETUP.md](./BACKEND_SETUP.md)
- [DOCKER_POSTGRES_MODE.md](./DOCKER_POSTGRES_MODE.md)
- [MEMORY_UPGRADE_PLAN.md](./MEMORY_UPGRADE_PLAN.md)
- [backend/db/POSTGRES_MVP_DESIGN.md](./backend/db/POSTGRES_MVP_DESIGN.md)

## Current Recommended Flows

## Host Backend + Docker Postgres

Use when:

- FastAPI runs with `uvicorn` on your machine
- Postgres runs in Docker

Set:

```env
USE_DOCKER_POSTGRES=false
```

## Full Docker Mode

Use when:

- backend runs in Docker
- Postgres runs in Docker
- pgAdmin runs in Docker

Set:

```env
USE_DOCKER_POSTGRES=true
```

Verify with:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/health | ConvertTo-Json -Depth 4
```

Expected:

- `postgres_connected: true`
- `postgres_mode: "docker"`

## Useful Verification Steps

## Auth

Test:

1. Sign up a new user
2. Log in
3. Confirm rows in:
   - `users`
   - `auth_identities`
   - `user_sessions`

## Chat Persistence

Test:

1. Upload a PDF
2. Ask a question
3. Confirm rows in:
   - `conversations`
   - `messages`
   - `message_retrieval_sources`

## Developer Notes

- The frontend currently stores auth data in local storage.
- The chat UI can show the signed-in user in the sidebar.
- The app still has a `local-user` fallback path in some chat flows; a future improvement is full end-to-end logged-in user binding for chat persistence.
- Docker backend builds are much better after excluding `.venv` and preinstalling CPU-only `torch`.

## Suggested Next Steps

- bind chat history fully to the authenticated user instead of fallback user IDs
- add automatic frontend refresh-token handling
- link all setup docs from `README.md`
- optionally add preconfigured pgAdmin server import
