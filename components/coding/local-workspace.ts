import type { GithubRepositoryTreeEntry } from "@/services/github";

export type LocalFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{
    write: (data: string | BufferSource | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type LocalDirectoryHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterableIterator<LocalEntryHandle>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  isSameEntry?: (other: unknown) => Promise<boolean>;
  getFileHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<LocalFileHandle>;
  getDirectoryHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<LocalDirectoryHandle>;
  removeEntry?: (
    name: string,
    options?: { recursive?: boolean },
  ) => Promise<void>;
};

export type LocalEntryHandle = LocalFileHandle | LocalDirectoryHandle;

export type LocalDirectorySnapshot = {
  entries: GithubRepositoryTreeEntry[];
  fileHandles: Map<string, LocalFileHandle>;
  directoryHandles: Map<string, LocalDirectoryHandle>;
};

const LOCAL_WORKSPACE_DB = "kontext-coding-workspaces";
const LOCAL_WORKSPACE_STORE = "folders";
const LOCAL_WORKSPACE_LAST_KEY = "kontext-last-local-workspace";

export type PersistedLocalWorkspace = {
  key: string;
  userId: string;
  workspaceId: string;
  slug: string;
  folderName: string;
  projectId: string;
  handle: LocalDirectoryHandle;
  lastOpenedAt: string;
  activeFilePath?: string;
  openFilePaths?: string[];
};

function canUseLocalWorkspaceStorage() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openLocalWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_WORKSPACE_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_WORKSPACE_STORE)) {
        database.createObjectStore(LOCAL_WORKSPACE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local workspace storage is unavailable."));
  });
}

function runWorkspaceRequest<T>(request: IDBRequest<T>, database: IDBDatabase): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local workspace storage failed."));
    request.addEventListener("success", () => database.close(), { once: true });
    request.addEventListener("error", () => database.close(), { once: true });
  });
}

export async function savePersistedLocalWorkspace(record: PersistedLocalWorkspace) {
  if (!canUseLocalWorkspaceStorage()) return false;
  const database = await openLocalWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_WORKSPACE_STORE, "readwrite");
  const request = transaction.objectStore(LOCAL_WORKSPACE_STORE).put(record);
  await runWorkspaceRequest(request, database);
  localStorage.setItem(LOCAL_WORKSPACE_LAST_KEY, record.key);
  return true;
}

export async function getPersistedLocalWorkspace(key: string) {
  if (!canUseLocalWorkspaceStorage()) return null;
  const database = await openLocalWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_WORKSPACE_STORE, "readonly");
  const request = transaction.objectStore(LOCAL_WORKSPACE_STORE).get(key);
  return (await runWorkspaceRequest(request, database)) as PersistedLocalWorkspace | undefined ?? null;
}

export async function listPersistedLocalWorkspaces(userId: string, workspaceId: string) {
  if (!canUseLocalWorkspaceStorage()) return [];
  const database = await openLocalWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_WORKSPACE_STORE, "readonly");
  const request = transaction.objectStore(LOCAL_WORKSPACE_STORE).getAll();
  const records = (await runWorkspaceRequest(request, database)) as PersistedLocalWorkspace[];
  return records
    .filter((record) => record.userId === userId && record.workspaceId === workspaceId)
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

export async function findPersistedLocalWorkspace(
  userId: string,
  workspaceId: string,
  handle: LocalDirectoryHandle,
) {
  const records = await listPersistedLocalWorkspaces(userId, workspaceId);
  for (const record of records) {
    if (handle.isSameEntry && record.handle?.isSameEntry) {
      try {
        if (await handle.isSameEntry(record.handle)) return record;
      } catch {
        // A stale permission handle is treated as a new selection below.
      }
    }
    if (record.folderName === handle.name && !handle.isSameEntry) return record;
  }
  return null;
}

export function localWorkspaceKey(userId: string, workspaceId: string, slug: string) {
  return `${userId}:${workspaceId}:${slug}`;
}

