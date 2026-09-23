"""OpenRouter Provider Adapter — implements LLMProvider for OpenRouter.

This is one implementation of the LLMProvider interface.
TrueMemory memory tools and agent runtime depend only on the interface,
not on this specific implementation.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import Any

import httpx

from services.llm_provider import (
    LLMProvider,
    ProviderCapabilities,
    CompletionRequest,
    CompletionResponse,
    ToolCall,
    ToolDefinition,
    Message,
)
from services.model_registry import (
    OPENROUTER_FREE_MODEL,
    OPENROUTER_MODEL_ALIASES,
    resolve_openrouter_model,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "https://true-memory.vercel.app")
_AFFORDABLE_TOKENS_RE = re.compile(r"can only afford\s+([\d,]+)", re.IGNORECASE)


def _affordable_retry_tokens(message: str, requested: int) -> int | None:
    """Return a conservative retry limit for OpenRouter credit-bound requests."""
    match = _AFFORDABLE_TOKENS_RE.search(message)
    if not match:
        return None
    affordable = int(match.group(1).replace(",", ""))
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


class OpenRouterProvider(LLMProvider):
    """OpenRouter provider implementation."""

    def __init__(
        self,
        api_key: str,
        model: str = "openai/gpt-4o",
        on_usage: Callable[[dict[str, int]], None] | None = None,
        base_url: str = "https://openrouter.ai/api/v1",
    ):
        self._api_key = api_key
        self._model = self._normalize_model(model, OPENROUTER_FREE_MODEL)
        self._on_usage = on_usage
        self._base_url = base_url.rstrip("/")

    @staticmethod
    def _normalize_model(model: str | None, fallback: str) -> str:
        value = str(model or "").strip()
        lowered = value.casefold()
        alias = lowered.split("::", 1)[1] if "::" in lowered else lowered
        if alias in OPENROUTER_MODEL_ALIASES:
            return resolve_openrouter_model(
                alias,
                has_images=False,
                default_model=fallback,
                vision_model=fallback,
            )
        return value or fallback

    def _request_model(self, model: str | None) -> str:
        """Normalize legacy UI aliases before they reach OpenRouter."""
        return self._normalize_model(model, self._model)

    def name(self) -> str:
        return "openrouter"

    def capabilities(self) -> set[ProviderCapabilities]:
        return {
            ProviderCapabilities.STREAMING,
            ProviderCapabilities.TOOL_CALLING,
            ProviderCapabilities.PARALLEL_TOOL_CALLS,
            ProviderCapabilities.VISION,
            ProviderCapabilities.SYSTEM_MESSAGES,
        }

    async def chat(self, request: CompletionRequest) -> CompletionResponse:
        """Non-streaming chat completion."""
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-Title": "TrueMemory",
        }
        payload = {
            "model": self._request_model(request.model),
            "messages": self.format_messages(request.messages),
            "stream": False,
            "max_tokens": request.max_tokens,
        }
        if request.tools:
            payload["tools"] = self.format_tools(request.tools)

        async with httpx.AsyncClient(timeout=120.0) as client:
            for attempt in range(2):
                response = await client.post(f"{self._base_url}/chat/completions", headers=headers, json=payload)
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

                return CompletionResponse(
                    content=_content_text(message.get("content")),
                    tool_calls=self.parse_tool_calls(message),
                    usage=_normalized_usage(data.get("usage")),
                    model=data.get("model", ""),
                    finish_reason=choice.get("finish_reason", ""),
                )
        return CompletionResponse()

    async def stream(self, request: CompletionRequest) -> AsyncGenerator[str, None]:
        """Streaming chat completion."""
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-Title": "TrueMemory",
        }
        payload = {
            "model": self._request_model(request.model),
            "messages": self.format_messages(request.messages),
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": request.max_tokens,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            for attempt in range(2):
                async with client.stream(
                    "POST", f"{self._base_url}/chat/completions", headers=headers, json=payload
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
                        if usage and self._on_usage:
                            self._on_usage(usage)
                        choices = chunk.get("choices")
                        if not isinstance(choices, list) or not choices:
                            continue
                        choice = choices[0] or {}
                        delta = choice.get("delta", {}) or {}
                        text = _content_text(delta.get("content"))
                        if not text:
                            text = _content_text((choice.get("message") or {}).get("content"))
                        if text:
                            yield text
                    return

    async def stream_with_tools(
        self, request: CompletionRequest
    ) -> AsyncGenerator[str | list[ToolCall], None]:
        """Streaming chat completion with tool support."""
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-Title": "TrueMemory",
        }
        payload: dict[str, Any] = {
            "model": self._request_model(request.model),
            "messages": self.format_messages(request.messages),
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": request.max_tokens,
        }
        if request.tools:
            payload["tools"] = self.format_tools(request.tools)
            payload["tool_choice"] = "auto"

        collected_tool_calls: dict[int, dict] = {}

        async with httpx.AsyncClient(timeout=120.0) as client:
            for attempt in range(2):
                async with client.stream(
                    "POST", f"{self._base_url}/chat/completions", headers=headers, json=payload
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
                        if usage and self._on_usage:
                            self._on_usage(usage)
                        choices = chunk.get("choices")
                        if not isinstance(choices, list) or not choices:
                            continue
                        choice = choices[0] or {}
                        delta = choice.get("delta", {}) or {}
                        # Handle tool call deltas
                        for tc_delta in delta.get("tool_calls") or []:
                            idx = tc_delta.get("index", 0)
                            if idx not in collected_tool_calls:
                                collected_tool_calls[idx] = {
                                    "id": tc_delta.get("id", ""),
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                }
                            tc = collected_tool_calls[idx]
                            if tc_delta.get("id"):
                                tc["id"] = tc_delta["id"]
                            fn = tc_delta.get("function") or {}
                            if fn.get("name"):
                                tc["function"]["name"] += fn["name"]
                            if fn.get("arguments"):
                                tc["function"]["arguments"] += fn["arguments"]
                        # Yield text content
                        text = _content_text(delta.get("content"))
                        if not text:
                            text = _content_text((choice.get("message") or {}).get("content"))
                        if text:
                            yield text
                    # After stream ends, yield tool calls if any
                    if collected_tool_calls:
                        tool_calls = []
                        for tc in collected_tool_calls.values():
                            args = tc["function"]["arguments"]
                            try:
                                args = json.loads(args)
                            except (json.JSONDecodeError, TypeError):
                                args = {}
                            tool_calls.append(ToolCall(
                                id=tc["id"],
                                name=tc["function"]["name"],
                                arguments=args,
                            ))
                        yield tool_calls
                    return

    async def chat_with_tools(self, request: CompletionRequest) -> CompletionResponse:
        """Non-streaming chat completion with tool support."""
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-Title": "TrueMemory",
        }
        payload: dict[str, Any] = {
            "model": self._request_model(request.model),
            "messages": self.format_messages(request.messages),
            "stream": False,
            "max_tokens": request.max_tokens,
        }
        if request.tools:
            payload["tools"] = self.format_tools(request.tools)
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=120.0) as client:
            for attempt in range(2):
                response = await client.post(f"{self._base_url}/chat/completions", headers=headers, json=payload)
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

                return CompletionResponse(
                    content=_content_text(message.get("content")),
                    tool_calls=self.parse_tool_calls(message),
                    usage=_normalized_usage(data.get("usage")),
                    model=data.get("model", ""),
                    finish_reason=choice.get("finish_reason", ""),
                )
        return CompletionResponse()


def create_openrouter_provider(
    api_key: str,
    model: str = "openai/gpt-4o",
    on_usage: Callable[[dict[str, int]], None] | None = None,
    base_url: str = "https://openrouter.ai/api/v1",
) -> OpenRouterProvider:
    """Factory function to create OpenRouterProvider."""
    return OpenRouterProvider(api_key=api_key, model=model, on_usage=on_usage, base_url=base_url)
