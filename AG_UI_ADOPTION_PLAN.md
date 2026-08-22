# AG-UI Adoption Plan

This project is not replacing the current chat system with AG-UI yet.

Instead, AmanAgentLab will gradually shape its existing SSE stream toward an AG-UI-style event model.

## Why This Approach

The app already has:

- streaming chat tokens
- status events
- artifact retrieval events
- document upload and preview
- memory search
- optional web search
- Postgres-backed chat history

AG-UI becomes most valuable when the app grows into a true agent runtime with multiple tools, interrupts, sub-agents, and richer UI state synchronization.

## Short Term

Keep the existing SSE stream.

Shape events closer to AG-UI by adding:

- event id
- event name
- timestamp
- sequence number
- stable payload shape

Implemented in:

- [backend/services/ag_ui_events.py](./backend/services/ag_ui_events.py)
- [backend/app/routes/chat.py](./backend/app/routes/chat.py)

## Medium Term

Expand the adapter into a clearer app-level event layer.

Suggested event categories:

- `agent.status`
- `tool.started`
- `tool.result`
- `message.delta`
- `run.finished`
- `run.error`
- `artifact.attached`
- `memory.saved`

The frontend can keep reading the legacy `type` field while gradually using the richer `event` field.

## Later

Consider real AG-UI integration when adding:

- LangGraph
- CrewAI
- CopilotKit
- OpenAI Agents SDK
- multi-agent workflows
- human approval or interrupt flows
- frontend tool calls
- generated UI components

## Current Event Compatibility

The backend now emits SSE payloads with both:

- `type`: existing frontend-compatible event type
- `event`: AG-UI-inspired event name

Example:

```json
{
  "id": "event-id",
  "type": "status",
  "event": "agent.status",
  "timestamp": "2026-06-11T00:00:00+00:00",
  "sequence": 123,
  "message": "Searching artifacts..."
}
```

This lets the app evolve without breaking the current UI.
