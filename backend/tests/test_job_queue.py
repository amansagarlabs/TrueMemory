import asyncio

from services.job_queue import InMemoryJobQueue, JobEnvelope


def test_test_queue_is_idempotent_by_key():
    queue = InMemoryJobQueue()
    first = JobEnvelope(job_type="memory_extraction", idempotency_key="event-1", payload_ref={"event_id": "event-1"})
    second = JobEnvelope(job_type="memory_extraction", idempotency_key="event-1", payload_ref={"event_id": "event-1"})
    asyncio.run(queue.enqueue(first))
    asyncio.run(queue.enqueue(second))
    assert len(queue.jobs) == 1


def test_job_envelope_contains_references_not_memory_content():
    job = JobEnvelope(job_type="consolidation_processing", payload_ref={"candidate_id": "cc_1"}, user_id="u1")
    assert job.payload_ref == {"candidate_id": "cc_1"}
    assert not hasattr(job, "content")
