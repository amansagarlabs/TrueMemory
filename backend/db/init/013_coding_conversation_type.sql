-- Keep coding-agent conversations distinct from normal chat conversations.
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;

ALTER TABLE conversations
ADD CONSTRAINT conversations_conversation_type_check
CHECK (
  conversation_type IN ('artifact_chat', 'general_chat', 'support_chat', 'coding_chat', 'agents_chat', 'workflow_chat')
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_type_recent
ON conversations(user_id, conversation_type, status, updated_at DESC);
