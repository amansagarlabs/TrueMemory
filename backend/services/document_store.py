"""Locate an uploaded artifact by its generated document id."""

from pathlib import Path

from services.pdf_upload import get_uploads_dir


def find_artifact_for_doc(doc_id: str, uploads_dir_name: str) -> tuple[Path, str]:
    uploads = get_uploads_dir(uploads_dir_name)
    matches = sorted(path for path in uploads.glob(f"{doc_id}_*") if path.is_file())
    if not matches:
        raise FileNotFoundError(f"No artifact found for doc_id={doc_id}")
    path = matches[0]
    filename = path.name[len(doc_id) + 1 :]
    return path, filename


def find_pdf_for_doc(doc_id: str, uploads_dir_name: str) -> tuple[Path, str]:
    """Backward-compatible alias used by older callers."""
    return find_artifact_for_doc(doc_id, uploads_dir_name)
