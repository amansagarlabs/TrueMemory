import pytest

from services.portable_memory import FORMAT, make_document, validate_document


def test_portable_round_trip_excludes_storage_internals():
    document = make_document([{
        "id": "memory-1", "key": "age", "content": "age = 19",
        "memory_type": "fact", "scope": "general", "revision": 1,
        "lifecycle_status": "current", "confidence_score": 0.97,
        "embedding": [0.1, 0.2], "table": "user_memories",
    }])
    assert document["format"] == FORMAT
    assert validate_document(document)[0]["memory_id"] == "memory-1"
    assert "embedding" not in str(document)
    assert "table" not in str(document)


def test_portable_validation_is_before_mutation():
    with pytest.raises(ValueError):
        validate_document({"format": FORMAT, "export": {"schema_version": "1"}, "memories": [{"key": "age"}]})


def test_unknown_relationship_is_rejected():
    document = make_document([{
        "id": "memory-1", "key": "age", "content": "age = 19",
        "memory_type": "fact", "scope": "general", "revision": 1,
        "relationships": [{"to_memory_id": "missing"}],
    }])
    with pytest.raises(ValueError, match="unknown memory"):
        validate_document(document)
