import json
from types import SimpleNamespace

from rag.hybrid_retriever import HybridKnowledgeRetriever


def _settings(path, *, warm_retrieval_models=False):
    return SimpleNamespace(
        curated_kb_path=str(path),
        hybrid_top_k=3,
        hybrid_candidate_k=6,
        hybrid_dense_weight=0.55,
        hybrid_bm25_weight=0.45,
        cross_encoder_model="",
        embedding_model="all-MiniLM-L6-v2",
        warm_retrieval_models=warm_retrieval_models,
    )


def test_curated_retrieval_uses_lexical_fallback_without_loading_embeddings(tmp_path):
    path = tmp_path / "curated.jsonl"
    path.write_text(
        "\n".join(
            json.dumps(
                {
                    "id": "india",
                    "title": "India",
                    "text": "Mahatma Gandhi is commonly called the Father of the Nation in India.",
                    "source": "test",
                }
            )
            for _ in range(1)
        ),
        encoding="utf-8",
    )

    result = HybridKnowledgeRetriever(_settings(path)).search(
        "Who is called the Father of the Nation in India?",
        session_key="test:user",
    )

    assert result["chunks"]
    assert result["chunks"][0]["id"] == "india"
    assert result["dense"] is False
