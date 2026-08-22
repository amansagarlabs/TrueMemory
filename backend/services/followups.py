"""Generate concise follow-up questions grounded in the completed answer."""

from __future__ import annotations

import json
import logging
import re

from services.openrouter import complete_chat_completion

logger = logging.getLogger(__name__)

_GENERIC_FOLLOWUP_PATTERNS = (
    re.compile(r"^can you explain .+ in simple terms\?$", re.IGNORECASE),
    re.compile(r"^what are the most important facts about .+\?$", re.IGNORECASE),
    re.compile(r"^how does .+ work in practice\?$", re.IGNORECASE),
    re.compile(r"^what are common misconceptions about .+\?$", re.IGNORECASE),
)


def _topic_from_question(question: str) -> str:
    topic = re.sub(
        r"^(?:what|who)\s+(?:is|are|was|were)\s+|^tell me about\s+|^explain\s+",
        "",
        question.strip(),
        flags=re.IGNORECASE,
    )
    topic = re.sub(r"[?!.,]+$", "", topic).strip()
    return topic[:80] or "this topic"


def _answer_subject(answer: str) -> str | None:
    plain = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", answer)
    plain = plain.replace("**", "")
    heading = re.search(
        r"(?:^|\n)\s*(?:#{1,3}\s+)?"
        r"(?:assessment|overview|summary|profile)\s+(?:of\s+)?(?:the\s+)?"
        r"([^.\n]{3,80})",
        plain,
        re.IGNORECASE,
    )
    if heading:
        return heading.group(1).strip(" :")

    introductions = re.finditer(
        r"(?:^|\n)\s*(?:The\s+)?"
        r"([A-Z][\w.'’()-]+(?:\s+[A-Z][\w.'’()-]+){1,6})\s+(?:is|was)\b",
        plain,
    )
    for introduction in introductions:
        subject = introduction.group(1).strip()
        if subject.split()[0].lower() not in {"how", "what", "why", "when", "where", "who"}:
            return subject
    return None


def _person_subject(answer: str) -> str | None:
    plain = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", answer).replace("**", "")
    match = re.search(
        r"(?:^|\n)\s*(?:The\s+)?"
        r"(?P<subject>[A-Z][\w.'’()-]+(?:\s+[A-Z][\w.'’()-]+){1,5})\s+"
        r"(?:is|was)\s+(?:an?\s+)?(?:[\w-]+\s+){0,4}"
        r"(?:cricketer|player|athlete|politician|scientist|actor|actress|author|writer|"
        r"minister|jurist|economist|artist|musician|entrepreneur|engineer|designer)\b",
        plain,
        re.IGNORECASE,
    )
    return match.group("subject").strip() if match else None


def _clean_followup(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" \"'")
    if not cleaned or len(cleaned) < 8 or len(cleaned) > 120:
        return None
    if any(pattern.match(cleaned) for pattern in _GENERIC_FOLLOWUP_PATTERNS):
        return None
    return cleaned if cleaned.endswith("?") else f"{cleaned}?"


def parse_followups(value: str) -> list[str]:
    """Parse and validate a model-produced JSON follow-up list."""
    candidate = value.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)
    start, end = candidate.find("["), candidate.rfind("]")
    if start >= 0 and end > start:
        candidate = candidate[start : end + 1]

    try:
        decoded = json.loads(candidate)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if isinstance(decoded, dict):
        decoded = decoded.get("followups")
    if not isinstance(decoded, list):
        return []

    output: list[str] = []
    seen: set[str] = set()
    for item in decoded:
        cleaned = _clean_followup(item)
        key = cleaned.lower() if cleaned else ""
        if not cleaned or key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
        if len(output) == 4:
            break
    return output


