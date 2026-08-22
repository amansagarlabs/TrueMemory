# pgAdmin Web Preview Setup

pgAdmin is included in the local Docker stack so you can browse the PostgreSQL database in the browser.

## Start pgAdmin

Run:

```powershell
docker compose up -d pgadmin
```

## Open in Browser

Go to:

```text
http://localhost:5050
```

## Login

Use:

- Email: `admin@local.dev`
- Password: `admin123`

These values come from [.env](./.env).

## Add the Postgres Server

Inside pgAdmin, create a new server with:

- Host: `postgres`
- Port: `5432`
- Database: `app-agent`
- Username: `postgres`
- Password: `1234567890`

`postgres` is the Docker service name, so pgAdmin can reach it through the Docker Compose network.

## Useful Tables to Check

After connecting, you can inspect tables such as:

- `users`
- `user_sessions`
- `conversations`
- `messages`
- `artifacts`
- `user_memories`
- `profile_memories`

## Notes

- PostgreSQL should already be running with:

```powershell
docker compose up -d postgres
```

- If pgAdmin does not open, verify that port `5050` is free on your machine.
