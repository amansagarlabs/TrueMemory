from services.experience_capture import Experience, ExperienceSource
from services.memory_consolidation import consolidate_experiences


def _episode(text, session, source=ExperienceSource.USER_INPUT, **metadata):
    return Experience(source=source, content=text, conversation_id=session, metadata=metadata)


def test_repeated_preference_produces_candidate_with_evidence_and_signals():
    result = consolidate_experiences([
        _episode("I prefer TypeScript.", "a"),
        _episode("I still use TypeScript.", "b"),
        _episode("TypeScript is my main frontend language.", "c"),
    ], mode="experimental")
    candidate = result.candidates[0]
    assert candidate.key == "user.preference.frontend_language"
    assert candidate.value == "TypeScript"
    assert len(candidate.evidence_ids) == 3
    assert candidate.signals.session_count == 3
    assert result.metrics["evidence_count"] == 3


def test_disabled_mode_never_produces_or_commits_candidates():
    called = []
    result = consolidate_experiences([_episode("I am 20 now.", "a")], commit=lambda *_: called.append(True))
    assert result.candidates == []
    assert called == []


def test_conflicting_state_is_marked_novel_and_governed():
    result = consolidate_experiences(
        [_episode("We migrated back to MongoDB.", "a")],
        existing_memories=[{"key": "project.database", "scope": "user", "content": "PostgreSQL", "source": "user_message"}],
        mode="experimental",
    )
    assert result.candidates[0].novelty["contradiction"] is True
    assert result.metrics["conflict_count"] == 1


def test_candidate_identity_is_stable_and_changes_with_evidence():
    episodes = [_episode("I prefer TypeScript.", "a"), _episode("I still use TypeScript.", "b")]
    first = consolidate_experiences(episodes, mode="experimental").candidates[0]
    second = consolidate_experiences(episodes, mode="experimental").candidates[0]
    changed = consolidate_experiences(episodes + [_episode("TypeScript is my main frontend language.", "c")], mode="experimental").candidates[0]
    assert first.candidate_id == second.candidate_id
    assert first.candidate_id != changed.candidate_id
