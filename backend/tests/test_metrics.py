from app.metrics import MetricsCollector


def test_metrics_snapshot_does_not_deadlock_when_histograms_exist() -> None:
    metrics = MetricsCollector()
    metrics.record("request_latency_ms", 12.5)
    snapshot = metrics.get_all()
    assert snapshot["histograms"]["request_latency_ms"]["p50"] == 12.5
