from types import SimpleNamespace

import pytest

from services.github_oauth import (
    create_oauth_state,
    decrypt_github_token,
    encrypt_github_token,
    github_authorize_url,
    verify_oauth_state,
)


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        aman_jwt_secret="s" * 48,
        github_client_id="client-id",
        github_oauth_redirect_uri="http://localhost:8000/api/integrations/github/callback",
        github_oauth_scope="read:user user:email",
    )


def test_github_oauth_state_and_token_are_protected() -> None:
    settings = _settings()
    state = create_oauth_state(settings, "user-123")
    assert verify_oauth_state(settings, state)["user_id"] == "user-123"
    encrypted = encrypt_github_token(settings, "gho_secret")
    assert encrypted != "gho_secret"
    assert decrypt_github_token(settings, encrypted) == "gho_secret"


def test_github_oauth_state_rejects_tampering() -> None:
    settings = _settings()
    state = create_oauth_state(settings, "user-123")
    with pytest.raises(RuntimeError, match="github_oauth_state_invalid"):
        verify_oauth_state(settings, state + "x")


def test_github_authorize_url_contains_signed_state_and_scope() -> None:
    settings = _settings()
    url = github_authorize_url(settings, "state-value")
    assert "client_id=client-id" in url
    assert "state=state-value" in url
    assert "read%3Auser" in url