def fallback_followups(question: str, answer: str) -> list[str]:
    """Create topic-aware suggestions when the optional model call fails."""
    normalized_question = question.strip().lower()
    if re.fullmatch(r"(?:h+i+|hello|hey|thanks|thank you)[!. ]*", normalized_question):
        return []

    answer_subject = _answer_subject(answer)
    person_subject = _person_subject(answer)
    topic = person_subject or answer_subject or _topic_from_question(question)
    answer_text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", answer)
    lowered = answer_text.lower()
    asks_who = bool(re.match(r"^\s*who\s+(?:is|was)\b", question, re.IGNORECASE))
    describes_organization = bool(
        re.search(r"\b(?:party|movement|organization|company|protest|demonstration)\b", lowered[:500])
    )
    is_person = bool(person_subject or (asks_who and not describes_organization))

    suggestions: list[str] = []
    if is_person:
        if re.search(r"\b(?:record|centur|award|achievement|title)\w*\b", lowered):
            suggestions.append(f"Which of {topic}'s achievements are the most significant?")
        if re.search(r"\b(?:captain|leader|leadership|minister|served)\w*\b", lowered):
            suggestions.append(f"How did {topic}'s leadership role change over time?")
        if re.search(r"\b(?:club|team|ipl|league|franchise)\w*\b|\bplayed for\b", lowered):
            suggestions.append(f"How did {topic} perform for the teams mentioned here?")
        if re.search(r"\b(?:born|early life|childhood|education)\b", lowered):
            suggestions.append(f"What shaped {topic}'s early career?")
        suggestions.extend(
            [
                f"What were the major turning points in {topic}'s career?",
                f"What recent developments about {topic} are missing from this overview?",
            ]
        )
    elif re.search(r"\b(?:protest|demonstration|movement)\b", lowered):
        display_topic = topic if topic.lower().startswith("the ") else f"the {topic}"
        suggestions.extend(
            [
                f"What concrete outcome would show that {display_topic} succeeded?",
                f"How have officials responded to {display_topic}?",
                f"Which claims about {display_topic} are independently verified?",
                f"What happened after {display_topic}?",
            ]
        )
    elif re.search(r"\b(?:vs\.?|versus|compare|difference)\b", question, re.IGNORECASE):
        suggestions.extend(
            [
                "Can you compare the main differences in a compact table?",
                "Which difference matters most in real-world use?",
                "What trade-offs are easy to overlook?",
                "Which option fits different types of users?",
            ]
        )
    else:
        if re.search(r"\b(?:because|therefore|means|causes?|results? in)\b", lowered):
            suggestions.append("What evidence best supports the main conclusion?")
        if re.search(r"\b(?:step|process|first|then|finally)\b", lowered):
            suggestions.append("Can you turn the process into a short checklist?")
        suggestions.extend(
            [
                "Which point in this answer deserves a deeper explanation?",
                "Can you give a concrete example based on this answer?",
                "What assumptions or limitations should I know about?",
                "How would this change in a different situation?",
            ]
        )

    output: list[str] = []
    seen: set[str] = set()
    for suggestion in suggestions:
        cleaned = _clean_followup(suggestion)
        key = cleaned.lower() if cleaned else ""
        if not cleaned or key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
        if len(output) == 4:
            break
    return output


async def generate_answer_followups(
    *,
    api_key: str,
    model: str,
    question: str,
    answer: str,
) -> list[str]:
    """Use the active answer model, with a deterministic fallback."""
    fallback = fallback_followups(question, answer)
    if not fallback and len(answer.strip()) < 80:
        return []

    messages = [
        {
            "role": "system",
            "content": (
                "Generate four concise follow-up questions grounded in the specific answer. "
                "Each question must explore a different concrete fact, implication, comparison, "
                "or unresolved detail from the answer. Never use generic templates such as "
                "'explain in simple terms', 'most important facts', 'work in practice', or "
                "'common misconceptions'. Do not ask how a person 'works'. Return only a JSON "
                "array of four strings. Keep each question under 16 words."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Original question:\n{question[:600]}\n\n"
                f"Completed answer:\n{answer[:5000]}"
            ),
        },
    ]
    try:
        raw = await complete_chat_completion(
            api_key=api_key,
            model=model,
            messages=messages,
            max_tokens=180,
        )
        generated = parse_followups(raw)
    except Exception as exc:
        logger.info("Dynamic follow-up generation fell back locally: %s", exc)
        generated = []

    if len(generated) >= 3:
        return generated[:4]

    combined = [*generated, *fallback]
    output: list[str] = []
    seen: set[str] = set()
    for item in combined:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
        if len(output) == 4:
            break
    return output
