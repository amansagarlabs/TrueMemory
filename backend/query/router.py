from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlparse

from .models import ExecutionPlan, PlanStep, QueryMode, RouteDecision


_URL_RE = re.compile(r"https?://[^\s<>()\[\]{}\"']+", re.IGNORECASE)
_NO_WEB_RE = re.compile(r"\b(do not|don't|dont|without)\s+(browse|search|use the web|web)\b", re.IGNORECASE)
_UTILITY_RE = re.compile(
    r"\b(current\s+)?(date|time|day of (the )?week|timezone)\b|\bwhat day is it\b",
    re.IGNORECASE,
)
_SOCIAL_RE = re.compile(
    r"^(hi+|hello+|hey+|yo+|howdy|good\s+(morning|afternoon|evening)|thanks?|thank\s+you)[!,.?\s]*$",
    re.IGNORECASE,
)
_MEMORY_RE = re.compile(
    r"\b(remember|what did (i|we)|earlier conversation|previous chat|my preferences?|what(?:'s| is) my name|who am i|my name)\b",
    re.IGNORECASE,
)
_FRESH_RE = re.compile(
    r"\b(latest|live|real[ -]?time|updates?|current|currently|recent|recently|today|tonight|this week|now|news|weather|scores?|schedule|price|pricing|exchange rate|availability|version|release|security advisory|law|policy|regulation|standard|ceo|president|prime minister|office holder|recommend(?:ation|ations)?)\b",
    re.IGNORECASE,
)
_RECOMMENDATION_RE = re.compile(
    r"\b(best|top|leading|popular|recommended|most used)\b",
    re.IGNORECASE,
)
_TECH_CATEGORY_RE = re.compile(
    r"\b(frameworks?|libraries|tools|platforms?|stacks?|runtimes?|sdk(?:s)?)\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b20\d{2}\b")
_SEARCH_RE = re.compile(
    r"\b(search|look up|browse|find sources?|verify|fact[ -]?check|cite|citations?)\b",
    re.IGNORECASE,
)
_FOLLOWUP_PRONOUN_RE = re.compile(
    r"\b(this|that|it|them|these|those|same|previous|earlier|above|next|more)\b",
    re.IGNORECASE,
)
_FOLLOWUP_ACTION_RE = re.compile(
    r"\b(can you|could you|would you|should you|please|change|update|edit|fix|continue|"
    r"more about|what about|how about|tell me more|explain|describe|summari[sz]e)\b",
    re.IGNORECASE,
)
_FACTUAL_LOOKUP_RE = re.compile(
    r"^(what|who|when|where|which|how many|how much|how old)\b",
    re.IGNORECASE,
)
_MAP_RE = re.compile(r"\b(map|list|discover|find)\b.{0,32}\b(pages|urls?|links|site structure|sitemap)\b", re.IGNORECASE)
_CRAWL_RE = re.compile(r"\b(crawl|read|scan)\b.{0,40}\b(site|website|docs?|pages?)\b", re.IGNORECASE)
_SCRAPE_RE = re.compile(r"\b(scrape|open|read|extract from|summari[sz]e)\b", re.IGNORECASE)
_AGENT_RE = re.compile(
    r"\b(compare|investigate|research|analy[sz]e across|multiple sources|these (two|three|\d+) (sites|vendors|urls?))\b",
    re.IGNORECASE,
)
_LIVE_SIGNAL_RE = re.compile(
    r"\b(live|real[ -]?time|right now|in progress|score(?:s|card)?|fixtures?|standings?|results? today|breaking|streaming)\b",
    re.IGNORECASE,
)
_CRICKET_RE = re.compile(r"\b(cricket|ipl|test match|odi|t20|wicket|innings)\b", re.IGNORECASE)
_FOOTBALL_RE = re.compile(r"\b(football|soccer|premier league|champions league|la liga|serie a|bundesliga|fifa)\b", re.IGNORECASE)
_SPORTS_RE = re.compile(r"\b(tennis|basketball|baseball|hockey|rugby|golf|formula 1|f1|motogp|boxing|ufc|sports?)\b", re.IGNORECASE)
_WEATHER_RE = re.compile(r"\b(weather|temperature|forecast|rain|storm|snow|humidity|air quality)\b", re.IGNORECASE)
_MARKET_RE = re.compile(r"\b(stock|stocks|share price|market|crypto|bitcoin|ethereum|forex|index|gold price|oil price)\b", re.IGNORECASE)
_ELECTION_RE = re.compile(r"\b(election|polls?|votes?|ballot|primary results?)\b", re.IGNORECASE)
_TRAFFIC_RE = re.compile(r"\b(traffic|road closure|transit|train status|flight status|delay|delays)\b", re.IGNORECASE)
_NEWS_RE = re.compile(r"\b(news|breaking|developing story)\b", re.IGNORECASE)
_EXPLICIT_WEB_RE = re.compile(r"\b(search the web|search online|look (?:this|it) up|google this|search internet|browse the web|research online|find sources?)\b", re.IGNORECASE)
_USER_IDENTITY_RE = re.compile(r"\b(my name|who am i|my alias|username)\b", re.IGNORECASE)
_USER_PROFESSIONAL_RE = re.compile(r"\b(what(?: do| am|) i do|what do i do professionally|my (?:job|role|career|skills?|company|employer|work|projects?|responsibilities|experience)|what am i (?:learning|working on))\b", re.IGNORECASE)
_CONVERSATION_RE = re.compile(r"\b(what did we discuss|what did i tell you|previous(?:ly)?|earlier conversation|our conversation|we talk(?:ed)? about|remember when)\b", re.IGNORECASE)
_TECH_RE = re.compile(r"\b(next\.js|react|vue|angular|python|javascript|typescript|docker|milvus|software engineer|api|database|framework|library|sdk)\b", re.IGNORECASE)
_SELF_PROFILE_RE = re.compile(
    r"\b(my|mine|myself|our|ours|who am i|what am i|what have i|what was my|"
    r"what do i|where do i|how am i)\b.{0,80}\b(about|name|alias|username|profile|"
    r"job|role|work|profession|career|company|employer|skill|experience|project|"
    r"goal|interest|preference|learn(?:ing)?|education|resume|location|bio|history|"
    r"responsibilit|do professionally)\b",
    re.IGNORECASE,
)


