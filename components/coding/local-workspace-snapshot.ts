import { zip } from "fflate";

import type {
  LocalDirectoryHandle,
  LocalFileHandle,
} from "@/components/coding/local-workspace";

const MAX_FILES = 20_000;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

function privateFile(name: string) {
  const value = name.toLowerCase();
  return (
    value === ".env" ||
    (value.startsWith(".env.") && value !== ".env.example") ||
    value === "id_rsa" ||
    value === "id_ed25519" ||
    value === ".npmrc" ||
    value === ".netrc" ||
    value === ".pypirc" ||
    value === ".git-credentials" ||
    value === "credentials.json" ||
    [".pem", ".key", ".p12", ".pfx"].some((suffix) => value.endsWith(suffix))
  );
}

async function collectFiles(
  directory: LocalDirectoryHandle,
  files: Record<string, Uint8Array>,
  excluded: string[],
  parentPath = "",
  totals = { files: 0, bytes: 0 },
) {
  for await (const handle of directory.values()) {
    const path = parentPath ? `${parentPath}/${handle.name}` : handle.name;
    if (handle.kind === "directory") {
      if (IGNORED_DIRECTORIES.has(handle.name.toLowerCase())) {
        excluded.push(`${path}/`);
        continue;
      }
      await collectFiles(handle, files, excluded, path, totals);
      continue;
    }
    if (privateFile(handle.name)) {
      excluded.push(path);
      continue;
    }
    const file = await (handle as LocalFileHandle).getFile();
    totals.files += 1;
    totals.bytes += file.size;
    if (
      totals.files > MAX_FILES ||
      totals.bytes > MAX_UNCOMPRESSED_BYTES
    ) {
      throw new Error(
        "The local workspace exceeds the 20,000 file or 100 MB snapshot limit.",
      );
    }
    files[path] = new Uint8Array(await file.arrayBuffer());
  }
  return totals;
}

function compressWorkspace(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, archive) => {
      if (error) reject(error);
      else resolve(archive);
    });
  });
}

export async function createLocalWorkspaceSnapshot(
  directory: LocalDirectoryHandle,
) {
  const files: Record<string, Uint8Array> = {};
  const excluded: string[] = [];
  const totals = await collectFiles(directory, files, excluded);
  if (!totals.files) {
    const excludedDirs = excluded.filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1));
    const hint = excludedDirs.length
      ? ` All folders were excluded: ${excludedDirs.join(", ")}. Open a folder that contains source files.`
      : " Open a folder that contains source files (not just node_modules or build output).";
    throw new Error(`The selected local workspace contains no uploadable files.${hint}`);
  }
  const archive = await compressWorkspace(files);
  return {
    archive,
    files: totals.files,
    uncompressedBytes: totals.bytes,
    compressedBytes: archive.byteLength,
    excluded,
  };
}
