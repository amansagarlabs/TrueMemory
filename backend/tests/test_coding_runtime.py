import asyncio
from io import BytesIO
from types import SimpleNamespace
import tarfile
from uuid import UUID, uuid4
import zipfile

import pytest

import services.coding_runtime as runtime


def _settings(tmp_path):
    return SimpleNamespace(
        coding_runtime_enabled=True,
        coding_runtime_root=str(tmp_path),
        coding_runtime_image="node:22-bookworm-slim",
        coding_runtime_memory="512m",
        coding_runtime_cpus=0.5,
        coding_runtime_pids=128,
    )


def _archive() -> bytes:
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        content = b'{"scripts":{"test":"node --test"}}'
        member = tarfile.TarInfo("aman-kontext/package.json")
        member.size = len(content)
        archive.addfile(member, BytesIO(content))
    return buffer.getvalue()


def _workspace_snapshot(files: dict[str, bytes] | None = None) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in (
            files or {"package.json": b'{"scripts":{"test":"node --test"}}'}
        ).items():
            archive.writestr(path, content)
    return buffer.getvalue()


def test_runtime_process_is_terminated_when_worker_cancels(monkeypatch) -> None:
    class Process:
        returncode = None

        def __init__(self):
            self.killed = False
            self.waiting = asyncio.Event()

        async def communicate(self, _input=None):
            if not self.killed:
                await self.waiting.wait()
            self.returncode = -9 if self.killed else 0
            return b"", b""

        def kill(self):
            self.killed = True
            self.waiting.set()

    process = Process()

    async def create_process(*_args, **_kwargs):
        return process

    monkeypatch.setattr(runtime.asyncio, "create_subprocess_exec", create_process)

    async def cancel_run():
        task = asyncio.create_task(runtime._run_process("docker", "version"))
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel_run())

    assert process.killed is True


def test_repository_index_reuses_fresh_user_scoped_cache(monkeypatch, tmp_path) -> None:
    downloads = 0

    async def download(**_kwargs):
        nonlocal downloads
        downloads += 1
        return _archive()

    monkeypatch.setattr(runtime, "_download_repository", download)
    settings = _settings(tmp_path)
    first_task = str(uuid4())
    second_task = str(uuid4())

    first = asyncio.run(
        runtime.prepare_code_index(
            settings,
            task_id=first_task,
            repository="aman/kontext",
            ref="main",
            github_token="secret",
            cache_scope="user-1",
        )
    )
    second = asyncio.run(
        runtime.prepare_code_index(
            settings,
            task_id=second_task,
            repository="aman/kontext",
            ref="main",
            github_token="secret",
            cache_scope="user-1",
        )
    )

    assert first["cache_hit"] is False
    assert second["cache_hit"] is True
    assert downloads == 1
    assert runtime.code_index_status(settings, task_id=second_task)["files"] == 1


def test_empty_github_repository_builds_an_empty_index(monkeypatch, tmp_path) -> None:
    async def download(**_kwargs):
        return b""

    monkeypatch.setattr(runtime, "_download_repository", download)
    settings = _settings(tmp_path)
    task_id = str(uuid4())

    indexed = asyncio.run(
        runtime.prepare_code_index(
            settings,
            task_id=task_id,
            repository="aman/empty",
            ref="main",
            github_token="secret",
            cache_scope="user-1",
        )
    )

    assert indexed["cache_hit"] is False
    assert indexed["files"] == 0


def test_local_snapshot_builds_index_without_github(monkeypatch, tmp_path) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    status = runtime.save_local_workspace_snapshot(
        settings,
        task_id=task_id,
        archive_bytes=_workspace_snapshot(
            {
                "package.json": b'{"dependencies":{"next":"16.2.12"}}',
                "app/page.tsx": b"export default function Page() { return <main /> }",
            }
        ),
    )

    assert status["files"] == 2
    indexed = asyncio.run(
        runtime.prepare_code_index(
            settings,
            task_id=task_id,
            repository="local:my-workspace-a1b2c3d4",
            ref="local",
            github_token="",
            cache_scope="user-1",
        )
    )

    assert indexed["cache_hit"] is False
    assert indexed["files"] == 2
    assert runtime.local_workspace_snapshot_status(
        settings,
        task_id=task_id,
    )["status"] == "ready"


