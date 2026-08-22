import assert from "node:assert/strict";
import test from "node:test";

import { unzipSync } from "fflate";

import { createLocalWorkspaceSnapshot } from "../components/coding/local-workspace-snapshot.ts";

function file(name, content) {
  const bytes = new TextEncoder().encode(content);
  return {
    kind: "file",
    name,
    async getFile() {
      return {
        size: bytes.byteLength,
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          );
        },
      };
    },
  };
}

function directory(name, entries) {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* entries;
    },
  };
}

test("packages source files while excluding generated and private paths", async () => {
  const root = directory("workspace", [
    file("package.json", '{"name":"safe"}'),
    file(".env", "SECRET=never-upload"),
    file(".env.example", "SECRET="),
    directory("app", [file("page.tsx", "export default function Page() {}")]),
    directory("node_modules", [file("package.json", '{"private":true}')]),
  ]);

  const snapshot = await createLocalWorkspaceSnapshot(root);
  const files = unzipSync(snapshot.archive);

  assert.deepEqual(Object.keys(files).sort(), [
    ".env.example",
    "app/page.tsx",
    "package.json",
  ]);
  assert.deepEqual(snapshot.excluded.sort(), [".env", "node_modules/"]);
});
