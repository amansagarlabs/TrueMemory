import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3002";
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const serverPort = new URL(baseURL).port || "3002";
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION !== "0";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    storageState: storageState || undefined,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: useProductionServer
      ? `node node_modules/next/dist/bin/next start --port ${serverPort}`
      : `npm run dev -- --port ${serverPort}`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      PLAYWRIGHT_BYPASS_AUTH: "1",
    },
    gracefulShutdown: {
      signal: "SIGINT",
      timeout: 1000,
    },
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
