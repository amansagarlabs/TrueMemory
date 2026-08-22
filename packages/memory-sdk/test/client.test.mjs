import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthenticationError, TrueMemory, NetworkError } from "../dist/index.js";

const response = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test("maps authentication failures to typed errors", async () => {
  const client = new TrueMemory({ baseUrl: "http://memory.test", token: "bad", fetch: async () => response(401, { detail: "invalid token" }) });
  await assert.rejects(() => client.health(), AuthenticationError);
});

test("retries safe GET requests but not writes", async () => {
  let calls = 0;
  const client = new TrueMemory({ baseUrl: "http://memory.test", token: "token", maxRetries: 1, fetch: async (_url, init) => { calls += 1; if (init.method === "POST") return response(500, {}); return calls === 1 ? response(503, {}) : response(200, { status: "ok", service: "memory" }); } });
  await client.health();
  assert.equal(calls, 2);
  await assert.rejects(() => client.remember({ key: "x", content: "y" }));
  assert.equal(calls, 3);
});

test("supports cancellation", async () => {
  const client = new TrueMemory({ baseUrl: "http://memory.test", token: "token", fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const controller = new AbortController();
  const pending = client.health({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, NetworkError);
});
