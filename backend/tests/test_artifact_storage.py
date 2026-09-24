from types import SimpleNamespace

import pytest

from services.artifact_storage import (
    ArtifactStorageError,
    materialize_artifact,
    retrieve_artifact_bytes,
    store_artifact,
)


def test_production_artifacts_require_cloudinary_credentials(tmp_path):
    settings = SimpleNamespace(environment="production", uploads_dir=str(tmp_path / "uploads"))

    with pytest.raises(ArtifactStorageError, match="Cloudinary is required"):
        store_artifact(
            settings,
            artifact_id="artifact-id",
            filename="private.pdf",
            file_bytes=b"pdf bytes",
            uploads_dir_name="uploads",
        )

    with pytest.raises(ArtifactStorageError, match="Refusing to read a local artifact"):
        retrieve_artifact_bytes(settings, storage_path="uploads/private.pdf")


def test_development_artifact_storage_round_trips_and_uses_temp_file(tmp_path):
    settings = SimpleNamespace(
        environment="development",
        uploads_dir="uploads",
        cloudinary_cloud_name="",
        cloudinary_api_key="",
        cloudinary_api_secret="",
    )
    stored = store_artifact(
        settings,
        artifact_id="artifact-id",
        filename="private report.txt",
        file_bytes=b"hello",
        uploads_dir_name="uploads",
    )
    assert stored.storage_path == "uploads/artifact-id_private report.txt"
    assert len(stored.checksum_sha256) == 64
    assert retrieve_artifact_bytes(settings, storage_path=stored.storage_path) == b"hello"

    path = materialize_artifact(
        settings, storage_path=stored.storage_path, filename="private report.txt"
    )
    try:
        assert path.read_bytes() == b"hello"
    finally:
        path.unlink(missing_ok=True)


def test_production_cloudinary_paths_must_use_authenticated_delivery():
    settings = SimpleNamespace(environment="production")
    with pytest.raises(ArtifactStorageError, match="metadata is invalid"):
        retrieve_artifact_bytes(settings, storage_path="cloudinary:image:upload:folder/id")