export function loadLastLocalWorkspaceKey() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LOCAL_WORKSPACE_LAST_KEY) || "";
}

export function createLocalWorkspaceSlug(folderName: string) {
  const base = folderName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "local-workspace";
  const entropy = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${base}-${entropy}`;
}

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

function joinPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}

export async function readLocalDirectory(
  directory: LocalDirectoryHandle,
  parentPath = "",
): Promise<LocalDirectorySnapshot> {
  const entries: GithubRepositoryTreeEntry[] = [];
  const fileHandles = new Map<string, LocalFileHandle>();
  const directoryHandles = new Map<string, LocalDirectoryHandle>();

  for await (const handle of directory.values()) {
    const path = joinPath(parentPath, handle.name);
    entries.push({
      path,
      type: handle.kind === "directory" ? "tree" : "blob",
      sha: `local:${path}`,
      size: 0,
      mode: handle.kind === "directory" ? "040000" : "100644",
    });

    if (handle.kind === "directory") {
      directoryHandles.set(path, handle);
    } else {
      fileHandles.set(path, handle);
    }
  }

  entries.sort((left, right) => {
    if (left.type !== right.type) return left.type === "tree" ? -1 : 1;
    return left.path.localeCompare(right.path, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return { entries, fileHandles, directoryHandles };
}

function looksBinary(content: string) {
  return content.slice(0, 8_192).includes("\0");
}

export async function readLocalFile(handle: LocalFileHandle) {
  const file = await handle.getFile();

  if (file.size > MAX_PREVIEW_BYTES) {
    return `// ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB.\n// Local previews are limited to 2 MB to keep the editor responsive.`;
  }

  if (file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return `// ${file.name} is a ${file.type || "binary"} asset.\n// Binary assets are available to the workspace but are not rendered as source text.`;
  }

  const content = await file.text();
  if (looksBinary(content)) {
    return `// ${file.name} appears to be a binary file and cannot be displayed as source text.`;
  }
  return content;
}

type UnifiedPatchFile = {
  path: string;
  oldPath: string;
  hunks: Array<{ oldStart: number; lines: string[] }>;
};

function normalizePatchPath(value: string) {
  const path = value.trim().split(/\s+/)[0];
  if (path === "/dev/null") return path;
  return path.replace(/^[ab]\//, "").replaceAll("\\", "/");
}

function normalizePatchLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function patchLinesMatch(left: string, right: string) {
  return left === right || normalizePatchLine(left) === normalizePatchLine(right);
}

function parseUnifiedPatch(patch: string): UnifiedPatchFile[] {
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  const files: UnifiedPatchFile[] = [];
  let current: UnifiedPatchFile | null = null;
  let currentHunk: UnifiedPatchFile["hunks"][number] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("--- ") && lines[index + 1]?.startsWith("+++ ")) {
      const oldPath = normalizePatchPath(line.slice(4));
      const path = normalizePatchPath(lines[index + 1].slice(4));
      if (!path || path === "/dev/null") {
        throw new Error("Deleting local files from an AI patch is not supported.");
      }
      current = { path, oldPath, hunks: [] };
      files.push(current);
      currentHunk = null;
      index += 1;
      continue;
    }
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (current && hunk) {
      currentHunk = { oldStart: Number(hunk[1]), lines: [] };
      current.hunks.push(currentHunk);
      continue;
    }
    if (currentHunk && (/^[ +\-]/.test(line) || line.startsWith("\\ No newline"))) {
      currentHunk.lines.push(line);
    }
  }
  if (!files.length) throw new Error("No valid unified diff was found in the agent response.");
  if (files.some((file) => file.hunks.length === 0)) {
    throw new Error("Every file in a unified diff must contain at least one hunk.");
  }
  return files;
}

