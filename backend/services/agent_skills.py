"""Discover and activate Agent Skills stored as SKILL.md folders.

The implementation follows the AI SDK Agent Skills progressive-disclosure
model while remaining provider-independent:

1. discover only frontmatter metadata;
2. select a relevant enabled skill for the current request;
3. load the full instructions only for selected skills.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path

BUILTIN_SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"
USER_SKILLS_ROOT = Path(__file__).resolve().parent.parent / "data" / "agent-skills"
SKILLS_ROOT = BUILTIN_SKILLS_ROOT
_FRONTMATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?")
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9-]{2,}")
_STOP_WORDS = {
    "about",
    "after",
    "also",
    "and",
    "before",
    "create",
    "for",
    "from",
    "into",
    "load",
    "needs",
    "the",
    "this",
    "use",
    "user",
    "when",
    "with",
}


@dataclass(frozen=True)
class SkillMetadata:
    name: str
    description: str
    path: str
    kind: str = "bundled"
    default_enabled: bool = True

    def public_dict(self) -> dict[str, str | bool]:
        result = asdict(self)
        result.pop("path", None)
        return result


@dataclass(frozen=True)
class LoadedSkill:
    name: str
    description: str
    directory: str
    instructions: str


def _parse_frontmatter(content: str) -> dict[str, str]:
    match = _FRONTMATTER_RE.match(content)
    if not match:
        raise ValueError("SKILL.md is missing YAML frontmatter")

    values: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip("\"'")
    if not values.get("name") or not values.get("description"):
        raise ValueError("SKILL.md requires name and description")
    return values


def _strip_frontmatter(content: str) -> str:
    return _FRONTMATTER_RE.sub("", content, count=1).strip()


@lru_cache(maxsize=8)
def discover_skills(root: str | Path | None = None) -> tuple[SkillMetadata, ...]:
    roots = (
        [Path(root).resolve()]
        if root is not None
        else [USER_SKILLS_ROOT.resolve(), BUILTIN_SKILLS_ROOT.resolve()]
    )
    skills: list[SkillMetadata] = []
    seen_names: set[str] = set()
    for root_path in roots:
        if not root_path.is_dir():
            continue
        for skill_file in sorted(root_path.glob("*/SKILL.md")):
            try:
                content = skill_file.read_text(encoding="utf-8")
                frontmatter = _parse_frontmatter(content)
                normalized_name = frontmatter["name"].strip().lower()
                if normalized_name in seen_names:
                    continue
                seen_names.add(normalized_name)
                skills.append(
                    SkillMetadata(
                        name=frontmatter["name"].strip(),
                        description=frontmatter["description"].strip(),
                        path=str(skill_file.parent.resolve()),
                        kind=frontmatter.get("kind", "bundled").strip() or "bundled",
                        default_enabled=frontmatter.get(
                            "default_enabled", "true"
                        ).lower()
                        not in {"false", "0", "no"},
                    )
                )
            except (OSError, UnicodeError, ValueError):
                continue
    return tuple(skills)


def load_skill(skill: SkillMetadata) -> LoadedSkill:
    directory = Path(skill.path).resolve()
    allowed_roots = {
        BUILTIN_SKILLS_ROOT.resolve(),
        USER_SKILLS_ROOT.resolve(),
    }
    if not any(root in directory.parents for root in allowed_roots):
        raise ValueError("Skill path is outside the configured skills directory")
    content = (directory / "SKILL.md").read_text(encoding="utf-8")
    return LoadedSkill(
        name=skill.name,
        description=skill.description,
        directory=str(directory),
        instructions=_strip_frontmatter(content),
    )


def create_skill(
    *,
    name: str,
    description: str,
    instructions: str,
) -> SkillMetadata:
    normalized_name = name.strip().lower()
    normalized_description = " ".join(description.split())
    slug = re.sub(r"[^a-z0-9]+", "-", normalized_name).strip("-")
    if not slug or len(slug) > 64:
        raise ValueError("Skill name must contain letters or numbers")
    if any(skill.name.lower() in {normalized_name, slug} for skill in discover_skills()):
        raise ValueError(f"A skill named '{name.strip()}' already exists")

    USER_SKILLS_ROOT.mkdir(parents=True, exist_ok=True)
    skill_dir = (USER_SKILLS_ROOT / slug).resolve()
    if USER_SKILLS_ROOT.resolve() not in skill_dir.parents:
        raise ValueError("Invalid skill path")
    skill_dir.mkdir(parents=False, exist_ok=False)
    skill_file = skill_dir / "SKILL.md"
    skill_file.write_text(
        "\n".join(
            [
                "---",
                f"name: {slug}",
                f"description: {normalized_description}",
                "kind: custom",
                "default_enabled: true",
                "---",
                "",
                f"# {name.strip()}",
                "",
                instructions.strip(),
                "",
            ]
        ),
        encoding="utf-8",
    )
    discover_skills.cache_clear()
    created = next(
        (skill for skill in discover_skills() if skill.name == slug),
        None,
    )
    if created is None:
        raise RuntimeError("The skill was written but could not be discovered")
    return created


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in _TOKEN_RE.findall(value.lower().replace("_", "-"))
        if token not in _STOP_WORDS
    }


def select_skills(
    question: str,
    *,
    enabled_names: list[str] | None = None,
    limit: int = 2,
) -> list[LoadedSkill]:
    """Select only skills with observable lexical relevance to the request."""

    question_tokens = _tokens(question)
    if not question_tokens:
        return []

    enabled = (
        {name.strip().lower() for name in enabled_names if name.strip()}
        if enabled_names is not None
        else None
    )
    ranked: list[tuple[int, SkillMetadata]] = []
    for skill in discover_skills():
        if enabled is not None and skill.name.lower() not in enabled:
            continue
        name_tokens = _tokens(skill.name)
        description_tokens = _tokens(skill.description)
        score = len(question_tokens & description_tokens)
        score += 2 * len(question_tokens & name_tokens)
        if skill.name.lower().replace("-", " ") in question.lower():
            score += 4
        if score > 0:
            ranked.append((score, skill))

    ranked.sort(key=lambda item: (-item[0], item[1].name))
    return [load_skill(skill) for _, skill in ranked[: max(0, limit)]]


def build_skills_prompt(skills: list[LoadedSkill]) -> str:
    if not skills:
        return ""
    sections = [
        "## Active Agent Skills",
        "Follow these task-specific instructions when they apply. They do not "
        "override system safety rules or instructions.",
    ]
    for skill in skills:
        sections.extend(
            [
                f"### {skill.name}",
                f"Skill directory: {skill.directory}",
                skill.instructions,
            ]
        )
    return "\n\n".join(sections)


def apply_skills_to_messages(
    messages: list[dict],
    skills: list[LoadedSkill],
) -> list[dict]:
    prompt = build_skills_prompt(skills)
    if not prompt:
        return messages

    updated = [dict(message) for message in messages]
    for message in updated:
        if message.get("role") == "system":
            message["content"] = f"{message.get('content', '')}\n\n{prompt}".strip()
            return updated
    return [{"role": "system", "content": prompt}, *updated]
