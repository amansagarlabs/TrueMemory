# Phase 10.3 Source Envelope

The reusable pipeline is `SourceEnvelope → Experience → MemoryCandidate → governed durable memory`.

Required fields: source type, stable source id, locator or payload hash, actor, observed_at, optional event_time, ingested_at, conversation/session/run id, parent experience id, and scope. Assistant/tool observations are never user facts without an authorized user statement or existing policy path. The current implementation preserves many of these fields across `Experience`, extraction metadata and durable storage; a single serialized envelope remains a follow-up.
