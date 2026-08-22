ALTER TABLE user_memories
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE user_memories
    ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE user_memories
    DROP CONSTRAINT IF EXISTS user_memories_memory_type_check;

ALTER TABLE user_memories
    ADD CONSTRAINT user_memories_memory_type_check
    CHECK (memory_type IN (
        'conversation_summary', 'preference', 'task_state', 'fact', 'decision'
    ));

ALTER TABLE user_memories
    DROP CONSTRAINT IF EXISTS user_memories_user_id_memory_type_memory_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_memories_workspace_key
    ON user_memories(user_id, workspace_id, memory_type, memory_key);

CREATE INDEX IF NOT EXISTS idx_user_memories_workspace
    ON user_memories(user_id, workspace_id, updated_at DESC);

UPDATE user_memories memory
SET workspace_id = conversation.workspace_id
FROM conversations conversation
WHERE memory.conversation_id = conversation.id
  AND memory.workspace_id IS NULL
  AND conversation.workspace_id IS NOT NULL;
