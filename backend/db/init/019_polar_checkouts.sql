-- Track Polar checkout sessions before redirecting the customer.
-- Webhooks remain the source of truth for entitlement changes.
CREATE TABLE IF NOT EXISTS polar_checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_key TEXT NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    status TEXT NOT NULL DEFAULT 'open',
    subscription_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polar_checkouts_user ON polar_checkouts(user_id, created_at DESC);
