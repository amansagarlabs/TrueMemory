"""Deterministic TrueMemory internal benchmark fixtures (not an SOTA claim)."""

from dataclasses import dataclass


@dataclass
class Record:
    key: str
    content: str
    scope: str
    valid_from: str | None = None
    valid_until: str | None = None
    forgotten: bool = False


def fixture_records() -> list[Record]:
    return [
        Record("editor", "prefers dark mode", "workspace-a"),
        Record("editor", "prefers light mode", "workspace-a", valid_from="2026-02-01"),
        Record("database", "uses postgres", "workspace-b"),
    ]


def retrieve(records: list[Record], query: str, scope: str, *, as_of: str | None = None) -> list[Record]:
    terms = set(query.lower().split())
    result = []
    for record in records:
        if record.scope != scope or record.forgotten:
            continue
        if not terms.issubset(set(f"{record.key} {record.content}".lower().split())):
            continue
        if as_of and record.valid_from and as_of < record.valid_from:
            continue
        if as_of and record.valid_until and as_of >= record.valid_until:
            continue
        result.append(record)
    return result


def run_internal_benchmark() -> dict[str, bool]:
    records = fixture_records()
    checks = {
        "preference_retrieval": bool(retrieve(records, "prefers dark mode", "workspace-a")),
        "scope_isolation": not retrieve(records, "uses postgres", "workspace-a"),
        "temporal_point_in_time": bool(retrieve(records, "prefers light mode", "workspace-a", as_of="2026-03-01")),
        "temporal_before_validity": not retrieve(records, "prefers light mode", "workspace-a", as_of="2026-01-01"),
        "abstention": not retrieve(records, "likes purple keyboards", "workspace-a"),
    }
    records[-1].forgotten = True
    checks["forgetting"] = not retrieve(records, "uses postgres", "workspace-b")
    return checks
