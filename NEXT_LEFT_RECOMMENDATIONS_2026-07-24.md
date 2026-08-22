# KONTEXT — What’s Left and Recommendation

Date: 2026-07-24

Current status:

- The chat sidebar and composer are being polished.
- Conversational follow-up routing is fixed so follow-up questions stay grounded in chat memory instead of drifting into web search.
- Project and memory surfaces are present, but the mention/context engine still needs more end-to-end hardening.

What is left:

1. Finish the @Mention context engine end to end.
   - Projects should resolve into a context graph.
   - Memory, files, conversations, connectors, MCP, GitHub, APIs, and databases should all resolve into structured context, not plain text.

2. Connect project selection to real workspace context.
   - A selected project should influence chat, artifacts, memory, and sidebar navigation consistently.

3. Remove remaining context duplication.
   - Profile memory, /memory, workspace memory, and conversation memory should stay distinct but not overlap visually or semantically.

4. Harden follow-up handling.
   - More “this / that / it / next / more about this” turns should stay attached to the previous answer.
   - Add regression tests for conversational continuity and mention routing.

5. Keep UI polish moving.
   - Sidebar hover states should feel smoother.
   - Composer surfaces should stay visually aligned with the dark theme.

Recommendation:

- Prioritize the context engine and project/memory wiring before any more surface-level UI work.
- Keep UI changes small and fluid, but do not let them interrupt the data-path work.
- Add tests around routing, mention resolution, and follow-up continuity before expanding features again.

Best next engineering moves:

- Resolve @Project into a real context graph with recent artifacts and conversations.
- Make project-scoped retrieval the default path inside chat.
- Normalize profile memory so it always reflects the live profile page state.
- Keep recent-chat follow-ups in memory unless the user explicitly asks for external search.
