"""Memory Governor — policy boundary between extraction and commit.

Evaluates memory candidates against policy rules before they reach the state resolver.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any

logger = logging.getLogger("truememory.governor")


class GovernorDecision(Enum):
    STORE = "store"
    UPDATE = "update"
    SUPERSEDE = "supersede"
    KEEP_SEPARATE = "keep_separate"
    NOOP = "noop"
    REJECT = "reject"
    EXPIRE = "expire"


@dataclass(frozen=True)
class GovernorResult:
    """Decision from the memory governor."""
    decision: GovernorDecision
    rule_id: str
    reason: str
    confidence: float
    policy_version: str


@dataclass(frozen=True)
class MemoryPolicy:
    """Configuration for memory governance."""
    min_confidence_store: float = 0.50
    min_importance_store: float = 0.30
    source_trust: dict[str, float] | None = None
    durable_types: set[str] | None = None
    temporary_types: set[str] | None = None
    policy_version: str = "v1"

    def __post_init__(self):
        if self.source_trust is None:
            object.__setattr__(self, "source_trust", {
                "user_message": 1.0,
                "assistant_message": 0.85,
                "tool_result": 0.90,
                "agent_observation": 0.85,
                "task_completion": 0.80,
                "user_correction": 0.95,
            })
        if self.durable_types is None:
            object.__setattr__(self, "durable_types", {
                "preference", "fact", "decision", "entity", "event"
            })
        if self.temporary_types is None:
            object.__setattr__(self, "temporary_types", {
                "task_state",
            })


_DEFAULT_POLICY = MemoryPolicy()


def _get_source_trust(source_type: str, policy: MemoryPolicy) -> float:
    return (policy.source_trust or {}).get(source_type, 0.7)


def _is_durable_type(memory_type: str, policy: MemoryPolicy) -> bool:
    return memory_type in (policy.durable_types or set())


def _is_temporary_type(memory_type: str, policy: MemoryPolicy) -> bool:
    return memory_type in (policy.temporary_types or set())


def govern_candidate(
    candidate: Any,
    existing_memory: dict[str, Any] | None = None,
    *,
    policy: MemoryPolicy | None = None,
) -> GovernorResult:
    """Evaluate a memory candidate against governance policy.

    Args:
        candidate: The memory candidate (must have memory_type, content,
                   confidence, importance_score, source_type, scope attributes).
        existing_memory: Optional existing memory record for comparison.
        policy: Policy configuration (uses default if None).

    Returns:
        GovernorResult with the decision and reasoning.
    """
    p = policy or _DEFAULT_POLICY

    memory_type = getattr(candidate, "memory_type", "fact")
    content = getattr(candidate, "content", "")
    confidence = float(getattr(candidate, "confidence", 0.7))
    importance = float(getattr(candidate, "importance_score", 0.5))
    source_type = getattr(candidate, "source_type", "user_message")
    scope = getattr(candidate, "scope", "user")

    source_trust = _get_source_trust(source_type, p)
    effective_confidence = confidence * source_trust

    if effective_confidence < p.min_confidence_store:
        return GovernorResult(
            decision=GovernorDecision.REJECT,
            rule_id="low_effective_confidence",
            reason=f"Effective confidence {effective_confidence:.2f} below threshold {p.min_confidence_store}",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if importance < p.min_importance_store:
        return GovernorResult(
            decision=GovernorDecision.REJECT,
            rule_id="low_importance",
            reason=f"Importance {importance:.2f} below threshold {p.min_importance_store}",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if _is_temporary_type(memory_type, p):
        return GovernorResult(
            decision=GovernorDecision.REJECT,
            rule_id="temporary_type",
            reason=f"Type '{memory_type}' is temporary, not durable",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if not _is_durable_type(memory_type, p):
        return GovernorResult(
            decision=GovernorDecision.REJECT,
            rule_id="unknown_type",
            reason=f"Type '{memory_type}' not in durable types",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if existing_memory is None:
        return GovernorResult(
            decision=GovernorDecision.STORE,
            rule_id="new_durable_memory",
            reason=f"New durable {memory_type} from {source_type}",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    existing_content = str(existing_memory.get("content", ""))
    existing_trust = _get_source_trust(
        str(existing_memory.get("source", "user_message")), p
    )

    if source_trust < existing_trust:
        return GovernorResult(
            decision=GovernorDecision.KEEP_SEPARATE,
            rule_id="lower_source_trust",
            reason=f"Source trust {source_trust} < existing trust {existing_trust}",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if content.strip() == existing_content.strip():
        return GovernorResult(
            decision=GovernorDecision.NOOP,
            rule_id="exact_match",
            reason="Content matches existing memory",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    if confidence > 0.9 and source_trust >= 0.9:
        return GovernorResult(
            decision=GovernorDecision.SUPERSEDE,
            rule_id="high_confidence_correction",
            reason=f"High confidence ({confidence}) from trusted source ({source_type})",
            confidence=effective_confidence,
            policy_version=p.policy_version,
        )

    return GovernorResult(
        decision=GovernorDecision.STORE,
        rule_id="default_store",
        reason=f"Durable {memory_type} accepted via default policy",
        confidence=effective_confidence,
        policy_version=p.policy_version,
    )
