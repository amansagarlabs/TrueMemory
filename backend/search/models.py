from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class PageMetadata:
    url: str
    title: str = ""
    description: str = ""
    image_url: str = ""
    site_name: str = ""
    favicon_url: str = ""


@dataclass(slots=True)
class ImageCandidate:
    url: str
    provider: str
    landing_url: str = ""
    attribution: str = ""
    license: str = ""
    score: float = 0.0


@dataclass(slots=True)
class EnrichmentResult:
    item: dict
    metadata: PageMetadata | None = None
    image: ImageCandidate | None = None
    warnings: list[str] = field(default_factory=list)
