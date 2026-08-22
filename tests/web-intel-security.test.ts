import test from "node:test";
import assert from "node:assert/strict";

import { validatePublicUrl } from "../lib/web-intel";

test("web URL validation blocks private and metadata addresses", async () => {
  await assert.rejects(() => validatePublicUrl("http://127.0.0.1"), /private network/);
  await assert.rejects(() => validatePublicUrl("http://localhost"), /private network/);
  await assert.rejects(() => validatePublicUrl("http://169.254.169.254/latest/meta-data"), /private network/);
});

test("web URL validation accepts a public HTTPS host", async () => {
  assert.equal(await validatePublicUrl("https://example.com"), "https://example.com/");
});
