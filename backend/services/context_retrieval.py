"""Concurrent provider registry for structured @mention retrieval."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol

from services.context_engine import ContextNode, normalize_kind


@dataclass(frozen=True)
class ContextRetrievalRequest:
    question: str
    mentions: tuple[dict[str, str], ...]
    user_id: str
    conversation_id: str


@dataclass(frozen=True)
class ProviderResult:
    provider: str
    nodes: tuple[ContextNode, ...] = ()
    error: str | None = None


class ContextProvider(Protocol):
    name: str
    kinds: frozenset[str]

    async def retrieve(self, request: ContextRetrievalRequest) -> list[ContextNode]: ...


class CallableContextProvider:
    def __init__(
        self,
        *,
        name: str,
        kinds: set[str],
        retrieve: Callable[[ContextRetrievalRequest], Awaitable[list[ContextNode]]],
    ) -> None:
        self.name = name
        self.kinds = frozenset(normalize_kind(kind) for kind in kinds)
        self._retrieve = retrieve

    async def retrieve(self, request: ContextRetrievalRequest) -> list[ContextNode]:
        return await self._retrieve(request)


class ContextProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, ContextProvider] = {}

    def register(self, provider: ContextProvider) -> None:
        if provider.name in self._providers:
            raise ValueError(f"Context provider already registered: {provider.name}")
        self._providers[provider.name] = provider

    def providers_for(self, mentions: tuple[dict[str, str], ...]) -> list[ContextProvider]:
        requested = {
            normalize_kind(str(mention.get("kind") or ""))
            for mention in mentions
        }
        return [
            provider
            for provider in self._providers.values()
            if provider.kinds & requested
        ]


class ParallelContextRetriever:
    def __init__(
        self,
        registry: ContextProviderRegistry,
        *,
        provider_timeout_seconds: float = 8.0,
    ) -> None:
        self.registry = registry
        self.provider_timeout_seconds = provider_timeout_seconds

    async def retrieve(self, request: ContextRetrievalRequest) -> list[ProviderResult]:
        providers = self.registry.providers_for(request.mentions)

        async def run(provider: ContextProvider) -> ProviderResult:
            try:
                nodes = await asyncio.wait_for(
                    provider.retrieve(request),
                    timeout=self.provider_timeout_seconds,
                )
                enriched = tuple(
                    ContextNode(
                        **{
                            **node.__dict__,
                            "metadata": {
                                "provider": provider.name,
                                "provenance": "mention-retrieval",
                                **node.metadata,
                            },
                        }
                    )
                    for node in nodes
                )
                return ProviderResult(provider=provider.name, nodes=enriched)
            except TimeoutError:
                return ProviderResult(provider=provider.name, error="provider_timeout")
            except Exception:
                return ProviderResult(provider=provider.name, error="provider_failed")

        return list(await asyncio.gather(*(run(provider) for provider in providers)))
