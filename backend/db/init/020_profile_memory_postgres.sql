-- Durable profile-memory contract used by REST, MCP, Python, and agents.
-- Existing profile_memories rows remain intact; legacy rows get the general scope.
ALTER TABLE profile_memories
    ADD COLUMN IF NOT EXISTS doc_id TEXT NOT NULL DEFAULT 'general';
ALTER TABLE profile_memories ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE profile_memories ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE profile_memories ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.750;
ALTER TABLE profile_memories ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- Preserve legacy artifact-scoped uniqueness while adding the general/profile scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_memories_scope_key
    ON profile_memories(user_id, doc_id, profile_key)
    WHERE artifact_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_memories_artifact_key
    ON profile_memories(user_id, artifact_id, profile_key)
    WHERE artifact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profile_memories_scope_updated
    ON profile_memories(user_id, doc_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS profile_memory_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL DEFAULT 'general',
    profile_key TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chat-summary',
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.750
        CHECK (confidence_score BETWEEN 0 AND 1),
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep service-role data access and deny direct client access by default.
REVOKE ALL ON TABLE profile_memories, profile_memory_revisions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profile_memories, profile_memory_revisions TO service_role, postgres;

CREATE INDEX IF NOT EXISTS idx_profile_memory_revisions_scope
    ON profile_memory_revisions(user_id, doc_id, profile_key, revision DESC);

ALTER TABLE profile_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_memory_revisions ENABLE ROW LEVEL SECURITY;
-- Keep the legacy default scope and make it consistent with the prior unique
-- constraint that treated NULL artifact IDs as distinct.
UPDATE profile_memories SET doc_id = 'general' WHERE doc_id IS NULL OR btrim(doc_id) = '';
ALTER TABLE profile_memories ALTER COLUMN doc_id SET DEFAULT 'general';
ALTER TABLE profile_memories ALTER COLUMN doc_id SET NOT NULL;
-- Do not expose these rows through the Data API. The backend owns authorization
-- and connects with its server-side database role.
REVOKE ALL ON TABLE profile_memories, profile_memory_revisions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profile_memories, profile_memory_revisions TO service_role;
