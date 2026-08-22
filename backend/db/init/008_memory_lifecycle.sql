ALTER TABLE user_memories
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'approved'
        CHECK (lifecycle_status IN ('pending', 'approved', 'rejected', 'superseded', 'archived'));
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.750;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS supersedes_memory_id UUID REFERENCES user_memories(id) ON DELETE SET NULL;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

DROP INDEX IF EXISTS uq_user_memories_workspace_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_user_memory_key
    ON user_memories (
        user_id,
        workspace_id,
        COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
        memory_type,
        memory_key
    )
    WHERE lifecycle_status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_user_memories_lifecycle
    ON user_memories(user_id, workspace_id, project_id, lifecycle_status, is_pinned DESC, updated_at DESC);
