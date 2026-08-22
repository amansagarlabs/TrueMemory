"""
Step 9–10 — OpenRouter chat completions with streaming.

LEARNING: The LLM never sees your whole PDF — only the retrieved chunks we inject.
          Streaming (SSE) sends tokens as they're generated for faster perceived UX.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator, Callable

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_AFFORDABLE_TOKENS_RE = re.compile(r"can only afford\s+([\d,]+)", re.IGNORECASE)


def _affordable_retry_tokens(message: str, requested: int) -> int | None:
    """Return a conservative retry limit for OpenRouter credit-bound requests."""
    match = _AFFORDABLE_TOKENS_RE.search(message)
    if not match:
        return None
    affordable = int(match.group(1).replace(",", ""))
    # Leave a small margin because provider-side estimates can change between
    # the rejected request and the retry.
    retry_tokens = min(requested - 1, max(1, int(affordable * 0.9)))
    return retry_tokens if retry_tokens < requested else None


def _openrouter_error(response_body: bytes, status_code: int) -> str:
    try:
        error = json.loads(response_body)
        return error.get("error", {}).get("message", response_body.decode())
    except Exception:
        return response_body.decode() or f"OpenRouter error {status_code}"


def _content_text(value: object) -> str:
    """Normalize OpenAI/OpenRouter string or multipart content chunks."""
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ""

    parts: list[str] = []
    for item in value:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            text = item.get("text") or item.get("content")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


def _normalized_usage(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}

    aliases = {
        "prompt_tokens": ("prompt_tokens", "input_tokens"),
        "completion_tokens": ("completion_tokens", "output_tokens"),
        "total_tokens": ("total_tokens",),
    }
    usage: dict[str, int] = {}
    for normalized_key, keys in aliases.items():
        for key in keys:
            count = value.get(key)
            if isinstance(count, int) and count >= 0:
                usage[normalized_key] = count
                break
    if "total_tokens" not in usage:
        input_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        if input_tokens is not None and output_tokens is not None:
            usage["total_tokens"] = input_tokens + output_tokens
    return usage


async def stream_chat_completion(
    *,
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int = 2048,
    on_usage: Callable[[dict[str, int]], None] | None = None,
) -> AsyncGenerator[str, None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Kontext",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in range(2):
            async with client.stream(
                "POST", OPENROUTER_URL, headers=headers, json=payload
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    message = _openrouter_error(body, response.status_code)
                    retry_tokens = _affordable_retry_tokens(message, int(payload["max_tokens"]))
                    if attempt == 0 and retry_tokens:
                        payload["max_tokens"] = retry_tokens
                        continue
                    raise RuntimeError(message)

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    usage = _normalized_usage(chunk.get("usage"))
                    if usage and on_usage:
                        on_usage(usage)
                    choices = chunk.get("choices")
                    if not isinstance(choices, list) or not choices:
                        continue
                    choice = choices[0] or {}
                    delta = choice.get("delta", {}) or {}
                    text = _content_text(delta.get("content"))
                    # A few compatible gateways put the final content on
                    # `message` instead of `delta`; accept both shapes.
                    if not text:
                        text = _content_text((choice.get("message") or {}).get("content"))
                    if text:
                        yield text
                return


async def complete_chat_completion(
    *,
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int = 2048,
) -> str:
    """Non-stream fallback for gateways that close an empty stream."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Kontext",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in range(2):
            response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            if response.status_code != 200:
                message = _openrouter_error(response.content, response.status_code)
                retry_tokens = _affordable_retry_tokens(message, int(payload["max_tokens"]))
                if attempt == 0 and retry_tokens:
                    payload["max_tokens"] = retry_tokens
                    continue
                raise RuntimeError(message)

            data = response.json()
            choice = (data.get("choices") or [{}])[0] or {}
            message = choice.get("message") or {}
            return _content_text(message.get("content")) or _content_text(choice.get("text"))
    return ""


async def stream_ollama_completion(
    *,
    base_url: str,
    model: str,
    messages: list[dict],
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Stream a chat response from a local Ollama server."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"num_predict": max_tokens},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream("POST", f"{base_url}/api/chat", json=payload) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise RuntimeError(_openrouter_error(body, response.status_code))
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    text = _content_text((chunk.get("message") or {}).get("content"))
                    if text:
                        yield text
        except httpx.HTTPError as exc:
            raise RuntimeError(
                f"Ollama is unavailable at {base_url}. Start Ollama and pull '{model}'."
            ) from exc
