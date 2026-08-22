"""Resolve authenticated chat images into OpenRouter multimodal content."""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
from uuid import UUID

from PIL import Image, ImageOps, UnidentifiedImageError

from services.image_ocr import MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS
from services.memory_store import get_local_artifact
from services.pdf_upload import get_uploads_dir
from services.postgres_store import (
    get_artifact_for_user,
    postgres_enabled,
    resolve_user_id,
)


MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024
OPENROUTER_IMAGE_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}


class ImageInputError(ValueError):
    """An image attachment is missing, unauthorized, or unsafe to send."""


def build_image_content(
    image_bytes: bytes,
    *,
    filename: str,
    index: int,
) -> list[dict]:
    """Validate image bytes and return labelled OpenRouter content blocks."""
    if not image_bytes:
        raise ImageInputError("An attached image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ImageInputError("Each image must be 15 MB or smaller.")

    try:
        image = Image.open(BytesIO(image_bytes))
        original_format = (image.format or "").upper()
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise ImageInputError("An attached image has dimensions that are too large.")
        image.load()
        image = ImageOps.exif_transpose(image)
    except ImageInputError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageInputError("An attachment is not a readable image.") from exc

    media_type = OPENROUTER_IMAGE_FORMATS.get(original_format)
    encoded_bytes = image_bytes
    if not media_type:
        # OpenRouter accepts PNG/JPEG/WebP/GIF. Convert OCR-friendly BMP/TIFF
        # uploads to PNG while preserving the original stored artifact.
        output = BytesIO()
        image.convert("RGB").save(output, format="PNG", optimize=True)
        encoded_bytes = output.getvalue()
        media_type = "image/png"

    data_url = f"data:{media_type};base64,{base64.b64encode(encoded_bytes).decode('ascii')}"
    return [
        {"type": "text", "text": f"Attached image {index}: {filename}"},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]


def load_user_image_content(
    settings,
    *,
    attachments: list[dict[str, str]],
    user_id: str,
) -> list[dict]:
    """Load only artifacts owned by the authenticated chat user."""
    uploads_dir = get_uploads_dir(settings.uploads_dir).resolve()
    resolved_user_id = resolve_user_id(settings, user_id) if postgres_enabled(settings) else None
    if postgres_enabled(settings) and not resolved_user_id:
        raise ImageInputError("The user account could not be resolved for this image.")

    blocks: list[dict] = []
    total_bytes = 0
    for index, attachment in enumerate(attachments[:4], start=1):
        artifact_id = str(attachment.get("artifact_id") or "")
        try:
            UUID(artifact_id)
        except ValueError as exc:
            raise ImageInputError("An attached image could not be found.") from exc

        if resolved_user_id:
            row = get_artifact_for_user(
                settings,
                artifact_id=artifact_id,
                user_id=resolved_user_id,
            )
        else:
            row = get_local_artifact(settings, artifact_id=artifact_id, user_id=user_id)
        if not row:
            raise ImageInputError("An attached image could not be found.")

        path = (uploads_dir.parent / str(row.get("storage_path") or "")).resolve()
        if uploads_dir not in path.parents or not path.is_file():
            raise ImageInputError("An attached image could not be found.")

        raw = path.read_bytes()
        total_bytes += len(raw)
        if total_bytes > MAX_TOTAL_IMAGE_BYTES:
            raise ImageInputError("Attached images must be 20 MB or smaller in total.")
        filename = str(row.get("filename") or attachment.get("filename") or f"Image {index}")
        blocks.extend(build_image_content(raw, filename=filename, index=index))
    return blocks


def attach_image_content(messages: list[dict], image_content: list[dict]) -> list[dict]:
    """Attach images to the final user message while leaving callers immutable."""
    if not image_content:
        return messages
    updated = [dict(message) for message in messages]
    for message in reversed(updated):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        text_block = {"type": "text", "text": content if isinstance(content, str) else ""}
        message["content"] = [text_block, *image_content]
        return updated
    raise ImageInputError("The image could not be attached to the model request.")
