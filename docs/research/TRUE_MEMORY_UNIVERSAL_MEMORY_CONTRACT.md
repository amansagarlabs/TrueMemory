# TrueMemory Universal Memory Contract v1

Seven operations are exposed through REST, MCP, Python SDK, and TypeScript
SDK. All require authenticated memory scope; user/workspace/project ownership
comes from server authorization. `agent_id`, provider, model, run, and session
are provenance metadata unless an explicitly authorized private scope is used.

Search/retrieve return `{items,count}`. Store returns `{saved,id,key,scope}`;
forget returns `{forgotten,id}`. Current state returns only active approved
records. Timeline returns `{items,count,next_cursor}` and preserves revisions;
it supports optional key, time bounds, `as_of`, order, and bounded limit.
Related accepts a known memory ID when workspace scope is supplied and returns
same-key or same-memory-type records within the authorized project. No graph
database is required. Errors use 401/403/404/409/422/429/5xx semantics.

MCP structured content mirrors REST semantics; annotations are descriptive and
do not replace authorization.
