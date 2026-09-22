"""Performance Metrics — collects and reports application performance data.

Provides:
- Request latency tracking
- Throughput metrics
- Error rates
- Resource utilization
- Custom metric recording

Usage:
    from app.metrics import metrics, record_metric
    metrics.record("request_latency_ms", 45.2)
    metrics.increment("requests_total")
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import RLock
from typing import Any


@dataclass
class MetricPoint:
    """Single metric data point."""
    name: str
    value: float
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    labels: dict[str, str] = field(default_factory=dict)


class MetricsCollector:
    """Thread-safe metrics collector."""

    def __init__(self):
        self._counters: dict[str, int] = defaultdict(int)
        self._gauges: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = defaultdict(list)
        # get_all() snapshots histograms through get_histogram(), which also
        # takes this lock. Reentrancy prevents a self-deadlock on that path.
        self._lock = RLock()
        self._start_time = time.monotonic()

    def increment(self, name: str, value: int = 1, labels: dict[str, str] | None = None) -> None:
        """Increment a counter."""
        key = self._make_key(name, labels)
        with self._lock:
            self._counters[key] += value

    def decrement(self, name: str, value: int = 1, labels: dict[str, str] | None = None) -> None:
        """Decrement a counter."""
        key = self._make_key(name, labels)
        with self._lock:
            self._counters[key] -= value

    def set(self, name: str, value: float, labels: dict[str, str] | None = None) -> None:
        """Set a gauge value."""
        key = self._make_key(name, labels)
        with self._lock:
            self._gauges[key] = value

    def record(self, name: str, value: float, labels: dict[str, str] | None = None) -> None:
        """Record a histogram value."""
        key = self._make_key(name, labels)
        with self._lock:
            self._histograms[key].append(value)
            # Keep only last 1000 values
            if len(self._histograms[key]) > 1000:
                self._histograms[key] = self._histograms[key][-1000:]

    def get_counter(self, name: str, labels: dict[str, str] | None = None) -> int:
        """Get counter value."""
        key = self._make_key(name, labels)
        with self._lock:
            return self._counters.get(key, 0)

    def get_gauge(self, name: str, labels: dict[str, str] | None = None) -> float | None:
        """Get gauge value."""
        key = self._make_key(name, labels)
        with self._lock:
            return self._gauges.get(key)

    def get_histogram(self, name: str, labels: dict[str, str] | None = None) -> dict[str, float]:
        """Get histogram statistics."""
        key = self._make_key(name, labels)
        with self._lock:
            values = self._histograms.get(key, [])
            if not values:
                return {"count": 0, "sum": 0, "avg": 0, "min": 0, "max": 0, "p50": 0, "p95": 0, "p99": 0}

            sorted_values = sorted(values)
            count = len(sorted_values)
            return {
                "count": count,
                "sum": sum(sorted_values),
                "avg": sum(sorted_values) / count,
                "min": sorted_values[0],
                "max": sorted_values[-1],
                "p50": sorted_values[count // 2],
                "p95": sorted_values[int(count * 0.95)] if count > 20 else sorted_values[-1],
                "p99": sorted_values[int(count * 0.99)] if count > 100 else sorted_values[-1],
            }

    def get_all(self) -> dict[str, Any]:
        """Get all metrics."""
        with self._lock:
            uptime = time.monotonic() - self._start_time
            return {
                "uptime_seconds": round(uptime, 2),
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "histograms": {
                    name: self.get_histogram(name)
                    for name in self._histograms
                },
            }

    def reset(self) -> None:
        """Reset all metrics."""
        with self._lock:
            self._counters.clear()
            self._gauges.clear()
            self._histograms.clear()
            self._start_time = time.monotonic()

    def _make_key(self, name: str, labels: dict[str, str] | None) -> str:
        """Create a metric key from name and labels."""
        if not labels:
            return name
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"


# Global metrics instance
_metrics = MetricsCollector()


def get_metrics() -> MetricsCollector:
    """Get the global metrics collector."""
    return _metrics


def record_metric(name: str, value: float, labels: dict[str, str] | None = None) -> None:
    """Convenience function to record a metric."""
    _metrics.record(name, value, labels)


def increment_counter(name: str, value: int = 1, labels: dict[str, str] | None = None) -> None:
    """Convenience function to increment a counter."""
    _metrics.increment(name, value, labels)


def set_gauge(name: str, value: float, labels: dict[str, str] | None = None) -> None:
    """Convenience function to set a gauge."""
    _metrics.set(name, value, labels)
