"""Conservative, preview-first extraction for user-shared memory notes."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from hashlib import sha256


@dataclass(frozen=True)
class NoteCandidate:
    key: str
    content: str
    memory_type: str
    confidence: float
    subject: str
    locator: str
    source_type: str = "memory_note"


def extract_note_candidates(text: str) -> list[dict]:
    candidates: list[NoteCandidate] = []
    for index, sentence in enumerate(re.split(r"(?<=[.!?])\s+|\n+", text.strip())):
        s = sentence.strip(" -•\t")
        if not s:
            continue
        locator = f"segment-{index + 1}"
        negated = bool(re.search(r"\b(?:don't|do not|doesn't|not|never|no longer)\b", s, re.I))
        patterns = [
            (r"\b(?:my name is|i am called)\s+([A-Z][\w-]+)", "name", "fact", "user", 0.97),
            (r"\b(?:i am|i'm)\s+(\d{1,3})\s*(?:years? old)?\b", "age", "fact", "user", 0.97),
            (r"\b(?:i prefer|my preference is)\s+(.+)", "preference", "preference", "user", 0.92),
            (r"\b(?:i am building|the project is)\s+([A-Z][\w-]+)", "project.name", "fact", "project", 0.9),
            (r"\b([A-Z][\w-]+)\s+is\s+(\d{1,3})\b", "person.age", "fact", "person", 0.96),
            (r"\b([A-Z][\w-]+)\s+prefers\s+(TypeScript|Python|Next\.js)\b", "person.preference.language", "preference", "person", 0.94),
            (r"\b(?:uses|use)\s+(PostgreSQL|Milvus|MongoDB|Next\.js|FastAPI|TypeScript|Python)\b", "project.stack", "fact", "project", 0.9),
        ]
        for pattern, key, kind, subject, confidence in patterns:
            match = re.search(pattern, s, re.I)
            if not match or negated:
                continue
            value = match.group(1).strip().rstrip(".")
            actual_key = key if key != "preference" else f"user.preference.{value.lower().replace(' ', '_')}"
            if key == "person.age":
                actual_key, value = f"{match.group(1)}.age", match.group(2)
            elif key == "person.preference.language":
                actual_key, value = f"{match.group(1)}.preference.language", match.group(2)
            content = f"{actual_key} = {value}"
            candidates.append(asdict(NoteCandidate(actual_key, content, kind, confidence, subject, locator)))
            if key != "project.stack":
                break
    # Stable semantic deduplication within one note.
    unique = {sha256(c["content"].casefold().encode()).hexdigest(): c for c in candidates}
    return list(unique.values())


def extract_note_relationships(text: str) -> list[dict]:
    """Return only explicit subject→uses→entity relationships."""
    relationships = []
    for index, sentence in enumerate(re.split(r"(?<=[.!?])\s+|\n+", text.strip())):
        match = re.search(r"\b([A-Z][\w-]+)\s+(?:uses|use)\s+(.+?)\.?$", sentence.strip())
        if not match:
            continue
        subject = match.group(1)
        for entity in re.split(r",|\band\b", match.group(2), flags=re.I):
            value = entity.strip(" .")
            if value and re.fullmatch(r"[A-Za-z][A-Za-z0-9.+#-]{1,40}", value):
                relationships.append({"from": subject, "type": "uses", "to": value, "kind": "relationship", "locator": f"segment-{index + 1}"})
    return relationships


def render_memory_notes(items: list[dict]) -> str:
    """Render selected semantic memories as lossy, human-readable notes."""
    lines: list[str] = []
    for item in items:
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        match = re.match(r"^([\w.]+)\s*=\s*(.+)$", content)
        if match:
            key, value = match.groups()
            if key == "age": lines.append(f"I am {value} years old.")
            elif key.startswith("user.preference."): lines.append(f"I prefer {value}.")
            elif key.startswith("project."): lines.append(f"The project {key.removeprefix('project.')} is {value}.")
            else: lines.append(f"{key} is {value}.")
        else:
            lines.append(content.rstrip("." ) + ".")
    return "\n".join(lines)
