"""Small production runtime guards kept independent of app initialization."""


def require_postgres_for_production(settings, *, postgres_available: bool) -> None:
    if settings.environment in {"production", "staging"} and not postgres_available:
        raise RuntimeError(
            "PostgreSQL is unavailable in production; refusing local SQLite fallback."
        )
