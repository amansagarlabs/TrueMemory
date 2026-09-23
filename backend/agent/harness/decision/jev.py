"""Optional TypeSafe/Jev adapter for the agent harness.

No other TrueMemory layer imports this module. The adapter only translates the
provider-neutral contract to the documented System One HTTP shape and validates
the response before returning it.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from services.retry_policy import backoff_ms, classify_http, retry_after_ms

from agent.harness.decision.contract import (
    DecisionRequest,
    FastDecisionProvider,
    FastDecisionResult,
)


class JevClientError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class JevClient:
    """Thin HTTP boundary; policy and fallback live in FastDecisionService."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.typesafe.ai",
        model: str = "jev-latest",
        timeout_seconds: float = 1.5,
        max_attempts: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.model = model.strip() or "jev-latest"
        self.timeout_seconds = max(0.1, min(float(timeout_seconds), 30.0))
        self.max_attempts = max(1, min(int(max_attempts), 3))
        self.transport = transport

    async def evaluate(self, request: DecisionRequest) -> dict[str, Any]:
        if not self.api_key:
            raise JevClientError("TYPESAFE_API_KEY is not configured")

        request_id = request.request_id or "truememory-fast-decision"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Request-ID": request_id,
            "Idempotency-Key": request_id,
        }
        payload = request.to_payload(model=self.model)
        url = f"{self.base_url}/v1/systemone"
        started = time.perf_counter()

        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            transport=self.transport,
        ) as client:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    response = await client.post(url, headers=headers, json=payload)
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt < self.max_attempts:
                        await self._sleep(attempt, None)
                        continue
                    raise JevClientError(
                        f"Jev request failed after {attempt} attempts: {type(exc).__name__}"
                    ) from exc
                except httpx.HTTPError as exc:
                    raise JevClientError(f"Jev request failed: {type(exc).__name__}") from exc

                if response.is_success:
                    try:
                        result = response.json()
                    except ValueError as exc:
                        raise JevClientError("Jev returned malformed JSON") from exc
                    if not isinstance(result, dict):
                        raise JevClientError("Jev returned a non-object response")
                    return result

                retry = classify_http(
                    response.status_code,
                    method="POST",
                    idempotency_key=request_id,
                )
                if retry.retryable and attempt < self.max_attempts:
                    await self._sleep(attempt, response.headers.get("Retry-After"))
                    continue
                raise JevClientError(
                    f"Jev request failed with HTTP {response.status_code}",
                    status_code=response.status_code,
                )

        raise JevClientError(
            f"Jev request did not complete in {(time.perf_counter() - started) * 1000:.1f}ms"
        )

    async def list_models(self) -> list[dict[str, Any]]:
        if not self.api_key:
            raise JevClientError("TYPESAFE_API_KEY is not configured")
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            transport=self.transport,
        ) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/v1/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise JevClientError("Unable to discover Jev models") from exc
        models = payload.get("data", payload) if isinstance(payload, dict) else payload
        return [item for item in models if isinstance(item, dict)] if isinstance(models, list) else []

    async def _sleep(self, attempt: int, retry_after: str | None) -> None:
        delay_ms = min(
            2_000,
            max(
                retry_after_ms(retry_after),
                backoff_ms(attempt, maximum_ms=2_000),
            ),
        )
        import asyncio

        await asyncio.sleep(delay_ms / 1000)


def _normalize_answers(
    payload: dict[str, Any],
    request: DecisionRequest,
) -> tuple[dict[str, Any], dict[str, float]]:
    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise JevClientError("Jev response is missing answers")

    values: dict[str, Any] = {}
    confidences: dict[str, float] = {}
    for name, question in request.questions.items():
        answer = answers.get(name)
        if not isinstance(answer, dict):
            raise JevClientError(f"Jev response is missing answer: {name}")
        if question.type == "choice":
            value = answer.get("choice")
        elif question.type == "score":
            value = answer.get("score")
        else:
            value = answer.get("noul")
        if value is None:
            raise JevClientError(f"Jev answer has no typed value: {name}")
        if question.type == "choice" and value not in (question.criteria or {}):
            raise JevClientError(f"Jev returned an unknown choice for {name}")
        if question.type == "noul":
            try:
                value = float(value)
            except (TypeError, ValueError) as exc:
                raise JevClientError(f"Jev returned an invalid noul value for {name}") from exc
            if not 0.0 <= value <= 1.0:
                raise JevClientError(f"Jev returned an out-of-range noul value for {name}")
            confidences[name] = max(value, 1.0 - value)
        elif question.type == "score":
            try:
                value = float(value)
            except (TypeError, ValueError) as exc:
                raise JevClientError(f"Jev returned an invalid score for {name}") from exc
            if not 0.0 <= value <= max(0, len(question.criteria or []) - 1):
                raise JevClientError(f"Jev returned an out-of-range score for {name}")
        if question.type != "noul" and answer.get("confidence") is not None:
            try:
                confidences[name] = max(0.0, min(1.0, float(answer["confidence"])))
            except (TypeError, ValueError) as exc:
                raise JevClientError(f"Jev returned an invalid confidence for {name}") from exc
        values[name] = value
    return values, confidences


class JevFastDecisionProvider(FastDecisionProvider):
    provider_name = "jev"

    def __init__(self, client: JevClient) -> None:
        self.client = client

    async def evaluate(self, request: DecisionRequest) -> FastDecisionResult:
        started = time.perf_counter()
        payload = await self.client.evaluate(request)
        values, confidences = _normalize_answers(payload, request)
        return FastDecisionResult(
            values=values,
            provider=self.provider_name,
            model=str(payload.get("model") or self.client.model),
            latency_ms=round((time.perf_counter() - started) * 1000, 3),
            request_id=request.request_id,
            run_id=request.run_id,
            confidences=confidences,
        )
