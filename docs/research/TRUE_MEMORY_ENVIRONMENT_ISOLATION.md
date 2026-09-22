# TrueMemory Environment Isolation

## Active configuration

The active `backend/.env` is configured for production Supabase PostgreSQL:

- `APP_ENV=production`
- `USE_DOCKER_POSTGRES=false`
- `DATABASE_URL` points to the Supabase pooler host (credentials are not documented here)
- database: `postgres`

The backend resolves this through the normal `DATABASE_URL` configuration path. MemoryCore remains environment-neutral; the database provider is selected by configuration.

## Test configuration

`docker-compose.test.yml` defines a separate disposable `postgres-test` service and `api-test` service. It requires the test-only `TRUEMEMORY_TEST_DB_PASSWORD` variable and must not reuse production credentials. Do not run destructive portability tests until that isolated stack is started and verified healthy.

## Safety

Production Supabase must never be used as a disposable portability target. `backend/.env`, frontend local env files, and secret-bearing environment files are ignored by Git; example files contain configuration names only.

## Verification

The active backend configuration was inspected without printing secrets: environment `production`, Supabase pooler host, database `postgres`, Docker Postgres disabled. Docker test config inspection confirms the separate `postgres-test` target, but service startup was not performed in this audit.
