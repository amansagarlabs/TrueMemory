from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

import httpx


class UnsafeUrlError(ValueError):
    pass


_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.google.internal.",
}


def _is_public_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def validate_public_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are supported.")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("URLs containing credentials are not supported.")
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname or hostname in _BLOCKED_HOSTS or hostname.endswith(".localhost"):
        raise UnsafeUrlError("Local and private network addresses are not allowed.")
    if parsed.port and parsed.port not in {80, 443}:
        raise UnsafeUrlError("Only standard web ports are allowed.")

    try:
        direct_ip = ipaddress.ip_address(hostname)
    except ValueError:
        direct_ip = None
    if direct_ip is not None:
        if not _is_public_ip(str(direct_ip)):
            raise UnsafeUrlError("Local and private network addresses are not allowed.")
        return parsed.geturl()

    loop = asyncio.get_running_loop()
    try:
        results = await loop.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError("The URL hostname could not be resolved.") from exc
    addresses = {item[4][0] for item in results}
    if not addresses or any(not _is_public_ip(address) for address in addresses):
        raise UnsafeUrlError("The URL resolves to a local or private network address.")
    return parsed.geturl()


async def safe_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_redirects: int = 5,
    **kwargs,
) -> httpx.Response:
    """GET a public URL while re-validating every redirect destination."""
    current = await validate_public_url(url)
    for _ in range(max_redirects + 1):
        response = await client.get(current, follow_redirects=False, **kwargs)
        if response.status_code not in {301, 302, 303, 307, 308}:
            return response
        location = response.headers.get("location")
        if not location:
            return response
        current = await validate_public_url(str(response.url.join(location)))
    raise UnsafeUrlError("The URL redirected too many times.")
