# Changes — 2026-09-17

## Backend deployment fixes

- Updated the backend Docker image to respect Render's injected `PORT` value.
- Fixed the PostgreSQL migration path so migrations are found correctly inside the container.
- Prevented the optional CrewAI web-crawling service from crashing application startup when `OPENROUTER_API_KEY` is not configured.
- Added backend environment files to `.dockerignore` so local secrets are not copied into the production image.
- Updated the Docker startup command to apply PostgreSQL migrations before starting Uvicorn.

## Database migrations

- The backend includes 18 SQL migration files under `backend/db/init/`.
- The container runs `python scripts/init_postgres.py` before starting the API.
- The migration command requires Render's production `DATABASE_URL` to point to Supabase.

## Render deployment notes

- Render service root directory: `backend`
- Runtime: Docker
- Dockerfile: `backend/Dockerfile`
- Health check endpoint: `/readiness`
- Do not commit `.env` files or production credentials.

## Verification

After deployment, verify:

```text
https://YOUR-RENDER-SERVICE.onrender.com/readiness
```

Expected migration log output includes:

```text
Postgres schema applied from 18 migration files
```
