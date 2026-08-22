"""Safe frontend model aliases and image-capability routing."""

# OpenRouter's capability-aware free router. It selects an available free
# model for each request (including multimodal requests). Free capacity can be
# rate-limited, so callers should surface a retryable error when it is
# temporarily unavailable.
OPENROUTER_FREE_MODEL = "openrouter/free"
OPENROUTER_FREE_VISION_MODEL = "openrouter/free"

LOCAL_MODEL_ALIASES = {
    "ollama-llama3.1": "llama3.1",
    "local-qwen2.5": "",
}


OPENROUTER_MODEL_ALIASES = {
    "openrouter-free": OPENROUTER_FREE_MODEL,
    "openrouter-auto": OPENROUTER_FREE_MODEL,
    "openrouter/free": OPENROUTER_FREE_MODEL,
    "free": OPENROUTER_FREE_MODEL,
    "qwen3-coder": "qwen/qwen3-coder:free",
    "gemini-flash": "google/gemini-2.5-flash",
    "deepseek-v3.2": "deepseek/deepseek-v3.2:free",
    "kimi-k2.5": "moonshotai/kimi-k2.5:free",
    "nvidia-nemotron": "nvidia/nemotron-3-super-120b-a12b:free",
    "gpt-oss-20b": "openai/gpt-oss-20b:free",
    "gpt-oss-120b": "openai/gpt-oss-120b:free",
    "grok-4.1-fast": "x-ai/grok-4.1-fast:free",
    "qwen3-14b": "qwen/qwen3-14b:free",
}

# Only aliases verified to accept general image input belong here. Text-only
# selections automatically use the configured vision fallback for image turns.
VISION_MODEL_ALIASES = {"kimi-k2.5", "openrouter-free", "openrouter-auto", "free", "qwen3-coder", "gemini-flash"}


def is_local_model(selected_model: str | None) -> bool:
    return (selected_model or "").strip().lower() in LOCAL_MODEL_ALIASES


def resolve_local_model(selected_model: str | None, default_model: str) -> str:
    return LOCAL_MODEL_ALIASES.get((selected_model or "").strip().lower()) or default_model


def resolve_openrouter_model(
    selected_model: str | None,
    *,
    has_images: bool,
    default_model: str,
    vision_model: str,
) -> str:
    """Resolve a UI alias without allowing arbitrary provider model injection."""
    normalized = (selected_model or "").strip().lower()
    if normalized in LOCAL_MODEL_ALIASES:
        return default_model
    if has_images and normalized not in VISION_MODEL_ALIASES:
        return vision_model.strip() or default_model
    resolved = OPENROUTER_MODEL_ALIASES.get(normalized)
    if resolved:
        return resolved
    # Dynamic catalog IDs are accepted only when OpenRouter marks them free.
    if ":free" in normalized and "/" in normalized:
        return normalized
    return default_model
