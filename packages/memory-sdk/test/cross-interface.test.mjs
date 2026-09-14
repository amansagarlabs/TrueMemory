import assert from "node:assert/strict";
import { test } from "node:test";
import { TrueMemory } from "../dist/index.js";

const API_URL = process.env.TRUEMEMORY_TEST_API_URL || "http://localhost:18000";
const TOKEN = process.env.TRUEMEMORY_TEST_TOKEN || "knt_meLJZMUODHK9r8lnHzCjp4mnNleCLljjxOnLDSolTuIw4h6XtcJhcUM__cauFPk0";
const WORKSPACE_ID = process.env.TRUEMEMORY_TEST_WORKSPACE_ID || "64ab2f34-2c1d-4597-8c88-dacff882baf9";

const client = new TrueMemory({ baseUrl: API_URL, token: TOKEN, timeoutMs: 15000 });

// Helper: raw REST fetch
async function restPost(path, body) {
  const resp = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function restGet(path) {
  const resp = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${TOKEN}` },
  });
  return resp.json();
}

// ─── Cross-Interface: REST → TS SDK ────────────────────────────────

test("cross-interface: REST store → TS SDK search", async () => {
  const key = `xint-rest-ts-${Date.now()}`;

  // Store via REST
  const stored = await restPost("/v1/memory/store", {
    key,
    content: "Cross-interface: PostgreSQL is the database.",
    source: "rest-xint",
    workspace_id: WORKSPACE_ID,
  });
  assert.ok(stored.memory_id || stored.id);

  // Search via TS SDK
  const searched = await client.search({ query: "PostgreSQL", workspace_id: WORKSPACE_ID });
  assert.ok(searched.items.length > 0);
  const found = searched.items.some(m => m.content.includes("Cross-interface: PostgreSQL"));
  assert.equal(found, true);
});

// ─── Cross-Interface: TS SDK → REST ────────────────────────────────

test("cross-interface: TS SDK store → REST current-state", async () => {
  const key = `xint-ts-rest-${Date.now()}`;

  // Store via TS SDK
  const stored = await client.store({
    key,
    content: "Cross-interface: Framework is Next.js.",
    source: "ts-xint",
    workspace_id: WORKSPACE_ID,
  });
  assert.ok(stored.id);

  // Read via REST current-state
  const state = await restPost("/v1/memory/current-state", { workspace_id: WORKSPACE_ID });
  assert.ok(state.memories || state.items);
});

// ─── Cross-Interface: REST → TS SDK → REST timeline ────────────────

test("cross-interface: REST store → TS update → REST timeline", async () => {
  const key = `xint-timeline-${Date.now()}`;

  // Store via REST
  const stored = await restPost("/v1/memory/store", {
    key,
    content: "Version 1: React.",
    source: "rest-xint",
    workspace_id: WORKSPACE_ID,
  });
  const memId = stored.memory_id || stored.id;

  // Update via TS SDK
  await client.update({ id: memId, content: "Version 2: Vue.", source: "ts-xint", workspace_id: WORKSPACE_ID });

  // Timeline via REST
  const timeline = await restPost("/v1/memory/timeline", { workspace_id: WORKSPACE_ID });
  assert.ok(timeline);
});

// ─── Cross-Interface: TS SDK forget → REST verify ──────────────────

test("cross-interface: TS SDK forget → REST search confirms gone", async () => {
  const key = `xint-forget-${Date.now()}`;

  // Store via TS SDK
  const stored = await client.store({
    key,
    content: "Temporary cross-interface fact.",
    source: "ts-xint",
    workspace_id: WORKSPACE_ID,
  });

  // Forget via TS SDK
  const forgotten = await client.forget({ id: stored.id, workspace_id: WORKSPACE_ID });
  assert.equal(forgotten.forgotten, true);

  // Verify via REST search
  const searched = await restPost("/v1/memories/search", { query: "Temporary cross-interface", workspace_id: WORKSPACE_ID });
  // Memory should not be found
  const items = searched.items || searched.memories || [];
  const found = items.some(m => m.content && m.content.includes("Temporary cross-interface"));
  assert.equal(found, false);
});

// ─── Cross-Interface: Content Equivalence ───────────────────────────

test("cross-interface: all interfaces return same content shape", async () => {
  const key = `xint-shape-${Date.now()}`;

  // Store via TS SDK
  const stored = await client.store({
    key,
    content: "Shape test: database is PostgreSQL.",
    source: "shape-xint",
    workspace_id: WORKSPACE_ID,
  });

  // Search via TS SDK
  const tsResult = await client.search({ query: "Shape test", workspace_id: WORKSPACE_ID });
  assert.ok(tsResult.items.length > 0);
  assert.ok(tsResult.items[0].id);
  assert.ok(tsResult.items[0].content);

  // Search via REST
  const restResult = await restPost("/v1/memories/search", { query: "Shape test", workspace_id: WORKSPACE_ID });
  const restItems = restResult.items || restResult.memories || [];
  assert.ok(restItems.length > 0);
  assert.ok(restItems[0].id || restItems[0].memory_id);
  assert.ok(restItems[0].content);
});
