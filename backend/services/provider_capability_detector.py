"""Provider Capability Detection — detects what a provider supports before live testing.

Probes the provider API to determine:
- Available models
- Tool calling support
- Streaming support
- Credit balance
- Rate limits
- Free tier availability

Used by Phase 9.9.1 readiness checks.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class ProviderCapabilityReport:
    """Report of provider capabilities detected."""
    provider: str
    api_reachable: bool = False
    credits_available: bool = False
    credit_balance: float | None = None
    credit_limit: float | None = None
    free_models_available: int = 0
    free_models_with_tools: int = 0
    rate_limit_remaining: int | None = None
    rate_limit_reset: str | None = None
    models_tested: list[str] = field(default_factory=list)
    tool_calling_verified: bool = False
    streaming_verified: bool = False
    errors: list[str] = field(default_factory=list)
    detected_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))

    def is_ready(self) -> bool:
        """Whether provider is ready for live testing."""
        return (
            self.api_reachable
            and self.credits_available
            and self.free_models_with_tools > 0
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "api_reachable": self.api_reachable,
            "credits_available": self.credits_available,
            "credit_balance": self.credit_balance,
            "credit_limit": self.credit_limit,
            "free_models_available": self.free_models_available,
            "free_models_with_tools": self.free_models_with_tools,
            "rate_limit_remaining": self.rate_limit_remaining,
            "rate_limit_reset": self.rate_limit_reset,
            "models_tested": self.models_tested,
            "tool_calling_verified": self.tool_calling_verified,
            "streaming_verified": self.streaming_verified,
            "errors": self.errors,
            "detected_at": self.detected_at,
            "ready": self.is_ready(),
        }


def detect_openrouter_capabilities(api_key: str) -> ProviderCapabilityReport:
    """Detect OpenRouter provider capabilities."""
    report = ProviderCapabilityReport(provider="openrouter")

    if not api_key:
        report.errors.append("No API key provided")
        return report

    headers = {"Authorization": f"Bearer {api_key}"}

    # 1. Check API reachability and credits
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/auth/key",
            headers=headers,
            timeout=10.0,
        )
        if resp.status_code == 200:
            report.api_reachable = True
            data = resp.json().get("data", {})
            report.credit_balance = data.get("usage", 0)
            report.credit_limit = data.get("limit")
            if report.credit_limit is None:
                report.credits_available = True
            elif isinstance(report.credit_limit, (int, float)):
                report.credits_available = report.credit_balance < report.credit_limit
        else:
            report.errors.append(f"Auth endpoint returned {resp.status_code}")
    except Exception as e:
        report.errors.append(f"API unreachable: {e}")

    # 2. List models and detect free/tool-capable
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
            headers=headers,
            timeout=15.0,
        )
        if resp.status_code == 200:
            models = resp.json().get("data", [])
            free_models = [
                m for m in models
                if m.get("pricing", {}).get("prompt") == "0"
                or m.get("pricing", {}).get("prompt") == 0
            ]
            report.free_models_available = len(free_models)
            report.free_models_with_tools = sum(
                1 for m in free_models
                if "tools" in (m.get("supported_parameters") or [])
            )
        else:
            report.errors.append(f"Models endpoint returned {resp.status_code}")
    except Exception as e:
        report.errors.append(f"Models list failed: {e}")

    # 3. Check rate limits from a test request
    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "model": "openrouter/free",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 5,
            },
            timeout=15.0,
        )
        if resp.status_code == 200:
            report.rate_limit_remaining = None  # No limit header on success
            report.models_tested.append("openrouter/free")
        elif resp.status_code == 429:
            body = resp.json()
            meta = body.get("error", {}).get("metadata", {}).get("headers", {})
            report.rate_limit_remaining = int(meta.get("X-RateLimit-Remaining", 0))
            report.rate_limit_reset = meta.get("X-RateLimit-Reset")
            report.errors.append(f"Rate limited: {resp.status_code}")
        elif resp.status_code == 402:
            report.errors.append("Payment required (no credits)")
        else:
            report.errors.append(f"Test request returned {resp.status_code}")
    except Exception as e:
        report.errors.append(f"Test request failed: {e}")

    return report


def detect_provider_capabilities(api_key: str, provider: str = "openrouter") -> ProviderCapabilityReport:
    """Detect capabilities for any supported provider."""
    if provider == "openrouter":
        return detect_openrouter_capabilities(api_key)
    report = ProviderCapabilityReport(provider=provider)
    report.errors.append(f"Provider '{provider}' not yet supported for detection")
    return report
