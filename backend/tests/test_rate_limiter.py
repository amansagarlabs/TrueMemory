from types import SimpleNamespace

from services.rate_limiter import RateLimiter


def test_local_rate_limiter_blocks_and_reports_retry_after() -> None:
    limiter = RateLimiter(
        SimpleNamespace(memory_db_path="rate-limit-test.db"),
        limit=2,
        window_seconds=60,
    )

    assert limiter.check("user-a")["allowed"] is True
    assert limiter.check("user-a")["allowed"] is True
    blocked = limiter.check("user-a")

    assert blocked["allowed"] is False
    assert blocked["remaining"] == 0
    assert blocked["retry_after"] >= 1
    assert blocked["backend"] == "local"


def test_local_rate_limiter_isolates_buckets() -> None:
    limiter = RateLimiter(
        SimpleNamespace(memory_db_path="rate-limit-test.db"),
        limit=1,
        window_seconds=60,
    )

    assert limiter.check("user-a")["allowed"] is True
    assert limiter.check("user-a")["allowed"] is False
    assert limiter.check("user-b")["allowed"] is True
