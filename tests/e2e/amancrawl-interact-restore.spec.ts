import { expect, test } from "@playwright/test";

test("amancrawl shows restore popup for stale interact sessions", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "aman_session",
      value: "test-session-token",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

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
          "crawl:scrape": { used: 0, limit: 1000, period: "daily", remaining: 1000, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:map": { used: 0, limit: 500, period: "daily", remaining: 500, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:search": { used: 0, limit: 1000, period: "daily", remaining: 1000, reset_at: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
          "crawl:crawl": { used: 0, limit: 200, period: "monthly", remaining: 200, reset_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(), tokens_input: 0, tokens_output: 0, cost_cents: 0 },
        },
      }),
    });
  });

  await page.route("**/api/web/scrape", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        cached: false,
        data: {
          scrapeId: "scrape_restore_123",
          markdown: "# Example",
          html: "<html><body><h1>Example</h1></body></html>",
          metadata: {
            title: "Example",
            description: "Example page",
            statusCode: 200,
            sourceURL: "https://example.com",
          },
          links: [],
        },
      }),
    });
  });

  await page.route("**/api/web/interact/scrape_restore_123/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scrapeId: "scrape_restore_123",
          sourceUrl: "https://example.com",
          currentUrl: "https://example.com",
          lastAction: "click",
          status: "stale",
          lastUsedAt: Date.now(),
          createdAt: Date.now(),
          hasStorageState: true,
          canRestore: false,
        },
      }),
    });
  });

  await page.route("**/api/web/interact/scrape_restore_123/restore", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: "Unable to restore session. Start a new browser?",
        recoverable: true,
      }),
      status: 409,
    });
  });

  await page.route("**/api/web/interact/scrape_restore_123", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto("/amancrawl?tool=scrape");
  await page.locator('input[type="url"]').fill("https://example.com");
  await page.getByRole("button", { name: /run scrape/i }).click();

  await expect(page.getByText("session stale")).toBeVisible();
  await page.getByRole("button", { name: "session stale" }).click();
  await expect(page.getByRole("heading", { name: "Browser session" })).toBeVisible();
  await expect(page.getByText("Unable to restore session. Start a new browser?")).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Browser session" })).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("heading", { name: "Browser session" })).not.toBeVisible();
});
