"""Optional fast decision providers for the agent harness.

This package deliberately does not import MemoryCore, MemoryClient, or any
storage implementation. Decisions are advisory unless the harness policy
explicitly permits a low-risk active use.
"""

from agent.harness.decision.contract import (
    DecisionQuestion,
    DecisionRequest,
    FastDecisionProvider,
    FastDecisionResult,
)
from agent.harness.decision.deterministic import DeterministicFastDecisionProvider
from agent.harness.decision.groq import GroqDecisionProvider
from agent.harness.decision.opa import EmbeddedOpaEngine
from agent.harness.decision.service import FastDecisionService

__all__ = [
    "DecisionQuestion",
    "DecisionRequest",
    "FastDecisionProvider",
    "FastDecisionResult",
    "DeterministicFastDecisionProvider",
    "EmbeddedOpaEngine",
    "GroqDecisionProvider",
    "FastDecisionService",
]