def _live_data_context(question: str) -> tuple[str | None, str | None]:
    if re.search(r"\b(what is|define|explain|how does|how do)\s+live streaming\b", question, re.IGNORECASE):
        return None, None

    has_live_signal = bool(_LIVE_SIGNAL_RE.search(question))
    has_current_weather_signal = bool(
        re.search(r"\b(now|today|tonight|tomorrow|current|currently|forecast|weather in|temperature in)\b", question, re.IGNORECASE)
    )
    has_current_traffic_signal = bool(
        re.search(r"\b(now|today|tonight|current|currently|status|closure|closed|delay|delays)\b", question, re.IGNORECASE)
    )
    if _WEATHER_RE.search(question) and (has_live_signal or has_current_weather_signal):
        return "weather", "Current weather"
    if _CRICKET_RE.search(question) and has_live_signal:
        return "cricket", "Live cricket updates"
    if _FOOTBALL_RE.search(question) and has_live_signal:
        return "football", "Live football updates"
    if _SPORTS_RE.search(question) and has_live_signal:
        return "sports", "Live sports updates"
    if _MARKET_RE.search(question) and (has_live_signal or re.search(r"\b(price|today|current|now)\b", question, re.IGNORECASE)):
        return "market", "Live market data"
    if _ELECTION_RE.search(question) and (has_live_signal or re.search(r"\b(current|today|now)\b", question, re.IGNORECASE)):
        return "election", "Live election results"
    if _TRAFFIC_RE.search(question) and (has_live_signal or has_current_traffic_signal):
        return "traffic", "Live traffic and travel"
    if _NEWS_RE.search(question) and has_live_signal:
        return "news", "Live news update"
    if has_live_signal:
        return "event", "Live event update"
    return None, None


def _urls(question: str) -> list[str]:
    values: list[str] = []
    for match in _URL_RE.findall(question):
        candidate = match.rstrip(".,;:!?")
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.hostname and candidate not in values:
            values.append(candidate)
    return values[:10]


def is_conversational_followup(
    question: str,
    recent_messages: list[dict] | None = None,
) -> bool:
    text = " ".join(question.strip().split())
    if not text or not recent_messages:
        return False
    if len(text.split()) > 18:
        return False
    if any(
        pattern.search(text)
        for pattern in (_URL_RE, _SEARCH_RE, _FACTUAL_LOOKUP_RE, _FRESH_RE, _MAP_RE, _CRAWL_RE, _SCRAPE_RE, _AGENT_RE)
    ):
        return False
    if not (_FOLLOWUP_PRONOUN_RE.search(text) and _FOLLOWUP_ACTION_RE.search(text)):
        return False
    roles = {str(message.get("role") or "").lower() for message in recent_messages}
    return "assistant" in roles and "user" in roles


