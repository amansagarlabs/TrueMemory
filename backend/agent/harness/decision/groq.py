"""Optional server-side Groq structured-output advisor."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from agent.harness.decision.contract import DecisionRequest, FastDecisionProvider, FastDecisionResult
from services.retry_policy import backoff_ms, classify_http, retry_after_ms


class GroqAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)


class GroqDecisionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[GroqAnswer]
    reason: str = ""


class GroqDecisionError(RuntimeError):
    pass


class GroqDecisionProvider(FastDecisionProvider):
    provider_name = "groq"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.groq.com/openai/v1",
        model: str = "openai/gpt-oss-20b",
        timeout_seconds: float = 1.5,
        max_attempts: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.model = model.strip() or "openai/gpt-oss-20b"
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max(1, min(max_attempts, 3))
        self.transport = transport

    async def evaluate(self, request: DecisionRequest) -> FastDecisionResult:
        if not self.api_key:
            raise GroqDecisionError("GROQ_API_KEY is not configured")
        started = time.perf_counter()
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "Return only the requested typed decision. Do not invent fields.",
                },
                {"role": "user", "content": json.dumps(self._minimal_payload(request), separators=(",", ":"))},
            ],
            "temperature": 0,
            "max_tokens": 300,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "truememory_decision",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "answers": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "value": {"type": "string"},
                                        "confidence": {"type": "number"},
                                    },
                                    "required": ["name", "value", "confidence"],
                                    "additionalProperties": False,
                                },
                            },
                            "reason": {"type": "string"},
                        },
                        "required": ["answers", "reason"],
                        "additionalProperties": False,
                    },
                },
            },
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=self.timeout_seconds, transport=self.transport) as client:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt >= self.max_attempts:
                        raise GroqDecisionError(type(exc).__name__) from exc
                    await self._sleep(attempt, 0)
                    continue
                if response.status_code >= 400:
                    decision = classify_http(response.status_code, method="POST", idempotency_key=request.request_id)
                    if not decision.retryable or attempt >= self.max_attempts:
                        raise GroqDecisionError(f"groq_http_{response.status_code}")
                    await self._sleep(attempt, retry_after_ms(response.headers.get("Retry-After")))
                    continue
                try:
                    body = response.json()
                    content = body["choices"][0]["message"]["content"]
                    parsed = GroqDecisionPayload.model_validate_json(content)
                except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
                    raise GroqDecisionError("groq_invalid_structured_response") from exc
                values: dict[str, Any] = {}
                confidences: dict[str, float] = {}
                questions = request.questions
                for answer in parsed.answers:
                    if answer.name not in questions:
                        raise GroqDecisionError("groq_unknown_answer_name")
                    values[answer.name] = self._coerce_value(answer.value, questions[answer.name].type, questions[answer.name].criteria)
                    confidences[answer.name] = answer.confidence
                if set(values) != set(questions):
                    raise GroqDecisionError("groq_missing_answer")
                return FastDecisionResult(
                    values=values,
                    provider="groq",
                    model=self.model,
                    latency_ms=round((time.perf_counter() - started) * 1000, 3),
                    request_id=request.request_id,
                    run_id=request.run_id,
                    confidences=confidences,
                )
        raise GroqDecisionError("groq_request_exhausted")

    @staticmethod
    def _minimal_payload(request: DecisionRequest) -> dict[str, Any]:
        return {
            "decision_type": request.decision_type,
            "state": {key: value for key, value in request.state.items() if key in {"user_message", "candidate_tool", "task_type", "project_id", "explicit", "complex"}},
            "questions": {name: question.to_payload() for name, question in request.questions.items()},
        }

    @staticmethod
    def _coerce_value(value: str, question_type: str, criteria: Any) -> Any:
        if question_type == "noul":
            lowered = value.strip().casefold()
            if lowered in {"true", "yes", "1"}: return True
            if lowered in {"false", "no", "0"}: return False
            try: return float(value)
            except ValueError: raise GroqDecisionError("groq_invalid_noul_value")
        if question_type == "score":
            try: result = float(value)
            except ValueError: raise GroqDecisionError("groq_invalid_score_value")
            if result < 0 or result > len(criteria or []) - 1: raise GroqDecisionError("groq_score_out_of_range")
            return result
        options = set((criteria or {}).keys())
        if value not in options: raise GroqDecisionError("groq_choice_out_of_range")
        return value

    async def _sleep(self, attempt: int, retry_after: int) -> None:
        import asyncio
        await asyncio.sleep(max(retry_after, backoff_ms(attempt)) / 1000)
