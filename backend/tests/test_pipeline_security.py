from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.auth_middleware import AuthContext
from app.routes import pipeline


def _auth(user_id: str = "user-1") -> AuthContext:
    return AuthContext(
        authenticated=True,
        user={"id": user_id},
        session_token="session",
    )


def test_pipeline_requires_owned_postgres_artifact(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(pipeline, "resolve_user_id", lambda _settings, _user_id: "db-user-1")
    monkeypatch.setattr(
        pipeline,
        "get_artifact_for_user",
        lambda _settings, *, artifact_id, user_id: (
            {"id": artifact_id} if user_id == "db-user-1" else None
        ),
    )

    pipeline._authorize_pipeline_artifact(
        object(),
        doc_id="artifact-1",
        auth=_auth(),
    )


def test_pipeline_hides_unowned_artifact(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(pipeline, "resolve_user_id", lambda _settings, _user_id: "db-user-1")
    monkeypatch.setattr(
        pipeline,
        "get_artifact_for_user",
        lambda _settings, *, artifact_id, user_id: None,
    )

    with pytest.raises(HTTPException) as exc:
        pipeline._authorize_pipeline_artifact(
            object(),
            doc_id="another-users-artifact",
            auth=_auth(),
        )

    assert exc.value.status_code == 404


def test_pipeline_local_mode_is_user_scoped(monkeypatch, tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    monkeypatch.setattr(pipeline, "postgres_enabled", lambda _settings: False)
    monkeypatch.setattr(
        pipeline,
        "get_local_artifact",
        lambda _settings, *, artifact_id, user_id: (
            {"id": artifact_id} if user_id == "owner" else None
        ),
    )

    with pytest.raises(HTTPException) as exc:
        pipeline._authorize_pipeline_artifact(
            settings,
            doc_id="artifact-1",
            auth=_auth("not-owner"),
        )

    assert exc.value.status_code == 404