def _decision(
    mode: QueryMode,
    *,
    reason: str,
    reason_code: str,
    confidence: float,
    urls: list[str] | None = None,
    query: str | None = None,
    fresh: bool = False,
    citations: bool = False,
    max_tool_calls: int = 0,
    fallback: QueryMode | None = None,
    confirmation: bool = False,
    live_data_kind: str | None = None,
    live_data_label: str | None = None,
    domain: str = "general",
    intent: str = "general",
    sub_intent: str | None = None,
    subject_type: str = "unknown",
    operation: str = "explain",
    temporal_type: str = "stable",
    required_context: dict[str, bool] | None = None,
    primary_source: str | None = None,
    fallback_source: str | None = None,
    web_allowed: bool | None = None,
    web_reason: str = "",
    search_mode: str | None = None,
) -> RouteDecision:
    actual_web = mode in {QueryMode.SEARCH, QueryMode.SCRAPE, QueryMode.MAP, QueryMode.CRAWL, QueryMode.AGENT}
    return RouteDecision(
        mode=mode,
        domain=domain,
        intent=intent,
        sub_intent=sub_intent,
        subject={"type": subject_type},
        operation=operation,
        temporal={"type": temporal_type, "requires_current": fresh},
        required_context=required_context or {},
        source={"primary": primary_source, "fallback": fallback_source},
        web_allowed=actual_web if web_allowed is None else web_allowed,
        web_required=actual_web,
        web_reason=web_reason or reason,
        search_mode=search_mode,
        normalized_query=query,
        needs_fresh_data=fresh,
        needs_web=actual_web,
        needs_citations=citations,
        target_urls=urls or [],
        search_queries=[query] if query and mode in {QueryMode.SEARCH, QueryMode.AGENT} else [],
        reason=reason,
        reason_code=reason_code,
        confidence=confidence,
        max_tool_calls=max_tool_calls,
        fallback_mode=fallback,
        requires_confirmation=confirmation,
        live_data_kind=live_data_kind,
        live_data_label=live_data_label,
    )