function findHunkStartCandidates(
  originalLines: string[],
  hunk: UnifiedPatchFile["hunks"][number],
  cursor: number,
) {
  const expected = hunk.lines
    .filter((line) => line.startsWith(" ") || line.startsWith("-"))
    .map((line) => line.slice(1));
  const preferred = Math.max(cursor, hunk.oldStart - 1);
  if (!expected.length) return [Math.min(preferred, originalLines.length)];

  const exactMatches: number[] = [];
  const relaxedMatches: number[] = [];
  const matchesAt = (start: number) =>
    expected.every((line, index) => patchLinesMatch(originalLines[start + index] || "", line));
  const lastStart = originalLines.length - expected.length;
  for (let start = cursor; start <= lastStart; start += 1) {
    if (matchesAt(start)) {
      if (expected.every((line, index) => originalLines[start + index] === line)) {
        exactMatches.push(start);
      } else {
        relaxedMatches.push(start);
      }
    }
  }
  const rank = (starts: number[]) =>
    starts
      .map((start) => ({
        start,
        distance: Math.abs(start - preferred),
      }))
      .sort((left, right) => left.distance - right.distance || left.start - right.start)
      .map((item) => item.start);
  return [...rank(exactMatches), ...rank(relaxedMatches)];
}

function tryApplyHunkAt(
  originalLines: string[],
  hunk: UnifiedPatchFile["hunks"][number],
  start: number,
  cursor: number,
) {
  if (start < cursor) return null;
  const result: string[] = [];
  let nextCursor = start;
  for (const line of hunk.lines) {
    if (line.startsWith("\\ No newline")) continue;
    const marker = line[0];
    const content = line.slice(1);
    if (marker === "+") {
      result.push(content);
      continue;
    }
    const current = originalLines[nextCursor];
    if (!patchLinesMatch(current || "", content)) return null;
    if (marker === " ") result.push(content);
    nextCursor += 1;
  }
  return {
    result,
    cursor: nextCursor,
  };
}

function applyPatchFile(original: string, file: UnifiedPatchFile) {
  const originalLines = original.replaceAll("\r\n", "\n").split("\n");
  if (!original && originalLines.length === 1) originalLines.length = 0;
  const result: string[] = [];
  let cursor = 0;

  for (const hunk of file.hunks) {
    const candidates = findHunkStartCandidates(
      originalLines,
      hunk,
      cursor,
    );
    let applied:
      | {
          result: string[];
          cursor: number;
        }
      | null = null;
    for (const hunkStart of candidates) {
      const prefix = originalLines.slice(cursor, hunkStart);
      const next = tryApplyHunkAt(originalLines, hunk, hunkStart, cursor);
      if (!next) continue;
      applied = {
        result: [...prefix, ...next.result],
        cursor: next.cursor,
      };
      break;
    }
    if (!applied) {
      throw new Error(
        `Patch context does not match ${file.path} near line ${cursor + 1}.`,
      );
    }
    result.push(...applied.result);
    cursor = applied.cursor;
  }
  result.push(...originalLines.slice(cursor));
  return result.length ? `${result.join("\n")}\n` : "";
}

export function validateUnifiedPatchForLocalWorkspace(
  patch: string,
  originals: Record<string, string>,
  existingPaths: ReadonlySet<string>,
) {
  const files = parseUnifiedPatch(patch);
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) {
      throw new Error(`The generated patch contains duplicate edits for ${file.path}.`);
    }
    seen.add(file.path);
    const exists = existingPaths.has(file.path);
    if (file.oldPath === "/dev/null" && exists) {
      throw new Error(`The generated patch tried to recreate existing file ${file.path}.`);
    }
    if (file.oldPath !== "/dev/null" && !exists) {
      throw new Error(`The generated patch referenced missing file ${file.path}.`);
    }
    applyPatchFile(file.oldPath === "/dev/null" ? "" : originals[file.path] || "", file);
  }
  return {
    files: files.map((file) => file.path),
  };
}

