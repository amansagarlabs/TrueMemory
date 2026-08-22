"""GitHub OAuth state and token protection helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlencode

from cryptography.fernet import Fernet, InvalidToken


def _secret(settings: Any) -> bytes:
    value = str(getattr(settings, "aman_jwt_secret", "") or "").strip()
    if len(value) < 32:
        raise RuntimeError("github_oauth_secret_not_configured")
    return value.encode("utf-8")


def _fernet(settings: Any) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(_secret(settings)).digest())
    return Fernet(key)


def encrypt_github_token(settings: Any, token: str) -> str:
    return _fernet(settings).encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_github_token(settings: Any, encrypted: str) -> str:
    try:
        return _fernet(settings).decrypt(encrypted.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError, ValueError) as exc:
        raise RuntimeError("github_token_invalid") from exc


def create_oauth_state(settings: Any, user_id: str, *, ttl_seconds: int = 600) -> str:
    payload = {
        "user_id": user_id,
        "exp": int(time.time()) + ttl_seconds,
        "nonce": secrets.token_urlsafe(18),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = hmac.new(_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"


def verify_oauth_state(settings: Any, state: str) -> dict[str, Any]:
    try:
        encoded, signature = state.split(".", 1)
        expected = hmac.new(_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("invalid signature")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
        )
        if int(payload.get("exp", 0)) < int(time.time()) or not payload.get("user_id"):
            raise ValueError("expired state")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("github_oauth_state_invalid") from exc


def github_authorize_url(settings: Any, state: str) -> str:
    client_id = str(getattr(settings, "github_client_id", "") or "").strip()
    redirect_uri = str(getattr(settings, "github_oauth_redirect_uri", "") or "").strip()
    if not client_id or not redirect_uri:
        raise RuntimeError("github_oauth_not_configured")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": str(getattr(settings, "github_oauth_scope", "read:user user:email repo")),
        "allow_signup": "false",
    }
    return "https://github.com/login/oauth/authorize?" + urlencode(params)
