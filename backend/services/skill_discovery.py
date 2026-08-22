"""Provider-based open-source skill discovery.

Providers return metadata only. Installation is a separate, permission-aware
operation so searching never downloads or executes third-party skill code.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import asdict, dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .agent_skills import discover_skills

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SkillSearchResult:
    id: str
    name: str
    description: str
    author: str
    registry: str
    kind: str = "external"
    source_url: str | None = None
    version: str = "0.1.0"
    license: str = "Unknown"
    verified: bool = False
    official: bool = False
    open_source: bool = True
    downloads: int = 0
    stars: int = 0
    trust_score: int = 50
    security_score: int = 50
    tags: tuple[str, ...] = ()

    def public_dict(self) -> dict:
        value = asdict(self)
        value["tags"] = list(self.tags)
        return value


class SkillProvider(Protocol):
    id: str

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]: ...


class LocalSkillProvider:
    id = "local"

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]:
        needle = query.lower().strip()
        results: list[SkillSearchResult] = []
        for skill in discover_skills():
            haystack = f"{skill.name} {skill.description} {skill.kind}".lower()
            if needle and needle not in haystack:
                continue
            results.append(SkillSearchResult(
                id=f"local:{skill.name}", name=skill.name, description=skill.description,
                author="KONTEXT", registry="Local Skills", verified=True, official=skill.kind == "bundled",
                trust_score=92, security_score=90, tags=(skill.kind,),
            ))
        return results[:limit]


class GitHubSkillProvider:
    id = "github"

    def __init__(self, endpoint: str):
        self.endpoint = endpoint.rstrip("/")

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]:
        search_query = query.strip()
        if not search_query:
            return []
        request = Request(
            f"{self.endpoint}/search/repositories?q={quote(search_query + ' skill')}&per_page={min(limit, 50)}",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "Kontext-Skill-Discovery"},
        )
        try:
            with urlopen(request, timeout=6) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            return []
        return [SkillSearchResult(
            id=f"github:{item.get('full_name', item.get('id'))}",
            name=item.get("name", "Unnamed skill"),
            description=item.get("description") or "Open-source skill repository",
            author=(item.get("owner") or {}).get("login", "GitHub"),
            registry="GitHub", source_url=item.get("html_url"),
            stars=int(item.get("stargazers_count") or 0),
            trust_score=min(90, 45 + int(item.get("stargazers_count") or 0) // 20),
            security_score=35,
            tags=("community", "open-source"),
        ) for item in payload.get("items", [])]


class OpenAgentSkillProvider:
    """Adapter for OpenAgentSkill's public metadata search endpoint."""

    id = "openagentskill"

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]:
        url = f"{self.base_url}/api/skills/search?q={quote(query)}&limit={min(limit, 30)}&format=json"
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "Kontext-Skill-Discovery"})
        try:
            with urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            return []
        records = payload.get("skills") or payload.get("items") or payload.get("results") or []
        results: list[SkillSearchResult] = []
        for item in records:
            trust = item.get("trust_score", item.get("trustScore", item.get("trust", 50)))
            audit = item.get("audit_score", item.get("auditScore", item.get("security_score", 50)))
            results.append(SkillSearchResult(
                id=f"openagentskill:{item.get('slug', item.get('id', item.get('name', 'skill')))}",
                name=item.get("name", item.get("title", "Unnamed skill")),
                description=item.get("description", "Open-source agent skill"),
                author=item.get("author", item.get("owner", "OpenAgentSkill")),
                registry="OpenAgentSkill",
                source_url=item.get("repository") or item.get("url") or item.get("skill_url"),
                version=item.get("version", "1.0.0"),
                license=item.get("license", "Unknown"),
                verified=bool(item.get("verified", False)),
                official=bool(item.get("official", False)),
                downloads=int(item.get("downloads", 0) or 0),
                stars=int(item.get("stars", item.get("github_stars", 0)) or 0),
                trust_score=max(0, min(100, int(trust or 0))),
                security_score=max(0, min(100, int(audit or 0))),
                tags=tuple(item.get("tags", item.get("platforms", [])) or []),
            ))
        return results


