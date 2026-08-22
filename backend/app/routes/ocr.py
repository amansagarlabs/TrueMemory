"""Authenticated OCR endpoint for pasted and uploaded chat images."""

from dataclasses import asdict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.auth_middleware import AuthContext, log_operation, require_auth
from app.config import get_settings
from services.image_ocr import (
    MAX_IMAGE_BYTES,
    OcrInputError,
    OcrResult,
    OcrUnavailableError,
    extract_image_text,
    validate_image_input,
)
from services.memory_store import save_local_artifact
from services.pdf_upload import save_pdf_upload
from services.postgres_store import (
    postgres_enabled,
    resolve_user_id,
    save_artifact,
)

router = APIRouter(prefix="/api", tags=["ocr"])


@router.post("/ocr/image")
async def ocr_image(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing image filename.")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Only image files can be read with OCR.")

    raw = await file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 15 MB or smaller.")

    settings = get_settings()
    resolved_user_id = None
    if postgres_enabled(settings):
        resolved_user_id = resolve_user_id(settings, auth.user_id or "")
        if not resolved_user_id:
            raise HTTPException(status_code=403, detail="User account could not be resolved.")

    try:
        # Validate and persist first. OCR enriches the image, but it must not be
        # the gate that decides whether a vision-capable chat model can see it.
        await run_in_threadpool(validate_image_input, raw, file.filename)
        stored = await save_pdf_upload(
            file_bytes=raw,
            original_filename=file.filename,
            uploads_dir_name=settings.uploads_dir,
        )
        mime_type = file.content_type or "image/png"
        if resolved_user_id:
            save_artifact(
                settings,
                artifact_id=stored.doc_id,
                user_id=resolved_user_id,
                filename=stored.filename,
                storage_path=stored.stored_path,
                mime_type=mime_type,
                file_size_bytes=stored.size_bytes,
                page_count=1,
            )
        elif auth.user_id:
            save_local_artifact(
                settings,
                artifact_id=stored.doc_id,
                user_id=auth.user_id,
                filename=stored.filename,
                storage_path=stored.stored_path,
                mime_type=mime_type,
                file_size_bytes=stored.size_bytes,
                page_count=1,
            )
        try:
            result = await run_in_threadpool(
                extract_image_text,
                raw,
                filename=file.filename,
                provider=settings.ocr_provider,
                language=settings.ocr_language,
                tesseract_cmd=settings.tesseract_cmd,
                paddle_device=settings.paddleocr_device,
                paddle_pipeline_version=settings.paddleocr_pipeline_version,
            )
        except OcrUnavailableError:
            result = OcrResult(
                text="",
                markdown="",
                provider="vision",
                model="Visual analysis",
                warnings=["OCR is unavailable; the image is still ready for visual analysis."],
            )
    except OcrInputError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    log_operation(
        auth,
        "image_ocr",
        extra={"provider": result.provider, "filename": file.filename},
    )
    payload = asdict(result)
    payload.update({
        "artifact_id": stored.doc_id,
        "filename": stored.filename,
        "mime_type": mime_type,
        "size_bytes": stored.size_bytes,
    })
    return payload
