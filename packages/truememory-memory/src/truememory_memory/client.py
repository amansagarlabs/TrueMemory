from __future__ import annotations
import asyncio, email.utils, json, random, uuid
from dataclasses import dataclass
from typing import ClassVar
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from .errors import *

@dataclass
class TrueMemory:
    api_key: str
    base_url: str = "http://localhost:8000"
    timeout: float = 15.0
    max_retries: int = 2

    _MAX_RETRY_AFTER_SECONDS: ClassVar[float] = 30.0

    @classmethod
    def _retry_after_seconds(cls, value: str | None) -> float:
        if not value:
            return 0.0
        try:
            return min(cls._MAX_RETRY_AFTER_SECONDS, max(0.0, float(value.strip())))
        except ValueError:
            try:
                target = email.utils.parsedate_to_datetime(value)
                current = datetime.now(timezone.utc)
                if target.tzinfo is None:
                    target = target.replace(tzinfo=timezone.utc)
                return min(cls._MAX_RETRY_AFTER_SECONDS, max(0.0, (target - current).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                return 0.0

    @staticmethod
    def _backoff_seconds(attempt: int) -> float:
        base = min(8.0, 0.1 * (2 ** max(0, attempt)))
        return max(0.0, base * (0.8 + random.random() * 0.4))

    async def _request(self, path: str, *, method: str = "GET", payload: dict | None = None, safe: bool = True, signal=None):
        if signal is not None and signal.is_set(): raise NetworkError("Request cancelled")
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json", "X-Request-ID": str(uuid.uuid4())}
        idempotency_key = (payload or {}).get("idempotency_key") if payload else None
        request_payload = dict(payload or {})
        request_payload.pop("idempotency_key", None)
        body = json.dumps(request_payload).encode() if payload is not None else None
        if body: headers["Content-Type"] = "application/json"
        if idempotency_key: headers["Idempotency-Key"] = str(idempotency_key)
        attempts = self.max_retries + 1 if (safe or idempotency_key) else 1
        for attempt in range(attempts):
            try:
                return await asyncio.to_thread(self._sync, path, method, body, headers)
            except TrueMemoryError as exc:
                retryable_status = exc.status in {408, 429, 502, 503, 504}
                # Preserve retries for typed transport/server failures created by
                # callers or test doubles without an HTTP status.
                retryable_typed_error = isinstance(exc, ServerError) and not exc.status
                if not (safe or idempotency_key) or not (retryable_status or retryable_typed_error) or attempt + 1 >= attempts:
                    raise
                delay = getattr(exc, "retry_after", None) or 0
                await asyncio.sleep(delay if delay else self._backoff_seconds(attempt))
            except (URLError, TimeoutError, OSError) as exc:
                if attempt + 1 >= attempts: raise NetworkError("Network request failed", details=exc) from exc
                await asyncio.sleep(self._backoff_seconds(attempt))

    def _sync(self, path, method, body, headers):
        try:
            with urlopen(Request(self.base_url.rstrip("/") + path, data=body, headers=headers, method=method), timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except HTTPError as exc:
            try: details = json.loads(exc.read().decode())
            except Exception: details = None
            message = str(details.get("detail", details) if isinstance(details, dict) else details) or f"Request failed ({exc.code})"
            request_id = exc.headers.get("x-request-id")
            if exc.code == 401: raise AuthenticationError(message, exc.code, request_id, details)
            if exc.code == 403: raise AuthorizationError(message, exc.code, request_id, details)
            if exc.code == 404: raise NotFoundError(message, exc.code, request_id, details)
            if exc.code == 409: raise ConflictError(message, exc.code, request_id, details)
            if exc.code == 422: raise ValidationError(message, exc.code, request_id, details)
            if exc.code == 429: raise RateLimitError(message, exc.code, request_id, details, self._retry_after_seconds(exc.headers.get("retry-after")))
            if exc.code >= 500: raise ServerError(message, exc.code, request_id, details)
            raise TrueMemoryError(message, exc.code, request_id, details)

    async def remember(self, key: str, content: str, *, signal=None, **kwargs): return await self._request("/v1/memories", method="POST", payload={"key": key, "content": content, **kwargs}, safe=False, signal=signal)
    async def store(self, key: str, content: str, *, signal=None, **kwargs): return await self._request("/v1/memory/store", method="POST", payload={"key": key, "content": content, **kwargs}, safe=False, signal=signal)
    async def search(self, query: str = "", *, signal=None, **kwargs): return await self._request("/v1/memories/search", method="POST", payload={"query": query, **kwargs}, signal=signal)
    async def retrieve(self, query: str = "", *, signal=None, **kwargs): return await self._request("/v1/memories/retrieve", method="POST", payload={"query": query, **kwargs}, signal=signal)
    async def current_state(self, *, workspace_id: str, project_id=None, signal=None): return await self._request("/v1/memory/current-state", method="POST", payload={"workspace_id": workspace_id, "project_id": project_id}, signal=signal)
    async def timeline(self, *, workspace_id: str, project_id=None, as_of=None, signal=None): return await self._request("/v1/memory/timeline", method="POST", payload={"workspace_id": workspace_id, "project_id": project_id, "as_of": as_of}, signal=signal)
    async def related(self, query: str = "", *, signal=None, **kwargs): return await self._request("/v1/memory/related", method="POST", payload={"query": query, **kwargs}, signal=signal)
    async def update(self, memory_id: str, content: str, *, signal=None, **kwargs): return await self._request("/v1/memories/update", method="POST", payload={"id": memory_id, "content": content, **kwargs}, safe=False, signal=signal)
    async def forget(self, memory_id: str, *, signal=None, **kwargs): return await self._request("/v1/memories/forget", method="POST", payload={"id": memory_id, **kwargs}, safe=False, signal=signal)
    async def context(self, query: str = "", *, signal=None, **kwargs): return await self.retrieve(query, signal=signal, **kwargs)
    async def profile(self, *, signal=None, **kwargs):
        from urllib.parse import urlencode
        query = urlencode({key: value for key, value in kwargs.items() if value is not None})
        return await self._request("/v1/memories" + (f"?{query}" if query else ""), signal=signal)
    async def list(self, *, signal=None, **kwargs): return await self.profile(signal=signal, **kwargs)
    async def health(self, *, signal=None): return await self._request("/v1/memory/health", signal=signal)
    async def usage(self, *, signal=None): return await self._request("/v1/memory/metrics", signal=signal)
    async def export_memory(self, *, signal=None, **kwargs): return await self._request("/v1/memory/export", method="POST", payload=kwargs, signal=signal)
    async def import_memory(self, document: dict, *, signal=None): return await self._request("/v1/memory/import", method="POST", payload={"document": document}, safe=False, signal=signal)
    async def extract_notes(self, text: str, *, signal=None): return await self._request("/v1/memory/import/notes", method="POST", payload={"text": text}, signal=signal)
    async def import_notes(self, text: str, selected: list[int], *, signal=None): return await self._request("/v1/memory/import/notes", method="POST", payload={"text": text, "selected": selected}, safe=False, signal=signal)
    async def export_notes(self, *, signal=None, **kwargs): return await self._request("/v1/memory/export/notes", method="POST", payload=kwargs, signal=signal)
