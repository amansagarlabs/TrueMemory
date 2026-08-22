from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def answer_runtime_question(question: str, timezone_name: str) -> str:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")
        timezone_name = "UTC"
    now = datetime.now(zone)
    lowered = question.lower()
    if "time" in lowered:
        clock = now.strftime("%I:%M %p").lstrip("0")
        date = f"{now.strftime('%A, %B')} {now.day}, {now.year}"
        return f"It is {clock} on {date} in {timezone_name}."
    if "day" in lowered and "date" not in lowered:
        return f"Today is {now.strftime('%A')} in {timezone_name}."
    return f"Today is {now.strftime('%A, %B')} {now.day}, {now.year} in {timezone_name}."
