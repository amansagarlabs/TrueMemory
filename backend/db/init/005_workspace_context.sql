CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'Kontext Memory',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
    ON workspaces(owner_user_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace
    ON conversations(user_id, workspace_id, updated_at DESC);
