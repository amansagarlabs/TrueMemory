from __future__ import annotations

import hashlib
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


_TRACKING_KEYS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref_src",
    "ref_url",
}


def canonicalize_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme.lower() not in {"http", "https"}:
        return raw

    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = parsed.port
    netloc = hostname
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{hostname}:{port}"

    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    query = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in _TRACKING_KEYS
    ]
    query.sort()
    return urlunparse((scheme, netloc, path, "", urlencode(query), ""))


def content_hash(*values: str) -> str:
    normalized = "\n".join(" ".join((value or "").split()) for value in values)
    return "sha256:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def favicon_url(canonical_url: str) -> str | None:
    parsed = urlparse(canonical_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return urlunparse((parsed.scheme, parsed.netloc, "/favicon.ico", "", "", ""))