class HtmlSkillCatalogProvider:
    """Metadata-only adapter for catalogs without a stable public API."""

    def __init__(self, provider_id: str, name: str, base_url: str):
        self.id = provider_id
        self.name = name
        self.base_url = base_url.rstrip("/")

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]:
        request = Request(
            f"{self.base_url}/?q={quote(query)}",
            headers={"Accept": "text/html", "User-Agent": "Kontext-Skill-Discovery"},
        )
        try:
            with urlopen(request, timeout=6) as response:
                html = response.read().decode("utf-8", errors="ignore")
        except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError):
            return []

        # Catalog pages expose repository/skill links even when they do not
        # provide JSON. Keep this conservative: no scripts or install content
        # are executed, and cards link back to the source for inspection.
        results: list[SkillSearchResult] = []
        seen: set[str] = set()
        for match in re.finditer(r'href=["\']([^"\']+)["\'][^>]*>([^<]{2,100})<', html, re.IGNORECASE):
            href, raw_name = match.groups()
            if not re.search(r"/(skill|skills|package|repo)/", href, re.IGNORECASE):
                continue
            name = re.sub(r"\s+", " ", raw_name).strip()
            if not name or name.lower() in seen:
                continue
            if query and query.lower() not in f"{name} {href}".lower():
                continue
            seen.add(name.lower())
            source_url = href if href.startswith("http") else f"{self.base_url}{href if href.startswith('/') else '/' + href}"
            results.append(SkillSearchResult(
                id=f"{self.id}:{href}", name=name, description=f"Open-source skill listed by {self.name}",
                author=self.name, registry=self.name, source_url=source_url,
                trust_score=45, security_score=35, tags=("open-source", "catalog"),
            ))
            if len(results) >= limit:
                break
        return results


class SkillsShProvider:
    """skills.sh leaderboard/search adapter using its public JSON API."""

    id = "skills-sh"

    def __init__(self, base_url: str, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token.strip()

    def search(self, query: str, limit: int = 20) -> list[SkillSearchResult]:
        if query.strip():
            endpoint = f"{self.base_url}/api/v1/skills/search?q={quote(query)}&limit={min(limit, 200)}"
        else:
            endpoint = f"{self.base_url}/api/v1/skills?view=all-time&page=0&per_page={min(limit, 500)}"
        headers = {"Accept": "application/json", "User-Agent": "Kontext-Skill-Discovery"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(endpoint, headers=headers)
        try:
            with urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            return []
        results: list[SkillSearchResult] = []
        for item in payload.get("data", []):
            source = item.get("source", "unknown")
            skill_id = item.get("id", f"{source}/{item.get('slug', item.get('name', 'skill'))}")
            results.append(SkillSearchResult(
                id=f"skills-sh:{skill_id}",
                name=item.get("name", item.get("slug", "Unnamed skill")),
                description=f"Open-source agent skill from {source}",
                author=source.split("/")[0], registry="skills.sh",
                source_url=item.get("url") or item.get("installUrl"),
                license="Unknown", open_source=True,
                downloads=int(item.get("installs", 0) or 0),
                stars=0, trust_score=55, security_score=50,
                tags=("open-source", "skills.sh", item.get("sourceType", "github")),
            ))
        return results


def providers() -> list[SkillProvider]:
    configured = [item.strip() for item in os.getenv("KONTEXT_SKILL_PROVIDERS", "local,github,openagentskill,skillsllm,skills-sh").split(",") if item.strip()]
    result: list[SkillProvider] = []
    for provider_id in configured:
        if provider_id == "local":
            result.append(LocalSkillProvider())
        elif provider_id == "github":
            result.append(GitHubSkillProvider(os.getenv("KONTEXT_GITHUB_API", "https://api.github.com")))
        elif provider_id == "openagentskill":
            result.append(OpenAgentSkillProvider(os.getenv("KONTEXT_OPENAGENTSKILL_URL", "https://www.openagentskill.com")))
        elif provider_id == "skillsllm":
            result.append(HtmlSkillCatalogProvider("skillsllm", "SkillsLLM", os.getenv("KONTEXT_SKILLSLLM_URL", "https://skillsllm.com")))
        elif provider_id in {"skills-sh", "skillssh"}:
            result.append(SkillsShProvider(
                os.getenv("KONTEXT_SKILLS_SH_URL", "https://skills.sh"),
                os.getenv("KONTEXT_SKILLS_SH_TOKEN", ""),
            ))
    return result


def discover(query: str, limit: int = 30) -> list[dict]:
    results: list[SkillSearchResult] = []
    for provider in providers():
        try:
            results.extend(provider.search(query, limit))
        except Exception as exc:  # noqa: BLE001 - one unavailable registry must not break discovery
            logger.warning("Skill provider %s failed for query %r: %s", provider.id, query, exc)
    unique = {item.id: item for item in results}
    ranked = sorted(unique.values(), key=lambda item: (-item.downloads, -item.verified, -item.trust_score, -item.stars, item.name.lower()))
    return [item.public_dict() for item in ranked[:limit]]
