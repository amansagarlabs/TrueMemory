from services.openrouter import _affordable_retry_tokens, _normalized_usage


def test_affordable_retry_tokens_leaves_safety_margin() -> None:
    message = (
        "This request requires more credits, or fewer max_tokens. "
        "You requested up to 2048 tokens, but can only afford 818."
    )

    assert _affordable_retry_tokens(message, 2048) == 736


def test_affordable_retry_tokens_accepts_comma_separators() -> None:
    assert _affordable_retry_tokens("can only afford 1,200", 2048) == 1080


def test_affordable_retry_tokens_ignores_unrelated_errors() -> None:
    assert _affordable_retry_tokens("Provider unavailable", 2048) is None


def test_normalized_usage_accepts_openrouter_shape() -> None:
    assert _normalized_usage(
        {
            "prompt_tokens": 120,
            "completion_tokens": 30,
            "total_tokens": 150,
        }
    ) == {
        "prompt_tokens": 120,
        "completion_tokens": 30,
        "total_tokens": 150,
    }


def test_normalized_usage_accepts_input_output_aliases() -> None:
    assert _normalized_usage({"input_tokens": 12, "output_tokens": 5}) == {
        "prompt_tokens": 12,
        "completion_tokens": 5,
        "total_tokens": 17,
    }
