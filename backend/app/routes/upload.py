"""
Upload API routes — Step 2.

POST /api/upload — accept a supported artifact, store under backend/uploads/
"""

from pathlib import Path
from uuid import UUID
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.artifact_extract import extract_artifact_pages
from services.memory_store import get_local_artifact, save_local_artifact
from services.pdf_upload import get_uploads_dir, save_pdf_upload
from services.postgres_store import (
    get_project_for_user,
    get_artifact_for_user,
    postgres_enabled,
    resolve_user_id,
    save_artifact,
)

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_artifact(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    workspace_id: UUID | None = Form(default=None),
    project_id: UUID | None = Form(default=None),
    auth: AuthContext = Depends(require_auth),
):
    """
    Upload a supported artifact for the RAG pipeline.

    Returns metadata shown in the UI: filename, size, pages, timestamp, doc_id.
    """
    settings = get_settings()

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    resolved_user_id = None
    if postgres_enabled(settings):
        resolved_user_id = resolve_user_id(settings, auth.user_id or "")
        if not resolved_user_id:
            raise HTTPException(status_code=403, detail="User account could not be resolved")
        if project_id:
            project = get_project_for_user(
                settings,
                project_id=str(project_id),
                user_id=resolved_user_id,
                workspace_id=str(workspace_id) if workspace_id else None,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project was not found.")
            workspace_id = UUID(project["workspace_id"])

    try:
        raw = await file.read()
        result = await save_pdf_upload(
            file_bytes=raw,
            original_filename=file.filename,
            uploads_dir_name=settings.uploads_dir,
        )
        if resolved_user_id:
            save_artifact(
                settings,
                artifact_id=result.doc_id,
                user_id=resolved_user_id,
                filename=result.filename,
                storage_path=result.stored_path,
                mime_type=file.content_type or _mime_type_for_filename(result.filename),
                file_size_bytes=result.size_bytes,
                page_count=result.page_count,
                title=title,
                workspace_id=str(workspace_id) if workspace_id else None,
                project_id=str(project_id) if project_id else None,
            )
        elif auth.user_id:
            save_local_artifact(
                settings,
                artifact_id=result.doc_id,
                user_id=auth.user_id,
                filename=result.filename,
                storage_path=result.stored_path,
                mime_type=file.content_type or _mime_type_for_filename(result.filename),
                file_size_bytes=result.size_bytes,
                page_count=result.page_count,
                title=title,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Upload failed") from exc

    return {
        "doc_id": result.doc_id,
        "title": _artifact_title(title, result.filename),
        "filename": result.filename,
        "mime_type": file.content_type or _mime_type_for_filename(result.filename),
        "size_bytes": result.size_bytes,
        "size_human": _format_bytes(result.size_bytes),
        "page_count": result.page_count,
        "uploaded_at": result.uploaded_at,
        "stored_path": result.stored_path,
        "pipeline_step": "upload",
    }


def _artifact_title(title: str | None, filename: str) -> str:
    return (
        (title or "").strip()
        or filename.rsplit(".", 1)[0].replace("_", " ").strip()
        or "Untitled artifact"
    )[:160]


@router.get("/artifacts/{artifact_id}/content")
async def get_artifact_content(
    artifact_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """Stream an authenticated artifact for the in-app document viewer."""
    settings = get_settings()
    path, metadata = _resolve_artifact(settings, artifact_id, auth)
    filename = str(metadata.get("filename") or _original_filename(path, artifact_id))
    mime_type = str(metadata.get("mime_type") or _mime_type_for_filename(filename))
    return FileResponse(
        path,
        media_type=mime_type,
        filename=filename,
        content_disposition_type="inline",
    )


@router.get("/artifacts/{artifact_id}/preview")
async def get_artifact_preview(
    artifact_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """Return bounded, extracted pages/slides/sheets for the document modal."""
    settings = get_settings()
    path, metadata = _resolve_artifact(settings, artifact_id, auth)
    filename = str(metadata.get("filename") or _original_filename(path, artifact_id))
    try:
        extracted_pages = extract_artifact_pages(path)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=415, detail="A text preview is not available for this file.") from exc

    pages = []
    remaining_chars = 250_000
    for page in extracted_pages[:100]:
        if remaining_chars <= 0:
            break
        text = str(page.get("text") or "")[: min(remaining_chars, 50_000)]
        remaining_chars -= len(text)
        pages.append({
            "page": int(page.get("page") or len(pages) + 1),
            "title": page.get("title"),
            "text": text,
        })

    return {
        "artifact_id": artifact_id,
        "filename": filename,
        "mime_type": str(metadata.get("mime_type") or _mime_type_for_filename(filename)),
        "size_bytes": int(metadata.get("size_bytes") or path.stat().st_size),
        "page_count": len(extracted_pages),
        "pages": pages,
        "truncated": len(pages) < len(extracted_pages) or remaining_chars <= 0,
    }


def _resolve_artifact(settings, artifact_id: str, auth: AuthContext) -> tuple[Path, dict]:
    try:
        UUID(artifact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Artifact not found") from exc

    uploads_dir = get_uploads_dir(settings.uploads_dir).resolve()
    metadata: dict = {}
    if postgres_enabled(settings):
        user_id = resolve_user_id(settings, auth.user_id or "")
        if not user_id:
            raise HTTPException(status_code=403, detail="User account could not be resolved")
        row = get_artifact_for_user(settings, artifact_id=artifact_id, user_id=user_id)
        if not row:
            raise HTTPException(status_code=404, detail="Artifact not found")
        metadata = dict(row)
        path = (uploads_dir.parent / str(metadata.get("storage_path") or "")).resolve()
    else:
        if not auth.user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        row = get_local_artifact(settings, artifact_id=artifact_id, user_id=auth.user_id)
        if row:
            metadata = dict(row)
            path = (uploads_dir.parent / str(metadata.get("storage_path") or "")).resolve()
        else:
            # Compatibility for local uploads created before the artifact index existed.
            path = next(uploads_dir.glob(f"{artifact_id}_*"), None)
            if path is None:
                raise HTTPException(status_code=404, detail="Artifact not found")
            path = path.resolve()

    if uploads_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")
    return path, metadata


def _original_filename(path: Path, artifact_id: str) -> str:
    prefix = f"{artifact_id}_"
    return path.name[len(prefix):] if path.name.startswith(prefix) else path.name


def _format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.1f} MB"


def _mime_type_for_filename(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".csv": "text/csv",
        ".json": "application/json",
        ".html": "text/html",
        ".htm": "text/html",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }.get(extension, "application/octet-stream")
