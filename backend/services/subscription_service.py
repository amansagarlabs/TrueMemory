"""
Subscription & Usage Tracking service.

Handles plan management, subscription lifecycle, usage recording,
and limit enforcement.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row


def _connect(settings) -> psycopg.Connection:
    return psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        options="-c search_path=public",
    )


# ── Plan operations ──────────────────────────────────────────────────────────

def get_all_plans(settings) -> list[dict]:
    """Return all active plans with their limits."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    p.id::text, p.plan_key, p.plan_name, p.description,
                    p.price_monthly_cents, p.price_yearly_cents, p.currency,
                    p.sort_order
                FROM plans p
                WHERE p.is_active = TRUE
                ORDER BY p.sort_order
            """)
            plans = cur.fetchall()

            for plan in plans:
                cur.execute("""
                    SELECT resource_key, limit_value, limit_period
                    FROM plan_limits
                    WHERE plan_id = %s
                """, (plan["id"],))
                plan["limits"] = {
                    row["resource_key"]: {
                        "value": row["limit_value"],
                        "period": row["limit_period"],
                    }
                    for row in cur.fetchall()
                }
    return plans


def get_plan_by_key(settings, plan_key: str) -> dict | None:
    """Get a single plan by its key."""
    plans = get_all_plans(settings)
    for p in plans:
        if p["plan_key"] == plan_key:
            return p
    return None


# ── Subscription operations ──────────────────────────────────────────────────

def get_user_subscription(settings, user_id: str) -> dict | None:
    """Get the active subscription for a user.
    Falls back to users.plan column if no subscription row exists.
    """
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            # Try subscriptions table first
            cur.execute("""
                SELECT
                    s.id::text, s.status, s.billing_cycle,
                    s.current_period_start, s.current_period_end,
                    s.trial_ends_at, s.canceled_at, s.cancel_at_period_end,
                    s.payment_provider, s.payment_subscription_id,
                    p.plan_key, p.plan_name, p.price_monthly_cents, p.price_yearly_cents
                FROM subscriptions s
                JOIN plans p ON p.id = s.plan_id
                WHERE s.user_id = %s
                  AND s.status IN ('active', 'trialing')
                ORDER BY s.created_at DESC
                LIMIT 1
            """, (user_id,))
            row = cur.fetchone()
            if row:
                return row

            # Fallback: read plan from users table
            cur.execute("SELECT plan FROM users WHERE id = %s", (user_id,))
            user_row = cur.fetchone()
            plan_key = (user_row["plan"] if user_row else "free") or "free"

            # Look up plan details
            cur.execute("""
                SELECT plan_key, plan_name, price_monthly_cents, price_yearly_cents
                FROM plans WHERE plan_key = %s
            """, (plan_key,))
            plan_row = cur.fetchone()

            return {
                "id": None,
                "status": "active",
                "billing_cycle": "monthly",
                "current_period_start": None,
                "current_period_end": None,
                "trial_ends_at": None,
                "canceled_at": None,
                "cancel_at_period_end": False,
                "payment_provider": None,
                "payment_subscription_id": None,
                "plan_key": plan_key,
                "plan_name": plan_row["plan_name"] if plan_row else plan_key.title(),
                "price_monthly_cents": plan_row["price_monthly_cents"] if plan_row else 0,
                "price_yearly_cents": plan_row["price_yearly_cents"] if plan_row else 0,
            }


def create_subscription(
    settings,
    *,
    user_id: str,
    plan_key: str,
    billing_cycle: str = "monthly",
    trial_days: int = 0,
    payment_provider: str | None = None,
    payment_subscription_id: str | None = None,
) -> dict:
    """Create a new subscription for a user."""
    plan = get_plan_by_key(settings, plan_key)
    if not plan:
        raise ValueError(f"Unknown plan: {plan_key}")

    now = datetime.now(timezone.utc)
    trial_ends = (now + timedelta(days=trial_days)) if trial_days > 0 else None
    period_end = now + timedelta(days=30 if billing_cycle == "monthly" else 365)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            # Cancel any existing active subscription
            cur.execute("""
                UPDATE subscriptions
                SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
                WHERE user_id = %s AND status IN ('active', 'trialing')
            """, (user_id,))

            # Create new subscription
            cur.execute("""
                INSERT INTO subscriptions (
                    user_id, plan_id, status, billing_cycle,
                    trial_ends_at, current_period_start, current_period_end,
                    payment_provider, payment_subscription_id
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id::text
            """, (
                user_id, plan["id"],
                "trialing" if trial_ends else "active",
                billing_cycle, trial_ends, now, period_end,
                payment_provider, payment_subscription_id,
            ))
            sub_id = cur.fetchone()["id"]

            # Update user's plan and subscription_id
            cur.execute("""
                UPDATE users
                SET plan = %s, subscription_id = %s, updated_at = NOW()
                WHERE id = %s
            """, (plan_key, sub_id, user_id))

            # Log event
            cur.execute("""
                INSERT INTO subscription_events (subscription_id, user_id, event_type, new_plan_id, new_status)
                VALUES (%s, %s, 'created', %s, %s)
            """, (sub_id, user_id, plan["id"], "trialing" if trial_ends else "active"))

            conn.commit()

    return get_user_subscription(settings, user_id)


def cancel_subscription(settings, user_id: str) -> dict | None:
    """Cancel a user's subscription (at period end)."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE subscriptions
                SET cancel_at_period_end = TRUE, canceled_at = NOW(), updated_at = NOW()
                WHERE user_id = %s AND status = 'active'
                RETURNING id::text
            """, (user_id,))
            row = cur.fetchone()
            if row:
                cur.execute("""
                    INSERT INTO subscription_events (subscription_id, user_id, event_type)
                    VALUES (%s, %s, 'canceled')
                """, (row["id"], user_id))
                conn.commit()
    return get_user_subscription(settings, user_id)


def upgrade_subscription(settings, user_id: str, new_plan_key: str) -> dict:
    """Upgrade or change a user's subscription plan."""
    new_plan = get_plan_by_key(settings, new_plan_key)
    if not new_plan:
        raise ValueError(f"Unknown plan: {new_plan_key}")

    current = get_user_subscription(settings, user_id)
    old_plan_key = current["plan_key"] if current else "free"

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            if current:
                cur.execute("""
                    UPDATE subscriptions
                    SET plan_id = %s, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id::text
                """, (new_plan["id"], current["id"]))
                sub_id = cur.fetchone()["id"]

                cur.execute("""
                    INSERT INTO subscription_events (subscription_id, user_id, event_type, old_plan_id, new_plan_id, old_status, new_status)
                    VALUES (%s, %s, 'upgraded', %s, %s, %s, 'active')
                """, (sub_id, user_id, current.get("plan_key"), new_plan["id"], current["status"]))
            else:
                # No existing subscription, create one
                return create_subscription(settings, user_id=user_id, plan_key=new_plan_key)

            cur.execute("""
                UPDATE users SET plan = %s, updated_at = NOW() WHERE id = %s
            """, (new_plan_key, user_id))
            conn.commit()

    return get_user_subscription(settings, user_id)


# ── Usage tracking ──────────────────────────────────────────────────────────

def record_usage(
    settings,
    *,
    user_id: str,
    resource_key: str,
    quantity: int = 1,
    model: str | None = None,
    provider: str | None = None,
    tokens_input: int | None = None,
    tokens_output: int | None = None,
    cost_cents: int | None = None,
    endpoint: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Record a usage event."""
    sub = get_user_subscription(settings, user_id)
    sub_id = sub["id"] if sub else None

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO usage_records (
                    user_id, subscription_id, resource_key, quantity,
                    model, provider, tokens_input, tokens_output,
                    cost_cents, endpoint, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """, (
                user_id, sub_id, resource_key, quantity,
                model, provider, tokens_input, tokens_output,
                cost_cents, endpoint,
                __import__("json").dumps(metadata) if metadata else "{}",
            ))

            # Update aggregates
            now = datetime.now(timezone.utc)
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            cur.execute("""
                INSERT INTO usage_aggregates (
                    user_id, subscription_id, period_start, period_end,
                    resource_key, total_quantity, total_tokens_input,
                    total_tokens_output, total_cost_cents, last_updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (user_id, period_start, resource_key)
                DO UPDATE SET
                    total_quantity = usage_aggregates.total_quantity + EXCLUDED.total_quantity,
                    total_tokens_input = usage_aggregates.total_tokens_input + EXCLUDED.total_tokens_input,
                    total_tokens_output = usage_aggregates.total_tokens_output + EXCLUDED.total_tokens_output,
                    total_cost_cents = usage_aggregates.total_cost_cents + EXCLUDED.total_cost_cents,
                    last_updated_at = NOW()
            """, (
                user_id, sub_id, period_start, now,
                resource_key, quantity,
                tokens_input or 0, tokens_output or 0, cost_cents or 0,
            ))
            conn.commit()


def get_usage_summary(settings, user_id: str) -> dict:
    """Get current usage summary for a user, with correct daily/monthly periods per resource."""
    now = datetime.now(timezone.utc)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            # Get plan
            plan = get_user_subscription(settings, user_id)
            plan_key = plan["plan_key"] if plan else "free"

            # Get all limits for this plan
            cur.execute("""
                SELECT pl.resource_key, pl.limit_value, pl.limit_period
                FROM plan_limits pl
                JOIN plans p ON p.id = pl.plan_id
                WHERE p.plan_key = %s
            """, (plan_key,))
            limit_rows = cur.fetchall()

            usage = {}
            for lr in limit_rows:
                rk = lr["resource_key"]
                limit_value = lr["limit_value"]
                limit_period = lr["limit_period"]

                # Compute correct period start
                if limit_period == "day":
                    period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                elif limit_period == "month":
                    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                elif limit_period == "year":
                    period_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                else:
                    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

                # Get usage for this period
                cur.execute("""
                    SELECT COALESCE(SUM(total_quantity), 0) as used,
                           COALESCE(SUM(total_tokens_input), 0) as tokens_input,
                           COALESCE(SUM(total_tokens_output), 0) as tokens_output,
                           COALESCE(SUM(total_cost_cents), 0) as cost_cents
                    FROM usage_aggregates
                    WHERE user_id = %s AND resource_key = %s AND period_start = %s
                """, (user_id, rk, period_start))
                row = cur.fetchone()

                # Compute reset_at
                if limit_period == "day":
                    reset_at = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                elif limit_period == "month":
                    if now.month == 12:
                        reset_at = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    else:
                        reset_at = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
                else:
                    reset_at = None

                remaining = max(0, limit_value - row["used"]) if limit_value > 0 else -1

                usage[rk] = {
                    "used": row["used"],
                    "limit": limit_value,
                    "period": limit_period,
                    "remaining": remaining,
                    "reset_at": reset_at.isoformat() if reset_at else None,
                    "tokens_input": row["tokens_input"],
                    "tokens_output": row["tokens_output"],
                    "cost_cents": row["cost_cents"],
                }

    return {
        "plan": plan_key,
        "usage": usage,
    }


def check_rate_limit(settings, user_id: str, resource_key: str) -> dict:
    """Check if user has exceeded their rate limit for a resource."""
    now = datetime.now(timezone.utc)

    plan = get_user_subscription(settings, user_id)
    plan_key = plan["plan_key"] if plan else "free"

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            # Get limit + period
            cur.execute("""
                SELECT pl.limit_value, pl.limit_period
                FROM plan_limits pl
                JOIN plans p ON p.id = pl.plan_id
                WHERE p.plan_key = %s AND pl.resource_key = %s
            """, (plan_key, resource_key))
            limit_row = cur.fetchone()

            if not limit_row:
                return {"allowed": True, "limit": -1, "used": 0, "remaining": -1}

            limit_value = limit_row["limit_value"]
            limit_period = limit_row["limit_period"]

            # Compute correct period start based on limit_period
            if limit_period == "day":
                period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif limit_period == "month":
                period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            elif limit_period == "year":
                period_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Get current usage
            cur.execute("""
                SELECT COALESCE(SUM(total_quantity), 0) as used
                FROM usage_aggregates
                WHERE user_id = %s AND resource_key = %s AND period_start = %s
            """, (user_id, resource_key, period_start))
            used = cur.fetchone()["used"]

            remaining = max(0, limit_value - used) if limit_value > 0 else -1

            # Compute reset time
            if limit_period == "day":
                reset_at = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            elif limit_period == "month":
                if now.month == 12:
                    reset_at = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                else:
                    reset_at = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                reset_at = None

            return {
                "allowed": limit_value == -1 or used < limit_value,
                "limit": limit_value,
                "used": used,
                "remaining": remaining,
                "plan": plan_key,
                "period": limit_period,
                "reset_at": reset_at.isoformat() if reset_at else None,
            }
