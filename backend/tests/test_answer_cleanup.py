from services.answer_cleanup import (
    link_bare_source_urls,
    sanitize_assistant_answer,
    strip_leading_search_result_dump,
)


def test_repeated_search_cards_are_removed_from_answer_prefix():
    answer = """[**First result**](https://example.com/one)
First result
[example.com](https://example.com/one)

[**Second result**](https://news.example.org/two)
Second result
[news.example.org](https://news.example.org/two)

**Assessment of the protest**

The protest may raise awareness, but its effects remain uncertain."""

    cleaned = strip_leading_search_result_dump(answer)

    assert cleaned.startswith("**Assessment of the protest**")
    assert "First result" not in cleaned
    assert "Second result" not in cleaned


def test_single_opening_link_is_preserved():
    answer = """[**Primary report**](https://example.com/report)
Primary report
[example.com](https://example.com/report)

The report documents the event."""

    assert strip_leading_search_result_dump(answer) == answer


def test_plain_search_cards_are_removed_from_answer_prefix():
    answer = """Odysseus - Wikipedia
Odysseus - Wikipedia
en.wikipedia.org

The Odyssey ending explained
The Odyssey ending explained
thepopverse.com

Odysseus has two traditions surrounding his death."""

    cleaned = strip_leading_search_result_dump(answer)

    assert cleaned == "Odysseus has two traditions surrounding his death."
    assert "wikipedia.org" not in cleaned


def test_provider_safety_metadata_is_not_user_visible():
    answer = """The answer is grounded in the available evidence.

User Safety: safe
Safety: allowed"""

    assert sanitize_assistant_answer(answer) == (
        "The answer is grounded in the available evidence."
    )


def test_known_bare_source_urls_become_markdown_citations():
    answer = "The city was at Hisarlik (https://example.com/troy)."
    linked = link_bare_source_urls(
        answer,
        [{"url": "https://example.com/troy", "domain": "example.com"}],
    )
    assert linked == "The city was at Hisarlik ([example.com](https://example.com/troy))."
