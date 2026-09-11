"""Provider-neutral reference agent contract.

These tests use a fake SDK-shaped adapter and are intentionally independent of
Claude/Codex internals. Live transport validation belongs in the deployment
test suite.
"""

from dataclasses import dataclass


@dataclass
class AgentAdapter:
    memory: object
    agent_id: str

    def store(self, key, content, **kwargs):
        return self.memory.remember(key, content, agent_id=self.agent_id, **kwargs)

    def search(self, query, **kwargs):
        return self.memory.search(query, agent_id=self.agent_id, **kwargs)

    def update(self, memory_id, content, **kwargs):
        return self.memory.update(memory_id, content, agent_id=self.agent_id, **kwargs)

    def forget(self, memory_id, **kwargs):
        return self.memory.forget(memory_id, agent_id=self.agent_id, **kwargs)


def test_reference_agent_is_provider_neutral():
    class FakeMemory:
        def remember(self, key, content, **kwargs): return {"key": key, "content": content}
        def search(self, query, **kwargs): return [{"content": "PostgreSQL"}]
        def update(self, memory_id, content, **kwargs): return {"updated": True}
        def forget(self, memory_id, **kwargs): return {"forgotten": True}

    a = AgentAdapter(FakeMemory(), "agent-a")
    assert a.store("database", "PostgreSQL")["key"] == "database"
    assert a.search("database")[0]["content"] == "PostgreSQL"
