# TrueMemory Phase 11.2 — Model Selector UI

The existing compact picker now loads the cached canonical catalog, preserves the current visual language, searches name/id/provider/capabilities, shows provider labels and truthful Free/Paid badges, highlights the selected model, and keeps the model list independently scrollable with overscroll containment.

The frontend only stores the selected canonical model id in its existing selection state. Provider credentials, provider URLs, and catalog authority remain backend concerns. Catalog failure does not block the chat surface; the static OpenRouter/local fallback remains available.

Browser E2E remains to be run against a live backend. Required assertions are search (`GPT`, `OpenAI`, `free`), empty state, scroll reachability, provider labels, badges, selection, and reload persistence.
