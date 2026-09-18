"""OAuth sign-in routes (Google, future providers)."""

from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.config import get_settings
import httpx
from services.auth_store import create_session, find_or_create_google_user, find_or_create_github_user
from services.google_oauth import (
    create_google_oauth_state,
    exchange_code_for_tokens,
    fetch_google_userinfo,
    google_authorize_url,
    verify_google_oauth_state,
)
from services.github_oauth import github_authorize_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/oauth", tags=["oauth"])


def _set_session_cookies(response: RedirectResponse, session: dict, settings) -> None:
    max_age = max(1, int(settings.aman_session_duration_days)) * 24 * 60 * 60
    cookie_options = {
        "max_age": max_age,
        "httponly": True,
        "secure": bool(settings.auth_cookie_secure),
        "samesite": "none" if settings.auth_cookie_secure else "lax",
        "path": "/",
    }
    response.set_cookie("aman_session", session["access_token"], **cookie_options)
    response.set_cookie("aman_refresh_token", session["refresh_token"], **cookie_options)


def _google_result_redirect(settings, status: str, detail: str | None = None):
    target = str(settings.google_oauth_frontend_url).rstrip("/")
    query = f"?google={status}"
    if detail:
        query += f"&detail={quote(detail[:160])}"
    return RedirectResponse(url=f"{target}{query}", status_code=303)


@router.get("/google/login")
async def google_login(redirect: str = Query(default="/chat")):
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    try:
        state = create_google_oauth_state(settings, redirect=redirect)
        return RedirectResponse(google_authorize_url(settings, state), status_code=303)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.") from exc


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    settings = get_settings()
    if error:
        return _google_result_redirect(settings, "error", "Google sign-in was cancelled.")
    if not code or not state:
        return _google_result_redirect(settings, "error", "Google sign-in was incomplete.")
    try:
        state_payload = verify_google_oauth_state(settings, state)
        tokens = await exchange_code_for_tokens(settings, code)
        access_token = str(tokens.get("access_token") or "")
        if not access_token:
            raise RuntimeError("google_token_missing")
        profile = await fetch_google_userinfo(access_token)
        google_sub = str(profile.get("sub") or "")
        email = str(profile.get("email") or "")
        if not google_sub or not email:
            raise RuntimeError("google_profile_incomplete")
        if not bool(profile.get("email_verified", True)):
            raise RuntimeError("google_email_unverified")

        user, created = find_or_create_google_user(
            settings,
            google_sub=google_sub,
            email=email,
            full_name=str(profile.get("name") or ""),
            avatar_url=str(profile.get("picture") or ""),
        )
        session = create_session(
            settings,
            user_id=str(user["id"]),
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )
        target = str(settings.google_oauth_frontend_url).rstrip("/")
        next_url = str(state_payload.get("redirect", "/chat"))
        destination = f"/oauth/callback?next={quote('/onboarding' if created else next_url, safe='')}"
        response = RedirectResponse(url=f"{target}{destination}", status_code=303)
        _set_session_cookies(response, session, settings)
        return response
    except Exception as exc:
        logger.warning("Google OAuth callback failed: %s", exc)
        return _google_result_redirect(settings, "error", "Google sign-in could not be completed.")


@router.get("/github/login")
async def github_login(redirect: str = Query(default="/chat")):
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=503, detail="GitHub sign-in is not configured.")
    safe_redirect = redirect if redirect.startswith("/") and not redirect.startswith("//") else "/chat"
    state = create_google_oauth_state(settings, redirect=safe_redirect, provider="github")
    # The state is signed by the shared auth secret; provider is checked below.
    return RedirectResponse(github_authorize_url(settings, state), status_code=303)


@router.get("/github/callback")
async def github_callback(request: Request, code: str | None = Query(default=None), state: str | None = Query(default=None), error: str | None = Query(default=None)):
    settings = get_settings()
    if error or not code or not state:
        return RedirectResponse(f"{settings.google_oauth_frontend_url}/login?github=error", status_code=303)
    try:
        payload = verify_google_oauth_state(settings, state, provider="github")
        async with httpx.AsyncClient(timeout=15) as client:
            token_response = await client.post("https://github.com/login/oauth/access_token", data={"client_id": settings.github_client_id, "client_secret": settings.github_client_secret, "code": code}, headers={"Accept": "application/json"})
            token_response.raise_for_status(); token = token_response.json().get("access_token")
            profile_response = await client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
            profile_response.raise_for_status(); profile = profile_response.json()
            email = profile.get("email")
            if not email:
                emails = await client.get("https://api.github.com/user/emails", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
                emails.raise_for_status(); verified = [item for item in emails.json() if item.get("verified") and item.get("primary")]
                email = verified[0].get("email") if verified else None
        user, created = find_or_create_github_user(settings, github_id=str(profile.get("id") or ""), email=str(email or ""), full_name=str(profile.get("name") or profile.get("login") or ""), avatar_url=str(profile.get("avatar_url") or ""))
        session = create_session(settings, user_id=str(user["id"]), user_agent=request.headers.get("user-agent"), ip_address=request.client.host if request.client else None)
        target = str(settings.google_oauth_frontend_url).rstrip("/"); redirect_to = str(payload.get("redirect", "/chat")); separator = "&" if "?" in redirect_to else "?"
        destination = f"/oauth/callback?next={quote('/onboarding' if created else redirect_to, safe='')}"
        response = RedirectResponse(f"{target}{destination}", status_code=303); _set_session_cookies(response, session, settings); return response
    except Exception as exc:
        logger.warning("GitHub OAuth callback failed: %s", exc)
        return RedirectResponse(f"{settings.google_oauth_frontend_url}/login?github=error", status_code=303)
