import test from "node:test";
import assert from "node:assert/strict";

import { buildAuthHeaders, getAuthToken, loadAuthUser, saveAuthSession } from "../frontend/lib/auth";
import type { AuthSession, AuthUser } from "../frontend/lib/types";

test("saving a sign-in session persists its bearer token for direct API requests", () => {
  const values = new Map<string, string>();
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  const previousEvent = globalThis.Event;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: () => true },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    value: class { constructor(readonly type: string) {} },
  });

  try {
    const session: AuthSession = {
      session_id: "session-id",
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: "2030-01-01T00:00:00Z",
    };
    const user: AuthUser = {
      id: "user-id",
      email: "user@example.test",
      plan: "free",
    };

    saveAuthSession(session, user);

    assert.equal(getAuthToken(), "test-access-token");
    assert.equal(buildAuthHeaders()["Authorization"], "Bearer test-access-token");
    assert.deepEqual(loadAuthUser(), user);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage });
    Object.defineProperty(globalThis, "Event", { configurable: true, value: previousEvent });
  }
});
