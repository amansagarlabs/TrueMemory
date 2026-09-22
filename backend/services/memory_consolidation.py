"""Deterministic episodic-to-semantic consolidation.

This is an experimental planning layer. It never writes by itself: callers must
provide an explicit commit function after the Governor has accepted a candidate.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Callable, Iterable

from services.conflict_resolver import resolve_conflict
from services.experience_capture import Experience, ExperienceSource
from services.memory_governor import GovernorDecision, MemoryPolicy, govern_candidate


@dataclass(frozen=True)
class StabilitySignals:
    frequency: int
    evidence_count: int
    session_count: int
    cross_agent_count: int
    explicit_confirmation: bool
    contradiction: bool
    recency: float


@dataclass(frozen=True)
class ConsolidationCandidate:
    key: str
    value: str
    memory_type: str
    scope: str
    evidence_ids: list[str]
    stability: float
    reason: str
    novelty: dict[str, bool]
    signals: StabilitySignals
    source_type: str = "consolidation"
    confidence: float = 0.85
    importance_score: float = 0.75

    @property
    def content(self) -> str:
        return f"{self.key} = {self.value}"


@dataclass
class ConsolidationReport:
    mode: str
    dry_run: bool
    candidates: list[ConsolidationCandidate] = field(default_factory=list)
    decisions: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class _Fact:
    key: str
    value: str
    scope: str
    experience: Experience
    explicit: bool


_FACT_PATTERNS = (
    (re.compile(r"\b(?:i|we)\s+(?:still\s+)?(?:prefer|use|choose)\s+(?P<value>[A-Za-z0-9_.-]+)\b", re.I), "user.preference.frontend_language", "preference"),
    (re.compile(r"\b(?P<value>TypeScript|Python|JavaScript)\s+is\s+my\s+main\s+frontend\s+language\b", re.I), "user.preference.frontend_language", "preference"),
    (re.compile(r"\b(?:our|the|we use|we migrated back to)\s+(?P<value>PostgreSQL|MongoDB|SQLite)\b", re.I), "project.database", "fact"),
    (re.compile(r"\b(?:i am|i'm)\s+(?P<value>\d{1,3})\s*(?:years? old)?\b", re.I), "user.age", "fact"),
    (re.compile(r"\b(?:i am|i'm)\s+(?:moving to|switching to)\s+(?P<value>[A-Za-z0-9_.-]+)\s+for frontend\b", re.I), "user.preference.frontend_language", "preference"),
)


def _scope(experience: Experience) -> str:
    return str(experience.metadata.get("scope") or experience.metadata.get("workspace_id") or "user")


def _extract(experience: Experience) -> list[_Fact]:
    text = experience.content.strip()
    if re.search(r"\b(?:don't|do not|never|not)\b", text, re.I):
        return []
    facts: list[_Fact] = []
    for pattern, key, _kind in _FACT_PATTERNS:
        match = pattern.search(text)
        if match:
            facts.append(_Fact(key, match.group("value"), _scope(experience), experience, experience.source in {ExperienceSource.USER_INPUT, ExperienceSource.USER_CORRECTION}))
    return facts


def _recency(experiences: Iterable[Experience]) -> float:
    items = list(experiences)
    if not items:
        return 0.0
    newest = max(item.timestamp for item in items)
    age_days = max(0.0, (datetime.now(newest.tzinfo) - newest).total_seconds() / 86400)
    return round(1.0 / (1.0 + age_days), 4)


def _candidate(group: list[_Fact], existing: list[dict[str, Any]]) -> ConsolidationCandidate:
    first = group[0]
    values = {fact.value.casefold() for fact in group}
    same_value = len(values) == 1
    sessions = {fact.experience.conversation_id or fact.experience.run_id for fact in group if fact.experience.conversation_id or fact.experience.run_id}
    agents = {str(fact.experience.metadata.get("agent_id")) for fact in group if fact.experience.metadata.get("agent_id")}
    current = next((item for item in existing if item.get("key") == first.key and str(item.get("scope", "")) == first.scope and item.get("lifecycle_status") not in {"superseded", "deleted"}), None)
    contradiction = bool(current and str(current.get("content", "")).casefold() != first.value.casefold())
    signals = StabilitySignals(len(group), len(group), len(sessions), len(agents), any(f.explicit for f in group), contradiction, _recency(f.experience for f in group))
    stability = round(min(1.0, 0.35 + min(0.25, len(group) * 0.12) + min(0.2, len(sessions) * 0.1) + (0.15 if signals.explicit_confirmation else 0) + (0.05 if same_value else 0)), 4)
    reason = "repeated_across_sessions" if len(sessions) > 1 else ("repeated_observation" if len(group) > 1 else "single_strong_experience")
    return ConsolidationCandidate(first.key, first.value, "preference" if first.key.startswith("user.preference") else "fact", first.scope, [f.experience.experience_id for f in group], stability, reason, {"new_key": current is None, "contradiction": contradiction, "state_transition": contradiction}, signals)


def consolidate_experiences(
    experiences: Iterable[Experience],
    *,
    existing_memories: list[dict[str, Any]] | None = None,
    mode: str = "disabled",
    dry_run: bool = True,
    policy: MemoryPolicy | None = None,
    commit: Callable[[ConsolidationCandidate, Any], Any] | None = None,
) -> ConsolidationReport:
    """Build candidates and optionally commit governed candidates.

    `mode=disabled` always previews no candidates. `experimental` is still
    deterministic and requires `dry_run=False` plus an explicit commit callback.
    """
    report = ConsolidationReport(mode=mode, dry_run=dry_run)
    if mode != "experimental":
        report.metrics = {"experience_count": len(list(experiences)), "candidate_count": 0, "consolidated_count": 0, "rejected_count": 0, "conflict_count": 0, "novelty_signals": 0, "evidence_count": 0, "revision_count": 0}
        return report
    items = list(experiences)
    existing = existing_memories or []
    groups: dict[tuple[str, str, str], list[_Fact]] = {}
    for experience in items:
        for fact in _extract(experience):
            groups.setdefault((fact.key, fact.value.casefold(), fact.scope), []).append(fact)
    for group in groups.values():
        candidate = _candidate(group, existing)
        report.candidates.append(candidate)
        current = next((item for item in existing if item.get("key") == candidate.key and item.get("scope") == candidate.scope), None)
        conflict = resolve_conflict(candidate.content, candidate.memory_type, candidate.key, current) if current else None
        governed = govern_candidate(candidate, current, policy=policy)
        decision = {"key": candidate.key, "governor": governed.decision.value, "rule": governed.rule_id, "conflict": conflict.resolution.value if conflict else None, "evidence_ids": candidate.evidence_ids}
        report.decisions.append(decision)
        report.events.append({"event_type": "memory_consolidation_candidate_created", "candidate": decision})
        if not dry_run and commit and governed.decision not in {GovernorDecision.REJECT, GovernorDecision.NOOP}:
            commit(candidate, governed)
            report.events.append({"event_type": "memory_consolidated", "key": candidate.key, "evidence_ids": candidate.evidence_ids, "signals": asdict(candidate.signals)})
    report.metrics = {"experience_count": len(items), "candidate_count": len(report.candidates), "consolidated_count": len([e for e in report.events if e["event_type"] == "memory_consolidated"]), "rejected_count": sum(d["governor"] == "reject" for d in report.decisions), "conflict_count": sum(bool(d["conflict"]) for d in report.decisions), "novelty_signals": sum(sum(candidate.novelty.values()) for candidate in report.candidates), "evidence_count": sum(len(candidate.evidence_ids) for candidate in report.candidates), "revision_count": sum(d["conflict"] == "supersede" for d in report.decisions)}
    return report
