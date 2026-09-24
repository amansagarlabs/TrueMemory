"""
PDF upload service — Step 2.

LEARNING: The first step in any document AI pipeline is durable storage.
          We save the raw file locally before extraction/chunking so you can
          re-process without re-uploading (common in production ingest jobs).
"""

from __future__ import annotations

import hashlib
import re
import uuid
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF — also used in Step 3 for full text extraction

MAX_PDF_BYTES = 20 * 1024 * 1024  # Retained name for compatibility.
SUPPORTED_EXTENSIONS = {
    ".pdf", ".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm",
    ".docx", ".pptx", ".xlsx", ".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".sql",
    ".yaml", ".yml", ".xml", ".toml", ".ini", ".log", ".java", ".go", ".rs",
    ".c", ".h", ".cpp", ".hpp", ".sh", ".ps1",
    ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff",
}


@dataclass
class UploadResult:
    doc_id: str
    filename: str
    size_bytes: int
    page_count: int
    uploaded_at: str
    stored_path: str
    checksum_sha256: str = ""


def get_uploads_dir(uploads_dir_name: str) -> Path:
    """Resolve backend/uploads/ regardless of cwd when starting uvicorn."""
    backend_root = Path(__file__).resolve().parent.parent
    path = backend_root / uploads_dir_name
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^\w.\-]", "_", base)
    return cleaned or "document.pdf"


def _read_page_count(file_path: Path) -> int:
    with fitz.open(file_path) as doc:
        return doc.page_count


async def save_pdf_upload(
    *,
    file_bytes: bytes,
    original_filename: str,
    uploads_dir_name: str,
    settings=None,
) -> UploadResult:
    if not file_bytes:
        raise ValueError("Empty file")
    if len(file_bytes) > MAX_PDF_BYTES:
        raise ValueError(f"File too large (max {MAX_PDF_BYTES // (1024 * 1024)} MB)")

    extension = Path(original_filename or "").suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(f"Unsupported file type. Supported: {allowed}")

    doc_id = str(uuid.uuid4())
    safe_name = _safe_filename(original_filename)
    temporary = tempfile.NamedTemporaryFile(prefix="truememory-upload-", suffix=extension, delete=False)
    temp_path = Path(temporary.name)
    try:
        temporary.write(file_bytes)
        temporary.close()
        if extension == ".pdf":
            try:
                page_count = _read_page_count(temp_path)
            except Exception as exc:
                raise ValueError("Invalid or corrupted PDF") from exc
        else:
            page_count = 1

        if settings is not None:
            from services.artifact_storage import store_artifact

            stored = store_artifact(
                settings,
                artifact_id=doc_id,
                filename=safe_name,
                file_bytes=file_bytes,
                uploads_dir_name=uploads_dir_name,
            )
            stored_path = stored.storage_path
        else:
            uploads_dir = get_uploads_dir(uploads_dir_name)
            dest = uploads_dir / f"{doc_id}_{safe_name}"
            dest.write_bytes(file_bytes)
            stored_path = str(dest.relative_to(uploads_dir.parent))
    finally:
        if not temporary.closed:
            temporary.close()
        temp_path.unlink(missing_ok=True)

    uploaded_at = datetime.now(timezone.utc).isoformat()

    return UploadResult(
        doc_id=doc_id,
        filename=safe_name,
        size_bytes=len(file_bytes),
        page_count=page_count,
        uploaded_at=uploaded_at,
        stored_path=stored_path,
        checksum_sha256=hashlib.sha256(file_bytes).hexdigest(),
    )
