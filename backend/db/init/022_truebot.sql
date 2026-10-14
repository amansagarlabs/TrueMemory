-- Additive migration. Apply with the existing privileged migration role.
BEGIN;
CREATE TABLE IF NOT EXISTS truebot_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider = 'openai'),
    model TEXT NOT NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    tools JSONB NOT NULL DEFAULT '[]',
    max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens BETWEEN 256 AND 4096),
    max_steps INTEGER NOT NULL CHECK (max_steps BETWEEN 1 AND 6),
    timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds BETWEEN 15 AND 120),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS truebot_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES truebot_agents(id),
    idempotency_key UUID NOT NULL,
    task TEXT NOT NULL CHECK (length(task) BETWEEN 1 AND 20000),
    agent_snapshot JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    output TEXT NOT NULL DEFAULT '',
    error TEXT,
    usage JSONB NOT NULL DEFAULT '{}',
    progress JSONB NOT NULL DEFAULT '[]',
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS truebot_agents_owner ON truebot_agents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS truebot_runs_owner ON truebot_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS truebot_runs_agent ON truebot_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS truebot_runs_queue ON truebot_runs(created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS truebot_runs_lease ON truebot_runs(lease_expires_at) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS truebot_worker_heartbeat (
    worker_name TEXT PRIMARY KEY,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Browser roles have no direct access. API and worker use the existing server role.
ALTER TABLE truebot_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE truebot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE truebot_worker_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON truebot_agents, truebot_runs, truebot_worker_heartbeat FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON truebot_agents, truebot_runs, truebot_worker_heartbeat FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON truebot_agents, truebot_runs, truebot_worker_heartbeat FROM authenticated;
    END IF;
END;
$$;
COMMIT;
