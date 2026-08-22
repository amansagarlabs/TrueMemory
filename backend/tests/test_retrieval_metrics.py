from evaluation.retrieval_metrics import (
    citation_coverage,
    latency_summary,
    ndcg_at_k,
    recall_at_k,
    reciprocal_rank,
)


def test_recall_and_mrr_measure_relevant_hit_position():
    ranked = ["noise", "target", "other"]
    assert recall_at_k(ranked, {"target"}, 2) == 1.0
    assert reciprocal_rank(ranked, {"target"}) == 0.5


def test_ndcg_rewards_cross_encoder_ordering():
    relevance = {"target": 3.0, "related": 1.0, "noise": 0.0}
    before = ndcg_at_k(["noise", "target", "related"], relevance, 3)
    after = ndcg_at_k(["target", "related", "noise"], relevance, 3)
    assert after > before


def test_citations_and_latency_are_reportable():
    assert citation_coverage(["a", "b"], {"a"}) == 0.5
    assert latency_summary([10, 20, 40])["p50_ms"] == 20
    assert latency_summary([])["count"] == 0
