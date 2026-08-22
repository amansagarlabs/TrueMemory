"""Transparent source normalization, verification, and scoring."""

from .aggregation import aggregate_source_set, finalize_source_usage
from .engine import build_source_intelligence
from .normalization import canonicalize_url

__all__ = [
    "aggregate_source_set",
    "build_source_intelligence",
    "canonicalize_url",
    "finalize_source_usage",
]
