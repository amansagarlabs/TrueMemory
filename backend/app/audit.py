"""Audit Logging — security event tracking for production.

Records:
- Authentication events (login, logout, failures)
- Authorization events (permission denials)
- Data access events (memory reads, writes, deletes)
- Admin operations
- Security violations (injection attempts, rate limits)

Usage:
    from app.audit import audit_log, AuditEvent
    audit_log(AuditEvent.AUTH_LOGIN, user_id="123", success=True)
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4


class AuditEvent(str, Enum):
    """Security-relevant audit events."""
    # Authentication
    AUTH_LOGIN = "auth.login"
    AUTH_LOGIN_FAILED = "auth.login_failed"
    AUTH_LOGOUT = "auth.logout"
    AUTH_TOKEN_REFRESH = "auth.token_refresh"
    AUTH_TOKEN_REVOKED = "auth.token_revoked"
    AUTH_API_KEY_USED = "auth.api_key_used"
    AUTH_API_KEY_INVALID = "auth.api_key_invalid"

    # Authorization
    AUTHZ_DENIED = "authz.denied"
    AUTHZ_SCOPE_VIOLATION = "authz.scope_violation"
    AUTHZ_ADMIN_ACCESS = "authz.admin_access"

    # Memory operations
    MEMORY_CREATE = "memory.create"
    MEMORY_READ = "memory.read"
    MEMORY_UPDATE = "memory.update"
    MEMORY_DELETE = "memory.delete"
    MEMORY_FORGET = "memory.forget"
    MEMORY_SEARCH = "memory.search"

    # Data access
    DATA_EXPORT = "data.export"
    DATA_IMPORT = "data.import"
    DATA_DELETE = "data.delete"

    # Security
    SECURITY_INJECTION_ATTEMPT = "security.injection_attempt"
    SECURITY_RATE_LIMIT = "security.rate_limit"
    SECURITY_CSRF_ATTEMPT = "security.csrf_attempt"
    SECURITY_UNSAFE_URL = "security.unsafe_url"

    # Admin
    ADMIN_USER_CREATE = "admin.user_create"
    ADMIN_USER_DELETE = "admin.user_delete"
    ADMIN_CONFIG_CHANGE = "admin.config_change"
    ADMIN_TOKEN_CREATE = "admin.token_create"


@dataclass
class AuditEntry:
    """Single audit log entry."""
    event: str
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    entry_id: str = field(default_factory=lambda: str(uuid4()))
    user_id: str | None = None
    workspace_id: str | None = None
    project_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    success: bool = True
    details: dict[str, Any] = field(default_factory=dict)
    resource_type: str | None = None
    resource_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "event": self.event,
            "timestamp": self.timestamp,
            "entry_id": self.entry_id,
            "user_id": self.user_id,
            "workspace_id": self.workspace_id,
            "project_id": self.project_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "success": self.success,
            "details": self.details,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)


class AuditLogger:
    """Production audit logger."""

    def __init__(self):
        self.logger = logging.getLogger("truememory.audit")
        self._buffer: list[AuditEntry] = []
        self._buffer_size = 100

    def log(
        self,
        event: AuditEvent | str,
        *,
        user_id: str | None = None,
        workspace_id: str | None = None,
        project_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        success: bool = True,
        details: dict[str, Any] | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> AuditEntry:
        """Log a security audit event."""
        entry = AuditEntry(
            event=event.value if isinstance(event, AuditEvent) else event,
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            details=details or {},
            resource_type=resource_type,
            resource_id=resource_id,
        )

        # Log at appropriate level
        if "failed" in entry.event or not entry.success:
            self.logger.warning("audit_event", extra=entry.to_dict())
        elif "security" in entry.event:
            self.logger.error("audit_security_event", extra=entry.to_dict())
        else:
            self.logger.info("audit_event", extra=entry.to_dict())

        # Buffer for batch writing
        self._buffer.append(entry)
        if len(self._buffer) >= self._buffer_size:
            self.flush()

        return entry

    def flush(self) -> list[AuditEntry]:
        """Flush buffered audit entries."""
        entries = self._buffer.copy()
        self._buffer.clear()
        return entries

    def get_recent(self, limit: int = 100) -> list[dict[str, Any]]:
        """Get recent audit entries from buffer."""
        return [e.to_dict() for e in self._buffer[-limit:]]


# Global audit logger instance
_audit_logger: AuditLogger | None = None


def get_audit_logger() -> AuditLogger:
    """Get or create the global audit logger."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    return _audit_logger


def audit_log(
    event: AuditEvent | str,
    **kwargs: Any,
) -> AuditEntry:
    """Convenience function to log an audit event."""
    return get_audit_logger().log(event, **kwargs)
