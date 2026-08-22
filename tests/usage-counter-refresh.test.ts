import test from "node:test";
import assert from "node:assert/strict";

import { startUsageRefreshTimer } from "../components/UsageCounter";

test("usage counter refresh helper fires immediately and on interval", async () => {
  const previousWindow = (globalThis as typeof globalThis & { window?: typeof globalThis }).window;
  const scope = globalThis as typeof globalThis & {
    window: typeof globalThis;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  };

  (scope as unknown as { window: Window }).window = scope as unknown as Window;

  let calls = 0;
  const cleanup = startUsageRefreshTimer(() => {
    calls += 1;
  }, 20);

  try {
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.ok(calls >= 2, `expected at least 2 refresh calls, got ${calls}`);
  } finally {
    cleanup();
    if (previousWindow) {
      scope.window = previousWindow;
    } else {
      delete (scope as { window?: typeof globalThis }).window;
    }
  }
});
