"""Versioned fallback pricing for models whose live catalog omits rates."""

from __future__ import annotations

from dataclasses import dataclass

PRICING_VERSION = "2026-09-22"

@dataclass(frozen=True)
class ModelPricing:
    provider: str
    model_id: str
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float = 0.0
    version: str = PRICING_VERSION
    source: str = "versioned-fallback"

_PRICES = {
    ("openai", "gpt-5.4-mini"): (0.75, 4.50, 0.0),
    ("openai", "gpt-5.4-nano"): (0.20, 1.25, 0.0),
    ("openai", "gpt-5-mini"): (0.25, 2.00, 0.0),
    ("openai", "gpt-5-nano"): (0.05, 0.40, 0.0),
}

def get_model_pricing(provider: str, model_id: str) -> ModelPricing | None:
    rates = _PRICES.get((provider.casefold(), model_id.casefold()))
    return ModelPricing(provider.casefold(), model_id, *rates) if rates else None

def calculate_cost_cents(pricing: ModelPricing | None, input_tokens: int, output_tokens: int, cached_input_tokens: int = 0) -> int | None:
    if pricing is None:
        return None
    regular_input = max(0, input_tokens - cached_input_tokens)
    dollars = ((regular_input * pricing.input_per_million) + (cached_input_tokens * pricing.cached_input_per_million) + (output_tokens * pricing.output_per_million)) / 1_000_000
    return round(dollars * 100)
