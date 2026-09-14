"""Security Headers Middleware — adds production security headers to all responses.

Provides:
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

Usage:
    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

from __future__ import annotations

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    def __init__(
        self,
        app,
        csp: str | None = None,
        hsts_max_age: int = 31536000,
        frame_options: str = "DENY",
        referrer_policy: str = "strict-origin-when-cross-origin",
    ):
        super().__init__(app)
        self.csp = csp or self._default_csp()
        self.hsts_max_age = hsts_max_age
        self.frame_options = frame_options
        self.referrer_policy = referrer_policy

    def _default_csp(self) -> str:
        """Generate default Content-Security-Policy."""
        return (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://openrouter.ai https://api.openai.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = self.frame_options
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = self.referrer_policy
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # HSTS (only for HTTPS)
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                f"max-age={self.hsts_max_age}; includeSubDomains"
            )

        # CSP
        if self.csp:
            response.headers["Content-Security-Policy"] = self.csp

        # Remove server header
        if "server" in response.headers:
            del response.headers["server"]

        return response
