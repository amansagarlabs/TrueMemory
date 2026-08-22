from query.models import QueryMode
from query.router import build_execution_plan, decide_route
from query.image_intent import classify_image_intent, should_include_source_images


def test_runtime_date_uses_utility():
    assert decide_route("What is the current date?").mode == QueryMode.UTILITY


def test_greeting_uses_social_fast_path():
    decision = decide_route("hii")
    assert decision.mode == QueryMode.SOCIAL
    assert decision.needs_web is False
    assert decision.max_tool_calls == 0


def test_stable_explanation_uses_model_knowledge_without_web_search():
    decision = decide_route("Explain dependency injection.")
    assert decision.mode == QueryMode.DIRECT
    assert decision.needs_web is False
    assert decision.web_allowed is False
    assert decision.source["primary"] == "model_knowledge"
    plan = build_execution_plan(decision)
    assert [step.id for step in plan.steps] == ["route", "tool-direct"]


def test_stable_factual_lookup_uses_model_knowledge_without_web_search():
    decision = decide_route("How many bones are in the human body?")
    assert decision.mode == QueryMode.DIRECT
    assert decision.needs_web is False
    assert decision.web_allowed is False
    assert decision.needs_fresh_data is False
    assert decision.reason_code == "stable_model_knowledge"


def test_user_name_never_uses_web():
    decision = decide_route("What is my name?")
    assert decision.mode == QueryMode.MEMORY
    assert decision.domain == "personal"
    assert decision.subject["type"] == "current_user"
    assert decision.source["primary"] == "user_profile"
    assert decision.web_required is False
    assert decision.web_allowed is False


def test_user_occupation_never_searches_for_phrase():
    decision = decide_route("what i do?")
    assert decision.mode == QueryMode.MEMORY
    assert decision.domain == "professional"
    assert decision.intent == "career_profile"
    assert decision.sub_intent == "occupation"
    assert decision.subject["type"] == "current_user"
    assert decision.web_required is False
    assert decision.web_allowed is False


def test_conversation_recall_stays_local():
    decision = decide_route("What did we discuss about Docker?")
    assert decision.mode == QueryMode.MEMORY
    assert decision.subject["type"] == "conversation"
    assert decision.source["primary"] == "conversation"
    assert decision.web_allowed is False


def test_current_technology_version_uses_documentation_search():
    decision = decide_route("What is the latest Next.js version?")
    assert decision.mode == QueryMode.SEARCH
    assert decision.web_required is True
    assert decision.web_allowed is True
    assert decision.search_mode == "documentation_search"
    assert decision.temporal["type"] == "current"


def test_explicit_web_request_overrides_local_default():
    decision = decide_route("Research online what software engineers are doing in 2026.")
    assert decision.mode in {QueryMode.SEARCH, QueryMode.AGENT}
    assert decision.web_allowed is True


def test_implicit_fresh_role_searches():
    decision = decide_route("Who is the CEO of OpenAI?")
    assert decision.mode == QueryMode.SEARCH
    assert decision.needs_fresh_data is True


def test_live_cricket_request_carries_structured_live_context():
    decision = decide_route("Cricket live updates")
    assert decision.mode == QueryMode.SEARCH
    assert decision.needs_fresh_data is True
    assert decision.live_data_kind == "cricket"
    assert decision.live_data_label == "Live cricket updates"
    plan = build_execution_plan(decision)
    assert plan.steps[-2].label == "Fetch sports data"


def test_live_football_request_uses_football_context():
    decision = decide_route("Football scores live right now")
    assert decision.live_data_kind == "football"
    assert decision.live_data_label == "Live football updates"


def test_current_market_price_request_uses_live_market_context():
    decision = decide_route("current market price of tata steel")
    assert decision.mode == QueryMode.SEARCH
    assert decision.live_data_kind == "market"
    assert decision.live_data_label == "Live market data"


def test_generic_live_event_request_uses_event_context():
    decision = decide_route("Give me live updates from the launch event")
    assert decision.mode == QueryMode.SEARCH
    assert decision.live_data_kind == "event"
    assert decision.max_tool_calls == 3


def test_live_streaming_explanation_is_not_misclassified_as_live_data():
    decision = decide_route("How does live streaming work?")
    assert decision.live_data_kind is None


def test_known_url_scrapes():
    decision = decide_route("Read https://example.com/pricing")
    assert decision.mode == QueryMode.SCRAPE
    assert decision.target_urls == ["https://example.com/pricing"]


def test_crawl_requires_confirmation():
    decision = decide_route("Crawl this docs site https://example.com/docs")
    assert decision.mode == QueryMode.CRAWL
    assert decision.requires_confirmation is True


def test_no_web_overrides_search():
    decision = decide_route("Do not browse; explain what a vector database is.")
    assert decision.mode == QueryMode.DIRECT
    assert decision.needs_web is False


def test_conversational_followup_stays_in_chat_memory() -> None:
    decision = decide_route(
        "can you change this name",
        recent_messages=[
            {"role": "user", "content": "hi whats my name"},
            {"role": "assistant", "content": "Your full name is Aman."},
        ],
    )
    assert decision.mode == QueryMode.MEMORY
    assert decision.needs_web is False
    assert decision.reason_code == "conversational_followup"


def test_text_only_requests_hide_source_images() -> None:
    decision = classify_image_intent("Summarize this PDF")
    assert decision.needs_images is False
    assert should_include_source_images("Explain JWT authentication") is False


def test_visual_requests_allow_source_images() -> None:
    decision = classify_image_intent("Show me Tesla Model Y")
    assert decision.needs_images is True
    assert should_include_source_images("Modern office interior ideas") is True
