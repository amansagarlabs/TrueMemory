# Backend Setup

This guide covers local backend setup for the FastAPI app, Python dependencies, schema initialization, and server startup.

## Backend Folder

Run backend commands from:

```text
backend
```

## Install Dependencies

From the project root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If the virtual environment is not activated yet, this command still installs into the project venv directly.

## Activate the Virtual Environment

```powershell
cd backend
.\.venv\Scripts\activate
```

## Start the Backend

```powershell
uvicorn main:app --reload --port 8000
```

Backend URL:

```text
http://127.0.0.1:8000
```

## Apply the Postgres Schema

Make sure PostgreSQL is running first:

```powershell
docker compose up -d postgres
```

Then run:

```powershell
cd backend
.\.venv\Scripts\python.exe .\scripts\init_postgres.py
```

This applies the schema from [backend/db/init/001_mvp_schema.sql](./backend/db/init/001_mvp_schema.sql).

## Important Environment Values

Configured in [.env](./.env):

- `BACKEND_HOST=0.0.0.0`
- `BACKEND_PORT=8000`
- `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `DATABASE_URL=postgresql://postgres:1234567890@localhost:5432/app-agent`
- `MEMORY_DB_PATH=backend/data/memory.db`

## Main Backend Features

- PDF upload
- extraction
- chunking
- tokenization
- embeddings
- Milvus / Zilliz retrieval
- RAG chat
- session memory
- Postgres-backed auth and chat history

## Common Checks

Verify the backend health endpoint:

```text
http://127.0.0.1:8000/health
```

Check Python import issues:

```powershell
cd backend
.\.venv\Scripts\python.exe -m py_compile main.py
```

## Common Issues

### `ModuleNotFoundError: No module named 'psycopg'`

Install requirements again:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Postgres schema not found

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe .\scripts\init_postgres.py
```

### Port 8000 already in use

Stop the old backend process or run on a different port:

```powershell
uvicorn main:app --reload --port 8001
```

## Related Files

- [docker-compose.yml](./docker-compose.yml)
- [PGADMIN_SETUP.md](./PGADMIN_SETUP.md)
- [backend/scripts/init_postgres.py](./backend/scripts/init_postgres.py)
- [backend/services/postgres_store.py](./backend/services/postgres_store.py)
