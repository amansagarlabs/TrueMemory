import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";

test("web API routes reject unauthenticated requests", async () => {
  const response = await middleware(
    new NextRequest("http://localhost/api/web/scrape", { method: "POST" }),
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "unauthenticated");
});
