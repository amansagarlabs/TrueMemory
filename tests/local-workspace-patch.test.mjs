import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUnifiedPatchToLocalWorkspace,
  validateUnifiedPatchForLocalWorkspace,
} from "../components/coding/local-workspace.ts";

const shiftedPackagePatch = `--- a/package.json
+++ b/package.json
@@ -1,3 +1,3 @@
 {
-  "name": "old-name"
+  "name": "new-name"
 }`;

test("relocates an exact patch hunk when its line number is stale", async () => {
  const original = `\n{\n  "name": "old-name"\n}\n`;
  const validation = validateUnifiedPatchForLocalWorkspace(
    shiftedPackagePatch,
    { "package.json": original },
    new Set(["package.json"]),
  );
  assert.deepEqual(validation.files, ["package.json"]);

  let written = "";
  const handle = {
    kind: "file",
    name: "package.json",
    getFile: async () => new File([original], "package.json"),
    createWritable: async () => ({
      write: async (content) => {
        written = content;
      },
      close: async () => undefined,
    }),
  };
  const root = {
    kind: "directory",
    name: "workspace",
    values: async function* values() {},
    requestPermission: async () => "granted",
    getFileHandle: async () => handle,
  };

  await applyUnifiedPatchToLocalWorkspace(
    root,
    shiftedPackagePatch,
    { "package.json": original },
  );
  assert.match(written, /"name": "new-name"/);
});

test("rejects a stale patch instead of overwriting unmatched content", () => {
  assert.throws(
    () =>
      validateUnifiedPatchForLocalWorkspace(
        shiftedPackagePatch,
        { "package.json": '{\n  "name": "different"\n}\n' },
        new Set(["package.json"]),
      ),
    /changed after this patch was generated/,
  );
});

test("preflights every file before requesting write access", async () => {
  const patch = `${shiftedPackagePatch}
--- a/app/page.tsx
+++ b/app/page.tsx
@@ -1,1 +1,1 @@
-export default function Page() { return null }
+export default function Page() { return <main /> }`;
  let permissionRequests = 0;
  let writes = 0;
  const root = {
    kind: "directory",
    name: "workspace",
    values: async function* values() {},
    requestPermission: async () => {
      permissionRequests += 1;
      return "granted";
    },
    getFileHandle: async () => ({
      kind: "file",
      name: "file",
      getFile: async () => new File([], "file"),
      createWritable: async () => ({
        write: async () => {
          writes += 1;
        },
        close: async () => undefined,
      }),
    }),
  };

  await assert.rejects(
    applyUnifiedPatchToLocalWorkspace(
      root,
      patch,
      {
        "package.json": '{\n  "name": "old-name"\n}\n',
        "app/page.tsx": "export default function Different() { return null }\n",
      },
    ),
    /changed after this patch was generated/,
  );
  assert.equal(permissionRequests, 0);
  assert.equal(writes, 0);
});
