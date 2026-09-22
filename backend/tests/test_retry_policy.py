from datetime import UTC, datetime

from services.retry_policy import backoff_ms, classify_http, retry_after_ms

def test_safe_http_retries_and_posts_require_idempotency():
    assert classify_http(503, method="GET").retryable
    assert not classify_http(503, method="POST").retryable
    assert classify_http(503, method="POST", idempotency_key="k").retryable
    assert not classify_http(401, method="GET").retryable

def test_retry_after_supports_seconds_and_http_date():
    assert retry_after_ms("2") == 2000
    assert retry_after_ms("Thu, 01 Jan 2026 00:00:03 GMT", now=datetime(2026, 1, 1, tzinfo=UTC)) == 3000

def test_backoff_is_bounded():
    assert backoff_ms(1, jitter=0) == 250
    assert backoff_ms(20, maximum_ms=1000) <= 1000
