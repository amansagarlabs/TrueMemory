from evaluation.run_evals import run


def test_core_evaluation_gate_passes():
    report = run()
    assert report["gate"] == "pass"
    assert report["failed_cases"] == 0
    assert report["critical_failures"] == []
    assert report["metrics"]["unnecessary_web_rate"] == 0.0
