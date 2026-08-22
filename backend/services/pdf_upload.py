"""
PDF upload service — Step 2.

LEARNING: The first step in any document AI pipeline is durable storage.
          We save the raw file locally before extraction/chunking so you can
          re-process without re-uploading (common in production ingest jobs).
"""

from __future__ import annotations

import re
import uuid
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
) -> UploadResult:
    if not file_bytes:
        raise ValueError("Empty file")
    if len(file_bytes) > MAX_PDF_BYTES:
        raise ValueError(f"File too large (max {MAX_PDF_BYTES // (1024 * 1024)} MB)")

    extension = Path(original_filename or "").suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(f"Unsupported file type. Supported: {allowed}")

    uploads_dir = get_uploads_dir(uploads_dir_name)
    doc_id = str(uuid.uuid4())
    safe_name = _safe_filename(original_filename)
    disk_name = f"{doc_id}_{safe_name}"
    dest = uploads_dir / disk_name

    dest.write_bytes(file_bytes)

    if extension == ".pdf":
        try:
            page_count = _read_page_count(dest)
        except Exception as exc:
            dest.unlink(missing_ok=True)
            raise ValueError("Invalid or corrupted PDF") from exc
    else:
        page_count = 1

    uploaded_at = datetime.now(timezone.utc).isoformat()

    return UploadResult(
        doc_id=doc_id,
        filename=safe_name,
        size_bytes=len(file_bytes),
        page_count=page_count,
        uploaded_at=uploaded_at,
        stored_path=str(dest.relative_to(uploads_dir.parent)),
    )
