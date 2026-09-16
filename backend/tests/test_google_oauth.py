from types import SimpleNamespace

import pytest

from services.google_oauth import (
    create_google_oauth_state,
    google_authorize_url,
    verify_google_oauth_state,
)


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        aman_jwt_secret="s" * 48,
        google_client_id="client-id",
        google_oauth_redirect_uri="http://localhost:8000/api/oauth/google/callback",
    )


def test_google_oauth_state_roundtrip() -> None:
    settings = _settings()
    state = create_google_oauth_state(settings)
    payload = verify_google_oauth_state(settings, state)
    assert payload["provider"] == "google"


def test_google_oauth_state_rejects_tampering() -> None:
    settings = _settings()
    state = create_google_oauth_state(settings)
    with pytest.raises(RuntimeError, match="google_oauth_state_invalid"):
        verify_google_oauth_state(settings, state + "x")


def test_google_authorize_url_contains_client_state_and_scope() -> None:
    settings = _settings()
    url = google_authorize_url(settings, "state-value")
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=client-id" in url
    assert "state=state-value" in url
    assert "response_type=code" in url
    assert "scope=openid" in url


def test_google_authorize_url_requires_configuration() -> None:
    settings = SimpleNamespace(
        aman_jwt_secret="s" * 48,
        google_client_id="",
        google_oauth_redirect_uri="",
    )
    with pytest.raises(RuntimeError, match="google_oauth_not_configured"):
        google_authorize_url(settings, "state-value")
