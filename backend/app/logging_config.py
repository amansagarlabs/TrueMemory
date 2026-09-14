"""Structured Logging Configuration — production-grade logging for TrueMemory.

Provides:
- JSON-structured log output for log aggregation
- Request correlation via X-Request-ID
- Centralized log level configuration
- Sensitive data redaction
- Performance-optimized lazy formatting

Usage:
    from app.logging_config import setup_logging
    setup_logging()
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import UTC, datetime
from typing import Any


class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add request context if available
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_entry["user_id"] = record.user_id
        if hasattr(record, "workspace_id"):
            log_entry["workspace_id"] = record.workspace_id

        # Add timing if available
        if hasattr(record, "duration_ms"):
            log_entry["duration_ms"] = record.duration_ms

        # Add exception info
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "traceback": self.formatException(record.exc_info),
            }

        # Add extra fields
        for key in ["status", "method", "path", "tool_name", "tool_call_id",
                     "memory_id", "provider", "model", "success", "error"]:
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry, default=str)


class TextFormatter(logging.Formatter):
    """Human-readable formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        request_id = getattr(record, "request_id", "")[:8] if hasattr(record, "request_id") else ""

        parts = [
            f"{color}{timestamp} [{record.levelname:8}]{self.RESET}",
            f"{record.name}",
            f"{record.getMessage()}",
        ]

        if request_id:
            parts.insert(2, f"[{request_id}]")

        if record.exc_info and record.exc_info[0] is not None:
            parts.append(self.formatException(record.exc_info))

        return " ".join(parts)


class SensitiveDataFilter(logging.Filter):
    """Filter to redact sensitive data from log records."""

    SENSITIVE_PATTERNS = [
        "password",
        "secret",
        "token",
        "api_key",
        "authorization",
        "credit_card",
        "ssn",
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            msg_lower = record.msg.lower()
            for pattern in self.SENSITIVE_PATTERNS:
                if pattern in msg_lower:
                    record.msg = f"[REDACTED:{pattern}]"
                    break
        return True


def setup_logging(
    level: str | None = None,
    json_output: bool | None = None,
    log_file: str | None = None,
) -> None:
    """Configure production logging.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_output: Use JSON formatting (default: True in production)
        log_file: Optional file path for log output
    """
    env = os.environ.get("APP_ENV", os.environ.get("ENVIRONMENT", "development")).lower()

    if level is None:
        level = os.environ.get("LOG_LEVEL", "INFO" if env == "production" else "DEBUG")

    if json_output is None:
        json_output = env in ("production", "staging")

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Create formatter
    if json_output:
        formatter: logging.Formatter = JSONFormatter()
    else:
        formatter = TextFormatter()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(JSONFormatter())  # Always JSON for files
        root_logger.addHandler(file_handler)

    # Add sensitive data filter
    root_logger.addFilter(SensitiveDataFilter())

    # Configure specific loggers
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    logging.info(
        "logging_configured",
        extra={"level": level, "json_output": json_output, "environment": env},
    )
