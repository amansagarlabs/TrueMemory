# TrueMemory Phase 11.2 — OpenAI Provider

`OpenAIProvider` implements the existing `LLMProvider` contract through the OpenAI-compatible `/chat/completions` API. Chat, streaming, canonical tool calls, usage normalization, and normalized errors stay behind the provider boundary.

Configuration is server-side only: `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL`, `OPENAI_FAST_MODEL`, `OPENAI_REASONING_MODEL`, and `OPENAI_EMBEDDING_MODEL`. The key is never returned by the model catalog, health route, frontend, or chat payload.

Live OpenAI evidence remains **NOT VERIFIED** until a deployment supplies a valid key and an authorized account. The current implementation preserves OpenRouter as the default and does not re-embed existing memories.
