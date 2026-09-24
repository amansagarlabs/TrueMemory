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
)
from services.memory_store import sync_account_profile_memories
from services.durable_memory import extract_durable_memories, rank_durable_memories
from services.postgres_store import load_conversation_messages, list_managed_memories, list_workspace_memories, timeline_workspace_memories, postgres_enabled, save_durable_memories, update_managed_memory, _connect
from services.memory_store import get_recent_messages
from services.memory_hot_cache import HotMemoryCache, get_hot_cache
from services.memory_hybrid import get_memory_hybrid_retriever
from services.temporal_reasoning import extract_temporal_intent, filter_by_temporal_intent

logger = logging.getLogger("TrueMemory.memory")


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
    def history(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]: ...


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

    def history(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]:
        return get_profile_memories(self.settings, user_id=user_id, doc_id=scope, limit=limit, include_history=True)


class PostgresProfileMemoryRepository:
    """Durable profile-memory adapter over the canonical Supabase table."""

    def __init__(self, settings: Any):
        self.settings = settings

    @staticmethod
    def _item(row: dict[str, Any], scope: str) -> dict[str, Any]:
        return {
            "id": f"profile:{scope}:{row['profile_key']}",
            "key": row["profile_key"],
            "content": row["content"],
            "source": row["source"],
            "updated_at": row["updated_at"],
            "valid_from": row.get("valid_from"),
            "valid_until": row.get("valid_until"),
            "confidence": float(row.get("confidence_score") or 0.75),
            "revision": int(row.get("revision") or 1),
        }

    def list(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to read a local profile-memory copy.")
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT profile_key, content, source, updated_at, valid_from,
                          valid_until, confidence_score, revision
                   FROM profile_memories WHERE user_id = %s AND doc_id = %s
                   ORDER BY updated_at DESC, id DESC LIMIT %s""",
                (user_id, scope, max(1, min(limit, 500))),
            )
            return [self._item(row, scope) for row in cur.fetchall()]

    def history(self, *, user_id: str, scope: str, limit: int) -> list[dict[str, Any]]:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to read local profile-memory history.")
        self._seed_history(user_id=user_id, scope=scope)
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT profile_key, content, source, created_at AS updated_at,
                          valid_from, valid_until, confidence_score, revision
                   FROM profile_memory_revisions WHERE user_id = %s AND doc_id = %s
                   ORDER BY created_at DESC, id DESC LIMIT %s""",
                (user_id, scope, max(1, min(limit, 500))),
            )
            return [self._item(row, scope) for row in cur.fetchall()]

    def _seed_history(self, *, user_id: str, scope: str) -> None:
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO profile_memory_revisions
                       (user_id, doc_id, profile_key, content, source, valid_from,
                        valid_until, confidence_score, revision)
                   SELECT current.user_id, current.doc_id, current.profile_key,
                          current.content, current.source, current.valid_from,
                          current.valid_until, current.confidence_score, current.revision
                   FROM profile_memories current
                   WHERE current.user_id = %s AND current.doc_id = %s
                     AND NOT EXISTS (
                         SELECT 1 FROM profile_memory_revisions prior
                         WHERE prior.user_id = current.user_id
                           AND prior.doc_id = current.doc_id
                           AND prior.profile_key = current.profile_key
                     )""",
                (user_id, scope),
            )

    def count(self, *, user_id: str, scope: str) -> int:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to read a local profile-memory copy.")
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) AS count FROM profile_memories WHERE user_id = %s AND doc_id = %s", (user_id, scope))
            return int(cur.fetchone()["count"])

    def search(self, *, user_id: str, scope: str, query: str, limit: int) -> list[dict[str, Any]]:
        needle = " ".join(query.split()).strip().lower()
        if not needle:
            return self.list(user_id=user_id, scope=scope, limit=limit)
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to read a local profile-memory copy.")
        pattern = f"%{needle}%"
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT profile_key, content, source, updated_at, valid_from,
                          valid_until, confidence_score, revision
                   FROM profile_memories WHERE user_id = %s AND doc_id = %s
                     AND (lower(profile_key) LIKE %s OR lower(content) LIKE %s)
                   ORDER BY updated_at DESC, id DESC LIMIT %s""",
                (user_id, scope, pattern, pattern, max(1, min(limit, 500))),
            )
            return [self._item(row, scope) for row in cur.fetchall()]

    def create(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> None:
        self._write(user_id=user_id, scope=scope, key=key, content=content, source=source, valid_from=valid_from, valid_until=valid_until, confidence=confidence)

    def update(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> bool:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to update a local profile-memory copy.")
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute("SAVEPOINT profile_memory_revision")
            cur.execute(
                """INSERT INTO profile_memory_revisions
                       (user_id, doc_id, profile_key, content, source, valid_from,
                        valid_until, confidence_score, revision)
                   SELECT user_id, doc_id, profile_key, content, source, valid_from,
                          valid_until, confidence_score, revision
                   FROM profile_memories
                   WHERE user_id = %s AND doc_id = %s AND profile_key = %s""",
                (user_id, scope, key),
            )
            archived = cur.rowcount > 0
            if not archived:
                cur.execute("ROLLBACK TO SAVEPOINT profile_memory_revision")
            cur.execute(
                """UPDATE profile_memories SET content = %s, source = %s,
                       valid_from = COALESCE(%s::timestamptz, valid_from),
                       valid_until = %s, confidence_score = %s,
                       revision = revision + 1, updated_at = NOW()
                   WHERE user_id = %s AND doc_id = %s AND profile_key = %s""",
                (content, source, valid_from, valid_until, max(0.0, min(confidence, 1.0)), user_id, scope, key),
            )
            updated = cur.rowcount > 0
            if updated:
                cur.execute("RELEASE SAVEPOINT profile_memory_revision")
            else:
                cur.execute("ROLLBACK TO SAVEPOINT profile_memory_revision")
                cur.execute("RELEASE SAVEPOINT profile_memory_revision")
            return updated

    def forget(self, *, user_id: str, scope: str, key: str) -> bool:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is unavailable; refusing to delete a local profile-memory copy.")
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute("SAVEPOINT profile_memory_revision")
            cur.execute(
                """INSERT INTO profile_memory_revisions
                       (user_id, doc_id, profile_key, content, source, valid_from,
                        valid_until, confidence_score, revision)
                   SELECT user_id, doc_id, profile_key, content, source, valid_from,
                          valid_until, confidence_score, revision
                   FROM profile_memories
                   WHERE user_id = %s AND doc_id = %s AND profile_key = %s""",
                (user_id, scope, key),
            )
            archived = cur.rowcount > 0
            cur.execute("DELETE FROM profile_memories WHERE user_id = %s AND doc_id = %s AND profile_key = %s", (user_id, scope, key))
            deleted = cur.rowcount > 0
            if deleted:
                if not archived:
                    cur.execute("ROLLBACK TO SAVEPOINT profile_memory_revision")
                cur.execute("RELEASE SAVEPOINT profile_memory_revision")
            else:
                cur.execute("ROLLBACK TO SAVEPOINT profile_memory_revision")
                cur.execute("RELEASE SAVEPOINT profile_memory_revision")
            return deleted

    def _write(self, *, user_id: str, scope: str, key: str, content: str, source: str, valid_from: str | None, valid_until: str | None, confidence: float) -> None:
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is required for durable profile memory writes.")
        with _connect(self.settings) as conn, conn.cursor() as cur:
            cur.execute("SAVEPOINT profile_memory_revision")
            cur.execute(
                """INSERT INTO profile_memory_revisions
                       (user_id, doc_id, profile_key, content, source, valid_from,
                        valid_until, confidence_score, revision)
                   SELECT user_id, doc_id, profile_key, content, source, valid_from,
                          valid_until, confidence_score, revision
                   FROM profile_memories
                   WHERE user_id = %s AND doc_id = %s AND profile_key = %s""",
                (user_id, scope, key),
            )
            archived = cur.rowcount > 0
            if not archived:
                cur.execute("ROLLBACK TO SAVEPOINT profile_memory_revision")
            cur.execute(
                """INSERT INTO profile_memories
                       (user_id, doc_id, profile_key, content, source, valid_from,
                        valid_until, confidence_score)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (user_id, doc_id, profile_key) WHERE artifact_id IS NULL DO UPDATE SET
                       content = EXCLUDED.content, source = EXCLUDED.source,
                       valid_from = COALESCE(EXCLUDED.valid_from, profile_memories.valid_from),
                       valid_until = EXCLUDED.valid_until,
                       confidence_score = EXCLUDED.confidence_score,
                       revision = profile_memories.revision + 1, updated_at = NOW()""",
                (user_id, scope, key, content, source, valid_from, valid_until, max(0.0, min(confidence, 1.0))),
            )
            cur.execute("RELEASE SAVEPOINT profile_memory_revision")


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
        repository = PostgresProfileMemoryRepository(settings) if postgres_enabled(settings) else SQLiteMemoryRepository(settings)
        self.core = MemoryCore(repository)
        self.hot_cache = get_hot_cache(settings)
        self.hybrid = get_memory_hybrid_retriever(settings)

    def _profile_records(self, *, user_id: str, scope: str, limit: int, include_history: bool = False) -> list[dict[str, Any]]:
        return self.core.repository.history(user_id=user_id, scope=scope, limit=limit) if include_history else self.core.repository.list(user_id=user_id, scope=scope, limit=limit)

    def _read_cached(self, key: str, loader):
        if postgres_enabled(self.settings):
            return loader()
        return self._cached(key, loader)

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
        if postgres_enabled(self.settings):
            if not resolved_user_id:
                raise RuntimeError("Postgres user is unresolved; refusing to read local conversation history.")
            return load_conversation_messages(
                self.settings, user_id=resolved_user_id, conversation_id=conversation_id
            )[-limit:]
        if getattr(self.settings, "environment", "development") in {"production", "staging"}:
            raise RuntimeError("Postgres is required for durable conversation history.")
        return self._cached(key, lambda: get_recent_messages(
            self.settings, conversation_id=conversation_id, limit=limit
        ))

    def list(self, *, user_id: str, scope: str = "general", limit: int = 50, workspace_id: str | None = None, agent_id: str | None = None, request_id: str | None = None) -> list[dict[str, Any]]:
        storage_scope = self._storage_scope(scope, workspace_id=workspace_id, agent_id=agent_id)
        key = HotMemoryCache.key(user_id=user_id, scope=storage_scope, operation=f"list:{limit}", workspace_id=workspace_id, agent_id=agent_id)
        if postgres_enabled(self.settings):
            return self.core.list(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), limit=limit)
        return self._read_cached(key, lambda: self.core.list(self.context(user_id=user_id, scope=storage_scope, workspace_id=workspace_id, agent_id=agent_id, request_id=request_id), limit=limit))

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
                logger.exception("Postgres workspace-memory retrieval failed")
                raise
        elif isinstance(self.core.repository, PostgresProfileMemoryRepository):
            if include_history:
                records = self.core.repository.history(user_id=user_id, scope=storage_scope, limit=max(1, min(candidate_limit, 10000)))
            else:
                records = self.core.repository.search(user_id=user_id, scope=storage_scope, query=query, limit=max(1, min(candidate_limit, 10000)))
        else:
            records = self._profile_records(user_id=user_id, scope=storage_scope, limit=max(1, min(candidate_limit, 10000)), include_history=include_history)
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
        if postgres_enabled(self.settings):
            return self._search_hierarchy(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, as_of=as_of, include_history=include_history, token_bindings=token_bindings, request_id=request_id)
        import logging as _log
        _log.getLogger("memory.debug").warning("SEARCH user_id=%s scope=%s storage_scope=%s query=%s ws=%s cache_key=%s", user_id, scope, storage_scope, query, workspace_id, key)
        result = self._read_cached(key, lambda: self._search_hierarchy(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, as_of=as_of, include_history=include_history, token_bindings=token_bindings, request_id=request_id))
        _log.getLogger("memory.debug").warning("SEARCH result_count=%d", len(result))
        return result

    def _search_hierarchy(self, *, user_id: str, scope: str, query: str, limit: int, workspace_id: str | None, agent_id: str | None, as_of: str | None, include_history: bool, token_bindings: dict[str, str] | None, request_id: str | None) -> list[dict[str, Any]]:
        temporal_intent = extract_temporal_intent(query)

        effective_as_of = as_of
        effective_include_history = include_history

        if temporal_intent.has_temporal and not as_of and not include_history:
            if temporal_intent.intent == "current":
                effective_include_history = False
            elif temporal_intent.intent in ("before", "historical"):
                effective_include_history = True
                if temporal_intent.target_date:
                    effective_as_of = temporal_intent.target_date.isoformat()
            elif temporal_intent.intent == "range" and temporal_intent.target_date:
                effective_as_of = temporal_intent.target_date.isoformat()

        l1_items = self.search_l1(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, token_bindings=token_bindings, request_id=request_id)
        l1_items = self.hybrid.filter_temporal(l1_items, as_of=effective_as_of or datetime.now(UTC), include_history=effective_include_history)
        if temporal_intent.has_temporal:
            l1_items = filter_by_temporal_intent(l1_items, temporal_intent)
        if self._l1_sufficient(query, l1_items) and not effective_include_history and not effective_as_of:
            return l1_items
        l2_items = self.search_l2(user_id=user_id, scope=scope, query=query, limit=limit, workspace_id=workspace_id, agent_id=agent_id, as_of=effective_as_of, include_history=effective_include_history, token_bindings=token_bindings, request_id=request_id)
        if temporal_intent.has_temporal:
            l2_items = filter_by_temporal_intent(l2_items, temporal_intent)
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
        fields = {
            "full_name": profile.get("full_name"),
            "username": profile.get("username"),
            "bio": profile.get("bio"),
            "company": profile.get("company"),
            "location": profile.get("location"),
            "website": profile.get("website"),
        }
        full_name = str(fields["full_name"] or "").strip().casefold()
        username = str(fields["username"] or "").strip().casefold()
        if full_name and username == full_name:
            fields["username"] = None
        if isinstance(self.core.repository, PostgresProfileMemoryRepository):
            repository = self.core.repository
            for name, value in fields.items():
                key = f"account_{name}"
                content = str(value or "").strip()
                if content:
                    repository.create(user_id=user_id, scope="general", key=key, content=content[:1000], source="account-profile")
                else:
                    repository.forget(user_id=user_id, scope="general", key=key)
        else:
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
        if not postgres_enabled(self.settings):
            raise RuntimeError("Postgres is required for workspace memory retrieval.")
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

        return self._read_cached(key, retrieve)

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

    def extract_and_save_workspace_memory(self, *, user_id: str, workspace_id: str, conversation_id: str, source_message_id: str | None, text: str, project_id: str | None = None, recent_messages: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
        """Extract memories using LLM pipeline with governance, then save."""
        from services.memory_extraction import extract_contextual_memories_sync
        from services.memory_governor import govern_candidate, GovernorDecision, MemoryPolicy
        from services.memory_pipeline import candidates_to_write_objects

        extraction = extract_contextual_memories_sync(
            text,
            source_type="user_message",
            recent_messages=recent_messages,
        )

        policy = MemoryPolicy()
        accepted = []
        for candidate in extraction.candidates:
            result = govern_candidate(candidate, policy=policy)
            if result.decision not in (
                GovernorDecision.REJECT,
                GovernorDecision.NOOP,
                GovernorDecision.EXPIRE,
            ):
                accepted.append(candidate)

        if not accepted:
            return []

        write_candidates = candidates_to_write_objects(
            accepted,
            user_id=user_id,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            project_id=project_id,
        )

        saved = self.save_workspace_candidates(
            user_id=user_id,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            candidates=write_candidates,
            project_id=project_id,
        )
        return saved

    def current_state(self, *, user_id: str, workspace_id: str, project_id: str | None = None, memory_type: str | None = None) -> list[dict[str, Any]]:
        """Return currently valid memories (approved, not superseded, within validity window)."""
        return list_workspace_memories(
            self.settings,
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            limit=200,
            include_history=False,
        )

    def historical_state(self, *, user_id: str, workspace_id: str, as_of: str, project_id: str | None = None) -> list[dict[str, Any]]:
        """Return memories that were valid at a specific point in time."""
        return list_workspace_memories(
            self.settings,
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            limit=200,
            as_of=as_of,
            include_history=True,
        )

    def timeline(self, *, user_id: str, workspace_id: str, project_id: str | None = None, memory_key: str | None = None, start: str | None = None, end: str | None = None, as_of: str | None = None, order: str = "desc", limit: int = 50) -> list[dict[str, Any]]:
        return timeline_workspace_memories(self.settings, user_id=user_id, workspace_id=workspace_id, project_id=project_id, memory_key=memory_key, start=start, end=end, as_of=as_of, order=order, limit=limit)

    def related(self, *, user_id: str, workspace_id: str, memory_id: str, project_id: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
        """Return same-project memories related by key/type; excludes source."""
        records = list_workspace_memories(self.settings, user_id=user_id, workspace_id=workspace_id, project_id=project_id, limit=200, include_history=False)
        source = next((r for r in records if str(r.get("id")) == str(memory_id)), None)
        if not source:
            return []
        key = str(source.get("memory_key") or "")
        kind = str(source.get("memory_type") or "")
        related = [r for r in records if str(r.get("id")) != str(memory_id) and (r.get("memory_key") == key or r.get("memory_type") == kind)]
        return related[:max(1, min(limit, 200))]

    def memory_versions(self, *, user_id: str, workspace_id: str, memory_key: str, project_id: str | None = None) -> list[dict[str, Any]]:
        """Return the full version history for a specific memory key."""
        if not postgres_enabled(self.settings):
            return []
        with _connect(self.settings) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id::text, memory_type, memory_key, content,
                        importance_score, confidence_score, source,
                        lifecycle_status, revision, supersedes_memory_id::text,
                        valid_from, valid_until, created_at, updated_at
                    FROM user_memories
                    WHERE user_id = %s AND workspace_id = %s
                      AND memory_key = %s
                      AND (%s::uuid IS NULL OR project_id = %s::uuid)
                    ORDER BY revision ASC
                    """,
                    (user_id, workspace_id, memory_key, project_id, project_id),
                )
                return [dict(row) for row in cur.fetchall()]
