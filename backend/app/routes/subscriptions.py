"""
Subscription & Usage API routes.

Handles plan listing, subscription management, usage tracking,
and rate-limit enforcement.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from services.subscription_service import (
    check_rate_limit,
    create_subscription,
    get_all_plans,
    get_usage_summary,
    get_user_subscription,
    _connect,
    record_usage,
    upgrade_subscription,
)


router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


# ── Request models ──────────────────────────────────────────────────────────

class CreateSubRequest(BaseModel):
    plan_key: str = Field(..., description="Plan to subscribe to")
    billing_cycle: str = Field(default="monthly", description="monthly or yearly")

class UpgradeSubRequest(BaseModel):
    plan_key: str = Field(..., description="New plan key")

class RecordUsageRequest(BaseModel):
    resource_key: str = Field(..., description="Resource being consumed")
    quantity: int = Field(default=1)
    model: str | None = None
    provider: str | None = None
    tokens_input: int | None = None
    tokens_output: int | None = None
    cost_cents: int | None = None
    endpoint: str | None = None


# ── Plan endpoints ──────────────────────────────────────────────────────────

@router.get("/plans")
async def api_get_plans():
    """List all available plans with limits. Public."""
    from app.config import get_settings
    settings = get_settings()
    return {"plans": get_all_plans(settings)}


# ── Subscription endpoints ──────────────────────────────────────────────────

@router.get("/me")
async def api_my_subscription(auth: AuthContext = Depends(require_auth)):
    """Get current user's subscription. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    sub = get_user_subscription(settings, auth.user_id)
    return {"subscription": sub, "plan": auth.plan}


@router.post("/subscribe")
async def api_subscribe(
    req: CreateSubRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Create a new subscription. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    try:
        sub = create_subscription(
            settings,
            user_id=auth.user_id,
            plan_key=req.plan_key,
            billing_cycle=req.billing_cycle,
        )
        return {"subscription": sub}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upgrade")
async def api_upgrade(
    req: UpgradeSubRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Upgrade or change plan. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    try:
        sub = upgrade_subscription(settings, auth.user_id, req.plan_key)
        return {"subscription": sub}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Usage endpoints ─────────────────────────────────────────────────────────

@router.get("/usage")
async def api_usage_summary(auth: AuthContext = Depends(require_auth)):
    """Get current month usage summary. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    return get_usage_summary(settings, auth.user_id)


@router.get("/usage/providers")
async def api_usage_providers(auth: AuthContext = Depends(require_auth)):
    """Get current month provider spend summary. Requires authentication."""
    from app.config import get_settings

    settings = get_settings()
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(provider, 'unknown') AS provider,
                       COALESCE(SUM(total_quantity), 0) AS used,
                       COALESCE(SUM(total_cost_cents), 0) AS cost_cents
                FROM usage_records
                WHERE user_id = %s
                  AND created_at >= date_trunc('month', NOW())
                GROUP BY COALESCE(provider, 'unknown')
                ORDER BY COALESCE(SUM(total_cost_cents), 0) DESC, provider ASC
                """,
                (auth.user_id,),
            )
            rows = cur.fetchall()

    providers = [
        {
            "provider": row["provider"],
            "used": row["used"],
            "cost_cents": row["cost_cents"],
        }
        for row in rows
    ]
    return {"providers": providers}


@router.post("/usage/record")
async def api_record_usage(
    req: RecordUsageRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Record usage. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    record_usage(
        settings,
        user_id=auth.user_id,
        resource_key=req.resource_key,
        quantity=req.quantity,
        model=req.model,
        provider=req.provider,
        tokens_input=req.tokens_input,
        tokens_output=req.tokens_output,
        cost_cents=req.cost_cents,
        endpoint=req.endpoint,
    )
    return {"status": "recorded"}


@router.get("/check/{resource_key}")
async def api_check_limit(
    resource_key: str,
    auth: AuthContext = Depends(require_auth),
):
    """Check rate limit for a resource. Requires authentication."""
    from app.config import get_settings
    settings = get_settings()
    return check_rate_limit(settings, auth.user_id, resource_key)