def decide_route(
    question: str,
    *,
    requested_mode: QueryMode | str = QueryMode.AUTO,
    doc_id: str | None = None,
    has_memory: bool = False,
    recent_messages: list[dict] | None = None,
) -> RouteDecision:
    text = " ".join(question.strip().split())
    urls = _urls(text)
    try:
        mode = QueryMode(requested_mode)
    except ValueError:
        mode = QueryMode.AUTO

    no_web = bool(_NO_WEB_RE.search(text))
    explicit_web = bool(_EXPLICIT_WEB_RE.search(text))
    personal_identity = bool(_USER_IDENTITY_RE.search(text))
    personal_professional = bool(_USER_PROFESSIONAL_RE.search(text))
    conversation_reference = bool(_CONVERSATION_RE.search(text))
    self_profile_reference = bool(_SELF_PROFILE_RE.search(text))
    referenced_years = [int(value) for value in _YEAR_RE.findall(text)]
    references_current_or_future_year = any(year >= datetime.now().year for year in referenced_years)
    is_technology_recommendation = bool(
        _RECOMMENDATION_RE.search(text) and _TECH_CATEGORY_RE.search(text)
    )
    live_data_kind, live_data_label = _live_data_context(text)

    # Runtime facts are always deterministic. Even if a stale composer mode
    # is still selected (for example, Web search), date/time questions must
    # never spend a web or LLM call.
    if _UTILITY_RE.search(text):
        return _decision(
            QueryMode.UTILITY,
            reason="This can be answered from the runtime clock.",
            reason_code="runtime_utility",
            confidence=.99,
        )

    if mode == QueryMode.AUTO and _SOCIAL_RE.fullmatch(text):
        return _decision(
            QueryMode.SOCIAL,
            reason="This is a simple greeting, so no model or external retrieval is needed.",
            reason_code="social_greeting",
            confidence=.99,
        )

    if mode != QueryMode.AUTO:
        if no_web and mode in {QueryMode.SEARCH, QueryMode.SCRAPE, QueryMode.MAP, QueryMode.CRAWL, QueryMode.AGENT}:
            return _decision(
                QueryMode.DOCUMENT if doc_id else QueryMode.DIRECT,
                reason="Web access was disabled by the user.",
                reason_code="explicit_no_web",
                confidence=1,
            )
        if mode in {QueryMode.SCRAPE, QueryMode.MAP, QueryMode.CRAWL} and not urls:
            return _decision(
                QueryMode.DIRECT,
                reason="The selected web operation needs a URL.",
                reason_code="missing_required_url",
                confidence=1,
            )
        return _decision(
            mode,
            reason=f"The user selected {mode.value} mode.",
            reason_code="explicit_mode",
            confidence=1,
            urls=urls,
            query=text,
            fresh=mode in {QueryMode.SEARCH, QueryMode.AGENT},
            citations=mode in {QueryMode.DOCUMENT, QueryMode.SEARCH, QueryMode.SCRAPE, QueryMode.CRAWL, QueryMode.AGENT},
            max_tool_calls={QueryMode.SEARCH: 3 if live_data_kind else 1, QueryMode.SCRAPE: 1, QueryMode.MAP: 1, QueryMode.CRAWL: 10, QueryMode.AGENT: 8}.get(mode, 0),
            fallback=QueryMode.SEARCH if mode in {QueryMode.SCRAPE, QueryMode.CRAWL, QueryMode.AGENT} else None,
            confirmation=mode in {QueryMode.CRAWL, QueryMode.AGENT},
            live_data_kind=live_data_kind if mode in {QueryMode.SEARCH, QueryMode.AGENT} else None,
            live_data_label=live_data_label if mode in {QueryMode.SEARCH, QueryMode.AGENT} else None,
        )

    if doc_id:
        return _decision(QueryMode.DOCUMENT, reason="The question is grounded in the uploaded document.", reason_code="document_attached", confidence=.99, citations=True)
    # Private context wins before legacy memory/factual heuristics.
    if (personal_identity or personal_professional or conversation_reference or self_profile_reference) and not explicit_web:
        is_conversation = conversation_reference
        professional = (personal_professional or bool(re.search(r"\b(career|job|role|work|profession|skill|experience|project|goal|learn|resume|responsibilit)", text, re.IGNORECASE))) and not personal_identity and not is_conversation
        return _decision(
            QueryMode.MEMORY,
            reason="Question targets private user or conversation context.",
            reason_code="conversation_reference" if is_conversation else "user_context_reference",
            confidence=.96 if personal_identity else .9,
            domain="conversation" if is_conversation else "professional" if professional else "personal",
            intent="conversation_recall" if is_conversation else "career_profile" if professional else "personal_profile",
            sub_intent="recall" if is_conversation else "occupation" if professional else "identity",
            subject_type="conversation" if is_conversation else "current_user",
            operation="recall" if is_conversation else "retrieve",
            temporal_type="historical" if is_conversation else "stable",
            required_context={"conversation": is_conversation, "user_memory": not is_conversation},
            primary_source="conversation" if is_conversation else "user_profile",
            fallback_source="user_memory",
            web_allowed=False,
            web_reason="Private answer available from profile, memory, or conversation.",
        )
    if _MEMORY_RE.search(text):
        return _decision(
            QueryMode.MEMORY,
            reason="This asks for personal or earlier workspace context, so I will check memory before answering.",
            reason_code="memory_reference",
            confidence=.94,
        )
    if no_web:
        return _decision(QueryMode.DIRECT, reason="Web access was disabled by the user.", reason_code="explicit_no_web", confidence=.99)
    if urls and _MAP_RE.search(text):
        return _decision(QueryMode.MAP, reason="The request asks to discover URLs on a known site.", reason_code="explicit_map", confidence=.96, urls=urls, citations=True, max_tool_calls=1)
    if urls and _CRAWL_RE.search(text):
        return _decision(QueryMode.CRAWL, reason="The request asks to read multiple pages from a site.", reason_code="explicit_crawl", confidence=.95, urls=urls, citations=True, max_tool_calls=10, fallback=QueryMode.SCRAPE, confirmation=True)
    if urls and _SCRAPE_RE.search(text):
        return _decision(QueryMode.SCRAPE, reason="The request asks to read a specific URL.", reason_code="explicit_scrape", confidence=.96, urls=urls, citations=True, max_tool_calls=1, fallback=QueryMode.SEARCH)
    if _AGENT_RE.search(text) and (
        _FRESH_RE.search(text)
        or _SEARCH_RE.search(text)
        or references_current_or_future_year
        or is_technology_recommendation
    ):
        return _decision(QueryMode.AGENT, reason="The request needs several current evidence steps.", reason_code="multi_step_research", confidence=.87, urls=urls, query=text, fresh=True, citations=True, max_tool_calls=8, fallback=QueryMode.SEARCH, confirmation=True, live_data_kind=live_data_kind, live_data_label=live_data_label)
    if (
        _SEARCH_RE.search(text)
        or explicit_web
        or _FRESH_RE.search(text)
        or references_current_or_future_year
        or is_technology_recommendation
    ):
        reason = (
            "Searching because this is a current recommendation and the useful options may change."
            if is_technology_recommendation or references_current_or_future_year
            else "Searching because this information may have changed or needs verification."
        )
        return _decision(QueryMode.SEARCH, reason=reason, reason_code="fresh_or_recommended_fact", confidence=.93, query=text, fresh=True, citations=True, max_tool_calls=3 if live_data_kind else 1, fallback=QueryMode.DIRECT, live_data_kind=live_data_kind, live_data_label=live_data_label, domain="technology" if _TECH_RE.search(text) else "general", intent="research", sub_intent="current_information", subject_type="technology" if _TECH_RE.search(text) else "external_resource", operation="research", temporal_type="current", primary_source="web_search", web_allowed=True, web_reason="Current or explicitly requested external information.", search_mode="documentation_search" if re.search(r"version|release|documentation|docs", text, re.IGNORECASE) else "web_search")
    if _FACTUAL_LOOKUP_RE.search(text):
        return _decision(
            QueryMode.DIRECT,
            reason="Stable general knowledge does not require web search.",
            reason_code="stable_model_knowledge",
            confidence=.86,
            domain="technology" if _TECH_RE.search(text) else "general",
            intent="explain",
            subject_type="technology" if _TECH_RE.search(text) else "unknown",
            operation="explain",
            primary_source="model_knowledge",
            web_allowed=False,
            web_reason="Stable answer available from model knowledge.",
        )
    if is_conversational_followup(text, recent_messages):
        return _decision(
            QueryMode.MEMORY,
            reason="This is a conversational follow-up, so I will stay grounded in the recent chat instead of searching the web.",
            reason_code="conversational_followup",
            confidence=.9,
        )
    if has_memory and re.search(r"\b(my|our|workspace|project)\b", text, re.IGNORECASE):
        return _decision(QueryMode.MEMORY, reason="Workspace memory may contain relevant personal context.", reason_code="scoped_memory", confidence=.72)
    return _decision(
        QueryMode.DIRECT,
        reason="No current external information requested; web search is not default fallback.",
        reason_code="default_local_answer",
        confidence=.78,
        primary_source="conversation" if recent_messages else "model_knowledge",
        fallback_source="model_knowledge",
        required_context={"conversation": bool(recent_messages), "user_memory": bool(has_memory)},
        web_allowed=False,
        web_reason="Web search is not default fallback.",
    )


