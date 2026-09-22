"""Global Exception Handler — consistent error responses for unhandled exceptions.

Provides:
- Structured error responses
- Request correlation
- Sensitive data redaction
- Error classification

Usage:
    from app.middleware.exception_handler import register_exception_handlers
    register_exception_handlers(app)
"""

from __future__ import annotations

import logging
import time
import traceback
from typing import Any
from uuid import uuid4
from services.retry_policy import RETRYABLE_STATUSES

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("truememory.exception_handler")


class ErrorClassification:
    """Classify errors for appropriate response."""

    @staticmethod
    def classify(exc: Exception) -> dict[str, Any]:
        """Classify an exception into error response fields."""
        exc_type = type(exc).__name__

        # HTTP exceptions from Starlette/FastAPI
        if isinstance(exc, StarletteHTTPException):
            retryable = exc.status_code in RETRYABLE_STATUSES
            return {
                "error": "http_error",
                "message": str(exc.detail),
                "status_code": exc.status_code,
                "classification": "client_error" if exc.status_code < 500 else "server_error",
                "retryable": retryable,
            }

        # Validation errors
        if exc_type in ("ValidationError", "ValueError", "PydanticValidationError"):
            return {
                "error": "validation_error",
                "message": str(exc)[:200],
                "status_code": 422,
                "classification": "client_error",
            }

        # Authentication/Authorization
        if exc_type in ("AuthenticationError", "AuthorizationError", "PermissionError"):
            return {
                "error": "auth_error",
                "message": "Authentication or authorization failed",
                "status_code": 401,
                "classification": "client_error",
            }

        # Database errors
        if exc_type in ("OperationalError", "IntegrityError", "InterfaceError"):
            logger.error("database_error", extra={"error_type": exc_type, "error": str(exc)[:200]})
            return {
                "error": "database_error",
                "message": "A database error occurred",
                "status_code": 503,
                "classification": "infrastructure_error",
                "retryable": True,
            }

        # Connection errors
        if exc_type in ("ConnectionError", "ConnectError", "TimeoutError"):
            logger.error("connection_error", extra={"error_type": exc_type, "error": str(exc)[:200]})
            return {
                "error": "connection_error",
                "message": "A connection error occurred",
                "status_code": 503,
                "classification": "infrastructure_error",
                "retryable": True,
            }

        # Default: internal server error
        return {
            "error": "internal_error",
            "message": "An internal server error occurred",
            "status_code": 500,
            "classification": "server_error",
        }


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle all unhandled exceptions with consistent response format."""
        request_id = getattr(request.state, "request_id", str(uuid4())[:12])

        classification = ErrorClassification.classify(exc)

        # Log the error
        if classification["status_code"] >= 500:
            logger.exception(
                "unhandled_exception",
                extra={
                    "request_id": request_id,
                    "path": request.url.path,
                    "method": request.method,
                    "error_type": type(exc).__name__,
                    "status_code": classification["status_code"],
                },
            )
        else:
            logger.warning(
                "client_error",
                extra={
                    "request_id": request_id,
                    "path": request.url.path,
                    "method": request.method,
                    "error_type": type(exc).__name__,
                    "status_code": classification["status_code"],
                },
            )

        # Build response
        response_body = {
            "error": classification["error"],
            "message": classification["message"],
            "request_id": request_id,
            "code": classification["error"],
            "retryable": bool(classification.get("retryable", False)),
        }

        # Add detail in non-production
        import os
        env = os.environ.get("APP_ENV", "development")
        if env != "production":
            response_body["detail"] = {
                "type": classification["error_type"] if "error_type" in classification else type(exc).__name__,
                "classification": classification["classification"],
            }

        return JSONResponse(
            status_code=classification["status_code"],
            content=response_body,
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Handle HTTP exceptions with consistent format."""
        request_id = getattr(request.state, "request_id", str(uuid4())[:12])

        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "http_error",
                "message": str(exc.detail),
                "request_id": request_id,
                "code": "http_error",
                "retryable": exc.status_code in RETRYABLE_STATUSES,
            },
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Keep framework-generated 422 responses on the public error contract."""
        request_id = getattr(request.state, "request_id", str(uuid4())[:12])
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "message": "Request validation failed.",
                "request_id": request_id,
                "code": "validation_error",
                "retryable": False,
                "detail": exc.errors(),
            },
            headers={"X-Request-ID": request_id},
        )
