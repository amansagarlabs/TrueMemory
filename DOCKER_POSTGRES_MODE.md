# Docker Postgres Mode Reference

This guide explains when to use Docker Postgres, how pgAdmin fits into the stack, and which environment values to use.

## When to Use Docker Postgres

Use Docker Postgres when:

- you want PostgreSQL managed by Docker Compose
- you want pgAdmin in the browser
- you want the full local infra stack to be reproducible

## Two Database Modes

The backend supports two modes:

### Local Mode

Use this when the backend runs on your machine with:

```powershell
uvicorn main:app --reload --port 8000
```

In this case, the backend should connect to:

- Host: `localhost`
- Port: `5432`

Set:

```env
USE_DOCKER_POSTGRES=false
```

### Docker Mode

Use this when the backend also runs inside Docker Compose.

In this case, the backend should connect to the Docker service name:

- Host: `postgres`
- Port: `5432`

Set:

```env
USE_DOCKER_POSTGRES=true
```

## Recommended Environment Values

Add these to [.env](./.env):

```env
USE_DOCKER_POSTGRES=true
POSTGRES_LOCAL_HOST=localhost
POSTGRES_DOCKER_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=app-agent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=1234567890
DATABASE_URL_LOCAL=postgresql://postgres:1234567890@localhost:5432/app-agent
DATABASE_URL_DOCKER=postgresql://postgres:1234567890@postgres:5432/app-agent
```

## Start Docker Services

Run:

```powershell
docker compose up -d postgres pgadmin
```

## pgAdmin Access

Open:

```text
http://localhost:5050
```

Login:

- Email: `admin@local.dev`
- Password: `admin123`

## Add the Database Server in pgAdmin

Inside pgAdmin, create a server with:

- Host: `postgres`
- Port: `5432`
- Database: `app-agent`
- Username: `postgres`
- Password: `1234567890`

## How the Backend Chooses the Database

The backend reads the flag:

```env
USE_DOCKER_POSTGRES=true|false
```

Behavior:

- `false`: use `DATABASE_URL_LOCAL` or `localhost`
- `true`: use `DATABASE_URL_DOCKER` or Docker host `postgres`

This logic lives in [backend/app/config.py](./backend/app/config.py).

## Health Check

You can confirm the active mode through:

```text
http://127.0.0.1:8000/health
```

The response includes:

- `postgres_connected`
- `postgres_mode`
- `postgres_database`
- `postgres_host`
- `postgres_user`

## Important Rule

- Backend on host machine: use `local` mode
- Backend in Docker: use `docker` mode

## Related Files

- [DOCKER_SETUP.md](./DOCKER_SETUP.md)
- [PGADMIN_SETUP.md](./PGADMIN_SETUP.md)
- [BACKEND_SETUP.md](./BACKEND_SETUP.md)
- [backend/app/config.py](./backend/app/config.py)
- [docker-compose.yml](./docker-compose.yml)
