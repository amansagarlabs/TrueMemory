"""
AI Scraping Agent — LLM-powered intelligent data extraction.
Takes a URL + instruction, scrapes the page, uses LLM to extract/transform data.
"""

import os
import httpx
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Reuse existing crawl utilities
from .crawl_service import (
    scrape_url,
    _browser_headers,
    _jina_scrape,
    _httpx_scrape,
)
from .openrouter import stream_ollama_completion

# LLM endpoint
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def _ollama_extract(
    *,
    messages: list[dict[str, str]],
    output_format: str,
) -> str:
    """Use the configured local model when the paid provider is unavailable."""
    base_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "qwen3-coder:30b")
    parts: list[str] = []
    async for token in stream_ollama_completion(
        base_url=base_url,
        model=model,
        messages=messages,
        max_tokens=4096,
    ):
        parts.append(token)
    return "".join(parts)


def _get_llm_headers() -> dict:
    """Headers for OpenRouter LLM calls."""
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://Kontext.local",
        "X-Title": "Kontext Crawl",
    }
    return headers


EXTRACTION_SYSTEM_PROMPT = """You are an intelligent web scraping agent. Your job is to extract and transform data from web pages according to the user's instructions.

Rules:
1. Extract ONLY the data the user asks for.
2. Return valid JSON when possible.
3. If the user asks for a list, return an array.
4. If the user asks for structured data, use clear field names.
5. Be concise — no extra commentary, just the extracted data.
6. If data is not found, return null or empty array for that field.
7. Preserve important context like dates, numbers, and names exactly as they appear.
8. If the page is behind a paywall or blocked, say so clearly.

Output format:
- If the user asks for JSON, return a JSON code block.
- If the user asks for markdown, return markdown.
- Otherwise, return the most useful format for the request."""


