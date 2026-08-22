import { expect, test } from "@playwright/test";

test("limit modal refreshes usage when opened", async ({ page }) => {
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

  let usageFetches = 0;
  await page.route("**/api/subscriptions/usage", async (route) => {
    usageFetches += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        plan: "pro",
        usage: {
          "crawl:scrape": { used: 999, limit: 1000, period: "daily", remaining: 1, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:map": { used: 100, limit: 500, period: "daily", remaining: 400, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:search": { used: 200, limit: 1000, period: "daily", remaining: 800, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:crawl": { used: 50, limit: 200, period: "monthly", remaining: 150, reset_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
        },
      }),
    });
  });

  await page.route("**/api/web/scrape", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 429,
      body: JSON.stringify({
        success: false,
        error: "crawl:scrape limit reached",
        detail: {
          error: "limit_reached",
          resource: "crawl:scrape",
          plan: "pro",
          limit: 1000,
          used: 1000,
          remaining: 0,
          message: "You have reached the scrape limit.",
        },
      }),
    });
  });

  await page.goto("/amancrawl?tool=scrape");
  await page.locator('input[type="url"]').fill("https://example.com");
  await page.getByRole("button", { name: /run scrape/i }).click();

  await expect(page.getByRole("heading", { name: "Scrapes Limit Reached" })).toBeVisible();
  await expect.poll(() => usageFetches).toBeGreaterThanOrEqual(2);
});
