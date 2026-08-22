from pathlib import Path

from services import agent_skills
from services.agent_skills import (
    apply_skills_to_messages,
    create_skill,
    discover_skills,
    select_skills,
)


def test_discovers_skill_metadata_without_loading_body(tmp_path: Path):
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo\ndescription: Analyze demo datasets.\n---\n\nSECRET BODY",
        encoding="utf-8",
    )

    discover_skills.cache_clear()
    skills = discover_skills(tmp_path)

    assert len(skills) == 1
    assert skills[0].name == "demo"
    assert "SECRET BODY" not in skills[0].description


def test_selects_and_injects_only_relevant_enabled_skill():
    discover_skills.cache_clear()
    selected = select_skills(
        "Please create a product requirements document for this feature",
        enabled_names=["product-requirements", "data-exploration"],
    )

    assert [skill.name for skill in selected] == ["product-requirements"]
    messages = apply_skills_to_messages(
        [{"role": "system", "content": "Base"}, {"role": "user", "content": "Question"}],
        selected,
    )
    assert "Active Agent Skills" in messages[0]["content"]
    assert "Product Requirements" in messages[0]["content"]


def test_disabled_skill_is_not_selected():
    discover_skills.cache_clear()
    selected = select_skills(
        "Analyze this CSV dataset for missing values",
        enabled_names=["content-creation"],
    )
    assert selected == []


def test_creates_persistent_custom_skill(tmp_path: Path, monkeypatch):
    builtin_root = tmp_path / "builtins"
    user_root = tmp_path / "user"
    builtin_root.mkdir()
    monkeypatch.setattr(agent_skills, "BUILTIN_SKILLS_ROOT", builtin_root)
    monkeypatch.setattr(agent_skills, "USER_SKILLS_ROOT", user_root)
    discover_skills.cache_clear()
    try:
        created = create_skill(
            name="Customer Interview",
            description="Synthesize customer interviews into recurring themes.",
            instructions="Group evidence by theme and preserve direct user language.",
        )
        assert created.name == "customer-interview"
        assert created.kind == "custom"
        assert created.default_enabled is True
        assert (user_root / "customer-interview" / "SKILL.md").is_file()
    finally:
        discover_skills.cache_clear()
