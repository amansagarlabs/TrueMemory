# Chat Resources UI Handbook

This document captures the resources/provenance UI pattern implemented for chat answers so it can be reused in other chat surfaces.

## Goal

Show a Perplexity-style resources panel for each assistant answer without changing AI generation, RAG, streaming, or backend contracts.

## What Was Found

The only first-class source payload already returned by the backend stream is `web_sources` on the chat done event.

Relevant data shapes:

```ts
// lib/types.ts
type ChatStreamEvent = {
  type: "status" | "retrieval" | "token" | "done" | "error";
  web_sources?: Array<{
    title: string;
    url: string;
    content?: string;
    score?: number | null;
  }>;
};
```

```ts
// components/chat/types.ts
export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  emphasis?: "default" | "highlight";
  badge?: string;
  resources?: MessageResource[];
}

export interface MessageResource {
  title: string;
  url: string;
  domain: string;
  sourceType: string;
  description?: string;
}
```

## UI Pattern

The implementation uses a right-side `Sheet` drawer and renders two layers:

1. Provenance blocks
2. Internet links

Provenance blocks are shown in this order:

1. Selected answer
2. Conversation context
3. Saved memory
4. Model knowledge
5. Clicked answer

Internet links are rendered only when there are actual URLs.

## Fallback Order

Use this order when building resources for a message:

1. `message.resources`
2. `web_sources` from the chat stream
3. Markdown links in `message.content`
4. Raw URLs in `message.content`
5. Uploaded artifact fallback if the assistant answer is document-based and no web links exist

## Implementation Notes

The current implementation keeps the source UI frontend-only:

- `sendMessage` captures `web_sources` from the stream
- The assistant message stores a `resources` array for later rendering
- A `messageResources` map keeps per-message source items keyed by message id
- `showSources(message)` opens the drawer for the selected assistant message
- Duplicate URLs are removed before rendering
- Empty cards are never shown

## Reusable Helpers

The following helpers are the reusable parts of the pattern:

```ts
buildSourceItems(message)
extractMarkdownLinks(text)
normalizeResourcesFromStream(eventSources, answerText)
dedupeSourceItems(items)
buildProvenanceBlocks(message)
```

## Copyable UI Rules

- Keep resources attached to the assistant message, not as a global chat state.
- Open the resources panel from the answer actions row.
- Show the answer body first, then provenance labels, then link cards.
- Hide the panel content when no resources exist.
- Use one source card per unique URL.
- Prefer the backend `web_sources` payload over guessed or hardcoded sources.

## Suggested Reuse In Other Code

If you want this in another chat screen:

1. Add an optional `resources` field to that screen’s message type.
2. Capture `web_sources` from the streaming response.
3. Normalize those sources with markdown-link extraction.
4. Store the result per assistant message id.
5. Render a right-side drawer or inline panel with the same section order.

## Current Files

- [components/chat/ChatInterface.tsx](/D:/aman/my-ai-app/my-ai-app/components/chat/ChatInterface.tsx)
- [components/chat/types.ts](/D:/aman/my-ai-app/my-ai-app/components/chat/types.ts)
- [lib/types.ts](/D:/aman/my-ai-app/my-ai-app/lib/types.ts)

