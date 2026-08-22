from datetime import datetime, timezone
from types import SimpleNamespace

from services.subscription_service import get_usage_summary


class FakeCursor:
    def __init__(self):
        self._queries = []
        self._fetch_queue = []

    def execute(self, query, params=None):
        self._queries.append((query, params))
        if "FROM plan_limits" in query:
            self._fetch_queue.append([
                {"resource_key": "crawl:scrape", "limit_value": 1000, "limit_period": "day"},
                {"resource_key": "crawl:search", "limit_value": 500, "limit_period": "month"},
            ])
        elif "FROM usage_aggregates" in query:
            resource_key = params[1]
            if resource_key == "crawl:scrape":
                self._fetch_queue.append([
                    {"used": 7, "tokens_input": 100, "tokens_output": 25, "cost_cents": 42}
                ])
            else:
                self._fetch_queue.append([
                    {"used": 12, "tokens_input": 50, "tokens_output": 5, "cost_cents": 15}
                ])
        elif "FROM users" in query or "FROM subscriptions" in query:
            self._fetch_queue.append([])

    def fetchall(self):
        return self._fetch_queue.pop(0) if self._fetch_queue else []

    def fetchone(self):
        rows = self._fetch_queue.pop(0) if self._fetch_queue else []
        return rows[0] if rows else None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeConn:
    def __init__(self, cursor):
        self.cursor_obj = cursor

    def cursor(self):
        return self.cursor_obj

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_get_usage_summary_reads_per_user_aggregates(monkeypatch):
    cursor = FakeCursor()
    conn = FakeConn(cursor)

    monkeypatch.setattr(
        "services.subscription_service._connect",
        lambda _settings: conn,
    )
    monkeypatch.setattr(
        "services.subscription_service.get_user_subscription",
        lambda _settings, _user_id: {"plan_key": "pro"},
    )

    summary = get_usage_summary(SimpleNamespace(), "user-123")

    assert summary["plan"] == "pro"
    assert summary["usage"]["crawl:scrape"]["used"] == 7
    assert summary["usage"]["crawl:scrape"]["remaining"] == 993
    assert summary["usage"]["crawl:search"]["used"] == 12
    assert summary["usage"]["crawl:search"]["remaining"] == 488
    assert summary["usage"]["crawl:scrape"]["tokens_input"] == 100
    assert summary["usage"]["crawl:search"]["cost_cents"] == 15
