from services.router_experiments import compare_router_variants


def test_router_ab_preview_is_review_only_and_stable() -> None:
    result = compare_router_variants(["What do I do?", "What is React?"])
    assert result["production_variant"] == "v1"
    assert result["candidate_status"] == "review_only"
    assert result["changed_cases"] == 0