export async function applyUnifiedPatchToLocalWorkspace(
  root: LocalDirectoryHandle,
  patch: string,
  originals: Record<string, string>,
) {
  const files = parseUnifiedPatch(patch);
  const prepared = files.map((file) => {
    const segments = file.path.split("/").filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`Unsafe patch path: ${file.path}`);
    }
    const original = file.oldPath === "/dev/null" ? "" : originals[file.path] || "";
    return {
      file,
      segments,
      content: applyPatchFile(original, file),
    };
  });

  const permission = await root.requestPermission?.({ mode: "readwrite" });
  if (permission && permission !== "granted") {
    throw new Error("Write access was not granted for this local folder.");
  }
  const written = new Map<string, { content: string; handle: LocalFileHandle }>();

  for (const { file, segments, content } of prepared) {
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
      if (!directory.getDirectoryHandle) throw new Error("Browser cannot create local directories.");
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    if (!directory.getFileHandle) throw new Error("Browser cannot create local files.");
    const handle = await directory.getFileHandle(segments.at(-1)!, { create: true });
    if (!handle.createWritable) throw new Error("Browser does not provide writable file handles.");
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    written.set(file.path, { content, handle });
  }
  return written;
}

export type LocalWorkspaceSyncFile =
  | {
      path: string;
      status: "changed";
      encoding: "base64";
      content: string;
    }
  | {
      path: string;
      status: "deleted";
    };

export type LocalWorkspaceSyncResult =
  | {
      path: string;
      status: "changed";
      content: string;
      handle: LocalFileHandle;
    }
  | {
      path: string;
      status: "deleted";
    };

function decodeBase64(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function previewRuntimeFile(path: string, bytes: Uint8Array) {
  if (bytes.byteLength > MAX_PREVIEW_BYTES) {
    return `// ${path} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB.\n// Local previews are limited to 2 MB to keep the editor responsive.`;
  }
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return looksBinary(content)
      ? `// ${path} is a binary file and cannot be displayed as source text.`
      : content;
  } catch {
    return `// ${path} is a binary file and cannot be displayed as source text.`;
  }
}

export async function synchronizeLocalWorkspace(
  root: LocalDirectoryHandle,
  files: LocalWorkspaceSyncFile[],
) {
  const permission = await root.requestPermission?.({ mode: "readwrite" });
  if (permission && permission !== "granted") {
    throw new Error("Write access was not granted for this local folder.");
  }

  const results: LocalWorkspaceSyncResult[] = [];
  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    if (
      !segments.length ||
      segments.some((segment) => segment === "." || segment === "..")
    ) {
      throw new Error(`Unsafe workspace sync path: ${file.path}`);
    }
    let directory = root;
    let parentMissing = false;
    for (const segment of segments.slice(0, -1)) {
      if (!directory.getDirectoryHandle) {
        throw new Error("Browser cannot access local directories.");
      }
      try {
        directory = await directory.getDirectoryHandle(segment, {
          create: file.status === "changed",
        });
      } catch (reason) {
        if (
          file.status === "deleted" &&
          reason instanceof DOMException &&
          reason.name === "NotFoundError"
        ) {
          parentMissing = true;
          break;
        }
        throw reason;
      }
    }
    const name = segments.at(-1)!;
    if (file.status === "deleted") {
      if (parentMissing) {
        results.push({ path: file.path, status: "deleted" });
        continue;
      }
      if (!directory.removeEntry) {
        throw new Error("Browser cannot remove local files.");
      }
      try {
        await directory.removeEntry(name);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "NotFoundError")) {
          throw reason;
        }
      }
      results.push({ path: file.path, status: "deleted" });
      continue;
    }

    if (!directory.getFileHandle) {
      throw new Error("Browser cannot create local files.");
    }
    const handle = await directory.getFileHandle(name, { create: true });
    if (!handle.createWritable) {
      throw new Error("Browser does not provide writable file handles.");
    }
    const bytes = decodeBase64(file.content);
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    results.push({
      path: file.path,
      status: "changed",
      content: previewRuntimeFile(file.path, bytes),
      handle,
    });
  }
  return results;
}
