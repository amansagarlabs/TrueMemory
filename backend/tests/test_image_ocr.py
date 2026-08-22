from io import BytesIO

import pytest
from PIL import Image

from services import image_ocr


def _png_bytes() -> bytes:
    image = Image.new("RGB", (80, 40), "white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_auto_uses_lightweight_provider_when_paddle_is_unavailable(monkeypatch):
    expected = image_ocr.OcrResult(
        text="Readable text",
        markdown="Readable text",
        provider="tesseract",
        model="Tesseract OCR",
    )
    monkeypatch.setattr(image_ocr, "_paddle_is_available", lambda: False)
    monkeypatch.setattr(image_ocr, "_extract_with_tesseract", lambda *args, **kwargs: expected)

    result = image_ocr.extract_image_text(
        _png_bytes(),
        filename="clipboard.png",
        provider="auto",
    )

    assert result == expected


def test_rejects_non_image_extension_before_running_provider():
    with pytest.raises(image_ocr.OcrInputError, match="PNG, JPG"):
        image_ocr.extract_image_text(
            _png_bytes(),
            filename="clipboard.txt",
            provider="tesseract",
        )


def test_rejects_unsupported_provider():
    with pytest.raises(image_ocr.OcrInputError, match="OCR_PROVIDER"):
        image_ocr.extract_image_text(
            _png_bytes(),
            filename="clipboard.png",
            provider="unknown",
        )


def test_validation_does_not_require_an_ocr_provider():
    assert image_ocr.validate_image_input(_png_bytes(), "visual-only.png") is None
