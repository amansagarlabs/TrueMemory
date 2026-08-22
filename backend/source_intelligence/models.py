from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum


SCORE_VERSION = "source-intelligence-v2"


class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    PROBABLE = "probable"
    UNVERIFIED = "unverified"
    CONFLICTING = "conflicting"
    REVOKED = "revoked"


class VerificationType(str, Enum):
    OFFICIAL_DOCS = "official_docs"
    OFFICIAL_REPOSITORY = "official_repository"
    GOVERNMENT = "government"
    STANDARD = "standard"
    RESEARCH = "research"
    ACADEMIC = "academic"
    COMPANY = "company"
    NEWS = "news"
    COMMUNITY = "community"
    VIDEO = "video"
    DISCUSSION = "discussion"
    DOCUMENTATION = "documentation"
    API_REFERENCE = "api_reference"
    REPOSITORY = "repository"
    BLOG = "blog"
    REFERENCE = "reference"
    UNKNOWN = "unknown"


class EvidenceRole(str, Enum):
    PRIMARY = "primary"
    SUPPORTING = "supporting"
    BACKGROUND = "background"
    IGNORED = "ignored"


@dataclass(slots=True)
class VerificationResult:
    status: VerificationStatus
    type: VerificationType
    label: str
    signals: list[str] = field(default_factory=list)
    method: str = "deterministic_v1"

    def to_dict(self) -> dict:
        value = asdict(self)
        value["status"] = self.status.value
        value["type"] = self.type.value
        return value


@dataclass(slots=True)
class FreshnessResult:
    status: str
    label: str
    age_days: int | None
    source_date: str | None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class ScoreResult:
    score: float
    label: str
    components: dict[str, float]
    explanation: str

    def to_dict(self) -> dict:
        return asdict(self)
