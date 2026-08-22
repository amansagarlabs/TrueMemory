# Automatic Search Fallback

This app follows an automatic answer hierarchy for AmanAgentLab.

## Search Order

1. Current conversation memory
2. Uploaded artifact content, when a document is active
3. Saved profile and chat memory
4. Optional live web search
5. Final LLM response
6. Save useful knowledge for future conversations

## Current Implementation

The backend chat stream emits progress events such as:

- `Searching current conversation...`
- `Searching saved memory...`
- `Searching artifacts...`
- `Searching web...`
- `Generating answer...`

Document chat uses the existing PDF RAG retrieval flow.

General chat works without a document and can use optional live web search when configured.

## Web Search Provider

Live web search is optional and currently supports Tavily.

Add these values to `.env`:

```env
WEB_SEARCH_ENABLED=true
TAVILY_API_KEY=your_tavily_key_here
WEB_SEARCH_MAX_RESULTS=5
```

When enabled, no-document chat automatically searches the web before generating the answer.

When disabled, the app still searches conversation memory and saved memory, then generates a normal model answer.

## Saved Knowledge

Useful web search results are stored in the SQLite profile memory store under the `general` document scope.

Stored fields include:

- user query
- search summary
- sources
- timestamp

## Related Files

- [backend/app/routes/chat.py](./backend/app/routes/chat.py)
- [backend/services/web_search.py](./backend/services/web_search.py)
- [backend/rag/prompt_builder.py](./backend/rag/prompt_builder.py)
- [components/chat/ChatInterface.tsx](./components/chat/ChatInterface.tsx)
- [lib/types.ts](./lib/types.ts)