async def scrape_and_extract(
    url: str,
    instruction: str,
    output_format: str = "json",
    model: str = "openrouter/free",
) -> dict[str, Any]:
    """
    Main agent flow: scrape URL → extract content → LLM processes instruction → returns result.

    Args:
        url: Target URL to scrape
        instruction: What to extract (e.g. "Extract all product names and prices as JSON")
        output_format: "json", "markdown", "text", or "auto"
        model: OpenRouter model to use for LLM processing

    Returns:
        {
            "url": str,
            "instruction": str,
            "result": Any,       # LLM-extracted data
            "raw_content": str,  # Original scraped content
            "raw_length": int,
            "model": str,
            "tokens_used": int
        }
    """
    logger.info(f"Agent: scraping {url} with instruction: {instruction[:80]}...")

    # Step 1: Scrape the URL
    raw = None
    try:
        raw = await scrape_url(url, ["markdown"], timeout=30.0)
    except Exception:
        pass

    if not raw:
        # Fallback to httpx
        raw = await _httpx_scrape(url, ["text"], timeout=30.0)

    if not raw:
        return {
            "url": url,
            "instruction": instruction,
            "error": "Failed to scrape URL",
            "result": None,
            "raw_content": "",
            "raw_length": 0,
            "model": model,
            "tokens_used": 0,
        }

    # Extract raw content
    raw_content = ""
    if isinstance(raw, dict):
        raw_content = raw.get("markdown", "") or raw.get("text", "") or raw.get("content", "")
        # Truncate if too long (keep ~80k chars for context window)
        if len(raw_content) > 80000:
            raw_content = raw_content[:80000] + "\n\n[Content truncated...]"
    elif isinstance(raw, str):
        raw_content = raw[:80000]

    raw_length = len(raw_content)

    if not raw_content.strip():
        return {
            "url": url,
            "instruction": instruction,
            "error": "Scraped content is empty",
            "result": None,
            "raw_content": "",
            "raw_length": 0,
            "model": model,
            "tokens_used": 0,
        }

    # Step 2: Send to LLM for extraction
    logger.info(f"Agent: sending {raw_length} chars to LLM ({model})")

    format_hint = ""
    if output_format == "json":
        format_hint = "\n\nReturn your answer as a JSON code block."
    elif output_format == "markdown":
        format_hint = "\n\nReturn your answer as markdown."
    elif output_format == "text":
        format_hint = "\n\nReturn your answer as plain text."

    user_prompt = f"""URL: {url}

Page Content:
---
{raw_content}
---

Instruction: {instruction}{format_hint}"""

    messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers=_get_llm_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0.1,
                    "max_tokens": 4096,
                },
            )
            resp.raise_for_status()
            llm_data = resp.json()

        # Parse LLM response
        choice = llm_data.get("choices", [{}])[0]
        message = choice.get("message", {})
        result_text = message.get("content", "")
        tokens_used = llm_data.get("usage", {}).get("total_tokens", 0)

        # Try to parse JSON from result
        result = result_text
        if output_format == "json" or output_format == "auto":
            result = _try_parse_json(result_text)

        logger.info(f"Agent: completed, {tokens_used} tokens used")

        return {
            "url": url,
            "instruction": instruction,
            "result": result,
            "raw_content": raw_content[:5000],  # Truncate for response
            "raw_length": raw_length,
            "model": model,
            "tokens_used": tokens_used,
        }

    except httpx.HTTPStatusError as e:
        error_body = ""
        try:
            error_body = e.response.text[:500]
        except Exception:
            pass
        logger.error(f"Agent LLM error {e.response.status_code}: {error_body}")
        try:
            result_text = await _ollama_extract(messages=messages, output_format=output_format)
            result = _try_parse_json(result_text) if output_format in {"json", "auto"} else result_text
            return {
                "url": url,
                "instruction": instruction,
                "result": result,
                "raw_content": raw_content[:5000],
                "raw_length": raw_length,
                "model": os.getenv("OLLAMA_MODEL", "qwen3-coder:30b"),
                "provider": "ollama",
                "tokens_used": 0,
            }
        except Exception as fallback_error:
            logger.error(f"Local Ollama extraction fallback failed: {fallback_error}")
        return {
            "url": url,
            "instruction": instruction,
            "error": f"LLM error: {e.response.status_code}",
            "result": None,
            "raw_content": raw_content[:5000],
            "raw_length": raw_length,
            "model": model,
            "tokens_used": 0,
        }
    except Exception as e:
        logger.error(f"Agent error: {e}")
        try:
            result_text = await _ollama_extract(messages=messages, output_format=output_format)
            result = _try_parse_json(result_text) if output_format in {"json", "auto"} else result_text
            return {
                "url": url,
                "instruction": instruction,
                "result": result,
                "raw_content": raw_content[:5000],
                "raw_length": raw_length,
                "model": os.getenv("OLLAMA_MODEL", "qwen3-coder:30b"),
                "provider": "ollama",
                "tokens_used": 0,
            }
        except Exception as fallback_error:
            logger.error(f"Local Ollama extraction fallback failed: {fallback_error}")
        return {
            "url": url,
            "instruction": instruction,
            "error": str(e),
            "result": None,
            "raw_content": raw_content[:5000],
            "raw_length": raw_length,
            "model": model,
            "tokens_used": 0,
        }


async def batch_extract(
    urls: list[str],
    instruction: str,
    output_format: str = "json",
    model: str = "openrouter/free",
) -> dict[str, Any]:
    """
    Batch extraction: scrape multiple URLs and extract data from each.

    Returns:
        {
            "instruction": str,
            "results": [{"url": str, "result": Any, "error": str|None}, ...],
            "total_urls": int,
            "successful": int,
            "failed": int,
            "total_tokens": int,
        }
    """
    results = []
    total_tokens = 0
    successful = 0
    failed = 0

    for url in urls[:20]:  # Cap at 20 URLs
        r = await scrape_and_extract(url, instruction, output_format, model)
        results.append({
            "url": r["url"],
            "result": r.get("result"),
            "error": r.get("error"),
        })
        total_tokens += r.get("tokens_used", 0)
        if r.get("error"):
            failed += 1
        else:
            successful += 1

    return {
        "instruction": instruction,
        "results": results,
        "total_urls": len(urls[:20]),
        "successful": successful,
        "failed": failed,
        "total_tokens": total_tokens,
    }


def _try_parse_json(text: str) -> Any:
    """Try to extract and parse JSON from LLM response text."""
    import re

    # Try code block first
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try raw JSON
    match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Return as-is
    return text
