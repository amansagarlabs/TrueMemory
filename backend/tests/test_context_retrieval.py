import asyncio

from services.context_engine import ContextNode
from services.context_retrieval import (
    CallableContextProvider,
    ContextProviderRegistry,
    ContextRetrievalRequest,
    ParallelContextRetriever,
)


def test_selected_providers_run_concurrently_and_fail_independently() -> None:
    registry = ContextProviderRegistry()

    async def memory(_request):
        await asyncio.sleep(0.02)
        return [ContextNode("m1", "memory", "Name", "Aman", "profile-memory")]

    async def broken(_request):
        raise RuntimeError("credential unavailable")

    registry.register(CallableContextProvider(
        name="memory", kinds={"memory"}, retrieve=memory
    ))
    registry.register(CallableContextProvider(
        name="github", kinds={"github_repository"}, retrieve=broken
    ))
    results = asyncio.run(ParallelContextRetriever(registry).retrieve(
        ContextRetrievalRequest(
            question="Who am I?",
            mentions=(
                {"kind": "memory", "id": "profile-memory", "label": "Profile"},
                {"kind": "github_repository", "id": "repos", "label": "Repositories"},
            ),
            user_id="user-1",
            conversation_id="chat-1",
        )
    ))

    assert results[0].nodes[0].metadata["provider"] == "memory"
    assert results[1].error == "provider_failed"


def test_unmentioned_provider_is_not_executed() -> None:
    called = False

    async def web(_request):
        nonlocal called
        called = True
        return []

    registry = ContextProviderRegistry()
    registry.register(CallableContextProvider(name="web", kinds={"web"}, retrieve=web))
    results = asyncio.run(ParallelContextRetriever(registry).retrieve(
        ContextRetrievalRequest(
            question="hello",
            mentions=({"kind": "memory", "id": "profile-memory", "label": "Profile"},),
            user_id="user-1",
            conversation_id="chat-1",
        )
    ))
    assert results == []
    assert called is False
