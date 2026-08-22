from __future__ import annotations

import re


_REDIRECT_RESPONSE_RE = re.compile(
    r"\b(?:"
    r"you can find .{0,80} by visiting|"
    r"visit (?:one of|the following)|"
    r"check (?:one of|these|the following) (?:sites|platforms|sources|websites)|"
    r"these platforms provide|"
    r"recommended sources|"
    r"reliable sources(?: include|:)|"
    r"please check (?:one of|the|these)|"
    r"i (?:do not|don't) have access to (?:live|real[ -]?time)|"
    r"i (?:cannot|can't) access (?:live|real[ -]?time)"
    r")\b",
    re.IGNORECASE | re.DOTALL,
)


def live_answer_needs_repair(answer: str) -> bool:
    return not answer.strip() or bool(_REDIRECT_RESPONSE_RE.search(answer))


def live_repair_instruction(label: str, *, evidence_available: bool) -> str:
    evidence_rule = (
        "The retrieved web context contains evidence, so extract and report its concrete value, status, result, condition, or event."
        if evidence_available
        else "If the retrieved context contains no concrete live fact, say exactly what could not be verified."
    )
    return (
        f"Rewrite the previous draft for this {label} request. The draft is invalid because it redirects the user instead of answering. "
        f"{evidence_rule} Lead with the direct update. Include units, currency, score, timestamp, location, or status when supported. "
        "Cite the exact supporting URL inline. Do not recommend websites, describe platforms, or provide a directory of places to check."
    )


def unavailable_live_answer(label: str) -> str:
    return (
        f"I couldn't verify a concrete **{label.lower()}** from the live evidence retrieved for this request. "
        "I won't replace the missing update with a list of websites; please retry when live retrieval is available."
    )
