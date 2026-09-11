"""LLM-based memory extraction with structured output.

Produces memory candidates from natural language without directly mutating state.
Falls back to deterministic regex extraction on LLM failure.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field, asdict
from hashlib import sha256
from typing import Any

from services.durable_memory import DurableMemoryCandidate, extract_durable_memories

logger = logging.getLogger("truememory.extraction")

EXTRACTION_PROMPT = """Extract durable memories from the following text. For each memory, return:
- type: preference | fact | decision | task_state | entity | event
- content: A concise, self-contained statement of the memory
- scope: user | project | agent | global
- confidence: 0.0-1.0 (how certain is this fact)
- importance: 0.0-1.0 (how significant is this for future context)
- temporal: { "valid_from": null, "valid_until": null } if time-bound, else null
- entities: list of entity names mentioned
- reason: brief explanation of why this is a durable memory

Rules:
- Only extract facts, preferences, decisions, or entity relationships
- Do NOT extract questions, temporary states, or debugging notes
- Do NOT extract opinions unless explicitly stated as preferences
- If the text contains no durable information, return an empty array
- Each extracted memory must be self-contained and understandable without context

Text:
{text}

Respond with a JSON object: { "candidates": [...] }"""

MEMORY_TYPES = {"preference", "fact", "decision", "task_state", "entity", "event"}
SCOPE_TYPES = {"user", "project", "agent", "global"}
MIN_CONFIDENCE = 0.5
MIN_IMPORTANCE = 0.3
MAX_CONTENT_LENGTH = 2000


@dataclass(frozen=True)
class ExtractionCandidate:
    """Validated memory candidate from extraction."""
    memory_type: str
    memory_key: str
    content: str
    importance_score: float
    confidence: float
    scope: str
    entities: list[str]
    temporal: dict[str, str | None] | None
    source_type: str
    reason: str


@dataclass(frozen=True)
class ExtractionResult:
    """Result of extraction processing."""
    candidates: list[ExtractionCandidate]
    source: str
    method: str
    success: bool
    error: str | None = None
    latency_ms: float | None = None


def _normalize_type(memory_type: str) -> str:
    normalized = memory_type.strip().lower()
    return normalized if normalized in MEMORY_TYPES else "fact"


def _normalize_scope(scope: str) -> str:
    normalized = scope.strip().lower()
    return normalized if normalized in SCOPE_TYPES else "user"


def _make_memory_key(memory_type: str, content: str) -> str:
    digest = sha256(content.strip().casefold().encode("utf-8")).hexdigest()[:24]
    return f"{memory_type}:{digest}"


def _validate_candidate(raw: dict[str, Any], source_type: str) -> ExtractionCandidate | None:
    """Validate and normalize a raw extraction candidate."""
    try:
        memory_type = _normalize_type(raw.get("type", "fact"))
        content = str(raw.get("content", "")).strip()
        if not content or len(content) < 3:
            return None
        if len(content) > MAX_CONTENT_LENGTH:
            content = content[:MAX_CONTENT_LENGTH]

        confidence = float(raw.get("confidence", 0.7))
        if confidence < MIN_CONFIDENCE:
            return None

        importance = float(raw.get("importance", 0.5))
        if importance < MIN_IMPORTANCE:
            importance = MIN_IMPORTANCE

        scope = _normalize_scope(raw.get("scope", "user"))
        entities = [str(e).strip() for e in raw.get("entities", []) if str(e).strip()]
        temporal = raw.get("temporal")
        if temporal and not isinstance(temporal, dict):
            temporal = None
        reason = str(raw.get("reason", "extracted")).strip()[:500]

        memory_key = _make_memory_key(memory_type, content)

        return ExtractionCandidate(
            memory_type=memory_type,
            memory_key=memory_key,
            content=content,
            importance_score=min(importance, 1.0),
            confidence=min(confidence, 1.0),
            scope=scope,
            entities=entities,
            temporal=temporal,
            source_type=source_type,
            reason=reason,
        )
    except (ValueError, TypeError, KeyError) as exc:
        logger.debug("Candidate validation failed: %s", exc)
        return None


def _parse_llm_response(response_text: str) -> list[dict[str, Any]]:
    """Extract JSON candidates from LLM response."""
    text = response_text.strip()
    json_match = re.search(r'\{[\s\S]*"candidates"[\s\S]*\}', text)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            candidates = parsed.get("candidates", [])
            if isinstance(candidates, list):
                return candidates
        except json.JSONDecodeError:
            pass

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "candidates" in parsed:
            return parsed["candidates"]
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    return []


def _deterministic_extract(text: str, source_type: str) -> list[ExtractionCandidate]:
    """Fallback deterministic extraction using regex patterns."""
    candidates = extract_durable_memories(text)
    result: list[ExtractionCandidate] = []
    for c in candidates:
        validated = _validate_candidate(
            {
                "type": c.memory_type,
                "content": c.content,
                "confidence": 0.7,
                "importance": c.importance_score,
                "scope": "user",
                "entities": [],
                "temporal": None,
                "reason": "regex_fallback",
            },
            source_type,
        )
        if validated:
            result.append(validated)
    return result


async def extract_memories(
    text: str,
    *,
    source_type: str = "user_message",
    api_key: str | None = None,
    model: str | None = None,
    conversation_id: str | None = None,
    message_id: str | None = None,
    project_id: str | None = None,
) -> ExtractionResult:
    """Extract memory candidates from text using LLM with regex fallback.

    Args:
        text: The text to extract memories from.
        source_type: The source of the text (user_message, assistant_message, tool_result, etc.)
        api_key: OpenRouter API key for LLM extraction.
        model: Model to use for extraction.
        conversation_id: Optional conversation context.
        message_id: Optional message context.
        project_id: Optional project context.

    Returns:
        ExtractionResult with validated candidates.
    """
    import time
    start = time.monotonic()

    if not text or not text.strip():
        return ExtractionResult(
            candidates=[], source=source_type, method="none", success=True
        )

    if api_key and model:
        try:
            from services.openrouter import complete_chat_completion

            prompt = EXTRACTION_PROMPT.format(text=text[:4000])
            messages = [{"role": "user", "content": prompt}]

            response = await complete_chat_completion(
                api_key=api_key,
                model=model,
                messages=messages,
                max_tokens=1500,
            )

            raw_candidates = _parse_llm_response(response)
            validated: list[ExtractionCandidate] = []
            for raw in raw_candidates:
                candidate = _validate_candidate(raw, source_type)
                if candidate:
                    validated.append(candidate)

            latency = (time.monotonic() - start) * 1000

            if validated:
                return ExtractionResult(
                    candidates=validated,
                    source=source_type,
                    method="llm",
                    success=True,
                    latency_ms=latency,
                )

        except Exception as exc:
            logger.warning("LLM extraction failed, falling back to regex: %s", exc)

    fallback = _deterministic_extract(text, source_type)
    latency = (time.monotonic() - start) * 1000
    return ExtractionResult(
        candidates=fallback,
        source=source_type,
        method="regex_fallback",
        success=True,
        latency_ms=latency,
    )


def extract_memories_sync(
    text: str,
    *,
    source_type: str = "user_message",
    api_key: str | None = None,
    model: str | None = None,
) -> ExtractionResult:
    """Synchronous extraction using regex only (for testing and fallback)."""
    import time
    start = time.monotonic()
    fallback = _deterministic_extract(text, source_type)
    latency = (time.monotonic() - start) * 1000
    return ExtractionResult(
        candidates=fallback,
        source=source_type,
        method="regex_fallback",
        success=True,
        latency_ms=latency,
    )