def build_execution_plan(decision: RouteDecision) -> ExecutionPlan:
    labels = {
        QueryMode.UTILITY: "Read the runtime clock",
        QueryMode.SOCIAL: "Respond to the greeting",
        QueryMode.DIRECT: "Write the answer",
        QueryMode.MEMORY: "Check relevant conversation context",
        QueryMode.DOCUMENT: "Read the relevant document passages",
        QueryMode.SEARCH: "Search current sources",
        QueryMode.SCRAPE: "Read the requested page",
        QueryMode.MAP: "Find the site's relevant pages",
        QueryMode.CRAWL: "Review the requested site",
        QueryMode.AGENT: "Research and verify the request",
    }
    if decision.live_data_label and decision.mode in {QueryMode.SEARCH, QueryMode.AGENT}:
        labels[decision.mode] = (
            "Fetch sports data"
            if decision.live_data_kind in {"cricket", "football", "sports"}
            else f"Check {decision.live_data_label.lower()}"
        )
    steps = [PlanStep(id="route", mode=decision.mode, label="Understand the request", status="complete")]
    if decision.mode in {QueryMode.SEARCH, QueryMode.AGENT}:
        steps.append(
            PlanStep(
                id="knowledge",
                mode=QueryMode.MEMORY,
                label="Check relevant background",
            )
        )
    steps.append(
        PlanStep(
            id=f"tool-{decision.mode.value}",
            mode=decision.mode,
            label=labels[decision.mode],
            requires_confirmation=decision.requires_confirmation,
        )
    )
    if decision.mode not in {QueryMode.UTILITY, QueryMode.SOCIAL, QueryMode.DIRECT}:
        steps.append(PlanStep(id="answer", mode=QueryMode.DIRECT, label="Write the verified answer"))
    return ExecutionPlan(
        route=decision.mode,
        steps=steps,
        max_tool_calls=decision.max_tool_calls,
        allows_replan=decision.mode == QueryMode.AGENT,
    )
