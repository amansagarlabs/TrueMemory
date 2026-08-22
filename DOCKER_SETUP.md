# Docker Setup

This project uses Docker Compose for local infrastructure services such as PostgreSQL and pgAdmin.

## Services

- `postgres` for the local app database
- `pgadmin` for browser-based database inspection

## Start Postgres

Run:

```powershell
docker compose up -d postgres
```

## Start pgAdmin

Run:

```powershell
docker compose up -d pgadmin
```

## Start All Docker Services

Run:

```powershell
docker compose up -d
```

## Stop Services

Run:

```powershell
docker compose down
```

## Rebuild Services

Run:

```powershell
docker compose up -d --build
```

## View Running Containers

Run:

```powershell
docker compose ps
```

## View Logs

Postgres:

```powershell
docker compose logs postgres
```

pgAdmin:

```powershell
docker compose logs pgadmin
```

Backend:

```powershell
docker compose logs backend
```

## PostgreSQL Connection Values

From [.env](./.env):

- Host: `localhost`
- Port: `5432`
- Database: `app-agent`
- Username: `postgres`
- Password: `1234567890`

## pgAdmin Web Access

Open:

```text
http://localhost:5432
```

Login:

- Email: `admin@local.dev`
- Password: `admin123`

Inside pgAdmin, add a server with:

- Host: `postgres`
- Port: `5432`
- Database: `app-agent`
- Username: `postgres`
- Password: `1234567890`

## Useful Commands

Restart one service:

```powershell
docker compose restart postgres
```

Remove stopped containers:

```powershell
docker compose rm
```

## Notes

- `postgres` is the Docker Compose service name used by other containers.
- pgAdmin reaches the database using `postgres`, not `localhost`, from inside Docker.
- Database schema is defined in [backend/db/init/001_mvp_schema.sql](./backend/db/init/001_mvp_schema.sql).
