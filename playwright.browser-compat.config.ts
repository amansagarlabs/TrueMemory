import { defineConfig, devices } from "@playwright/test";

const testBaseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const testPort = new URL(testBaseUrl).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "truememory-browser-compat.spec.ts",
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: testBaseUrl },
  webServer: {
    command: "node scripts/browser-compat-server.mjs",
    url: testBaseUrl,
    reuseExistingServer: false,
    env: { BROWSER_COMPAT_PORT: testPort },
    timeout: 30_000,
  },
});
