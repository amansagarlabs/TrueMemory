"""Incremental repository intelligence for coding agents.

The index is intentionally independent from the model and runtime. It produces a
small, serializable workspace map plus ranked source chunks that can be consumed
by chat, review, and execution agents.
"""

from __future__ import annotations

import ast
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import time
from typing import Any, Iterable

INDEX_VERSION = 2
MAX_FILE_BYTES = 1_000_000
MAX_INDEX_BYTES = 24_000_000
MAX_INDEX_FILES = 12_000
CHUNK_LINES = 80
CHUNK_OVERLAP = 12

IGNORED_DIRECTORIES = {
    ".git",
    ".hg",
    ".next",
    ".nuxt",
    ".output",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "venv",
}
SENSITIVE_NAMES = {
    ".env",
    ".npmrc",
    ".pypirc",
    ".netrc",
    "credentials",
    "credentials.json",
    "id_dsa",
    "id_ed25519",
    "id_rsa",
    "service-account.json",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
}
SENSITIVE_SUFFIXES = {".key", ".p12", ".pfx", ".pem"}
SOURCE_LANGUAGES = {
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".css": "css",
    ".go": "go",
    ".h": "c",
    ".hpp": "cpp",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".md": "markdown",
    ".mjs": "javascript",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scss": "scss",
    ".sh": "shell",
    ".sql": "sql",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".vue": "vue",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
}
IMPORTANT_NAMES = {
    "dockerfile",
    "makefile",
    "package.json",
    "pyproject.toml",
    "readme.md",
    "requirements.txt",
}
TOKEN_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{1,}")
JS_IMPORT_PATTERN = re.compile(
    r"(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?[\"']([^\"']+)[\"']"
    r"|require\(\s*[\"']([^\"']+)[\"']\s*\)"
)
JS_SYMBOL_PATTERN = re.compile(
    r"^\s*(?:export\s+)?(?:default\s+)?"
    r"(?:(?:async\s+)?function|class|interface|type|enum|const|let|var)\s+"
    r"([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)
GENERIC_SYMBOL_PATTERN = re.compile(
    r"^\s*(?:(?:pub|public|private|protected|export|async|static)\s+)*"
    r"(?:class|struct|enum|interface|trait|function|func|fn|def)\s+"
    r"([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)


@dataclass(frozen=True)
class IndexLimits:
    max_files: int = MAX_INDEX_FILES
    max_bytes: int = MAX_INDEX_BYTES
    max_file_bytes: int = MAX_FILE_BYTES


def _tokens(value: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(value)]


def _trigrams(value: str) -> set[str]:
    normalized = value.lower()
    return {
        normalized[position : position + 3]
        for position in range(max(0, len(normalized) - 2))
        if "\n" not in normalized[position : position + 3]
    }


def _build_text_search_index(files: list[dict[str, Any]]) -> dict[str, Any]:
    postings: dict[str, list[str]] = defaultdict(list)
    for file_item in files:
        for chunk in file_item.get("chunks", []):
            document_id = str(chunk.get("id") or "")
            if not document_id:
                continue
            searchable = (
                f"{file_item.get('path', '')} "
                f"{' '.join(chunk.get('symbols', []))} {chunk.get('text', '')}"
            )
            for gram in _trigrams(searchable):
                postings[gram].append(document_id)
    # Common grams create enormous posting lists and provide little pruning
    # value. Bound the serialized index so repository size cannot turn search
    # indexing into an unbounded memory/disk operation.
    max_postings = 2_000_000
    bounded: dict[str, list[str]] = {}
    used_postings = 0
    for gram in sorted(postings, key=lambda item: (len(postings[item]), item)):
        entries = postings[gram]
        if len(entries) > 4_096 or used_postings + len(entries) > max_postings:
            continue
        bounded[gram] = entries
        used_postings += len(entries)
    return {
        "postings": bounded,
        "documents": sum(len(item.get("chunks", [])) for item in files),
        "postings_count": used_postings,
    }


def _is_sensitive(path: Path) -> bool:
    name = path.name.lower()
    return (
        name in SENSITIVE_NAMES
        or name.startswith(".env.")
        or path.suffix.lower() in SENSITIVE_SUFFIXES
    )


def _language(path: Path) -> str | None:
    name = path.name.lower()
    if name in IMPORTANT_NAMES:
        return SOURCE_LANGUAGES.get(path.suffix.lower(), "text")
    return SOURCE_LANGUAGES.get(path.suffix.lower())


def _read_source(path: Path, max_file_bytes: int) -> str | None:
    try:
        size = path.stat().st_size
        if size <= 0 or size > max_file_bytes:
            return None
        raw = path.read_bytes()
    except (OSError, PermissionError):
        return None
    if b"\x00" in raw[:8_192]:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def _python_analysis(source: str) -> tuple[list[dict[str, Any]], list[str]]:
    symbols: list[dict[str, Any]] = []
    imports: list[str] = []
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return symbols, imports
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            symbols.append(
                {
                    "name": node.name,
                    "kind": "class" if isinstance(node, ast.ClassDef) else "function",
                    "line": int(node.lineno),
                    "end_line": int(getattr(node, "end_lineno", node.lineno)),
                }
            )
        elif isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = "." * int(node.level or 0) + (node.module or "")
            if module:
                imports.append(module)
    return symbols, list(dict.fromkeys(imports))


def _line_number(source: str, offset: int) -> int:
    return source.count("\n", 0, offset) + 1


def _lexical_analysis(
    source: str,
    language: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    symbol_pattern = (
        JS_SYMBOL_PATTERN if language in {"javascript", "typescript"} else GENERIC_SYMBOL_PATTERN
    )
    symbols = [
        {
            "name": match.group(1),
            "kind": "symbol",
            "line": _line_number(source, match.start()),
            "end_line": _line_number(source, match.end()),
        }
        for match in symbol_pattern.finditer(source)
    ]
    imports: list[str] = []
    if language in {"javascript", "typescript"}:
        imports = [
            first or second
            for first, second in JS_IMPORT_PATTERN.findall(source)
            if first or second
        ]
    return symbols, list(dict.fromkeys(imports))


def _chunks(source: str, path: str, symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lines = source.splitlines()
    if not lines:
        return []
    step = max(1, CHUNK_LINES - CHUNK_OVERLAP)
    result: list[dict[str, Any]] = []
    for start in range(0, len(lines), step):
        end = min(len(lines), start + CHUNK_LINES)
        related = [
            symbol["name"]
            for symbol in symbols
            if start + 1 <= int(symbol["line"]) <= end
        ]
        text = "\n".join(lines[start:end]).strip()
        if text:
            result.append(
                {
                    "id": f"{path}:{start + 1}:{end}",
                    "start_line": start + 1,
                    "end_line": end,
                    "symbols": related[:24],
                    "text": text,
                }
            )
        if end >= len(lines):
            break
    return result


def _candidate_paths(root: Path, limits: IndexLimits) -> Iterable[Path]:
    count = 0
    for current, directories, files in os.walk(root):
        directories[:] = sorted(
            item
            for item in directories
            if item.lower() not in IGNORED_DIRECTORIES and not item.startswith(".cache")
        )
        for name in sorted(files):
            path = Path(current) / name
            if _is_sensitive(path) or _language(path) is None:
                continue
            count += 1
            if count > limits.max_files:
                return
            yield path


def _resolve_import(
    source_path: str,
    imported: str,
    available: set[str],
) -> str | None:
    normalized = imported.strip()
    source_parent = PurePosixPath(source_path).parent
    if normalized.startswith(("@/", "~/")):
        normalized = normalized[2:]
    elif normalized.startswith(".") and not normalized.startswith(("./", "../")):
        level = len(normalized) - len(normalized.lstrip("."))
        base = source_parent
        for _ in range(max(0, level - 1)):
            base = base.parent
        normalized = str(base.joinpath(normalized[level:].replace(".", "/")))
    elif normalized.startswith(("./", "../")):
        normalized = str(source_parent.joinpath(imported)).replace("\\", "/")
        parts: list[str] = []
        for part in PurePosixPath(normalized).parts:
            if part == "..":
                if parts:
                    parts.pop()
            elif part not in {"", "."}:
                parts.append(part)
        normalized = "/".join(parts)
    else:
        normalized = normalized.replace(".", "/")
    normalized = normalized.lstrip("/")
    candidates = [
        normalized,
        *(f"{normalized}{suffix}" for suffix in SOURCE_LANGUAGES),
        *(f"{normalized}/index{suffix}" for suffix in SOURCE_LANGUAGES),
        f"{normalized}.py",
        f"{normalized}/__init__.py",
    ]
    return next((candidate for candidate in candidates if candidate in available), None)


def _connect_imports(files: list[dict[str, Any]]) -> list[dict[str, str]]:
    available = {item["path"] for item in files}
    edges: list[dict[str, str]] = []
    for item in files:
        resolved: list[str] = []
        for imported in item.get("imports", []):
            target = _resolve_import(item["path"], imported, available)
            if target and target != item["path"] and target not in resolved:
                resolved.append(target)
                edges.append({"source": item["path"], "target": target, "kind": "imports"})
        item["resolved_imports"] = resolved
    return edges


def build_code_index(
    root: Path,
    *,
    previous: dict[str, Any] | None = None,
    limits: IndexLimits | None = None,
) -> dict[str, Any]:
    """Build or incrementally refresh a safe, bounded repository index."""
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError("workspace_not_found")
    limits = limits or IndexLimits()
    previous_files = {
        item["path"]: item
        for item in (previous or {}).get("files", [])
        if isinstance(item, dict) and item.get("path") and item.get("sha256")
    }
    files: list[dict[str, Any]] = []
    total_bytes = 0
    reused = 0
    skipped = 0
    for path in _candidate_paths(root, limits):
        try:
            relative = path.relative_to(root).as_posix()
            size = path.stat().st_size
        except (OSError, ValueError):
            skipped += 1
            continue
        if total_bytes + size > limits.max_bytes:
            skipped += 1
            continue
        source = _read_source(path, limits.max_file_bytes)
        if source is None:
            skipped += 1
            continue
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
        old = previous_files.get(relative)
        if old and old.get("sha256") == digest:
            record = dict(old)
            reused += 1
        else:
            language = _language(path) or "text"
            if language == "python":
                symbols, imports = _python_analysis(source)
            else:
                symbols, imports = _lexical_analysis(source, language)
            record = {
                "path": relative,
                "language": language,
                "size": size,
                "line_count": source.count("\n") + 1,
                "sha256": digest,
                "symbols": symbols[:500],
                "imports": imports[:500],
                "chunks": _chunks(source, relative, symbols),
            }
        files.append(record)
        total_bytes += size
    edges = _connect_imports(files)
    return {
        "version": INDEX_VERSION,
        "created_at": time.time(),
        "root_name": root.name,
        "files": files,
        "edges": edges,
        "text_search": _build_text_search_index(files),
        "stats": {
            "files": len(files),
            "symbols": sum(len(item.get("symbols", [])) for item in files),
            "chunks": sum(len(item.get("chunks", [])) for item in files),
            "import_edges": len(edges),
            "bytes": total_bytes,
            "reused_files": reused,
            "skipped_files": skipped,
        },
    }


def _file_importance(index: dict[str, Any]) -> dict[str, float]:
    incoming = Counter(edge["target"] for edge in index.get("edges", []))
    importance: dict[str, float] = {}
    for item in index.get("files", []):
        path = item["path"]
        name = PurePosixPath(path).name.lower()
        importance[path] = (
            math.log2(2 + incoming[path]) * 1.8
            + math.log2(2 + len(item.get("symbols", [])))
            + (2.0 if name in IMPORTANT_NAMES else 0.0)
            - min(path.count("/") * 0.08, 0.8)
        )
    return importance


def repository_map(index: dict[str, Any], *, max_chars: int = 8_000) -> str:
    importance = _file_importance(index)
    files = sorted(
        index.get("files", []),
        key=lambda item: (-importance.get(item["path"], 0.0), item["path"]),
    )
    lines = ["Repository map:"]
    for item in files:
        symbols = ", ".join(symbol["name"] for symbol in item.get("symbols", [])[:12])
        imports = ", ".join(item.get("resolved_imports", [])[:6])
        detail = f"- {item['path']}"
        if symbols:
            detail += f" | symbols: {symbols}"
        if imports:
            detail += f" | imports: {imports}"
        if sum(len(line) + 1 for line in lines) + len(detail) + 1 > max_chars:
            break
        lines.append(detail)
    return "\n".join(lines)


def search_code_index(
    index: dict[str, Any],
    query: str,
    *,
    limit: int = 12,
    max_chars: int = 18_000,
    mode: str = "hybrid",
) -> dict[str, Any]:
    """Rank chunks with BM25 plus an indexed literal/regex candidate pass."""
    if mode not in {"hybrid", "literal", "regex"}:
        raise ValueError("search_mode_invalid")
    query_tokens = _tokens(query)
    if not query_tokens:
        return {
            "query": query,
            "results": [],
            "repository_map": repository_map(index, max_chars=min(8_000, max_chars)),
            "context": repository_map(index, max_chars=max_chars),
        }
    documents: list[tuple[dict[str, Any], dict[str, Any], list[str]]] = []
    document_frequency: Counter[str] = Counter()
    for file_item in index.get("files", []):
        for chunk in file_item.get("chunks", []):
            tokens = _tokens(
                f"{file_item['path']} {' '.join(chunk.get('symbols', []))} {chunk['text']}"
            )
            documents.append((file_item, chunk, tokens))
            document_frequency.update(set(tokens))
    if not documents:
        return {
            "query": query,
            "results": [],
            "repository_map": "",
            "context": "",
        }
    candidate_ids: set[str] | None = None
    postings = ((index.get("text_search") or {}).get("postings") or {})
    if mode in {"literal", "hybrid"}:
        candidate_grams = (
            set().union(*(_trigrams(token) for token in query_tokens))
            if query_tokens
            else set()
        )
    else:
        literal_runs = re.findall(r"[A-Za-z0-9_./:-]{3,}", query)
        candidate_grams = set().union(*(_trigrams(run) for run in literal_runs)) if literal_runs else set()
    if candidate_grams and postings:
        posting_lists = [set(postings.get(gram, [])) for gram in candidate_grams]
        posting_lists.sort(key=len)
        if posting_lists and posting_lists[0]:
            # Regex alternations and optional groups make full boolean
            # decomposition expensive. A union is a safe candidate superset;
            # deterministic regex matching below removes false positives.
            candidate_ids = set.union(*posting_lists)
            if len(candidate_ids) > 20_000:
                candidate_ids = None

    average_length = sum(len(tokens) for _, _, tokens in documents) / len(documents)
    importance = _file_importance(index)
    query_text = query.lower()
    scored: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
    for file_item, chunk, tokens in documents:
        if candidate_ids is not None and chunk.get("id") not in candidate_ids:
            continue
        searchable = f"{file_item['path']} {' '.join(chunk.get('symbols', []))} {chunk['text']}"
        if mode == "literal" and query.lower() not in searchable.lower():
            continue
        if mode == "regex":
            try:
                if re.search(query, searchable, flags=re.IGNORECASE) is None:
                    continue
            except re.error as exc:
                raise ValueError("search_regex_invalid") from exc
        frequencies = Counter(tokens)
        score = 0.0
        for token in query_tokens:
            frequency = frequencies[token]
            if not frequency:
                continue
            inverse_frequency = math.log(
                1 + (len(documents) - document_frequency[token] + 0.5)
                / (document_frequency[token] + 0.5)
            )
            denominator = frequency + 1.2 * (
                0.25 + 0.75 * len(tokens) / max(1.0, average_length)
            )
            score += inverse_frequency * frequency * 2.2 / denominator
        path_lower = file_item["path"].lower()
        symbol_names = [name.lower() for name in chunk.get("symbols", [])]
        score += sum(1.8 for token in query_tokens if token in path_lower)
        score += sum(2.4 for token in query_tokens if any(token in name for name in symbol_names))
        if query_text in path_lower:
            score += 5.0
        score += min(importance.get(file_item["path"], 0.0) * 0.12, 1.2)
        if score > 0:
            scored.append((score, file_item, chunk))
    scored.sort(key=lambda item: (-item[0], item[1]["path"], item[2]["start_line"]))
    results: list[dict[str, Any]] = []
    per_file: Counter[str] = Counter()
    for score, file_item, chunk in scored:
        if per_file[file_item["path"]] >= 3:
            continue
        per_file[file_item["path"]] += 1
        results.append(
            {
                "path": file_item["path"],
                "language": file_item["language"],
                "start_line": chunk["start_line"],
                "end_line": chunk["end_line"],
                "symbols": chunk.get("symbols", []),
                "score": round(score, 4),
                "text": chunk["text"],
            }
        )
        if len(results) >= max(1, min(limit, 50)):
            break
    map_budget = min(6_000, max(1_000, max_chars // 3))
    repo_map = repository_map(index, max_chars=map_budget)
    context_parts = [repo_map, "\nRelevant code:"]
    used = sum(len(part) for part in context_parts)
    included: list[dict[str, Any]] = []
    for result in results:
        block = (
            f"\n\n{result['path']}:{result['start_line']}-{result['end_line']}\n"
            f"```{result['language']}\n{result['text']}\n```"
        )
        if used + len(block) > max_chars:
            break
        context_parts.append(block)
        included.append(result)
        used += len(block)
    return {
        "query": query,
        "results": included,
        "repository_map": repo_map,
        "context": "".join(context_parts),
    }


def load_code_index(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
        return None
    if payload.get("version") != INDEX_VERSION or not isinstance(payload.get("files"), list):
        return None
    return payload


def save_code_index(index: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f"{path.stem}-",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        json.dump(index, temporary, ensure_ascii=False, separators=(",", ":"))
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)
