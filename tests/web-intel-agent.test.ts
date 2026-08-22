import test from "node:test";
import assert from "node:assert/strict";

import { GET as getAgentStatus } from "../app/api/web/agent/[jobId]/status/route";
import { GET as getCacheStats } from "../app/api/admin/cache/stats/route";
import { DELETE as deleteCache } from "../app/api/admin/cache/route";

test("agent status route returns spec-shaped failure for missing job", async () => {
  const response = await getAgentStatus(new Request("http://localhost/api/web/agent/job_1/status"), {
    params: Promise.resolve({ jobId: "job_1" }),
  });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.status, "failed");
  assert.equal(body.error, "Job not found");
});

test("admin cache routes reject without authorization", async () => {
  const stats = await getCacheStats(new Request("http://localhost/api/admin/cache/stats"));
  assert.equal(stats.status, 401);
  const payload = await stats.json();
  assert.equal(payload.success, false);
});

test("admin invalidation route rejects malformed body without authorization", async () => {
  const response = await deleteCache(
    new Request("http://localhost/api/admin/cache", {
      method: "DELETE",
      body: JSON.stringify({ pattern: "cache:*" }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(response.status, 401);
});
