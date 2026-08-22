"""Provider-neutral memory domain boundary.

Storage adapters stay behind this module. Assistant and public transports call
MemoryCore/MemoryClient instead of implementing memory rules themselves.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import uuid4

from services.memory_store import (
    forget_profile_memory,
    get_profile_memories,
    search_profile_memories,
    update_profile_memory,
    upsert_profile_memory,
    maybe_store_profile_memory,
    sync_account_profile_memories,
)
from services.durable_memory import extract_durable_memories, rank_durable_memories
from services.postgres_store import load_conversation_messages, list_managed_memories, list_workspace_memories, postgres_enabled, save_durable_memories, update_managed_memory
from services.memory_store import get_recent_messages
from services.memory_hot_cache import HotMemoryCache, get_hot_cache
from services.memory_hybrid import get_memory_hybrid_retriever

logger = logging.getLogger("kontext.memory")


@dataclass(frozen=True)
class MemoryScope:
    organization_id: str | None = None
    tenant_id: str | None = None
    user_id: str | None = None
    workspace_id: str | None = None
    agent_id: str | None = None
    session_id: str | None = None
    memory_scope: str = "general"


@dataclass(frozen=True)
class MemoryOperationContext:
    scope: MemoryScope
    request_id: str = field(default_factory=lambda: str(uuid4()))
    actor_type: str = "user"
    actor_id: str | None = None
    token_bindings: dict[str, str] = field(default_factory=dict)


class MemoryAuthorization:
    """Server-side ownership checks for every memory operation."""

    @staticmethod
    def check(context: MemoryOperationContext) -> None:
        if not context.scope.user_id:
            raise PermissionError("memory_user_required")
        if context.scope.memory_scope.strip() == "":
            raise PermissionError("memory_scope_required")

    @staticmethod
    def assert_user(context: MemoryOperationContext, user_id: str) -> None:
        MemoryAuthorization.check(context)
        if context.scope.user_id != str(user_id):
            raise PermissionError("memory_user_forbidden")

    @staticmethod
    def assert_bindings(context: MemoryOperationContext, requested: dict[str, str | None]) -> None:
        for key, bound_value in context.token_bindings.items():
            requested_value = requested.get(key)
            if bound_value and requested_value != bound_value:
                raise PermissionError(f"memory_{key}_forbidden")


class MemoryRepository(Protocol):
    def count(self, *, user_id: str, scope: str) -> int: ...
    def list(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]: ...
    def search(self, *, user_id: str, scope: str, query: str, limit: int) -> list[dict[str, Any]]: ...
    def create(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> None: ...
    def update(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> bool: ...
    def forget(self, *, user_id: str, scope: str, key: str) -> bool: ...


class SQLiteMemoryRepository:
    def __init__(self, settings: Any):
        self.settings = settings

    def list(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]:
        return get_profile_memories(self.settings, user_id=user_id, doc_id=scope, limit=limit)

    def count(self, *, user_id: str, scope: str) -> int:
        from services.memory_store import count_profile_memories

        return count_profile_memories(self.settings, user_id=user_id, doc_id=scope)

    def search(self, *, user_id: str, scope: str, query: str, limit: int) -> list[dict[str, Any]]:
        return search_profile_memories(self.settings, user_id=user_id, doc_id=scope, query=query, limit=limit)

    def create(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> None:
        upsert_profile_memory(self.settings, user_id=user_id, doc_id=scope, memory_key=key, content=content, source=source, valid_from=valid_from, valid_until=valid_until, confidence=confidence)

    def update(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> bool:
        return update_profile_memory(self.settings, user_id=user_id, doc_id=scope, memory_key=key, content=content, source=source, valid_from=valid_from, valid_until=valid_until, confidence=confidence)

    def forget(self, *, user_id: str, scope: str, key: str) -> bool:
        return forget_profile_memory(self.settings, user_id=user_id, doc_id=scope, memory_key=key)


class MemoryCore:
    def __init__(self, repository: MemoryRepository):
        self.repository = repository

    def list(self, context: MemoryOperationContext, *, limit: int = 50) -> list[dict[str, Any]]:
        MemoryAuthorization.check(context)
        self._audit(context, "list")
        return self.repository.list(user_id=context.scope.user_id or "", scope=context.scope.memory_scope, limit=max(1, min(limit, 500)))

    def count(self, context: MemoryOperationContext) -> int:
        MemoryAuthorization.check(context)
        self._audit(context, "count")
        return self.repository.count(user_id=context.scope.user_id or "", scope=context.scope.memory_scope)

    def search(self, context: MemoryOperationContext, *, query: str = "", limit: int = 10) -> list[dict[str, Any]]:
        MemoryAuthorization.check(context)
        self._audit(context, "search")
        return self.repository.search(user_id=context.scope.user_id or "", scope=context.scope.memory_scope, query=query, limit=max(1, min(limit, 500)))

    def create(self, context: MemoryOperationContext, *, key: str, content: str, source: str = "agent", valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> None:
        MemoryAuthorization.check(context)
        self._audit(context, "create")
        self.repository.create(user_id=context.scope.user_id or "", scope=context.scope.memory_scope, key=key.strip(), content=content.strip(), source=source.strip() or "agent", valid_from=valid_from, valid_until=valid_until, confidence=confidence)

    def update(self, context: MemoryOperationContext, *, key: str, content: str, source: str = "agent", valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> bool:
        MemoryAuthorization.check(context)
        self._audit(context, "update")
        return self.repository.update(user_id=context.scope.user_id or "", scope=context.scope.memory_scope, key=key, content=content.strip(), source=source.strip() or "agent", valid_from=valid_from, valid_until=valid_until, confidence=confidence)

    def forget(self, context: MemoryOperationContext, *, key: str) -> bool:
        MemoryAuthorization.check(context)
        self._audit(context, "forget")
        return self.repository.forget(user_id=context.scope.user_id or "", scope=context.scope.memory_scope, key=key)

    @staticmethod
    def _audit(context: MemoryOperationContext, operation: str) -> None:
        logger.info(
            "memory_operation",
            extra={
                "request_id": context.request_id,
                "operation": operation,
                "actor_type": context.actor_type,
                "actor_id": context.actor_id,
                "user_id": context.scope.user_id,
                "workspace_id": context.scope.workspace_id,
                "agent_id": context.scope.agent_id,
            },
        )


class MemoryClient:
    """Assistant-facing facade. Keeps transport independent from storage."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.core = MemoryCore(SQLiteMemoryRepository(settings))
        self.hot_cache = get_hot_cache(settings)
        self.hybrid = get_memory_hybrid_retriever(settings)

    def _cached(self, key: str, loader) -> Any:
        return self.hot_cache.get_or_load(key, loader)

    @staticmethod
    def _storage_scope(
        scope: str,
        *,
        workspace_id: str | None = None,
        agent_id: str | None = None,
    ) -> str:
        """Keep local profile storage isolated across optional dimensions."""
        normalized = str(scope or "general").strip() or "general"
        segments = normalized.split("|")
        for prefix, value in (("workspace", workspace_id), ("agent", agent_id)):
            if value:
                marker = f"{prefix}:{value}"
                if marker not in segments:
                    segments.append(marker)
        return "|".join(segments)

    def context(self, *, user_id: str, scope: str = "general", organization_id: str | None = None, tenant_id: str | None = None, workspace_id: str | None = None, agent_id: str | None = None, session_id: str | None = None, token_bindings: dict[str, str] | None = None, actor_type: str = "assistant", actor_id: str | None = None, request_id: str | None = None) -> MemoryOperationContext:
        bindings = token_bindings or {}
        return MemoryOperationContext(
            scope=MemoryScope(organization_id=organization_id or bindings.get("organization_id"), tenant_id=tenant_id or bindings.get("tenant_id"), user_id=str(user_id), workspace_id=workspace_id, agent_id=agent_id, session_id=session_id, memory_scope=scope),
            actor_type=actor_type,
            actor_id=actor_id,
            request_id=request_id or str(uuid4()),
            token_bindings=bindings,
        )

    def recent_messages(self, *, user_id: str, conversation_id: str, limit: int, resolved_user_id: str | None = None) -> list[dict[str, Any]]:
        key = HotMemoryCache.key(user_id=user_id, scope="conversation", operation=f"recent:{limit}", session_id=conversation_id)
        return self._cached(key, lambda: (
            load_conversation_messages(self.settings, user_id=resolved_user_id, conversation_id=conversation_id)[-limit:]
            if resolved_user_id and postgres_enabled(self.settings)
            else get_recent_messages(self.settings, conversation_id=conversation_id, limit=limit)
        ))

    def list(self, *, user_id: str, scope: str = "general", limit: int = 50, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> list[dict[str, Any]]:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        key = HotMemoryCache.key(user_id=user_id, scope=storage_scope, operation=f"list:{limit}", workspace_id=workspace_id, agent_id=agent_id)
        return self._cached(key, lambda: self.core.list(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), limit=limit))

    def count(self, *, user_id: str, scope: str = "general", workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> int:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        return self.core.count(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id))

    @staticmethod
    def _l1_sufficient(query: str, items: list[dict[str, Any]]) -> bool:
        if not query.strip():
            return True
        query_terms = set(query.casefold().split())
        if not items or not query_terms:
            return False
        for item in items:
            evidence = f"{item.get('key', '')} {item.get('memory_key', '')} {item.get('content', '')}".casefold()
            if all(term in evidence for term in query_terms):
                return True
        return False

    def search_l1(self, *, user_id: str, scope: str = "general", query: str = "", limit: int = 10, token_bindings: dict[str, str] | None = None, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> list[dict[str, Any]]:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        context = self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, token_bindings=token_bindings, request_id=request_id)
        MemoryAuthorization.assert_bindings(context, {"organization_id": context.scope.organization_id, "tenant_id": context.scope.tenant_id, "workspace_id": workspace_id, "agent_id": agent_id})
        return self.core.search(context, query=query, limit=limit)

    def search_l2(self, *, user_id: str, scope: str = "general", query: str = "", limit: int = 10, workspace_id: str | None = None, agent_id: str | None = None, as_of: str | None = None, include_history: bool = False, token_bindings: dict[str, str] | None = None, request_id: str | None = None) -> list[dict[str, Any]]:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        context = self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, token_bindings=token_bindings, request_id=request_id)
        MemoryAuthorization.check(context)
        MemoryAuthorization.assert_bindings(context, {"organization_id": context.scope.organization_id, "tenant_id": context.scope.tenant_id, "workspace_id": workspace_id, "agent_id": agent_id})
        self.core._audit(context, "search_l2")
        candidate_limit = max(limit, int(getattr(self.settings, "memory_l2_candidate_limit", 200)))
        if workspace_id and postgres_enabled(self.settings) and not include_history:
            try:
                records = list_workspace_memories(
                    self.settings,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    limit=candidate_limit,
                    as_of=as_of,
                    include_history=include_history,
                )
            except Exception:
                # L2 must not turn a temporary Postgres outage into an
                # assistant failure; the caller retains its L1 result.
                return []
        else:
            records = get_profile_memories(
                self.settings,
                user_id=user_id,
                doc_id=storage_scope,
                limit=max(1, min(candidate_limit, 10000)),
                include_history=include_history,
            )
        if include_history:
            query_terms = set(re.findall(r"[a-z0-9]+", str(query).casefold()))
            if query_terms:
                records = [
                    record for record in records
                    if query_terms <= set(re.findall(r"[a-z0-9]+", f"{record.get('key', '')} {record.get('content', '')}".casefold()))
                ]
            return sorted(records, key=lambda record: int(record.get("revision") or 0), reverse=True)[: max(1, min(limit, 100))]
        return self.hybrid.search(
            records,
            query=query,
            scope=storage_scope,
            limit=limit,
            as_of=as_of,
            include_history=include_history,
        )

    def search(self, *, user_id: str, scope: str = "general", query: str = "", limit: int = 10, workspace_id: str | None = None, agent_id: str | None = None, as_of: str | None = None, include_history: bool = False, token_bindings: dict[str, str] | None = None, request_id: str | None = None) -> list[dict[str, Any]]:
        bindings = token_bindings or {}
        cache_query = query
        if bindings:
            cache_query = f"{query}|organization:{bindings.get('organization_id', '')}|tenant:{bindings.get('tenant_id', '')}"
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        key = HotMemoryCache.key(user_id=user_id, scope=storage_scope, operation=f"search:{limit}:{as_of or ''}:{int(include_history)}", query=cache_query, workspace_id=workspace_id, agent_id=agent_id)
        if not str(user_id).strip() or not str(scope).strip():
            raise PermissionError("memory_user_required" if not str(user_id).strip() else "memory_scope_required")
        if bindings:
            context = self.context(user_id=user_id, scope=scope, workspace_id=workspace_id, agent_id=agent_id, token_bindings=token_bindings, request_id=request_id)
            MemoryAuthorization.assert_bindings(context, {"organization_id": context.scope.organization_id, "tenant_id": context.scope.tenant_id, "workspace_id": workspace_id, "agent_id": agent_id})
        return self._cached(key, lambda: self._search_hierarchy(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, as_of=as_of, include_history=include_history, token_bindings=token_bindings, request_id=request_id))

    def _search_hierarchy(self, *, user_id: str, scope: str, query: str, limit: int, workspace_id: str | None, agent_id: str | None, as_of: str | None, include_history: bool, token_bindings: dict[str, str] | None, request_id: str | None) -> list[dict[str, Any]]:
        l1_items = self.search_l1(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, token_bindings=token_bindings, request_id=request_id)
        l1_items = self.hybrid.filter_temporal(l1_items, as_of=as_of or datetime.now(UTC), include_history=include_history)
        if self._l1_sufficient(query, l1_items) and not include_history and not as_of:
            return l1_items
        l2_items = self.search_l2(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, as_of=as_of, include_history=include_history, token_bindings=token_bindings, request_id=request_id)
        return l2_items or l1_items

    def remember(self, *, user_id: str, scope: str = "general", key: str, content: str, source: str = "agent", valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> None:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        self.core.create(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), key=key, content=content, source=source, valid_from=valid_from, valid_until=valid_until, confidence=confidence)
        self.hot_cache.invalidate(user_id=user_id, scope=storage_scope)
        self.hybrid.invalidate()

    def update(self, *, user_id: str, scope: str = "general", key: str, content: str, source: str = "agent", valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> bool:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        updated = self.core.update(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), key=key, content=content, source=source, valid_from=valid_from, valid_until=valid_until, confidence=confidence)
        if updated:
            self.hot_cache.invalidate(user_id=user_id, scope=storage_scope)
            self.hybrid.invalidate()
        return updated

    def forget(self, *, user_id: str, scope: str = "general", key: str, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> bool:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        forgotten = self.core.forget(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), key=key)
        if forgotten:
            self.hot_cache.invalidate(user_id=user_id)
            self.hybrid.invalidate()
        return forgotten

    def remember_declaration(self, *, user_id: str, question: str, answer: str = "", scope: str = "general", request_id: str | None = None) -> None:
        """Preserve existing declaration extraction behind provider boundary."""
        context = self.context(user_id=user_id, scope=scope, request_id=request_id)
        MemoryAuthorization.check(context)
        maybe_store_profile_memory(self.core.repository.settings, user_id=user_id, doc_id=scope, question=question, answer=answer)
        self.hot_cache.invalidate(user_id=user_id, scope=scope)

    def sync_account_profile(self, *, user_id: str, profile: dict[str, Any]) -> None:
        sync_account_profile_memories(self.settings, user_id=user_id, profile=profile)
        self.hot_cache.invalidate(user_id=user_id, scope="general")

    def list_managed(self, *, user_id: str, workspace_id: str, project_id: str | None = None, query: str = "", status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        return list_managed_memories(self.settings, user_id=user_id, workspace_id=workspace_id, project_id=project_id, query=query, status=status, limit=limit)

    def update_managed(self, *, user_id: str, memory_id: str, action: str, content: str | None = None) -> dict[str, Any] | None:
        item = update_managed_memory(self.settings, memory_id=memory_id, user_id=user_id, action=action, content=content)
        if item:
            self.hot_cache.invalidate(user_id=user_id, scope=f"workspace:{item.get('workspace_id', '')}")
        return item

    def workspace_search(self, *, user_id: str, workspace_id: str, query: str, project_id: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
        """Provider-owned adapter for current durable workspace memory."""
        scope = f"workspace:{workspace_id}"
        key = HotMemoryCache.key(user_id=user_id, scope=scope, operation=f"workspace_search:{limit}", query=f"{project_id or ''}|{query}")
        def retrieve() -> list[dict[str, Any]]:
            records = list_workspace_memories(
                self.settings,
                user_id=user_id,
                workspace_id=workspace_id,
                project_id=project_id,
                limit=max(50, int(getattr(self.settings, "memory_l2_candidate_limit", 200))),
            )
            l1_items = rank_durable_memories(query, records, limit=limit)
            if self._l1_sufficient(query, l1_items):
                return l1_items
            return self.hybrid.search(records, query=query, scope=scope, limit=limit)

        return self._cached(key, retrieve)

    def save_workspace_candidates(self, *, user_id: str, workspace_id: str, conversation_id: str, source_message_id: str | None, candidates: list[Any], project_id: str | None = None) -> list[dict[str, Any]]:
        saved = save_durable_memories(
            self.core.repository.settings,
            user_id=user_id,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            candidates=candidates,
            project_id=project_id,
        )
        self.hot_cache.invalidate(user_id=user_id, scope=f"workspace:{workspace_id}")
        return saved

    def invalidate(self, *, user_id: str, scope: str | None = None) -> None:
        self.hot_cache.invalidate(user_id=user_id, scope=scope)

    def cache_metrics(self) -> dict[str, Any]:
        return self.hot_cache.metrics()

    def extract_and_save_workspace_memory(self, *, user_id: str, workspace_id: str, conversation_id: str, source_message_id: str | None, text: str, project_id: str | None = None) -> list[dict[str, Any]]:
        return self.save_workspace_candidates(
            user_id=user_id,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            candidates=extract_durable_memories(text),
            project_id=project_id,
        )
