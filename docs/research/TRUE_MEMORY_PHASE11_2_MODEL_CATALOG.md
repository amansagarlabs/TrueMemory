# TrueMemory Phase 11.2 — Model Catalog

The backend owns a canonical catalog for OpenRouter and OpenAI. Provider APIs are queried server-side and cached for five minutes; the picker consumes cached metadata and never receives credentials.

Each model is normalized as `id`, `name`, `provider`, `provider_label`, `pricing`, `pricing_type`, `context_length`, `supports`, and `availability`. Zero provider pricing is `free`; non-zero pricing is `paid`; missing pricing is `unknown`. Local and Ollama entries remain separate and are not falsely marked free.

`GET /api/models` returns the catalog and `GET /api/models/openai/health` returns only safe availability/authentication counts. A failed refresh retains the last catalog when one exists. Provider URLs and model metadata are backend-controlled.
