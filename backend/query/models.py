from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class QueryMode(str, Enum):
    AUTO = "auto"
    SOCIAL = "social"
    DIRECT = "direct"
    UTILITY = "utility"
    MEMORY = "memory"
    DOCUMENT = "document"
    SEARCH = "search"
    SCRAPE = "scrape"
    MAP = "map"
    CRAWL = "crawl"
    AGENT = "agent"


class RouteDecision(BaseModel):
    mode: QueryMode
    domain: str = "general"
    intent: str = "general"
    sub_intent: str | None = None
    subject: dict[str, str] = Field(default_factory=lambda: {"type": "unknown"})
    operation: str = "explain"
    temporal: dict[str, object] = Field(default_factory=lambda: {"type": "stable", "requires_current": False})
    entities: list[str] = Field(default_factory=list, max_length=20)
    required_context: dict[str, bool] = Field(default_factory=dict)
    source: dict[str, str | None] = Field(default_factory=dict)
    web_allowed: bool = False
    web_required: bool = False
    web_reason: str = ""
    search_mode: str | None = None
    normalized_query: str | None = None
    needs_fresh_data: bool = False
    needs_web: bool = False
    needs_citations: bool = False
    target_urls: list[str] = Field(default_factory=list, max_length=10)
    search_queries: list[str] = Field(default_factory=list, max_length=3)
    reason: str = Field(max_length=240)
    reason_code: str = Field(max_length=80)
    confidence: float = Field(ge=0, le=1)
    max_tool_calls: int = Field(default=0, ge=0, le=20)
    fallback_mode: QueryMode | None = None
    requires_confirmation: bool = False
    live_data_kind: Literal["cricket", "football", "sports", "weather", "market", "election", "traffic", "news", "event"] | None = None
    live_data_label: str | None = Field(default=None, max_length=80)


class PlanStep(BaseModel):
    id: str = Field(max_length=80)
    mode: QueryMode
    label: str = Field(max_length=120)
    status: Literal["pending", "active", "complete", "failed", "denied"] = "pending"
    detail: str | None = Field(default=None, max_length=240)
    requires_confirmation: bool = False


class ExecutionPlan(BaseModel):
    route: QueryMode
    steps: list[PlanStep] = Field(default_factory=list, max_length=20)
    max_tool_calls: int = Field(default=0, ge=0, le=20)
    allows_replan: bool = False
    capabilities: list[dict] = Field(default_factory=list, max_length=24)


class QuerySource(BaseModel):
    id: str
    title: str
    url: str
    domain: str
    snippet: str = ""
    quote: str | None = None
    image_url: str | None = None
    image_landing_url: str | None = None
    image_attribution: str | None = None
    image_license: str | None = None
    image_provider: str | None = None
    source_type: Literal["search", "scrape", "crawl", "document", "memory"]
    provider: str | None = None
    provider_label: str | None = None
    published_at: str | None = None
    retrieved_at: str
    citation_index: int | None = None
    canonical_url: str | None = None
    favicon_url: str | None = None
    verification: dict = Field(default_factory=dict)
    trust_score: float | None = Field(default=None, ge=0, le=100)
    trust_label: str | None = None
    trust_components: dict[str, float] = Field(default_factory=dict)
    trust_explanation: str | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    confidence_label: str | None = None
    confidence_components: dict[str, float] = Field(default_factory=dict)
    confidence_explanation: str | None = None
    evidence_role: Literal["primary", "supporting", "background", "ignored"] | None = None
    reason_used: str | None = None
    influence_score: float | None = Field(default=None, ge=0, le=1)
    freshness: dict = Field(default_factory=dict)
    cross_verification: dict = Field(default_factory=dict)
    content_hash: str | None = None
    language: str | None = None
    license: str | None = None
    score_version: str | None = None
