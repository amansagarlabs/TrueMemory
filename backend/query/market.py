from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


_MARKET_PRICE_REQUEST_RE = re.compile(
    r"\b(?:current|latest|live|today(?:'s)?)?\s*(?:market|share|stock)?\s*price\b|\btrading\s+at\b|\bstock\s+quote\b",
    re.IGNORECASE,
)
_CURRENCY_VALUE_RE = re.compile(
    r"(?P<currency>₹|Rs\.?|INR|US\$|USD|\$|€|EUR|£|GBP)\s*(?P<value>\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)",
    re.IGNORECASE,
)


def is_market_price_request(question: str) -> bool:
    return bool(_MARKET_PRICE_REQUEST_RE.search(question))


def build_verified_market_price_answer(
    question: str,
    sources: list[dict],
    timezone_name: str,
) -> str | None:
    """Return a direct quote answer for a market-price request.

    The answer is deterministic so an evidence failure can never degrade into
    a directory of finance websites.
    """
    if not is_market_price_request(question):
        return None

    company = _company_label(question, sources)
    for source in sources:
        evidence = " ".join(
            str(source.get(field) or "")
            for field in ("snippet", "quote", "content", "title")
        )
        match = _CURRENCY_VALUE_RE.search(evidence)
        url = str(source.get("url") or "")
        if not match or not url.startswith(("http://", "https://")):
            continue

        currency = _currency_symbol(match.group("currency"))
        value = match.group("value")
        domain = str(source.get("domain") or urlparse(url).hostname or "market quote").removeprefix("www.")
        retrieved_at = _retrieved_at_label(timezone_name)
        return (
            f"**{company} is {currency}{value} per share** on the latest quote AmanCrawlretrieved "
            f"{retrieved_at} from [{domain}]({url}).\n\n"
            "Market prices can move during trading, so treat this as the retrieved quote rather than a continuously updating ticker."
        )

    return (
        f"I couldn't verify a current numeric price for **{company}** from AmanCrawl's retrieved evidence right now. "
        "I won't substitute a list of finance websites; please retry when live retrieval is available."
    )


def _currency_symbol(value: str) -> str:
    normalized = value.lower().rstrip(".")
    return {
        "rs": "₹",
        "inr": "₹",
        "₹": "₹",
        "us$": "$",
        "usd": "$",
        "$": "$",
        "eur": "€",
        "€": "€",
        "gbp": "£",
        "£": "£",
    }.get(normalized, value)


def _company_label(question: str, sources: list[dict]) -> str:
    patterns = (
        r"\bprice\s+(?:of|for)\s+(.+?)(?:\?|$)",
        r"^(.+?)\s+(?:market\s+|share\s+|stock\s+)?price\b",
    )
    for pattern in patterns:
        match = re.search(pattern, question.strip(), re.IGNORECASE)
        if match:
            label = re.sub(r"\b(?:today|now|current|latest|live)\b", "", match.group(1), flags=re.IGNORECASE)
            label = re.sub(r"\s+", " ", label).strip(" -.,")
            if label:
                return label.title()

    for source in sources:
        title = str(source.get("title") or "")
        label = re.split(r"\b(?:share|stock)\s+price\b", title, maxsplit=1, flags=re.IGNORECASE)[0]
        label = label.strip(" -|,")
        if label:
            return label
    return "The requested security"


def _retrieved_at_label(timezone_name: str) -> str:
    try:
        now = datetime.now(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError:
        now = datetime.now(ZoneInfo("UTC"))
    time_label = now.strftime("%I:%M %p").lstrip("0")
    zone_label = now.tzname() or timezone_name
    return f"on {now.strftime('%B %d, %Y')} at {time_label} {zone_label}"
