from pathlib import Path

from services.code_index import (
    IndexLimits,
    build_code_index,
    repository_map,
    search_code_index,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_index_extracts_symbols_imports_and_excludes_sensitive_files(tmp_path) -> None:
    _write(
        tmp_path / "app.py",
        "from services.users import UserService\n\n"
        "class Application:\n"
        "    def run(self):\n"
        "        return UserService()\n",
    )
    _write(
        tmp_path / "services" / "users.py",
        "class UserService:\n"
        "    def find_user(self, user_id: str):\n"
        "        return user_id\n",
    )
    _write(tmp_path / ".env", "DATABASE_PASSWORD=do-not-index\n")
    _write(tmp_path / "private.pem", "do-not-index\n")
    _write(tmp_path / "secrets.py", "class SecretStore:\n    pass\n")

    index = build_code_index(tmp_path)

    paths = {item["path"] for item in index["files"]}
    assert paths == {"app.py", "secrets.py", "services/users.py"}
    assert {symbol["name"] for symbol in index["files"][0]["symbols"]} >= {
        "Application",
        "run",
    }
    assert {
        (edge["source"], edge["target"])
        for edge in index["edges"]
    } == {("app.py", "services/users.py")}


def test_index_reuses_unchanged_files_and_refreshes_changed_files(tmp_path) -> None:
    _write(tmp_path / "alpha.py", "def alpha():\n    return 1\n")
    _write(tmp_path / "beta.py", "def beta():\n    return alpha()\n")
    first = build_code_index(tmp_path)
    _write(tmp_path / "beta.py", "def beta():\n    return 2\n")

    second = build_code_index(tmp_path, previous=first)

    assert second["stats"]["reused_files"] == 1
    beta = next(item for item in second["files"] if item["path"] == "beta.py")
    assert "return 2" in beta["chunks"][0]["text"]


def test_hybrid_search_ranks_symbol_and_path_matches_and_bounds_context(tmp_path) -> None:
    _write(
        tmp_path / "auth" / "session.ts",
        "export class SessionStore {\n"
        "  async createSession(userId: string) { return userId }\n"
        "}\n",
    )
    _write(
        tmp_path / "billing.ts",
        "export function createInvoice() { return 'invoice' }\n",
    )
    _write(
        tmp_path / "app.ts",
        "import { SessionStore } from '@/auth/session'\n"
        "export const sessions = new SessionStore()\n",
    )
    index = build_code_index(
        tmp_path,
        limits=IndexLimits(max_files=100, max_bytes=100_000, max_file_bytes=20_000),
    )

    result = search_code_index(
        index,
        "Where is createSession implemented?",
        limit=4,
        max_chars=2_000,
    )

    assert result["results"][0]["path"] == "auth/session.ts"
    assert "SessionStore" in result["context"]
    assert len(result["context"]) <= 2_000
    assert {
        (edge["source"], edge["target"]) for edge in index["edges"]
    } >= {("app.ts", "auth/session.ts")}


def test_repository_map_respects_character_budget(tmp_path) -> None:
    for number in range(20):
        _write(
            tmp_path / "src" / f"module_{number}.py",
            f"class Service{number}:\n    pass\n",
        )
    index = build_code_index(tmp_path)

    result = repository_map(index, max_chars=240)

    assert result.startswith("Repository map:")
    assert len(result) <= 240


def test_indexed_literal_and_regex_search_narrow_and_match_exact_text(tmp_path) -> None:
    _write(
        tmp_path / "auth.ts",
        "export function createSession(userId: string) { return userId }\n",
    )
    _write(tmp_path / "billing.ts", "export function createInvoice() { return 1 }\n")
    index = build_code_index(tmp_path)

    literal = search_code_index(index, "createSession", mode="literal")
    regex = search_code_index(index, r"create(Session|Invoice)", mode="regex")

    assert literal["results"][0]["path"] == "auth.ts"
    assert {result["path"] for result in regex["results"]} == {
        "auth.ts",
        "billing.ts",
    }
