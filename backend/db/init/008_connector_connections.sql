CREATE TABLE IF NOT EXISTS connector_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    account_id TEXT,
    account_login TEXT,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_connections_user
    ON connector_connections (user_id, connector_id);
