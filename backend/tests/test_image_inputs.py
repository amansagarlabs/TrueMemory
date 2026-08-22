from base64 import b64decode
from io import BytesIO

from PIL import Image

from services.image_inputs import attach_image_content, build_image_content
from services.model_registry import resolve_openrouter_model


def _image_bytes(image_format: str) -> bytes:
    image = Image.new("RGB", (24, 16), "#d97706")
    buffer = BytesIO()
    image.save(buffer, format=image_format)
    return buffer.getvalue()


def test_build_image_content_sends_actual_png_pixels():
    blocks = build_image_content(
        _image_bytes("PNG"),
        filename="diagram.png",
        index=1,
    )

    assert blocks[0] == {"type": "text", "text": "Attached image 1: diagram.png"}
    data_url = blocks[1]["image_url"]["url"]
    assert data_url.startswith("data:image/png;base64,")
    assert b64decode(data_url.split(",", 1)[1]).startswith(b"\x89PNG")


def test_build_image_content_transcodes_bmp_for_openrouter():
    blocks = build_image_content(
        _image_bytes("BMP"),
        filename="scan.bmp",
        index=1,
    )

    data_url = blocks[1]["image_url"]["url"]
    assert data_url.startswith("data:image/png;base64,")
    assert b64decode(data_url.split(",", 1)[1]).startswith(b"\x89PNG")


def test_attach_image_content_builds_a_multipart_user_message():
    messages = [
        {"role": "system", "content": "Be helpful."},
        {"role": "user", "content": "What is visible?"},
    ]
    image_blocks = build_image_content(
        _image_bytes("PNG"),
        filename="photo.png",
        index=1,
    )

    result = attach_image_content(messages, image_blocks)

    assert messages[1]["content"] == "What is visible?"
    assert result[1]["content"][0] == {"type": "text", "text": "What is visible?"}
    assert result[1]["content"][-1]["type"] == "image_url"


def test_text_model_selection_uses_vision_fallback_for_images():
    model = resolve_openrouter_model(
        "deepseek-v3.2",
        has_images=True,
        default_model="deepseek/deepseek-v3.2",
        vision_model="openrouter/free",
    )

    assert model == "openrouter/free"


def test_verified_vision_selection_is_preserved_for_images():
    model = resolve_openrouter_model(
        "kimi-k2.5",
        has_images=True,
        default_model="deepseek/deepseek-v3.2",
        vision_model="openrouter/free",
    )

    assert model == "moonshotai/kimi-k2.5:free"
