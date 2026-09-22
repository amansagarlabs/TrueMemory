"""OpenAI adapter using the provider-neutral OpenAI-compatible contract."""

from __future__ import annotations

from collections.abc import Callable

from services.providers.openrouter_provider import OpenRouterProvider


class OpenAIProvider(OpenRouterProvider):
    """OpenAI implementation without leaking SDK/provider objects upstream."""

    def __init__(self, api_key: str, model: str = "gpt-5.6-terra", base_url: str = "https://api.openai.com/v1", on_usage: Callable | None = None):
        super().__init__(api_key=api_key, model=model, on_usage=on_usage, base_url=base_url)

    def name(self) -> str:
        return "openai"


def create_openai_provider(api_key: str, model: str = "gpt-5.6-terra", base_url: str = "https://api.openai.com/v1", on_usage: Callable | None = None) -> OpenAIProvider:
    return OpenAIProvider(api_key=api_key, model=model, base_url=base_url, on_usage=on_usage)
