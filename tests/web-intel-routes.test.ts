import test from "node:test";
import assert from "node:assert/strict";

import { POST as searchPost } from "../app/api/web/search/route";
import { POST as scrapePost } from "../app/api/web/scrape/route";
import { POST as mapPost } from "../app/api/web/map/route";
import { GET as interactStatusGet } from "../app/api/web/interact/[scrapeId]/status/route";
import { POST as interactRestorePost } from "../app/api/web/interact/[scrapeId]/restore/route";
import { cacheService } from "../lib/cache/cache-service";
import { cacheKeys } from "../lib/cache/keys";
import { TTL } from "../lib/cache/ttl";

test("search route returns cached response without hitting provider", async () => {
  const key = cacheKeys.search("anthropic claude", 3);
  const cachedValue = {
    web: [
      {
        url: "https://example.com",
        title: "Example",
        description: "Cached result",
        markdown: "# Example",
        position: 1,
      },
    ],
  };
  await cacheService.set(key, cachedValue, TTL.SEARCH);

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (...args) => {
    fetchCalls += 1;
    throw new Error(`unexpected fetch: ${String(args[0])}`);
  };

  try {
    const response = await searchPost(
      new Request("http://localhost/api/web/search", {
        method: "POST",
        body: JSON.stringify({ query: "anthropic claude", limit: 3, formats: ["markdown"] }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.cached, true);
    assert.equal(body.data.web[0].title, "Example");
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
    await cacheService.invalidate(key);
  }
});

test("scrape route returns cached response without launching browser", async () => {
  const normalizedUrl = new URL("https://example.com").toString();
  const key = cacheKeys.scrape(normalizedUrl, ["markdown"]);
  const cachedValue = {
    markdown: "# Cached page",
    html: "<html><body><h1>Cached page</h1></body></html>",
    metadata: {
      title: "Cached page",
      description: "Cached description",
      statusCode: 200,
      sourceURL: "https://example.com",
    },
    links: ["https://example.com/about"],
  };
  await cacheService.set(key, cachedValue, TTL.SCRAPE_VOLATILE);

  const response = await scrapePost(
    new Request("http://localhost/api/web/scrape", {
      method: "POST",
      body: JSON.stringify({ url: normalizedUrl, formats: ["markdown"] }),
      headers: { "Content-Type": "application/json" },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cached, true);
  assert.equal(body.data.metadata.title, "Cached page");
  assert.equal(body.data.markdown, "# Cached page");

  await cacheService.invalidate(key);
});

test("map route returns cached response without hitting discovery flow", async () => {
  const normalizedUrl = new URL("https://docs.anthropic.com").toString();
  const key = cacheKeys.map(normalizedUrl);
  const cachedValue = {
    links: [
      { url: "https://docs.anthropic.com/en/docs", title: "Docs", depth: 1 },
    ],
  };
  await cacheService.set(key, cachedValue, TTL.MAP);

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("unexpected fetch");
  };

  try {
    const response = await mapPost(
      new Request("http://localhost/api/web/map", {
        method: "POST",
        body: JSON.stringify({ url: normalizedUrl, limit: 10 }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.cached, true);
    assert.equal(body.data.links[0].url, "https://docs.anthropic.com/en/docs");
  } finally {
    global.fetch = originalFetch;
    await cacheService.invalidate(key);
  }
});

test("interact status route returns stored session shape", async () => {
  const scrapeId = "scrape_test_123";
  const key = `session:scrape:${scrapeId}`;
  await cacheService.set(
    key,
    {
      scrapeId,
      sourceUrl: "https://example.com",
      currentUrl: "https://example.com/page",
      createdAt: 1,
      lastUsedAt: 2,
      status: "checkpointed",
      lastAction: "click",
      storageState: null,
    },
    TTL.SCRAPE_VOLATILE,
  );

  try {
    const response = await interactStatusGet(
      new Request(`http://localhost/api/web/interact/${scrapeId}/status`, { method: "GET" }),
      { params: Promise.resolve({ scrapeId }) },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.scrapeId, scrapeId);
    assert.equal(body.data.status, "checkpointed");
    assert.equal(body.data.lastAction, "click");
    assert.equal(body.data.hasStorageState, false);
  } finally {
    await cacheService.invalidate(key);
  }
});

test("interact restore route returns spec-shaped session data", async () => {
  const scrapeId = "scrape_restore_123";
  const key = `session:scrape:${scrapeId}`;
  await cacheService.set(
    key,
    {
      scrapeId,
      sourceUrl: "https://example.com",
      currentUrl: "https://example.com/page",
      createdAt: 1,
      lastUsedAt: 2,
      status: "checkpointed",
      lastAction: "fill",
      storageState: null,
    },
    TTL.SCRAPE_VOLATILE,
  );

  try {
    const response = await interactRestorePost(
      new Request(`http://localhost/api/web/interact/${scrapeId}/restore`, { method: "POST" }),
      { params: Promise.resolve({ scrapeId }) },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.scrapeId, scrapeId);
    assert.equal(body.data.canRestore, true);
  } finally {
    await cacheService.invalidate(key);
  }
});