def test_local_snapshot_rejects_traversal_and_private_files(tmp_path) -> None:
    settings = _settings(tmp_path)
    for path, reason in [
        ("../outside.txt", "unsafe_workspace_snapshot"),
        (".env", "workspace_snapshot_contains_private_file"),
        ("certs/server.pem", "workspace_snapshot_contains_private_file"),
    ]:
        try:
            runtime.save_local_workspace_snapshot(
                settings,
                task_id=str(uuid4()),
                archive_bytes=_workspace_snapshot({path: b"secret"}),
            )
        except ValueError as exc:
            assert str(exc) == reason
        else:
            raise AssertionError(f"{path} must be rejected")


def test_runtime_starts_with_locked_down_docker_controls(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        calls.append((args, timeout))
        if args[1] == "inspect":
            return runtime.RuntimeResult(1, "", "not found")
        return runtime.RuntimeResult(0, "container-id", "")

    async def download(**_kwargs):
        return _archive()

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(runtime, "_download_repository", download)
    task_id = str(uuid4())
    result = asyncio.run(
        runtime.start_runtime(
            _settings(tmp_path),
            task_id=task_id,
            repository="aman/kontext",
            ref="main",
            github_token="secret",
            plan_artifact="# Current Kontext Goal\n\nBuild the approved task.",
        )
    )

    docker_run = next(args for args, _timeout in calls if args[1] == "run")
    assert result["status"] == "running"
    assert "--network" in docker_run and "none" in docker_run
    assert "--read-only" in docker_run
    assert ["--cap-drop", "ALL"] == list(
        docker_run[docker_run.index("--cap-drop") : docker_run.index("--cap-drop") + 2]
    )
    assert "no-new-privileges" in docker_run
    assert "--pids-limit" in docker_run
    assert "--memory" in docker_run
    assert "--cpus" in docker_run
    assert (
        tmp_path / UUID(task_id).hex / "package.json"
    ).read_text(encoding="utf-8").startswith('{"scripts"')
    assert (
        tmp_path / UUID(task_id).hex / "plans-goals" / "task.md"
    ).read_text(encoding="utf-8").startswith("# Current Kontext Goal")
    assert any(args[1:4] == ("exec", runtime._container_name(task_id), "git") for args, _ in calls)


def test_empty_github_repository_starts_as_a_blank_git_workspace(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        calls.append((args, timeout))
        if args[1] == "inspect":
            return runtime.RuntimeResult(1, "", "not found")
        return runtime.RuntimeResult(0, "container-id", "")

    async def download(**_kwargs):
        return b""

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(runtime, "_download_repository", download)
    task_id = str(uuid4())
    result = asyncio.run(
        runtime.start_runtime(
            _settings(tmp_path),
            task_id=task_id,
            repository="aman/empty",
            ref="main",
            github_token="secret",
        )
    )

    assert result["status"] == "running"
    assert (tmp_path / UUID(task_id).hex).is_dir()
    assert any(args[1:4] == ("exec", runtime._container_name(task_id), "git") for args, _ in calls)


def test_runtime_can_mount_a_shared_deployment_volume(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        calls.append(args)
        if args[1] == "inspect":
            return runtime.RuntimeResult(1, "", "not found")
        return runtime.RuntimeResult(0, "container-id", "")

    async def download(**_kwargs):
        return _archive()

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(runtime, "_download_repository", download)
    settings = _settings(tmp_path)
    settings.coding_runtime_volume = "kontext-coding-workspaces"
    task_id = str(uuid4())

    asyncio.run(
        runtime.start_runtime(
            settings,
            task_id=task_id,
            repository="aman/kontext",
            ref="main",
            github_token="secret",
        )
    )

    docker_run = next(args for args in calls if args[1] == "run")
    mount = docker_run[docker_run.index("--mount") + 1]
    assert mount == (
        "type=volume,src=kontext-coding-workspaces,dst=/workspace,"
        f"volume-subpath={UUID(task_id).hex}"
    )


def test_local_runtime_starts_from_uploaded_snapshot(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        calls.append((args, timeout))
        if args[1] == "inspect":
            return runtime.RuntimeResult(1, "", "not found")
        return runtime.RuntimeResult(0, "container-id", "")

    monkeypatch.setattr(runtime, "_run_process", run)
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    runtime.save_local_workspace_snapshot(
        settings,
        task_id=task_id,
        archive_bytes=_workspace_snapshot(),
    )

    result = asyncio.run(
        runtime.start_runtime(
            settings,
            task_id=task_id,
            repository="local:my-workspace-a1b2c3d4",
            ref="local",
            github_token="",
        )
    )

    assert result["status"] == "running"
    assert (tmp_path / UUID(task_id).hex / "package.json").exists()
    assert any(args[1] == "run" for args, _timeout in calls)


def test_runtime_command_uses_docker_exec_without_host_shell(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        calls.append(args)
        if args[1] == "inspect":
            return runtime.RuntimeResult(0, "running\n", "")
        return runtime.RuntimeResult(0, "tests passed\n", "")

    monkeypatch.setattr(runtime, "_run_process", run)
    task_id = str(uuid4())
    result = asyncio.run(
        runtime.execute_runtime_command(
            _settings(tmp_path),
            task_id=task_id,
            command="npm test",
        )
    )

    assert result["stdout"] == "tests passed\n"
    assert calls[-1][:3] == ("docker", "exec", "--interactive")
    assert calls[-1][-3:] == ("sh", "-lc", "npm test")


def test_repository_archive_rejects_path_traversal(tmp_path) -> None:
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        content = b"secret"
        member = tarfile.TarInfo("repo/../../secret.txt")
        member.size = len(content)
        archive.addfile(member, BytesIO(content))

    try:
        runtime._extract_repository_archive(buffer.getvalue(), tmp_path / "workspace")
    except ValueError as exc:
        assert str(exc) == "unsafe_repository_archive"
    else:
        raise AssertionError("archive traversal must fail closed")


def test_patch_is_checked_before_it_is_applied(monkeypatch, tmp_path) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        if args[1] == "inspect":
            return runtime.RuntimeResult(0, "running\n", "")
        if "status" in args:
            return runtime.RuntimeResult(0, " M app/page.tsx\n", "")
        return runtime.RuntimeResult(0, "diff", "")

    async def run_with_input(*args, input_bytes, timeout=30.0):
        calls.append((args, input_bytes, timeout))
        return runtime.RuntimeResult(0, "", "")

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(runtime, "_run_process_with_input", run_with_input)
    patch = "--- a/app/page.tsx\n+++ b/app/page.tsx\n@@ -1 +1 @@\n-old\n+new\n"
    result = asyncio.run(
        runtime.apply_runtime_patch(
            _settings(tmp_path),
            task_id=str(uuid4()),
            patch=patch,
        )
    )

    assert calls[0][0][-3:] == ("--check", "--whitespace=error-all", "-")
    assert "--whitespace=fix" in calls[1][0]
    assert calls[0][1] == patch.encode("utf-8")
    assert result["files"] == ["app/page.tsx"]


def test_patch_falls_back_to_workspace_rebase_when_git_apply_fails(
    monkeypatch,
    tmp_path,
) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    workspace = runtime._workspace_path(settings, task_id)
    workspace.mkdir(parents=True)
    package_json = workspace / "package.json"
    package_json.write_text(
        '{\n  "name": "old-name"\n}\n',
        encoding="utf-8",
    )
    calls = []

    async def run_with_input(*args, input_bytes, timeout=30.0):
        calls.append((args, input_bytes, timeout))
        return runtime.RuntimeResult(
            1,
            "",
            "Patch context does not match package.json near line 1.",
        )

    async def status(_settings, *, task_id):
        return {"status": "running"}

    async def changes(_settings, *, task_id):
        return {
            "task_id": task_id,
            "files": ["package.json"],
            "status": " M package.json\n",
            "diff": "diff",
        }

    monkeypatch.setattr(runtime, "_run_process_with_input", run_with_input)
    monkeypatch.setattr(runtime, "runtime_status", status)
    monkeypatch.setattr(runtime, "runtime_changes", changes)

    result = asyncio.run(
        runtime.apply_runtime_patch(
            settings,
            task_id=task_id,
            patch=(
                "--- a/package.json\n"
                "+++ b/package.json\n"
                "@@ -1,3 +1,3 @@\n"
                " {\n"
                '-  "name": "old-name"\n'
                '+  "name": "new-name"\n'
                " }\n"
            ),
        )
    )

    assert len(calls) == 1
    assert '"new-name"' in package_json.read_text(encoding="utf-8")
    assert result["files"] == ["package.json"]


def test_working_tree_export_is_bounded_and_binary_safe(monkeypatch, tmp_path) -> None:
    async def changes(_settings, *, task_id):
        return {
            "task_id": task_id,
            "files": ["app/page.tsx", "old.txt"],
            "status": " M app/page.tsx\n D old.txt\n",
            "diff": "",
        }

    async def run_binary(*args, timeout=30.0):
        assert args[-1] == "app/page.tsx"
        return runtime.BinaryRuntimeResult(0, b"export default 1;\n", b"")

    monkeypatch.setattr(runtime, "runtime_changes", changes)
    monkeypatch.setattr(runtime, "_run_process_binary", run_binary)
    result = asyncio.run(
        runtime.export_runtime_working_tree(
            _settings(tmp_path),
            task_id=str(uuid4()),
        )
    )

    assert result["total_bytes"] == len(b"export default 1;\n")
    assert result["files"] == [
        {
            "path": "app/page.tsx",
            "status": "changed",
            "encoding": "base64",
            "content": "ZXhwb3J0IGRlZmF1bHQgMTsK",
        },
        {"path": "old.txt", "status": "deleted"},
    ]


def test_working_tree_records_reject_path_traversal() -> None:
    with pytest.raises(ValueError, match="unsafe_runtime_sync_path"):
        runtime._working_tree_records(" M ../outside.txt\n")


def test_validation_command_uses_existing_package_script(tmp_path) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    workspace = runtime._workspace_path(settings, task_id)
    workspace.mkdir(parents=True)
    (workspace / "package.json").write_text(
        '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1",'
        '"typecheck":"tsc --noEmit","build":"next build"}}',
        encoding="utf-8",
    )
    (workspace / "pnpm-lock.yaml").write_text("", encoding="utf-8")

    assert (
        runtime.detect_runtime_validation_command(settings, task_id=task_id)
        == "pnpm typecheck"
    )


def test_validation_command_detects_python_workspace(tmp_path) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    workspace = runtime._workspace_path(settings, task_id)
    workspace.mkdir(parents=True)
    (workspace / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\n",
        encoding="utf-8",
    )

    assert (
        runtime.detect_runtime_validation_command(settings, task_id=task_id)
        == "python -m pytest"
    )


def test_runtime_diagnostics_parse_typescript_and_eslint(tmp_path) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    workspace = runtime._workspace_path(settings, task_id)
    (workspace / "app").mkdir(parents=True)
    (workspace / "app" / "page.tsx").write_text("", encoding="utf-8")
    (workspace / "lib.ts").write_text("", encoding="utf-8")

    diagnostics = runtime.parse_runtime_diagnostics(
        settings,
        task_id=task_id,
        stdout=(
            "app/page.tsx(12,7): error TS2322: Type 'string' is not assignable.\n"
            f"{workspace / 'lib.ts'}\n"
            "  3:5  warning  Unexpected any  @typescript-eslint/no-explicit-any\n"
        ),
        stderr="",
    )

    assert diagnostics == [
        {
            "path": "app/page.tsx",
            "line": 12,
            "column": 7,
            "severity": "error",
            "message": "Type 'string' is not assignable.",
            "source": "validation",
            "code": "TS2322",
        },
        {
            "path": "lib.ts",
            "line": 3,
            "column": 5,
            "severity": "warning",
            "message": "Unexpected any",
            "source": "eslint",
            "code": "@typescript-eslint/no-explicit-any",
        },
    ]


def test_runtime_diagnostics_are_deduplicated_and_bounded(tmp_path) -> None:
    settings = _settings(tmp_path)
    task_id = str(uuid4())
    workspace = runtime._workspace_path(settings, task_id)
    workspace.mkdir(parents=True)
    repeated = "src/app.py:4:2: error E100: Broken import"

    diagnostics = runtime.parse_runtime_diagnostics(
        settings,
        task_id=task_id,
        stdout=f"{repeated}\n{repeated}",
        stderr="",
        limit=1,
    )

    assert len(diagnostics) == 1
    assert diagnostics[0]["path"] == "src/app.py"
    assert diagnostics[0]["code"] == "E100"


def test_latest_commit_exports_bounded_file_content(monkeypatch, tmp_path) -> None:
    async def run(*args, timeout=30.0):
        if args[1] == "inspect":
            return runtime.RuntimeResult(0, "running\n", "")
        if "ls-tree" in args:
            return runtime.RuntimeResult(0, "100755 blob abc\tapp.py\n", "")
        if "log" in args:
            return runtime.RuntimeResult(0, "Fix the app\n", "")
        return runtime.RuntimeResult(0, "", "")

    async def run_binary(*args, timeout=30.0):
        if "diff" in args:
            return runtime.BinaryRuntimeResult(
                0,
                b"M\x00app.py\x00D\x00old.py\x00",
                b"",
            )
        return runtime.BinaryRuntimeResult(0, b"print('ok')\n", b"")

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(runtime, "_run_process_binary", run_binary)
    result = asyncio.run(
        runtime.export_runtime_commit(
            _settings(tmp_path),
            task_id=str(uuid4()),
        )
    )

    assert result["message"] == "Fix the app"
    assert result["changes"][0] == {
        "path": "app.py",
        "status": "changed",
        "mode": "100755",
        "content": b"print('ok')\n",
    }
    assert result["changes"][1] == {"path": "old.py", "status": "deleted"}


def test_preview_proxy_only_reaches_task_container_localhost(
    monkeypatch,
    tmp_path,
) -> None:
    calls = []

    async def run(*args, timeout=30.0):
        if args[1] == "inspect":
            return runtime.RuntimeResult(0, "running\n", "")
        return runtime.RuntimeResult(0, "", "")

    async def run_binary_input(*args, input_bytes, timeout=30.0):
        calls.append((args, input_bytes))
        return runtime.BinaryRuntimeResult(
            0,
            b'{"status":200,"headers":{"Content-Type":"text/html"}}\n<h1>Ready</h1>',
            b"",
        )

    monkeypatch.setattr(runtime, "_run_process", run)
    monkeypatch.setattr(
        runtime,
        "_run_process_binary_with_input",
        run_binary_input,
    )
    task_id = str(uuid4())
    result = asyncio.run(
        runtime.proxy_runtime_preview(
            _settings(tmp_path),
            task_id=task_id,
            port=3000,
            path="/dashboard?mode=test",
            headers={"Accept": "text/html", "Authorization": "secret"},
        )
    )

    command = calls[0][0]
    assert command[:4] == (
        "docker",
        "exec",
        "--interactive",
        runtime._container_name(task_id),
    )
    assert "127.0.0.1" in runtime._PREVIEW_PROXY_SCRIPT
    assert "Authorization" not in command[-1]
    assert result["body"] == b"<h1>Ready</h1>"
