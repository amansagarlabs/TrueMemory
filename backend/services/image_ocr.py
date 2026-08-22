"""Lazy, resource-aware OCR providers for pasted and uploaded chat images."""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
import shutil


SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 32_000_000


class OcrInputError(ValueError):
    """The supplied file is not a safe, supported image."""


class OcrUnavailableError(RuntimeError):
    """No configured OCR provider can process the image."""


@dataclass(frozen=True)
class OcrResult:
    text: str
    markdown: str
    provider: str
    model: str
    language: str = "auto"
    confidence: float | None = None
    warnings: list[str] = field(default_factory=list)


_paddle_pipeline = None
_paddle_pipeline_key: tuple[str, str] | None = None
_paddle_lock = Lock()


def extract_image_text(
    image_bytes: bytes,
    *,
    filename: str,
    provider: str = "auto",
    language: str = "eng",
    tesseract_cmd: str = "",
    paddle_device: str = "cpu",
    paddle_pipeline_version: str = "v1.6",
) -> OcrResult:
    """Extract readable text while loading heavyweight providers only on demand."""
    normalized_provider = provider.strip().lower() or "auto"
    if normalized_provider not in {"auto", "tesseract", "paddleocr-vl"}:
        raise OcrInputError("OCR_PROVIDER must be auto, tesseract, or paddleocr-vl.")

    image = _validated_image(image_bytes, filename)

    if normalized_provider == "paddleocr-vl":
        return _extract_with_paddle_vl(
            image,
            filename=filename,
            device=paddle_device,
            pipeline_version=paddle_pipeline_version,
        )

    if normalized_provider == "auto" and _paddle_is_available():
        try:
            return _extract_with_paddle_vl(
                image,
                filename=filename,
                device=paddle_device,
                pipeline_version=paddle_pipeline_version,
            )
        except OcrUnavailableError:
            # A partially installed VLM must not break the lightweight fallback.
            pass

    return _extract_with_tesseract(
        image,
        language=language,
        configured_command=tesseract_cmd,
    )


def validate_image_input(image_bytes: bytes, filename: str) -> None:
    """Validate an image without requiring any OCR provider to be installed."""
    _validated_image(image_bytes, filename)


def _validated_image(image_bytes: bytes, filename: str):
    if not image_bytes:
        raise OcrInputError("The image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise OcrInputError("Images must be 15 MB or smaller.")
    if Path(filename).suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
        raise OcrInputError("Use a PNG, JPG, WebP, BMP, or TIFF image.")

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError

        image = Image.open(BytesIO(image_bytes))
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise OcrInputError("The image dimensions are too large for OCR.")
        image.load()
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")
    except OcrInputError:
        raise
    except (ImportError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise OcrInputError("The uploaded file is not a readable image.") from exc


def _paddle_is_available() -> bool:
    try:
        import paddleocr  # noqa: F401
    except ImportError:
        return False
    return True


def _paddle_pipeline_for(device: str, pipeline_version: str):
    global _paddle_pipeline, _paddle_pipeline_key
    key = (device, pipeline_version)
    if _paddle_pipeline is not None and _paddle_pipeline_key == key:
        return _paddle_pipeline

    try:
        from paddleocr import PaddleOCRVL
    except ImportError as exc:
        raise OcrUnavailableError(
            'PaddleOCR-VL is not installed. Install the optional "paddleocr[doc-parser]" runtime.'
        ) from exc

    try:
        _paddle_pipeline = PaddleOCRVL(
            device=device,
            pipeline_version=pipeline_version,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
        )
        _paddle_pipeline_key = key
        return _paddle_pipeline
    except Exception as exc:
        raise OcrUnavailableError("PaddleOCR-VL could not initialize on this device.") from exc


def _extract_with_paddle_vl(image, *, filename: str, device: str, pipeline_version: str) -> OcrResult:
    suffix = Path(filename).suffix.lower() or ".png"
    with _paddle_lock, TemporaryDirectory(prefix="kontext-ocr-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / f"input{suffix}"
        output_path = temp_path / "output"
        output_path.mkdir()
        image.save(input_path)

        pipeline = _paddle_pipeline_for(device, pipeline_version)
        try:
            results = list(pipeline.predict(str(input_path)))
            for result in results:
                result.save_to_markdown(save_path=output_path)
            markdown_files = sorted(output_path.rglob("*.md"))
            markdown = "\n\n".join(
                path.read_text(encoding="utf-8", errors="replace").strip()
                for path in markdown_files
            ).strip()
        except Exception as exc:
            raise OcrUnavailableError("PaddleOCR-VL could not read this image.") from exc

    if not markdown:
        return OcrResult(
            text="",
            markdown="",
            provider="paddleocr-vl",
            model=f"PaddleOCR-VL-{pipeline_version.removeprefix('v')}",
            warnings=["No readable text was detected."],
        )
    return OcrResult(
        text=markdown,
        markdown=markdown,
        provider="paddleocr-vl",
        model=f"PaddleOCR-VL-{pipeline_version.removeprefix('v')}",
    )


def _extract_with_tesseract(image, *, language: str, configured_command: str) -> OcrResult:
    try:
        import pytesseract
        from pytesseract import Output, TesseractNotFoundError
    except ImportError as exc:
        raise OcrUnavailableError("The lightweight OCR runtime is not installed.") from exc

    command = _resolve_tesseract_command(configured_command)
    if command:
        pytesseract.pytesseract.tesseract_cmd = command

    try:
        available_languages = set(pytesseract.get_languages(config=""))
        requested = [item.strip() for item in language.split("+") if item.strip()]
        selected = [item for item in requested if item in available_languages]
        resolved_language = "+".join(selected) or ("eng" if "eng" in available_languages else "")
        data = pytesseract.image_to_data(
            image,
            lang=resolved_language or None,
            config="--oem 1 --psm 3",
            output_type=Output.DICT,
        )
    except TesseractNotFoundError as exc:
        raise OcrUnavailableError(
            "Tesseract was not found. Set TESSERACT_CMD or enable PaddleOCR-VL."
        ) from exc
    except Exception as exc:
        raise OcrUnavailableError("The lightweight OCR provider could not read this image.") from exc

    lines: dict[tuple[int, int, int, int], list[str]] = {}
    confidences: list[float] = []
    count = len(data.get("text", []))
    for index in range(count):
        word = str(data["text"][index]).strip()
        if not word:
            continue
        key = (
            int(data.get("page_num", [1] * count)[index]),
            int(data.get("block_num", [0] * count)[index]),
            int(data.get("par_num", [0] * count)[index]),
            int(data.get("line_num", [0] * count)[index]),
        )
        lines.setdefault(key, []).append(word)
        try:
            confidence = float(data.get("conf", [-1] * count)[index])
            if confidence >= 0:
                confidences.append(confidence)
        except (TypeError, ValueError):
            pass

    text = "\n".join(" ".join(words) for _, words in sorted(lines.items())).strip()
    confidence = round(sum(confidences) / len(confidences), 1) if confidences else None
    warnings = [] if text else ["No readable text was detected."]
    return OcrResult(
        text=text,
        markdown=text,
        provider="tesseract",
        model="Tesseract OCR",
        language=resolved_language or "auto",
        confidence=confidence,
        warnings=warnings,
    )


def _resolve_tesseract_command(configured_command: str) -> str:
    configured = configured_command.strip()
    if configured:
        return configured
    discovered = shutil.which("tesseract")
    if discovered:
        return discovered
    windows_default = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    return str(windows_default) if windows_default.is_file() else ""
