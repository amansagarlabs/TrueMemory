"""Explicit capability catalog; unimplemented providers are never executable."""

TOOLS = [
    {"id": "memory.search", "name": "Search memory", "description": "Read relevant TrueMemory context in the selected workspace."},
    {"id": "memory.save", "name": "Save memory", "description": "Save agent notes to TrueMemory. Enable only when you approve memory writes."},
]
TEMPLATES = [
    {"id": key, "name": name, "description": description, "instructions": instructions, "tools": ["memory.search"]}
    for key, name, description, instructions in [
        ("personal", "Personal Assistant", "Plan and organize everyday work.", "Help the user organize tasks and make practical plans. Ask for missing details. Never claim to have performed external actions."),
        ("research", "Research Agent", "Analyze questions and supplied sources.", "Analyze supplied evidence, distinguish facts from assumptions, and cite only sources actually supplied or retrieved. Explain when live web access is unavailable."),
        ("coding", "Coding Agent", "Review code and propose changes.", "Help review and write code. Explain assumptions and verification steps. You have no terminal or repository execution access; never claim to have run code."),
        ("devsecops", "DevSecOps Agent", "Assess deployment and security risks.", "Review supplied configurations and code for security and operational issues. Prioritize concrete findings. Never claim to have scanned or deployed systems."),
        ("documents", "Document Analyst", "Extract insights from supplied text.", "Analyze user-supplied document text and relevant memory. Ground conclusions in the available material and flag missing evidence."),
        ("support", "Customer Support Agent", "Draft helpful support responses.", "Use approved supplied knowledge to draft customer support responses. Do not invent policies or claim account actions. Ask for clarification when needed."),
    ]
]


def limits(settings):
    return {"max_agents": settings.truebot_max_agents, "daily_runs": settings.truebot_daily_runs, "concurrent_runs": settings.truebot_concurrent_runs}


def catalog(settings):
    configured = bool(settings.openai_api_key and settings.truebot_models)
    return {
        "enabled": settings.truebot_enabled,
        "providers": [
            {"id": "openai", "name": "OpenAI", "configured": configured, "models": settings.truebot_models, "runtime": "model-api", "capabilities": ["text", "function-calling"]},
            *[{"id": key, "name": name, "configured": False, "models": [], "runtime": runtime, "capabilities": []}
              for key, name, runtime in [("anthropic", "Anthropic Claude", "model-api"), ("xai", "xAI Grok", "model-api"), ("local", "Local inference", "model-api"), ("coding-runtime", "Autonomous coding runtime", "agent-runtime")]],
        ],
        "templates": TEMPLATES,
        "tools": TOOLS,
        "limits": limits(settings),
        "automations_enabled": False,
    }
