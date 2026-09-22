"""Provider-neutral token accounting for chat and background phases."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def estimate_tokens(text: str | None) -> int:
    """Safe fallback when a provider does not return usage metadata.

    Four UTF-8-ish characters per token is intentionally conservative for
    product metering; provider-reported usage should replace this estimate.
    """
    value = str(text or "")
    return max(0, (len(value) + 3) // 4)


def record_chat_usage(*, settings, user_id: str, model: str, provider: str, input_text: str, output_text: str, endpoint: str = "/api/chat") -> dict[str, int]:
    from services.subscription_service import record_usage

    tokens_input = estimate_tokens(input_text)
    tokens_output = estimate_tokens(output_text)
    record_usage(
        settings,
        user_id=user_id,
        resource_key="ai:tokens",
        quantity=tokens_input + tokens_output,
        model=model,
        provider=provider,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        endpoint=endpoint,
        metadata={"accounting": "estimated_chars_per_token", "version": "v1"},
    )
    logger.info(
        "ai.token_usage input_tokens=%d output_tokens=%d total_tokens=%d provider=%s model=%s user_id=%s",
        tokens_input, tokens_output, tokens_input + tokens_output, provider, model, user_id,
    )
    return {"input_tokens": tokens_input, "output_tokens": tokens_output, "total_tokens": tokens_input + tokens_output}
