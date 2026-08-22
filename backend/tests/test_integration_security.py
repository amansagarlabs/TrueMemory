import asyncio

import pytest
from fastapi import HTTPException

from app.routes import integrations


def test_connector_url_rejects_private_network() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            integrations._validated_connector_config(
                integrations.ConnectorConfig(
                    connector_id="webhook",
                    url="http://127.0.0.1/internal",
                )
            )
        )

    assert exc.value.status_code == 422


def test_url_connector_requires_url() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            integrations._validated_connector_config(
                integrations.ConnectorConfig(connector_id="slack")
            )
        )

    assert exc.value.status_code == 422


def test_non_url_connector_does_not_run_url_validation(monkeypatch) -> None:
    async def fail_if_called(_url: str) -> str:
        raise AssertionError("URL validation should not run")

    monkeypatch.setattr(integrations, "validate_public_url", fail_if_called)
    config = integrations.ConnectorConfig(
        connector_id="github",
        api_key="token",
    )

    assert asyncio.run(integrations._validated_connector_config(config)) == config
