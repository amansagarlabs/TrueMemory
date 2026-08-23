import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "truememory-browser-compat.spec.ts",
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
  webServer: {
    command: "node scripts/browser-compat-server.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    env: { BROWSER_COMPAT_PORT: "3000" },
    timeout: 30_000,
  },
});
