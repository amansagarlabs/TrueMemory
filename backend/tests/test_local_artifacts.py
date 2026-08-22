from types import SimpleNamespace

from services.memory_store import (
    get_local_artifact,
    init_memory_store,
    list_local_artifacts,
    save_local_artifact,
)


def test_local_artifacts_are_persisted_and_scoped_to_user(tmp_path):
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)

    save_local_artifact(
        settings,
        artifact_id="artifact-1",
        user_id="user-1",
        filename="report.pdf",
        storage_path="uploads/artifact-1_report.pdf",
        mime_type="application/pdf",
        file_size_bytes=2048,
        page_count=3,
        title="Quarterly research",
    )

    items = list_local_artifacts(settings, user_id="user-1")
    assert len(items) == 1
    assert items[0]["filename"] == "report.pdf"
    assert items[0]["title"] == "Quarterly research"
    assert get_local_artifact(settings, artifact_id="artifact-1", user_id="user-1") is not None
    assert get_local_artifact(settings, artifact_id="artifact-1", user_id="user-2") is None
