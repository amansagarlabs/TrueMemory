"use client";

import { Code2, Copy, FileDiff } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

const MonacoDiffSurface = dynamic(
  () =>
    import("@/components/coding/monaco-workbench-editor").then(
      (module) => module.MonacoDiffSurface,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[12px] text-white/35">
        Preparing review…
      </div>
    ),
  },
);

type DiffFile = {
  path: string;
  original: string;
  modified: string;
  added: number;
  removed: number;
};

function stripGitPrefix(path: string) {
  const normalized = path.trim().replace(/^"|"$/g, "");
  if (normalized === "/dev/null") return normalized;
  return normalized.replace(/^[ab]\//, "");
}

function createDiffFile(path = "changes.patch"): DiffFile {
  return { path, original: "", modified: "", added: 0, removed: 0 };
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let originalLines: string[] = [];
  let modifiedLines: string[] = [];
  let insideHunk = false;

  function ensureFile(path?: string) {
    if (current) return current;
    current = createDiffFile(path);
    return current;
  }

  function finishFile() {
    if (!current) return;
    current.original = originalLines.join("\n");
    current.modified = modifiedLines.join("\n");
    files.push(current);
    current = null;
    originalLines = [];
    modifiedLines = [];
    insideHunk = false;
  }

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      const match = line.match(/^diff --git (.+?) (.+)$/);
      current = createDiffFile(stripGitPrefix(match?.[2] || "changes.patch"));
      continue;
    }
    if (line.startsWith("--- ")) {
      if (current && insideHunk) finishFile();
      ensureFile(stripGitPrefix(line.slice(4)));
      continue;
    }
    if (line.startsWith("+++ ")) {
      const file = ensureFile(stripGitPrefix(line.slice(4)));
      const nextPath = stripGitPrefix(line.slice(4));
      if (nextPath !== "/dev/null") file.path = nextPath;
      continue;
    }
    if (line.startsWith("@@")) {
      const file = ensureFile();
      const range = line.match(
        /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/,
      );
      const oldStart = Math.max(1, Number(range?.[1] || 1));
      const newStart = Math.max(1, Number(range?.[2] || 1));
      const paddingLimit = 20_000;
      while (
        originalLines.length < oldStart - 1 &&
        originalLines.length < paddingLimit
      ) {
        originalLines.push("");
      }
      while (
        modifiedLines.length < newStart - 1 &&
        modifiedLines.length < paddingLimit
      ) {
        modifiedLines.push("");
      }
      insideHunk = true;
      void file;
      continue;
    }
    if (!insideHunk) continue;
    if (line.startsWith("\\ No newline")) continue;
    const file = ensureFile();
    if (line.startsWith("+")) {
      modifiedLines.push(line.slice(1));
      file.added += 1;
    } else if (line.startsWith("-")) {
      originalLines.push(line.slice(1));
      file.removed += 1;
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      originalLines.push(content);
      modifiedLines.push(content);
    }
  }
  finishFile();

  if (!files.length) {
    return [
      {
        path: "changes.patch",
        original: "",
        modified: diff,
        added: 0,
        removed: 0,
      },
    ];
  }
  return files;
}

export function AICodeDiffViewer({
  diff,
  onCopy,
  onOpenFile,
  workspaceKey = "coding-review",
}: {
  diff: string;
  onCopy?: () => void;
  onOpenFile?: (path: string, content: string) => void;
  workspaceKey?: string;
}) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || "");
  const selected =
    files.find((file) => file.path === selectedPath) || files[0];
  const added = files.reduce((total, file) => total + file.added, 0);
  const removed = files.reduce((total, file) => total + file.removed, 0);

  return (
    <section
      className="flex h-full min-h-64 min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f1113]"
      aria-label="AI code changes"
    >
      <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
        <FileDiff
          className="size-3.5 text-[#f6b15b]"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-white/70">
          AI Code Changes
        </span>
        <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/45">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-emerald-300/80">
          +{added}
        </span>
        <span className="font-mono text-[10px] text-red-300/80">
          −{removed}
        </span>
        {onOpenFile && selected ? (
          <button
            type="button"
            onClick={() => onOpenFile(selected.path, selected.modified)}
            className="ml-1 inline-flex min-h-7 items-center gap-1.5 rounded-md border border-white/[0.08] px-2 text-[9px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff]"
          >
            <Code2 className="size-3" aria-hidden="true" />
            Open in editor
          </button>
        ) : null}
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy diff"
            className="ml-1 grid size-8 place-items-center rounded-md text-white/35 transition-colors duration-100 hover:bg-white/[0.07] hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b]"
          >
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {files.length > 1 ? (
        <div
          className="flex min-h-9 shrink-0 overflow-x-auto border-b border-white/[0.07] bg-[#0d0f11]"
          role="tablist"
          aria-label="Changed files"
        >
          {files.map((file) => (
            <button
              type="button"
              role="tab"
              aria-selected={file.path === selected.path}
              key={file.path}
              onClick={() => setSelectedPath(file.path)}
              className={`min-w-36 max-w-56 shrink-0 truncate border-r border-white/[0.07] px-3 text-left text-[11px] transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e67d2b] ${
                file.path === selected.path
                  ? "bg-white/[0.07] text-white/82"
                  : "text-white/38 hover:bg-white/[0.04] hover:text-white/68"
              }`}
            >
              {file.path}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MonacoDiffSurface
          key={selected.path}
          workspaceKey={workspaceKey}
          path={selected.path}
          original={selected.original}
          modified={selected.modified}
          className="h-full"
        />
      </div>
    </section>
  );
}
