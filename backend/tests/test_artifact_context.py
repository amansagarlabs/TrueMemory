import asyncio

import services.artifact_context as artifact_context


def test_image_file_mentions_become_authorized_model_attachments(monkeypatch) -> None:
    monkeypatch.setattr(
        artifact_context,
        "get_artifact_for_user",
        lambda *_args, artifact_id, **_kwargs: {
            "id": artifact_id,
            "filename": f"{artifact_id}.png",
            "mime_type": "image/png",
        } if artifact_id == "owned-image" else None,
    )

    attachments = asyncio.run(
        artifact_context.resolve_mentioned_image_attachments(
            object(),
            user_id="user-1",
            mentions=[
                {"kind": "file", "id": "owned-image", "label": "Diagram"},
                {"kind": "file", "id": "private-image", "label": "Private"},
                {"kind": "api", "id": "ignored", "label": "API"},
            ],
        )
    )

    assert attachments == [
        {
            "artifact_id": "owned-image",
            "filename": "owned-image.png",
            "mime_type": "image/png",
        }
    ]


def test_document_mention_resolves_authorized_metadata_and_chunks(monkeypatch) -> None:
    monkeypatch.setattr(
        artifact_context,
        "get_artifact_for_user",
        lambda *_args, **_kwargs: {
            "id": "artifact-1",
            "title": "Architecture",
            "filename": "architecture.pdf",
            "mime_type": "application/pdf",
            "page_count": 12,
        },
    )
    monkeypatch.setattr(
        artifact_context,
        "retrieve_chunks",
        lambda *_args, **_kwargs: {
            "chunks": [
                {
                    "chunk_index": 7,
                    "page": 3,
                    "text": "The retrieval layer combines vector and full-text search.",
                    "similarity": 0.94,
                }
            ]
        },
    )

    nodes = asyncio.run(artifact_context.retrieve_mentioned_artifact_nodes(
        object(),
        user_id="user-1",
        question="How does retrieval work?",
        mentions=[
            {
                "kind": "document",
                "id": "artifact-1",
                "label": "Architecture",
            }
        ],
    ))

    assert [node.id for node in nodes] == [
        "artifact:artifact-1",
        "artifact-chunk:artifact-1:7",
    ]
    assert nodes[1].metadata["parent_id"] == "artifact:artifact-1"
    assert nodes[1].metadata["root_kind"] == "document"
    assert nodes[1].score == 0.94


def test_file_mention_is_authorized_and_unindexed_file_degrades_safely(
    monkeypatch,
) -> None:
    requested: list[tuple[str, str]] = []

    def load_artifact(_settings, *, artifact_id: str, user_id: str):
        requested.append((artifact_id, user_id))
        if artifact_id == "not-owned":
            return None
        return {
            "id": artifact_id,
            "title": "Notes",
            "filename": "notes.txt",
            "mime_type": "text/plain",
            "page_count": None,
        }

    monkeypatch.setattr(artifact_context, "get_artifact_for_user", load_artifact)
    monkeypatch.setattr(
        artifact_context,
        "retrieve_chunks",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("not indexed")),
    )

    nodes = asyncio.run(artifact_context.retrieve_mentioned_artifact_nodes(
        object(),
        user_id="user-1",
        question="Summarize this",
        mentions=[
            {"kind": "file", "id": "artifact-2", "label": "Notes"},
            {"kind": "file", "id": "not-owned", "label": "Private"},
            {"kind": "api", "id": "ignored", "label": "API"},
        ],
    ))

    assert requested == [
        ("artifact-2", "user-1"),
        ("not-owned", "user-1"),
    ]
    assert [node.id for node in nodes] == ["artifact:artifact-2"]
    assert nodes[0].kind == "file"
