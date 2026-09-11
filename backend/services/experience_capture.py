"""Experience capture for agent actions and observations.

Captures experiences from agent execution without automatically persisting them as durable memory.
Experiences are the raw input for the extraction pipeline.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

logger = logging.getLogger("truememory.experience")


class ExperienceSource(Enum):
    USER_INPUT = "user_input"
    ASSISTANT_MESSAGE = "assistant_message"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    AGENT_OBSERVATION = "agent_observation"
    TASK_COMPLETION = "task_completion"
    TASK_FAILURE = "task_failure"
    USER_CORRECTION = "user_correction"
    AGENT_DECISION = "agent_decision"


@dataclass
class Experience:
    """Raw experience from agent execution."""
    experience_id: str = field(default_factory=lambda: str(uuid4()))
    source: ExperienceSource = ExperienceSource.USER_INPUT
    content: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    run_id: str | None = None
    task_id: str | None = None
    conversation_id: str | None = None
    message_id: str | None = None
    tool_call_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["source"] = self.source.value
        d["timestamp"] = self.timestamp.isoformat()
        return d


@dataclass
class ExperienceBatch:
    """Batch of related experiences from a single execution step."""
    experiences: list[Experience] = field(default_factory=list)
    run_id: str | None = None
    task_id: str | None = None

    def add(self, experience: Experience) -> None:
        if experience.run_id and not self.run_id:
            self.run_id = experience.run_id
        if experience.task_id and not self.task_id:
            self.task_id = experience.task_id
        self.experiences.append(experience)


def capture_user_input(
    content: str,
    *,
    conversation_id: str | None = None,
    message_id: str | None = None,
    run_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.USER_INPUT,
        content=content,
        conversation_id=conversation_id,
        message_id=message_id,
        run_id=run_id,
    )


def capture_assistant_message(
    content: str,
    *,
    conversation_id: str | None = None,
    message_id: str | None = None,
    run_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.ASSISTANT_MESSAGE,
        content=content,
        conversation_id=conversation_id,
        message_id=message_id,
        run_id=run_id,
    )


def capture_tool_result(
    tool_name: str,
    result: str,
    *,
    tool_call_id: str | None = None,
    run_id: str | None = None,
    task_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.TOOL_RESULT,
        content=f"[{tool_name}] {result[:3000]}",
        tool_call_id=tool_call_id,
        run_id=run_id,
        task_id=task_id,
        metadata={"tool_name": tool_name},
    )


def capture_task_completion(
    task_description: str,
    result_summary: str,
    *,
    run_id: str | None = None,
    task_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.TASK_COMPLETION,
        content=f"Completed: {task_description}. Result: {result_summary[:2000]}",
        run_id=run_id,
        task_id=task_id,
    )


def capture_user_correction(
    original: str,
    correction: str,
    *,
    conversation_id: str | None = None,
    run_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.USER_CORRECTION,
        content=f"Correction: previously '{original}', now '{correction}'",
        conversation_id=conversation_id,
        run_id=run_id,
    )


def capture_agent_observation(
    observation: str,
    *,
    run_id: str | None = None,
    task_id: str | None = None,
) -> Experience:
    return Experience(
        source=ExperienceSource.AGENT_OBSERVATION,
        content=observation,
        run_id=run_id,
        task_id=task_id,
    )
