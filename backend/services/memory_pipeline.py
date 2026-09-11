"""Memory Write Pipeline — integrates extraction, governance, and L3 resolution.

Orchestrates the flow: Experience → Extract → Govern → Resolve → Commit
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from services.memory_extraction import ExtractionCandidate, ExtractionResult, extract_memories, extract_memories_sync
from services.memory_governor import GovernorDecision, GovernorResult, govern_candidate, MemoryPolicy
from services.experience_capture import Experience, ExperienceSource

logger = logging.getLogger("truememory.pipeline")


@dataclass(frozen=True)
class WriteTrace:
    """Trace of a memory write operation for observability."""
    experience_id: str
    candidate_id: str | None
    memory_id: str | None
    operation: str
    previous_state: str | None
    new_state: str | None
    source: str
    confidence: float
    importance: float
    governor_rule: str
    policy_version: str
    resolver_result: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class PipelineResult:
    """Result of the memory write pipeline."""
    traces: list[WriteTrace]
    memories_written: int
    candidates_extracted: int
    candidates_governed: int
    candidates_rejected: int
    method: str
    success: bool
    error: str | None = None


def _map_governor_to_operation(governor_decision: GovernorDecision) -> str:
    mapping = {
        GovernorDecision.STORE: "ADD",
        GovernorDecision.UPDATE: "UPDATE",
        GovernorDecision.SUPERSEDE: "SUPERSEDE",
        GovernorDecision.KEEP_SEPARATE: "ADD",
        GovernorDecision.NOOP: "NOOP",
        GovernorDecision.REJECT: "REJECT",
        GovernorDecision.EXPIRE: "EXPIRE",
    }
    return mapping.get(governor_decision, "UNKNOWN")


async def process_experience(
    experience: Experience,
    *,
    user_id: str,
    workspace_id: str,
    project_id: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    policy: MemoryPolicy | None = None,
) -> PipelineResult:
    """Process a single experience through the full write pipeline.

    Returns PipelineResult with traces but does NOT directly write to database.
    The caller must invoke the actual write based on the accepted candidates.
    """
    traces: list[WriteTrace] = []
    p = policy or MemoryPolicy()

    extraction = await extract_memories(
        experience.content,
        source_type=experience.source.value,
        api_key=api_key,
        model=model,
        conversation_id=experience.conversation_id,
        message_id=experience.message_id,
        project_id=project_id,
    )

    if not extraction.candidates:
        return PipelineResult(
            traces=[], memories_written=0, candidates_extracted=0,
            candidates_governed=0, candidates_rejected=0,
            method=extraction.method, success=True,
        )

    accepted: list[ExtractionCandidate] = []
    for candidate in extraction.candidates:
        governor_result = govern_candidate(candidate, policy=p)

        trace = WriteTrace(
            experience_id=experience.experience_id,
            candidate_id=candidate.memory_key,
            memory_id=None,
            operation=_map_governor_to_operation(governor_result.decision),
            previous_state=None,
            new_state="pending" if governor_result.decision in (
                GovernorDecision.STORE, GovernorDecision.SUPERSEDE,
                GovernorDecision.KEEP_SEPARATE, GovernorDecision.UPDATE,
            ) else None,
            source=experience.source.value,
            confidence=candidate.confidence,
            importance=candidate.importance_score,
            governor_rule=governor_result.rule_id,
            policy_version=governor_result.policy_version,
            resolver_result=governor_result.reason,
        )
        traces.append(trace)

        if governor_result.decision not in (
            GovernorDecision.REJECT, GovernorDecision.NOOP, GovernorDecision.EXPIRE,
        ):
            accepted.append(candidate)

    return PipelineResult(
        traces=traces,
        memories_written=0,
        candidates_extracted=len(extraction.candidates),
        candidates_governed=len(traces),
        candidates_rejected=sum(1 for t in traces if t.operation == "REJECT"),
        method=extraction.method,
        success=True,
    )


def process_experience_sync(
    experience: Experience,
    *,
    user_id: str,
    workspace_id: str,
    project_id: str | None = None,
    policy: MemoryPolicy | None = None,
) -> PipelineResult:
    """Synchronous processing using regex extraction only (for testing)."""
    traces: list[WriteTrace] = []
    p = policy or MemoryPolicy()

    extraction = extract_memories_sync(
        experience.content,
        source_type=experience.source.value,
    )

    if not extraction.candidates:
        return PipelineResult(
            traces=[], memories_written=0, candidates_extracted=0,
            candidates_governed=0, candidates_rejected=0,
            method=extraction.method, success=True,
        )

    accepted: list[ExtractionCandidate] = []
    for candidate in extraction.candidates:
        governor_result = govern_candidate(candidate, policy=p)

        trace = WriteTrace(
            experience_id=experience.experience_id,
            candidate_id=candidate.memory_key,
            memory_id=None,
            operation=_map_governor_to_operation(governor_result.decision),
            previous_state=None,
            new_state="pending" if governor_result.decision in (
                GovernorDecision.STORE, GovernorDecision.SUPERSEDE,
                GovernorDecision.KEEP_SEPARATE, GovernorDecision.UPDATE,
            ) else None,
            source=experience.source.value,
            confidence=candidate.confidence,
            importance=candidate.importance_score,
            governor_rule=governor_result.rule_id,
            policy_version=governor_result.policy_version,
            resolver_result=governor_result.reason,
        )
        traces.append(trace)

        if governor_result.decision not in (
            GovernorDecision.REJECT, GovernorDecision.NOOP, GovernorDecision.EXPIRE,
        ):
            accepted.append(candidate)

    return PipelineResult(
        traces=traces,
        memories_written=0,
        candidates_extracted=len(extraction.candidates),
        candidates_governed=len(traces),
        candidates_rejected=sum(1 for t in traces if t.operation == "REJECT"),
        method=extraction.method,
        success=True,
    )


def candidates_to_write_objects(
    candidates: list[ExtractionCandidate],
    *,
    user_id: str,
    workspace_id: str,
    conversation_id: str | None = None,
    source_message_id: str | None = None,
    project_id: str | None = None,
) -> list[Any]:
    """Convert ExtractionCandidates to objects compatible with save_durable_memories."""
    from dataclasses import dataclass as dc

    @dc
    class WriteCandidate:
        memory_type: str
        memory_key: str
        content: str
        importance_score: float

    return [
        WriteCandidate(
            memory_type=c.memory_type,
            memory_key=c.memory_key,
            content=c.content,
            importance_score=c.importance_score,
        )
        for c in candidates
    ]
