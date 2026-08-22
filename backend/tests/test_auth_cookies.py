from types import SimpleNamespace

from fastapi import Response

from app.routes.auth import (
    _clear_session_cookies,
    _request_token,
    _set_session_cookies,
)


def _settings(*, secure: bool = False):
    return SimpleNamespace(
        aman_session_duration_days=7,
        auth_cookie_secure=secure,
    )


def test_session_cookies_are_http_only_and_lax() -> None:
    response = Response()
    _set_session_cookies(
        response,
        {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
        },
        _settings(),
    )

    cookies = response.headers.getlist("set-cookie")
    assert len(cookies) == 2
    assert all("HttpOnly" in cookie for cookie in cookies)
    assert all("SameSite=lax" in cookie for cookie in cookies)
    assert all("Path=/" in cookie for cookie in cookies)


def test_secure_cookie_flag_is_configurable() -> None:
    response = Response()
    _set_session_cookies(
        response,
        {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
        },
        _settings(secure=True),
    )

    assert all(
        "Secure" in cookie
        for cookie in response.headers.getlist("set-cookie")
    )


def test_bearer_token_takes_precedence_over_cookie() -> None:
    request = SimpleNamespace(cookies={"aman_session": "cookie-token"})
    assert _request_token(request, "Bearer api-token") == "api-token"
    assert _request_token(request, None) == "cookie-token"


def test_logout_expires_both_http_only_cookies() -> None:
    response = Response()
    _clear_session_cookies(response, _settings(secure=True))

    cookies = response.headers.getlist("set-cookie")
    assert len(cookies) == 2
    assert all("Max-Age=0" in cookie for cookie in cookies)
    assert all("HttpOnly" in cookie for cookie in cookies)
    assert all("Secure" in cookie for cookie in cookies)
