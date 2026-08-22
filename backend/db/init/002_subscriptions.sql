-- =============================================================================
-- Subscription & Usage Tracking System
-- Migration: 002_subscriptions.sql
-- =============================================================================

-- ── Plan definitions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key TEXT NOT NULL UNIQUE,               -- free, pro, team, enterprise
    plan_name TEXT NOT NULL,                       -- Display name
    description TEXT,
    price_monthly_cents INTEGER NOT NULL DEFAULT 0, -- $0 for free
    price_yearly_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Plan limits (what each plan allows) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    resource_key TEXT NOT NULL,                    -- crawl:scrape, crawl:crawl, ai:tokens, etc.
    limit_value INTEGER NOT NULL DEFAULT -1,       -- -1 = unlimited, 0 = blocked, N = max
    limit_period TEXT NOT NULL DEFAULT 'month',    -- day, month, year, lifetime
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, resource_key)
);

-- ── User subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'trialing', 'past_due', 'canceled', 'expired', 'suspended'
    )),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    canceled_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    payment_provider TEXT,                         -- stripe, razorpay, etc.
    payment_subscription_id TEXT,                  -- External subscription ID
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Usage tracking ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    resource_key TEXT NOT NULL,                    -- crawl:scrape, ai:tokens, etc.
    quantity INTEGER NOT NULL DEFAULT 1,
    model TEXT,                                    -- openai/gpt-4o, etc.
    provider TEXT,                                 -- openrouter, openai, etc.
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost_cents INTEGER,                            -- Cost in cents for billing
    endpoint TEXT,                                 -- API endpoint used
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Usage aggregates (pre-computed for fast queries) ──────────────────────────
CREATE TABLE IF NOT EXISTS usage_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    resource_key TEXT NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    total_tokens_input INTEGER NOT NULL DEFAULT 0,
    total_tokens_output INTEGER NOT NULL DEFAULT 0,
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, period_start, resource_key)
);

-- ── Subscription events (audit trail) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'created', 'activated', 'trial_started', 'trial_ended',
        'upgraded', 'downgraded', 'renewed', 'canceled',
        'payment_failed', 'reactivated', 'expired', 'suspended'
    )),
    old_plan_id UUID REFERENCES plans(id),
    new_plan_id UUID REFERENCES plans(id),
    old_status TEXT,
    new_status TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plans_key ON plans(plan_key);
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_id ON plan_limits(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_resource ON usage_records(user_id, resource_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_aggregates_user ON usage_aggregates(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_subscription_events_sub ON subscription_events(subscription_id, created_at DESC);

-- ── Seed default plans ────────────────────────────────────────────────────────
INSERT INTO plans (plan_key, plan_name, description, price_monthly_cents, price_yearly_cents, sort_order)
VALUES
    ('free', 'Free', 'Get started with basic features', 0, 0, 0),
    ('pro', 'Pro', 'Advanced features for power users', 999, 9900, 1),       -- $9.99/mo, $99/yr
    ('team', 'Team', 'Collaborate with your team', 2999, 29900, 2),          -- $29.99/mo, $299/yr
    ('enterprise', 'Enterprise', 'Custom solutions for organizations', 0, 0, 3) -- Contact sales
ON CONFLICT (plan_key) DO NOTHING;

-- ── Seed plan limits ──────────────────────────────────────────────────────────
-- Free plan limits
INSERT INTO plan_limits (plan_id, resource_key, limit_value, limit_period)
SELECT p.id, lr.resource_key, lr.limit_value, lr.limit_period
FROM plans p
CROSS JOIN (VALUES
    ('crawl:scrape', 10, 'day'),
    ('crawl:map', 5, 'day'),
    ('crawl:search', 10, 'day'),
    ('crawl:crawl', 0, 'month'),
    ('ai:tokens', 50000, 'month'),
    ('ai:requests', 50, 'day'),
    ('documents', 3, 'lifetime'),
    ('memory', 100, 'month')
) AS lr(resource_key, limit_value, limit_period)
WHERE p.plan_key = 'free'
ON CONFLICT (plan_id, resource_key) DO NOTHING;

-- Pro plan limits
INSERT INTO plan_limits (plan_id, resource_key, limit_value, limit_period)
SELECT p.id, lr.resource_key, lr.limit_value, lr.limit_period
FROM plans p
CROSS JOIN (VALUES
    ('crawl:scrape', 200, 'day'),
    ('crawl:map', 100, 'day'),
    ('crawl:search', 200, 'day'),
    ('crawl:crawl', 50, 'month'),
    ('ai:tokens', 500000, 'month'),
    ('ai:requests', 500, 'day'),
    ('documents', 50, 'lifetime'),
    ('memory', 1000, 'month')
) AS lr(resource_key, limit_value, limit_period)
WHERE p.plan_key = 'pro'
ON CONFLICT (plan_id, resource_key) DO NOTHING;

-- Team plan limits
INSERT INTO plan_limits (plan_id, resource_key, limit_value, limit_period)
SELECT p.id, lr.resource_key, lr.limit_value, lr.limit_period
FROM plans p
CROSS JOIN (VALUES
    ('crawl:scrape', 1000, 'day'),
    ('crawl:map', 500, 'day'),
    ('crawl:search', 1000, 'day'),
    ('crawl:crawl', 200, 'month'),
    ('ai:tokens', 2000000, 'month'),
    ('ai:requests', 2000, 'day'),
    ('documents', 200, 'lifetime'),
    ('memory', 5000, 'month')
) AS lr(resource_key, limit_value, limit_period)
WHERE p.plan_key = 'team'
ON CONFLICT (plan_id, resource_key) DO NOTHING;

-- Enterprise: unlimited everything
INSERT INTO plan_limits (plan_id, resource_key, limit_value, limit_period)
SELECT p.id, lr.resource_key, -1, lr.limit_period
FROM plans p
CROSS JOIN (VALUES
    ('crawl:scrape', 'month'),
    ('crawl:map', 'month'),
    ('crawl:search', 'month'),
    ('crawl:crawl', 'month'),
    ('ai:tokens', 'month'),
    ('ai:requests', 'month'),
    ('documents', 'lifetime'),
    ('memory', 'month')
) AS lr(resource_key, limit_period)
WHERE p.plan_key = 'enterprise'
ON CONFLICT (plan_id, resource_key) DO NOTHING;

-- ── Update users table to reference subscriptions ─────────────────────────────
-- Add subscription_id to users for quick lookup
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team', 'enterprise'));
