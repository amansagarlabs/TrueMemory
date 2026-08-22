from __future__ import annotations

import re
from urllib.parse import urlparse

from .models import VerificationResult, VerificationStatus, VerificationType


_GOV_SUFFIXES = (".gov", ".gov.uk", ".gov.in", ".gc.ca", ".gouv.fr", ".europa.eu")
_RESEARCH_HOSTS = {
    "arxiv.org",
    "doi.org",
    "pubmed.ncbi.nlm.nih.gov",
    "ncbi.nlm.nih.gov",
    "openalex.org",
    "aclanthology.org",
}
_STANDARD_HOSTS = {"ietf.org", "rfc-editor.org", "w3.org", "iso.org", "whatwg.org"}
_COMMUNITY_HOSTS = {
    "reddit.com",
    "stackoverflow.com",
    "stackexchange.com",
    "news.ycombinator.com",
    "quora.com",
}
_NEWS_HOSTS = {
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "nytimes.com",
    "theguardian.com",
    "timesofsports.com",
}
_VIDEO_HOSTS = {"youtube.com", "youtu.be", "vimeo.com"}
_REFERENCE_HOSTS = {
    "britannica.com": "Reference encyclopedia",
    "wikipedia.org": "Community encyclopedia",
}
_REFERENCE_MIRROR_HOSTS = {
    "wikiwand.com",
}
_OFFICIAL_ORGANIZATION_HOSTS = {
    "bcci.tv": "Official cricket board",
    "icc-cricket.com": "Official sports governing body",
    "iplt20.com": "Official competition website",
    "python.org": "Official project website",
    "react.dev": "Official project documentation",
    "nextjs.org": "Official project documentation",
    "typescriptlang.org": "Official project website",
    "kubernetes.io": "Official project website",
}


def _matches_host(domain: str, host: str) -> bool:
    return domain == host or domain.endswith(f".{host}")


def classify_source(
    *,
    canonical_url: str,
    title: str,
    source_type: str,
    provider: str | None = None,
    verification_hint: str | None = None,
) -> VerificationResult:
    parsed = urlparse(canonical_url)
    domain = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    lowered_title = title.lower()
    signals: list[str] = []

    if verification_hint in {"official_site", "official_docs"}:
        verification_type = (
            VerificationType.OFFICIAL_DOCS
            if verification_hint == "official_docs"
            else VerificationType.COMPANY
        )
        return VerificationResult(
            VerificationStatus.VERIFIED,
            verification_type,
            "Official documentation" if verification_hint == "official_docs" else "Official website",
            ["Ownership supplied by a verified source adapter"],
            "verified_adapter_hint",
        )

    for host, label in _OFFICIAL_ORGANIZATION_HOSTS.items():
        if _matches_host(domain, host):
            return VerificationResult(
                VerificationStatus.VERIFIED,
                VerificationType.COMPANY,
                label,
                ["Domain is present in the curated official-organization registry"],
                "official_domain_registry",
            )

    if any(domain.endswith(suffix) for suffix in _GOV_SUFFIXES):
        return VerificationResult(
            VerificationStatus.VERIFIED,
            VerificationType.GOVERNMENT,
            "Government source",
            ["Recognized government domain suffix"],
            "domain_registry",
        )

    if any(_matches_host(domain, host) for host in _STANDARD_HOSTS):
        return VerificationResult(
            VerificationStatus.VERIFIED,
            VerificationType.STANDARD,
            "Standards body",
            ["Recognized standards organization domain"],
            "standards_registry",
        )

    if any(_matches_host(domain, host) for host in _RESEARCH_HOSTS):
        return VerificationResult(
            VerificationStatus.VERIFIED,
            VerificationType.RESEARCH,
            "Research source",
            ["Recognized research index or publisher host"],
            "research_registry",
        )

    if any(_matches_host(domain, host) for host in _COMMUNITY_HOSTS):
        return VerificationResult(
            VerificationStatus.UNVERIFIED,
            VerificationType.COMMUNITY,
            "Community source",
            ["User-generated community content"],
            "community_registry",
        )

    if any(_matches_host(domain, host) for host in _VIDEO_HOSTS):
        return VerificationResult(
            VerificationStatus.UNVERIFIED,
            VerificationType.VIDEO,
            "Video",
            ["Video hosting platform"],
            "host_registry",
        )

    if any(_matches_host(domain, host) for host in _NEWS_HOSTS):
        return VerificationResult(
            VerificationStatus.PROBABLE,
            VerificationType.NEWS,
            "News publisher",
            ["Recognized news publisher domain"],
            "publisher_registry",
        )

    for host, label in _REFERENCE_HOSTS.items():
        if _matches_host(domain, host):
            return VerificationResult(
                VerificationStatus.PROBABLE,
                VerificationType.REFERENCE,
                label,
                ["Recognized reference publisher domain", "Individual claims still require corroboration"],
                "reference_registry",
            )

    if any(_matches_host(domain, host) for host in _REFERENCE_MIRROR_HOSTS):
        return VerificationResult(
            VerificationStatus.UNVERIFIED,
            VerificationType.REFERENCE,
            "Reference mirror",
            ["Republished reference content; verify against the original publisher"],
            "reference_mirror_registry",
        )

    if domain == "github.com" or domain.endswith(".github.com"):
        if verification_hint == "official_repository":
            return VerificationResult(
                VerificationStatus.VERIFIED,
                VerificationType.OFFICIAL_REPOSITORY,
                "Official repository",
                ["Upstream ownership supplied by a verified adapter"],
                "verified_adapter_hint",
            )
        return VerificationResult(
            VerificationStatus.UNVERIFIED,
            VerificationType.REPOSITORY,
            "Code repository",
            ["Repository ownership has not been independently verified"],
            "repository_host",
        )

    documentation_signal = (
        domain.startswith("docs.")
        or "/docs/" in path
        or "/documentation/" in path
        or "documentation" in lowered_title
    )
    api_signal = "/api/" in path or "api reference" in lowered_title
    if api_signal:
        signals.append("API reference URL or title pattern")
        return VerificationResult(
            VerificationStatus.PROBABLE,
            VerificationType.API_REFERENCE,
            "API reference",
            signals,
            "content_pattern",
        )
    if documentation_signal:
        signals.append("Documentation URL or title pattern")
        return VerificationResult(
            VerificationStatus.PROBABLE,
            VerificationType.DOCUMENTATION,
            "Documentation",
            signals,
            "content_pattern",
        )

    if domain.endswith(".edu") or ".ac." in domain:
        return VerificationResult(
            VerificationStatus.PROBABLE,
            VerificationType.ACADEMIC,
            "Academic source",
            ["Academic institution domain pattern"],
            "domain_pattern",
        )

    if re.search(r"\bofficial (site|website)\b", lowered_title):
        return VerificationResult(
            VerificationStatus.PROBABLE,
            VerificationType.COMPANY,
            "Claimed official website",
            ["The page title claims official status", "Domain ownership has not been independently verified"],
            "title_claim",
        )

    if source_type in {"document", "memory"}:
        return VerificationResult(
            VerificationStatus.UNVERIFIED,
            VerificationType.UNKNOWN,
            "Workspace source",
            ["Private workspace evidence"],
            "workspace_context",
        )

    if provider in {"tavily", "brave", "searxng", "duckduckgo", "google_jina"}:
        signals.append("Discovered through web search")
    return VerificationResult(
        VerificationStatus.UNVERIFIED,
        VerificationType.UNKNOWN,
        "Unverified web source",
        signals or ["No verified ownership signals available"],
        "insufficient_signals",
    )
