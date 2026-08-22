from services.followups import fallback_followups, parse_followups


def test_parse_followups_rejects_static_templates_and_deduplicates():
    parsed = parse_followups(
        """[
          "How does Virat Kohli work in practice?",
          "Which ODI record is hardest to surpass?",
          "Which ODI record is hardest to surpass?",
          "How did his captaincy affect India?",
          "Why has he stayed with RCB?"
        ]"""
    )

    assert parsed == [
        "Which ODI record is hardest to surpass?",
        "How did his captaincy affect India?",
        "Why has he stayed with RCB?",
    ]


def test_person_fallback_uses_facts_from_the_answer():
    suggestions = fallback_followups(
        "Who is Virat Kohli?",
        (
            "Virat Kohli is an Indian cricketer who captained India, played for RCB, "
            "and holds major ODI century records."
        ),
    )

    assert len(suggestions) == 4
    assert any("achievements" in item for item in suggestions)
    assert any("leadership" in item for item in suggestions)
    assert any("teams" in item for item in suggestions)
    assert all("work in practice" not in item.lower() for item in suggestions)


def test_greeting_does_not_show_followups():
    assert fallback_followups("hii", "Hello! How can I help?") == []


def test_misspelled_protest_question_is_not_treated_as_a_person():
    suggestions = fallback_followups(
        "asis thsi protest good",
        (
            "Assessment of the CJP protest\n"
            "The Cockroach Janta Party (CJP) is a youth-led movement. "
            "It may raise awareness, but concrete reforms remain uncertain."
        ),
    )

    assert len(suggestions) == 4
    assert all("career" not in item.lower() for item in suggestions)
    assert all("thsi" not in item.lower() for item in suggestions)
    assert all("asis" not in item.lower() for item in suggestions)
    assert all("cjp protest" in item.lower() for item in suggestions)
