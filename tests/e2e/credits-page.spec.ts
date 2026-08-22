import { expect, test } from "@playwright/test";

test("credits page renders backend usage summary", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "app-agent-auth-user",
      JSON.stringify({
        id: "user-1",
        email: "developer@example.com",
        full_name: "Context Developer",
        plan: "pro",
      }),
    );
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "user-1",
          email: "developer@example.com",
          full_name: "Context Developer",
          plan: "pro",
        },
      }),
    });
  });

  await page.route("**/api/subscriptions/usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        plan: "pro",
        usage: {
          "crawl:scrape": { used: 0, limit: 1000, period: "day", remaining: 1000, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:map": { used: 0, limit: 500, period: "day", remaining: 500, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:search": { used: 0, limit: 1000, period: "day", remaining: 1000, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:crawl": { used: 0, limit: 200, period: "month", remaining: 200, reset_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
        },
      }),
    });
  });

  await page.route("**/api/subscriptions/usage/providers", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          { provider: "openrouter", used: 12, cost_cents: 840 },
          { provider: "codex", used: 7, cost_cents: 430 },
          { provider: "claude", used: 4, cost_cents: 260 },
        ],
      }),
    });
  });

  await page.goto("/credits", { waitUntil: "domcontentloaded" });

  const creditsMain = page.locator("main.dark");
  await expect(creditsMain).toContainText("One usage ledger for every web action.");
  await expect(creditsMain).toContainText("Scrapes");
  await expect(creditsMain).toContainText("Maps");
  await expect(creditsMain).toContainText("Searches");
  await expect(creditsMain).toContainText("Crawls");
});
