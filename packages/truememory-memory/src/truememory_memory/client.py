from __future__ import annotations
import asyncio, json, uuid
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from .errors import *

@dataclass
class TrueMemory:
    api_key: str
    base_url: str = "http://localhost:8000"
    timeout: float = 15.0
    max_retries: int = 2

    async def _request(self, path: str, *, method: str = "GET", payload: dict | None = None, safe: bool = True, signal=None):
        if signal is not None and signal.is_set(): raise NetworkError("Request cancelled")
        body = json.dumps(payload).encode() if payload is not None else None
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json", "X-Request-ID": str(uuid.uuid4())}
        if body: headers["Content-Type"] = "application/json"
        attempts = self.max_retries + 1 if safe else 1
        for attempt in range(attempts):
            try:
                return await asyncio.to_thread(self._sync, path, method, body, headers)
            except ServerError:
                if attempt + 1 >= attempts: raise
                await asyncio.sleep(0.1 * (2 ** attempt))
            except (URLError, TimeoutError, OSError) as exc:
                if attempt + 1 >= attempts: raise NetworkError("Network request failed", details=exc) from exc
                await asyncio.sleep(0.1 * (2 ** attempt))

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
            if exc.code == 429: raise RateLimitError(message, exc.code, request_id, details, int(exc.headers.get("retry-after", "0")))
            if exc.code >= 500: raise ServerError(message, exc.code, request_id, details)
            raise KontextError(message, exc.code, request_id, details)

    async def remember(self, key: str, content: str, *, signal=None, **kwargs): return await self._request("/v1/memories", method="POST", payload={"key": key, "content": content, **kwargs}, safe=False, signal=signal)
    async def search(self, query: str = "", *, signal=None, **kwargs): return await self._request("/v1/memories/search", method="POST", payload={"query": query, **kwargs}, signal=signal)
    async def retrieve(self, query: str = "", *, signal=None, **kwargs): return await self._request("/v1/memories/retrieve", method="POST", payload={"query": query, **kwargs}, signal=signal)
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
