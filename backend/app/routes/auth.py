"""MVP email/password auth routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.auth_middleware import AuthContext, require_auth
from services.auth_store import (
    authenticate_user,
    create_api_token,
    create_session,
    create_user_with_password,
    get_user_from_api_token,
    get_user_from_token,
    refresh_session,
    revoke_session_by_token,
    revoke_api_token,
    update_user_profile,
)
from services.memory_core import MemoryClient
from services.postgres_store import postgres_enabled

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignUpRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=40)
    full_name: str | None = Field(default=None, min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=20, max_length=255)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=20, max_length=255)


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    username: str | None = Field(default=None, min_length=3, max_length=40)
    bio: str | None = Field(default=None, max_length=1000)
    company: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=160)
    website: str | None = Field(default=None, max_length=500)
    onboarding_persona: str | None = Field(default=None, max_length=40)
    onboarding_heard_about: str | None = Field(default=None, max_length=40)
    onboarding_use_case: str | None = Field(default=None, max_length=40)
    onboarding_workspace_name: str | None = Field(default=None, max_length=80)
    onboarding_step: str | None = Field(default=None, max_length=40)


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(default="agent", min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["memory"])
    expires_days: int | None = Field(default=90, ge=1, le=3650)
    tenant_id: str | None = Field(default=None, max_length=120)
    workspace_id: str | None = Field(default=None, max_length=120)
    agent_id: str | None = Field(default=None, max_length=120)


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()


def _request_token(request: Request, authorization: str | None) -> str | None:
    return _extract_bearer(authorization) or request.cookies.get("aman_session")


def _set_session_cookies(response: Response, session: dict, settings) -> None:
    max_age = max(1, int(settings.aman_session_duration_days)) * 24 * 60 * 60
    cookie_options = {
        "max_age": max_age,
        "httponly": True,
        "secure": bool(settings.auth_cookie_secure),
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie("aman_session", session["access_token"], **cookie_options)
    response.set_cookie("aman_refresh", session["refresh_token"], **cookie_options)


def _clear_session_cookies(response: Response, settings) -> None:
    for name in ("aman_session", "aman_refresh"):
        response.delete_cookie(
            name,
            path="/",
            httponly=True,
            secure=bool(settings.auth_cookie_secure),
            samesite="lax",
        )


@router.post("/signup")
async def signup(body: SignUpRequest, request: Request):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=500, detail="Postgres is not configured.")

    try:
        user = create_user_with_password(
            settings,
            email=body.email,
            password=body.password,
            username=body.username,
            full_name=body.full_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session = create_session(
        settings,
        user_id=user["id"],
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    response = JSONResponse(jsonable_encoder({
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "full_name": body.full_name,
            "plan": "free",
        },
        "session": session,
    }))
    _set_session_cookies(response, session, settings)
    return response


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=500, detail="Postgres is not configured.")

    user = authenticate_user(settings, email=body.email, password=body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    session = create_session(
        settings,
        user_id=user["id"],
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    response = JSONResponse(jsonable_encoder({
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "full_name": user["full_name"],
            "plan": user.get("plan", "free"),
        },
        "session": session,
    }))
    _set_session_cookies(response, session, settings)
    return response


@router.get("/me")
async def me(
    request: Request,
    authorization: str | None = Header(default=None),
):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=500, detail="Postgres is not configured.")

    token = _request_token(request, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing session.")

    user = get_user_from_token(settings, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "full_name": user["full_name"],
            "bio": user.get("bio"),
            "company": user.get("company"),
            "location": user.get("location"),
            "website": user.get("website"),
            "timezone": user.get("timezone"),
            "locale": user.get("locale"),
            "preferences": user.get("preferences"),
            "plan": user.get("plan", "free"),
        }
    }


@router.patch("/me")
async def update_me(
    body: ProfileUpdateRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    settings = get_settings()
    token = _request_token(request, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing session.")
    current = get_user_from_token(settings, token)
    if not current:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    try:
        onboarding_preferences = {
            key: value
            for key, value in {
                "persona": body.onboarding_persona,
                "heardAbout": body.onboarding_heard_about,
                "onboardingUseCase": body.onboarding_use_case,
                "workspaceName": body.onboarding_workspace_name,
                "step": body.onboarding_step,
            }.items()
            if value is not None
        }
        user = update_user_profile(
            settings,
            user_id=str(current["id"]),
            preferences=onboarding_preferences or None,
            **body.model_dump(
                exclude={
                    "onboarding_persona",
                    "onboarding_heard_about",
                    "onboarding_use_case",
                    "onboarding_workspace_name",
                    "onboarding_step",
                }
            ),
        )
    except ValueError as exc:
        status_code = 409 if "already in use" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    MemoryClient(settings).sync_account_profile(
        user_id=str(current["id"]),
        profile=user,
    )
    return {"user": user}


@router.post("/refresh")
async def refresh(body: RefreshRequest, request: Request):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=500, detail="Postgres is not configured.")

    refresh_token = body.refresh_token or request.cookies.get("aman_refresh")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh session.")

    session = refresh_session(
        settings,
        refresh_token=refresh_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    user = get_user_from_token(settings, session["access_token"])
    if not user:
        raise HTTPException(status_code=401, detail="Could not resolve refreshed user.")

    response = JSONResponse(jsonable_encoder({
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "full_name": user["full_name"],
        },
        "session": {
            "session_id": session["session_id"],
            "access_token": session["access_token"],
            "refresh_token": session["refresh_token"],
            "expires_at": session["expires_at"],
        },
    }))
    _set_session_cookies(response, session, settings)
    return response


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=500, detail="Postgres is not configured.")

    access_token = _request_token(request, authorization)
    refresh_token = body.refresh_token or request.cookies.get("aman_refresh")
    invalidated_user_id = None
    if access_token:
        session_user = get_user_from_token(settings, access_token) or get_user_from_api_token(settings, access_token)
        invalidated_user_id = str(session_user["id"]) if session_user else None
    if not invalidated_user_id and refresh_token:
        refresh_user = get_user_from_token(settings, refresh_token)
        invalidated_user_id = str(refresh_user["id"]) if refresh_user else None
    revoked = False
    if access_token:
        revoked = revoke_session_by_token(settings, token=access_token) or revoked
    if refresh_token:
        revoked = revoke_session_by_token(settings, token=refresh_token) or revoked
    if invalidated_user_id:
        MemoryClient(settings).invalidate(user_id=invalidated_user_id)

    response = JSONResponse({
        "status": "ok",
        "message": "Session logged out." if revoked else "Session cleared.",
    })
    _clear_session_cookies(response, settings)
    return response


@router.post("/api-tokens")
async def issue_api_token(
    body: ApiTokenCreateRequest,
    auth: AuthContext = Depends(require_auth),
):
    invalid = sorted(set(body.scopes) - set(auth.scopes))
    if invalid:
        raise HTTPException(status_code=400, detail={"invalid_scopes": invalid})
    try:
        token = create_api_token(
            get_settings(),
            user_id=str(auth.user_id),
            token_name=body.name,
            scopes=body.scopes,
            expires_days=body.expires_days,
            tenant_id=body.tenant_id,
            workspace_id=body.workspace_id,
            agent_id=body.agent_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return token


@router.delete("/api-tokens/{token_id}")
async def revoke_api_token_route(
    token_id: str,
    auth: AuthContext = Depends(require_auth),
):
    settings = get_settings()
    revoked = revoke_api_token(settings, user_id=str(auth.user_id), token_id=token_id)
    if revoked:
        MemoryClient(settings).invalidate(user_id=str(auth.user_id))
    return {"revoked": revoked}
