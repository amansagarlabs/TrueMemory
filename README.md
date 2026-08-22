# Kontext Local Checkout

This repo is a local working tree for `AmanSagar0607/Kontext`.
The remote GitHub repo is the source of truth when this checkout drifts.

## Canonical Docs

The platform now has source-of-truth docs under `docs/`:

- [Docs index](docs/README.md)
- [Research](docs/research/MEMORY_RESEARCH.md)
- [Vision](docs/vision/VISION.md)
- [Platform strategy](docs/strategy/PLATFORM_STRATEGY.md)
- [Memory architecture](docs/architecture/MEMORY_ARCHITECTURE.md)
- [Benchmark plan](docs/benchmarks/BENCHMARK_PLAN.md)
- [Package install guide](docs/setup/README.md)

## Remote Source

- GitHub: `https://github.com/AmanSagar0607/Kontext`
- Use remote repo for latest structure, naming, and product direction.

## Current Stack

- Next.js frontend
- FastAPI backend
- Zilliz Cloud / Milvus for vector retrieval
- PostgreSQL for auth, sessions, conversations, and chat history
- pgAdmin for database inspection

## What This App Does

- sign up and log in with email/password
- upload a PDF
- extract, chunk, tokenize, embed, and store vector data
- ask questions about the uploaded document
- persist users, sessions, and recent chats in Postgres

## Project Structure

```text
my-ai-app/
  app/                      Next.js app router pages
  components/               frontend UI
  lib/                      shared frontend helpers and types
  services/                 frontend API clients
  backend/
    app/                    FastAPI config and routes
    db/                     Postgres schema and docs
    rag/                    retrieval and prompt building
    services/               auth, memory, Postgres, upload helpers
    scripts/                utility scripts
    Dockerfile
    requirements.txt
  docker-compose.yml
  .env.example
```

## Prerequisites

- Node.js
- Python 3.11+
- Docker Desktop
- npm

## 1. Environment Setup

Copy the example env:

```powershell
copy .env.example .env
```

Update `.env` with your real values for:

- `OPENROUTER_API_KEY`
- `MILVUS_ADDRESS`
- `MILVUS_TOKEN`

Important Postgres values already supported:

```env
USE_DOCKER_POSTGRES=false
POSTGRES_LOCAL_HOST=localhost
POSTGRES_DOCKER_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=app-agent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=1234567890
DATABASE_URL_LOCAL=postgresql://postgres:1234567890@localhost:5432/app-agent
DATABASE_URL_DOCKER=postgresql://postgres:1234567890@postgres:5432/app-agent
```

## 2. Install Frontend Dependencies

From the project root:

```powershell
npm install
```

## 3. Install Backend Dependencies

From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 4. Start PostgreSQL and pgAdmin

From the project root:

```powershell
docker compose up -d postgres pgadmin
```

pgAdmin:

- URL: `http://localhost:5050`
- Email: `admin@local.dev`
- Password: `admin123`

## 5. Apply the Postgres Schema

From the project root:

```powershell
cd backend
.\.venv\Scripts\python.exe .\scripts\init_postgres.py
```

This creates the MVP tables for:

- users
- auth identities
- user sessions
- conversations
- messages
- retrieval sources
- memory records

## 6. Run the App

You can run the app in two main ways.

## Option A: Backend on Host Machine, Postgres in Docker

Use this if you run FastAPI directly with `uvicorn`.

Set:

```env
USE_DOCKER_POSTGRES=false
```

Run backend:

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Run frontend:

```powershell
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## Option B: Full Docker Mode

Use this if you want backend + Postgres + pgAdmin all in Docker.

Set:

```env
USE_DOCKER_POSTGRES=true
```

Run:

```powershell
docker compose up -d postgres pgadmin backend
```

If you still run Next.js locally:

```powershell
npm run dev
```

## 7. Verify the Backend

Run:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/health | ConvertTo-Json -Depth 4
```

For host-backend mode, you want:

- `postgres_connected: true`
- `postgres_mode: "local"`

For full Docker mode, you want:

- `postgres_connected: true`
- `postgres_mode: "docker"`

## 8. Verify the Database

In pgAdmin, add a server with:

- Host: `postgres`
- Port: `5432`
- Database: `app-agent`
- Username: `postgres`
- Password: `1234567890`

Useful tables:

- `users`
- `auth_identities`
- `user_sessions`
- `conversations`
- `messages`
- `message_retrieval_sources`

## 9. Test the Main Flow

1. Sign up
2. Log in
3. Upload a PDF
4. Wait for the pipeline to finish
5. Ask a question in chat
6. Refresh pgAdmin and confirm rows appear in Postgres

## Common Commands

Start Docker services:

```powershell
docker compose up -d postgres pgadmin
```

Run backend locally:

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Run frontend locally:

```powershell
npm run dev
```

Check Docker containers:

```powershell
docker compose ps
```

Check backend logs in Docker:

```powershell
docker compose logs backend
```

Rebuild backend container:

```powershell
docker compose build --no-cache backend
docker compose up -d backend
```

## Notes

- The backend Docker image is configured for CPU-only PyTorch to avoid heavy CUDA downloads.
- Zilliz / Milvus is managed remotely, not run locally in Docker.
- The health endpoint now reports Postgres mode and connection state.

## Developer Docs

Additional repo docs:

- [BACKEND_SETUP.md](./BACKEND_SETUP.md)
- [DOCKER_SETUP.md](./DOCKER_SETUP.md)
- [PGADMIN_SETUP.md](./PGADMIN_SETUP.md)
- [DOCKER_POSTGRES_MODE.md](./DOCKER_POSTGRES_MODE.md)
- [MEMORY_UPGRADE_PLAN.md](./MEMORY_UPGRADE_PLAN.md)
- [RECENT_DEV_CHANGES.md](./RECENT_DEV_CHANGES.md)
- [backend/db/POSTGRES_MVP_DESIGN.md](./backend/db/POSTGRES_MVP_DESIGN.md)
