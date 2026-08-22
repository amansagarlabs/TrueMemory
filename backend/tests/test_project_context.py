import asyncio

import services.project_context as project_context


def test_active_project_is_added_once_and_explicit_mention_is_preserved() -> None:
    implicit = project_context.ensure_project_mention(
        [{"kind": "memory", "id": "workspace-memory", "label": "Workspace"}],
        project_id="project-1",
        project_label="Launch",
    )
    assert implicit[-1] == {
        "kind": "project",
        "id": "project-1",
        "label": "Launch",
    }

    explicit = project_context.ensure_project_mention(
        [{"kind": "projects", "id": "project-1", "label": "Explicit launch"}],
        project_id="project-1",
        project_label="Launch",
    )
    assert explicit == [
        {"kind": "projects", "id": "project-1", "label": "Explicit launch"}
    ]


def test_project_context_includes_ranked_artifact_chunks(monkeypatch) -> None:
    monkeypatch.setattr(
        project_context,
        "list_project_context_records",
        lambda *_args, **_kwargs: [
            {
                "id": "project:project-1",
                "kind": "project",
                "label": "Launch",
                "content": "Ship the project",
                "score": 1.0,
                "metadata": {"resource_type": "project"},
            },
            {
                "id": "artifact:artifact-1",
                "kind": "document",
                "label": "Decision log",
                "content": "decision.pdf · application/pdf · ready",
                "score": 0.75,
                "metadata": {
                    "resource_type": "artifact",
                    "parent_id": "project:project-1",
                    "relation": "contains_artifact",
                },
            },
        ],
    )
    monkeypatch.setattr(
        project_context,
        "retrieve_chunks",
        lambda *_args, **_kwargs: {
            "chunks": [
                {
                    "chunk_index": 2,
                    "page": 4,
                    "text": "The team selected PostgreSQL for durable project memory.",
                    "similarity": 0.91,
                }
            ]
        },
    )

    nodes = asyncio.run(project_context.retrieve_project_context_nodes(
        object(),
        project_id="project-1",
        user_id="user-1",
        question="Which database did we select?",
    ))

    chunk = next(node for node in nodes if node.id == "artifact-chunk:artifact-1:2")
    assert chunk.content == "The team selected PostgreSQL for durable project memory."
    assert chunk.metadata["parent_id"] == "artifact:artifact-1"
    assert chunk.metadata["relation"] == "contains_chunk"
    assert chunk.score == 0.91


def test_unindexed_artifact_does_not_break_project_context(monkeypatch) -> None:
    monkeypatch.setattr(
        project_context,
        "list_project_context_records",
        lambda *_args, **_kwargs: [
            {
                "id": "project:project-1",
                "kind": "project",
                "label": "Launch",
                "content": "Ship the project",
                "metadata": {"resource_type": "project"},
            },
            {
                "id": "artifact:artifact-1",
                "kind": "document",
                "label": "Pending upload",
                "content": "pending.pdf · application/pdf · uploaded",
                "metadata": {"resource_type": "artifact"},
            },
        ],
    )

    def fail_retrieval(*_args, **_kwargs):
        raise ValueError("not indexed")

    monkeypatch.setattr(project_context, "retrieve_chunks", fail_retrieval)

    nodes = asyncio.run(project_context.retrieve_project_context_nodes(
        object(),
        project_id="project-1",
        user_id="user-1",
        question="What is in this project?",
    ))

    assert [node.id for node in nodes] == [
        "project:project-1",
        "artifact:artifact-1",
    ]
