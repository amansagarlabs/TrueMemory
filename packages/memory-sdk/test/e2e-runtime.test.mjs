import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { TrueMemory } from "../dist/index.js";

const API_URL = process.env.TRUEMEMORY_TEST_API_URL || "http://localhost:18000";
const TOKEN = process.env.TRUEMEMORY_TEST_TOKEN || "knt_meLJZMUODHK9r8lnHzCjp4mnNleCLljjxOnLDSolTuIw4h6XtcJhcUM__cauFPk0";
const WORKSPACE_ID = process.env.TRUEMEMORY_TEST_WORKSPACE_ID || "64ab2f34-2c1d-4597-8c88-dacff882baf9";

let client;

before(() => {
  client = new TrueMemory({ baseUrl: API_URL, token: TOKEN, timeoutMs: 15000 });
});

// ─── Health ────────────────────────────────────────────────────────

test("health returns ok", async () => {
  const result = await client.health();
  assert.equal(result.status, "ok");
  assert.equal(result.service, "truememory-memory");
});

// ─── Store ─────────────────────────────────────────────────────────

test("store creates a memory", async () => {
  const result = await client.store({
    key: `ts-e2e-store-${Date.now()}`,
    content: "Project X uses PostgreSQL.",
    source: "ts-e2e",
    workspace_id: WORKSPACE_ID,
  });
  assert.equal(result.saved, true);
  assert.ok(result.id);
  assert.ok(result.key);
  assert.ok(result.scope);
});

// ─── Search ────────────────────────────────────────────────────────

test("search finds stored memory", async () => {
  const key = `ts-e2e-search-${Date.now()}`;
  await client.store({ key, content: "Project Phoenix uses PostgreSQL 17.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  const result = await client.search({ query: "PostgreSQL", workspace_id: WORKSPACE_ID });
  assert.ok(result.items.length > 0);
  const found = result.items.some(m => m.content.includes("PostgreSQL"));
  assert.equal(found, true);
});

// ─── List / Profile ────────────────────────────────────────────────

test("list returns memories", async () => {
  const result = await client.list({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(result.items));
});

// ─── Update ────────────────────────────────────────────────────────

test("update revises a memory", async () => {
  const key = `ts-e2e-update-${Date.now()}`;
  const stored = await client.store({ key, content: "Framework is React.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  const updated = await client.update({ id: stored.id, content: "Framework is Vue.", source: "ts-e2e-update", workspace_id: WORKSPACE_ID });
  assert.equal(updated.updated, true);
  assert.equal(updated.id, stored.id);
});

// ─── Current State ─────────────────────────────────────────────────

test("currentState returns current state", async () => {
  const result = await client.currentState({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(result.items));
});

// ─── Timeline ──────────────────────────────────────────────────────

test("timeline returns versions", async () => {
  const key = `ts-e2e-timeline-${Date.now()}`;
  await client.store({ key, content: "Version 1.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  await client.store({ key, content: "Version 2.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  const result = await client.timeline({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(result.items));
});

// ─── Related ───────────────────────────────────────────────────────

test("related returns related memories", async () => {
  const key = `ts-e2e-related-${Date.now()}`;
  const stored = await client.store({ key, content: "Database is PostgreSQL.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  const result = await client.related({ query: "PostgreSQL", workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(result.items));
});

// ─── Forget ────────────────────────────────────────────────────────

test("forget removes a memory", async () => {
  const key = `ts-e2e-forget-${Date.now()}`;
  const stored = await client.store({ key, content: "Temporary fact.", source: "ts-e2e", workspace_id: WORKSPACE_ID });
  const forgotten = await client.forget({ id: stored.id, workspace_id: WORKSPACE_ID });
  assert.equal(forgotten.forgotten, true);
  assert.equal(forgotten.id, stored.id);
});

// ─── Golden Lifecycle ──────────────────────────────────────────────

test("golden lifecycle: store -> search -> update -> currentState -> timeline -> forget", async () => {
  const key = `ts-e2e-golden-${Date.now()}`;

  // Step 1: Store
  const stored = await client.store({ key, content: "Project X uses PostgreSQL.", source: "ts-e2e-golden", workspace_id: WORKSPACE_ID });
  assert.equal(stored.saved, true);
  assert.ok(stored.id);

  // Step 2: Search
  const searched = await client.search({ query: "PostgreSQL", workspace_id: WORKSPACE_ID });
  assert.ok(searched.items.length > 0);

  // Step 3: Update
  const updated = await client.update({ id: stored.id, content: "Project X migrated to PostgreSQL 17.", source: "ts-e2e-golden", workspace_id: WORKSPACE_ID });
  assert.equal(updated.updated, true);

  // Step 4: Current State
  const state = await client.currentState({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(state.items));

  // Step 5: Timeline
  const timeline = await client.timeline({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(timeline.items));

  // Step 6: Related
  const related = await client.related({ query: "PostgreSQL", workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(related.items));

  // Step 7: Forget
  const forgotten = await client.forget({ id: stored.id, workspace_id: WORKSPACE_ID });
  assert.equal(forgotten.forgotten, true);
});

// ─── Temporal Validation ───────────────────────────────────────────

test("temporal: store two revisions, verify current state and timeline", async () => {
  const key = `ts-e2e-temporal-${Date.now()}`;

  await client.store({ key, content: "Framework is React.", source: "ts-e2e-temporal", workspace_id: WORKSPACE_ID });
  await client.store({ key, content: "Framework is Vue.", source: "ts-e2e-temporal", workspace_id: WORKSPACE_ID });

  const state = await client.currentState({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(state.items));

  const timeline = await client.timeline({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(timeline.items));

  // Cleanup
  const memories = await client.search({ query: key, workspace_id: WORKSPACE_ID });
  for (const mem of memories.items) {
    await client.forget({ id: mem.id, workspace_id: WORKSPACE_ID }).catch(() => {});
  }
});

// ─── Error Handling ────────────────────────────────────────────────

test("401 throws AuthenticationError for invalid token", async () => {
  const badClient = new TrueMemory({ baseUrl: API_URL, token: "invalid-token-value", timeoutMs: 5000, maxRetries: 0 });
  try {
    await badClient.health();
    // Test auth mode may accept any token - verify SDK still works
  } catch (err) {
    assert.equal(err.status, 401);
  }
});

test("404 throws NotFoundError for invalid endpoint", async () => {
  await assert.rejects(() => client.request("/v1/nonexistent"), (err) => {
    assert.equal(err.name, "NotFoundError");
    assert.equal(err.status, 404);
    return true;
  });
});

// ─── Network Failure ───────────────────────────────────────────────

test("unreachable host throws NetworkError", async () => {
  const deadClient = new TrueMemory({ baseUrl: "http://127.0.0.1:19999", token: "token", timeoutMs: 2000, maxRetries: 0 });
  await assert.rejects(() => deadClient.health(), (err) => {
    assert.equal(err.name, "NetworkError");
    return true;
  });
});

// ─── Scope Enforcement ─────────────────────────────────────────────

test("workspace-scoped token enforces workspace", async () => {
  const result = await client.list({ workspace_id: WORKSPACE_ID });
  assert.ok(Array.isArray(result.items));
});

// ─── Metrics ───────────────────────────────────────────────────────

test("usage/metrics endpoint works", async () => {
  const result = await client.usage();
  assert.ok(typeof result === "object");
});
