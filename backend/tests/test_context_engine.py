from services.context_engine import ContextNode, build_context_graph


def test_context_graph_resolves_ranks_deduplicates_and_compresses() -> None:
    mentions = [{"kind": "documents", "id": "doc-1", "label": "Design"}]
    candidates = [
        ContextNode("a", "document", "Design", "Redis cache design. " * 400, "doc-1"),
        ContextNode("b", "document", "Copy", "Redis cache design. " * 400, "doc-1"),
        ContextNode("c", "document", "Other", "unselected", "doc-2"),
    ]
    graph = build_context_graph("How is Redis cached?", mentions, candidates, max_characters=800)

    assert len(graph.nodes) == 1
    assert graph.nodes[0].id == "a"
    assert len(graph.optimized_text) <= 800
    assert graph.edges[0].relation == "resolves_to"


def test_legacy_plural_kinds_remain_supported() -> None:
    graph = build_context_graph(
        "Use GitHub",
        [{"kind": "connectors", "id": "github", "label": "GitHub"}],
        [ContextNode("github", "connector", "GitHub", "Repository context", "github")],
    )
    assert graph.nodes[0].kind == "connector"


def test_project_mention_keeps_typed_children_and_relationship_edges() -> None:
    graph = build_context_graph(
        "What decisions are in this project?",
        [{"kind": "project", "id": "project-1", "label": "Launch"}],
        [
            ContextNode(
                "project:project-1",
                "project",
                "Launch",
                "Ship the launch",
                "project-1",
                metadata={"root_kind": "project"},
            ),
            ContextNode(
                "memory:decision-1",
                "memory",
                "Hosting decision",
                "Use PostgreSQL",
                "project-1",
                metadata={
                    "root_kind": "project",
                    "parent_id": "project:project-1",
                    "relation": "contains_memory",
                },
            ),
        ],
    )

    assert {node.kind for node in graph.nodes} == {"project", "memory"}
    assert any(edge.relation == "contains_memory" for edge in graph.edges)
    assert all(edge.source != "mention:memory:project-1" for edge in graph.edges)
