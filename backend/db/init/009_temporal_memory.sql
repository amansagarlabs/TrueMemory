ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_memories_temporal
    ON user_memories(user_id, workspace_id, valid_from DESC, valid_until);
