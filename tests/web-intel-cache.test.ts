import test from "node:test";
import assert from "node:assert/strict";

import { cacheService } from "../lib/cache/cache-service";
import { cacheKeys } from "../lib/cache/keys";
import { TTL, classifyFreshness } from "../lib/cache/ttl";

test("cache service stores and returns values in memory fallback", async () => {
  const key = cacheKeys.search("Kontext search", 3);
  await cacheService.invalidate(key);

  const first = await cacheService.get<{ ok: boolean }>(key);
  assert.equal(first, null);

  await cacheService.set(key, { ok: true }, TTL.SEARCH);
  const second = await cacheService.get<{ ok: boolean }>(key);
  assert.deepEqual(second, { ok: true });
});

test("freshness classifier prefers stable docs and volatile news", () => {
  assert.equal(classifyFreshness("https://docs.anthropic.com/en/docs"), "stable");
  assert.equal(classifyFreshness("https://news.ycombinator.com"), "volatile");
});
