-- Add isolated history scopes for agent and workflow surfaces.
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;

ALTER TABLE conversations
ADD CONSTRAINT conversations_conversation_type_check
CHECK (
  conversation_type IN (
    'artifact_chat',
    'general_chat',
    'support_chat',
    'coding_chat',
    'agents_chat',
    'workflow_chat'
  )
);
