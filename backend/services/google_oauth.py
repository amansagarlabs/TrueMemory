"""Google OAuth sign-in helpers (authorization code flow).

Mirrors the GitHub OAuth pattern in `services/github_oauth.py`:
signed `state` for CSRF protection, httpx token exchange, userinfo fetch.

Google endpoints:
- Authorize: https://accounts.google.com/o/oauth2/v2/auth
- Token:     https://oauth2.googleapis.com/token
- Userinfo:  https://openidconnect.googleapis.com/v1/userinfo
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_OAUTH_SCOPE = "openid email profile"


def _secret(settings: Any) -> bytes:
    value = str(getattr(settings, "aman_jwt_secret", "") or "").strip()
    if len(value) < 32:
        raise RuntimeError("google_oauth_secret_not_configured")
    return value.encode("utf-8")


def create_google_oauth_state(settings: Any, *, ttl_seconds: int = 600) -> str:
    """Create a signed, expiring state token for the Google OAuth flow."""
    payload = {
        "provider": "google",
        "exp": int(time.time()) + ttl_seconds,
        "nonce": secrets.token_urlsafe(18),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = hmac.new(_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"


def verify_google_oauth_state(settings: Any, state: str) -> dict[str, Any]:
    """Verify a state token created by `create_google_oauth_state`."""
    try:
        encoded, signature = state.split(".", 1)
        expected = hmac.new(_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("invalid signature")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
        )
        if payload.get("provider") != "google":
            raise ValueError("wrong provider")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired state")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("google_oauth_state_invalid") from exc


def google_authorize_url(settings: Any, state: str) -> str:
    """Build the Google consent-screen URL."""
    client_id = str(getattr(settings, "google_client_id", "") or "").strip()
    redirect_uri = str(getattr(settings, "google_oauth_redirect_uri", "") or "").strip()
    if not client_id or not redirect_uri:
        raise RuntimeError("google_oauth_not_configured")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPE,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return GOOGLE_AUTHORIZE_URL + "?" + urlencode(params)


async def exchange_code_for_tokens(settings: Any, code: str) -> dict[str, Any]:
    """Exchange an authorization code for Google tokens."""
    client_id = str(getattr(settings, "google_client_id", "") or "").strip()
    client_secret = str(getattr(settings, "google_client_secret", "") or "").strip()
    redirect_uri = str(getattr(settings, "google_oauth_redirect_uri", "") or "").strip()
    if not client_id or not client_secret:
        raise RuntimeError("google_oauth_not_configured")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()


async def fetch_google_userinfo(access_token: str) -> dict[str, Any]:
    """Fetch the authenticated user's profile from Google."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()
