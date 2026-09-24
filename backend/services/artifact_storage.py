"""Durable uploaded-artifact storage adapters.

Cloudinary is used for production binaries. Local files remain an explicit
development/test adapter only; database metadata continues to live in Postgres.
"""

from __future__ import annotations

import hashlib
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import cloudinary
    from cloudinary import uploader
except ModuleNotFoundError:  # pragma: no cover - deployment installs requirements.txt
    cloudinary = None
    uploader = None


class ArtifactStorageError(RuntimeError):
    """An artifact could not be safely persisted or retrieved."""


def cloudinary_configured(settings: Any) -> bool:
    return all(
        str(getattr(settings, name, "") or "").strip()
        for name in ("cloudinary_cloud_name", "cloudinary_api_key", "cloudinary_api_secret")
    )


def _production(settings: Any) -> bool:
    return str(getattr(settings, "environment", "development")).lower() in {
        "production", "prod", "staging"
    }


def _configure(settings: Any) -> None:
    if cloudinary is None or uploader is None:
        raise ArtifactStorageError("Cloudinary SDK is not installed.")
    if not cloudinary_configured(settings):
        raise ArtifactStorageError("Cloudinary artifact storage is not configured.")
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def _resource_type(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}:
        return "image"
    if extension in {".mp4", ".mov", ".mp3", ".wav", ".m4a"}:
        return "video"
    return "raw"


def _object_id(artifact_id: str, filename: str) -> str:
    path = Path(filename)
    # Cloudinary image/video public IDs omit the file extension; raw assets
    # retain it so Cloudinary can distinguish same-stem documents.
    leaf = path.name if _resource_type(filename) == "raw" else path.stem
    return f"{artifact_id}/{leaf}"


@dataclass(frozen=True)
class StoredArtifact:
    storage_path: str
    checksum_sha256: str


def store_artifact(
    settings: Any,
    *,
    artifact_id: str,
    filename: str,
    file_bytes: bytes,
    uploads_dir_name: str,
) -> StoredArtifact:
    checksum = hashlib.sha256(file_bytes).hexdigest()
    if cloudinary_configured(settings):
        _configure(settings)
        resource_type = _resource_type(filename)
        try:
            result = uploader.upload(
                file_bytes,
                resource_type=resource_type,
                folder=str(getattr(settings, "cloudinary_folder", "truememory") or "truememory").strip("/"),
                public_id=_object_id(artifact_id, filename),
                type="authenticated",
                overwrite=False,
                unique_filename=False,
                use_filename=False,
                filename_override=Path(filename).name,
                tags=["truememory", f"artifact:{artifact_id}"],
            )
        except Exception as exc:
            raise ArtifactStorageError("Cloudinary upload failed.") from exc
        if not isinstance(result, dict) or not result.get("public_id"):
            raise ArtifactStorageError("Cloudinary returned incomplete upload metadata.")
        return StoredArtifact(
            storage_path=f"cloudinary:{resource_type}:authenticated:{result['public_id']}",
            checksum_sha256=checksum,
        )
    if _production(settings):
        raise ArtifactStorageError("Cloudinary is required for production artifact storage.")

    from services.pdf_upload import get_uploads_dir

    uploads_dir = get_uploads_dir(uploads_dir_name)
    disk_path = uploads_dir / f"{artifact_id}_{Path(filename).name}"
    disk_path.write_bytes(file_bytes)
    return StoredArtifact(
        storage_path=disk_path.relative_to(uploads_dir.parent).as_posix(),
        checksum_sha256=checksum,
    )


def retrieve_artifact_bytes(settings: Any, *, storage_path: str) -> bytes:
    value = str(storage_path or "")
    if value.startswith("cloudinary:"):
        pieces = value.split(":", 3)
        if len(pieces) != 4 or pieces[2] != "authenticated":
            raise ArtifactStorageError("Artifact storage metadata is invalid.")
        _, resource_type, delivery_type, public_id = pieces
        _configure(settings)
        try:
            result = cloudinary.api.resource(
                public_id,
                resource_type=resource_type,
                type=delivery_type,
            )
        except Exception as exc:
            raise ArtifactStorageError("Cloudinary artifact lookup failed.") from exc
        try:
            download_url = cloudinary.utils.private_download_url(
                public_id,
                str(result.get("format") or Path(public_id).suffix.lstrip(".")),
                resource_type=resource_type,
                type=delivery_type,
                expires_at=int(time.time()) + 60,
            )
            import httpx

            response = httpx.get(download_url, timeout=60.0, follow_redirects=True)
            response.raise_for_status()
            return response.content
        except Exception as exc:
            raise ArtifactStorageError("Cloudinary artifact download failed.") from exc

    if _production(settings):
        raise ArtifactStorageError("Refusing to read a local artifact in production.")
    from services.pdf_upload import get_uploads_dir

    uploads_dir = get_uploads_dir(settings.uploads_dir).resolve()
    path = (uploads_dir.parent / value).resolve()
    if uploads_dir not in path.parents or not path.is_file():
        raise FileNotFoundError("Artifact not found")
    return path.read_bytes()


def materialize_artifact(settings: Any, *, storage_path: str, filename: str) -> Path:
    """Create a request/worker-scoped temporary file for path-based parsers."""
    suffix = Path(filename).suffix
    temporary = tempfile.NamedTemporaryFile(prefix="truememory-artifact-", suffix=suffix, delete=False)
    try:
        temporary.write(retrieve_artifact_bytes(settings, storage_path=storage_path))
        temporary.close()
        return Path(temporary.name)
    except Exception:
        temporary.close()
        Path(temporary.name).unlink(missing_ok=True)
        raise


def delete_artifact(settings: Any, *, storage_path: str) -> None:
    value = str(storage_path or "")
    if value.startswith("cloudinary:"):
        pieces = value.split(":", 3)
        if len(pieces) != 4:
            raise ArtifactStorageError("Artifact storage metadata is invalid.")
        _, resource_type, delivery_type, public_id = pieces
        _configure(settings)
        uploader.destroy(public_id, resource_type=resource_type, type=delivery_type, invalidate=True)
        return
    if _production(settings):
        raise ArtifactStorageError("Refusing to delete a local artifact in production.")
    from services.pdf_upload import get_uploads_dir

    uploads_dir = get_uploads_dir(settings.uploads_dir).resolve()
    path = (uploads_dir.parent / value).resolve()
    if uploads_dir in path.parents:
        path.unlink(missing_ok=True)
