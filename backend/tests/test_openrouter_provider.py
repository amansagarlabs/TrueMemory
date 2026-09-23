from services.providers.openrouter_provider import OpenRouterProvider


def test_openrouter_provider_normalizes_legacy_aliases() -> None:
    provider = OpenRouterProvider(api_key="test", model="openrouter-free")

    assert provider._model == "openrouter/free"
    assert provider._request_model("openrouter-free") == "openrouter/free"
    assert provider._request_model("openrouter::openrouter-free") == "openrouter/free"


def test_openrouter_provider_uses_canonical_default_for_missing_model() -> None:
    provider = OpenRouterProvider(api_key="test", model="openrouter/free")

    assert provider._request_model(None) == "openrouter/free"


def test_openrouter_provider_preserves_explicit_model_ids() -> None:
    provider = OpenRouterProvider(api_key="test", model="openai/gpt-4o")

    assert provider._model == "openai/gpt-4o"
    assert provider._request_model("qwen/qwen3-coder:free") == "qwen/qwen3-coder:free"
