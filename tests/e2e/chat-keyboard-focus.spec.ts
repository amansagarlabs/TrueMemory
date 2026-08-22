import { expect, test } from "@playwright/test";

const hasAuthenticatedState = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("chat composer keyboard and focus", () => {
  test.skip(
    !hasAuthenticatedState,
    "Set PLAYWRIGHT_STORAGE_STATE to an authenticated Kontext browser state.",
  );

  test.beforeEach(async ({ page }) => {
    await page.route("**/health", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          zilliz_configured: true,
          openrouter_configured: true,
          postgres_connected: true,
          postgres_mode: "local",
          postgres_database: "test",
          postgres_host: "localhost",
        }),
      });
    });
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Agent chat" })).toBeVisible();
  });

  test("focuses the composer and preserves Shift+Enter as a newline", async ({ page }) => {
    const composer = page.getByLabel("Message Kontext");
    const sendButton = page.getByRole("button", { name: "Send message" });

    await expect(composer).toBeFocused();
    await composer.fill("First line");
    await composer.press("Shift+Enter");
    await composer.type("Second line");

    await expect(composer).toHaveValue("First line\nSecond line");
    await expect(sendButton).toBeEnabled();
  });

  test("Escape closes quick actions and restores focus to its trigger", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Open composer actions" });

    await trigger.click();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Add files, images, or links" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("shows the selected response mode beside the model without changing the prompt", async ({ page }) => {
    const composer = page.getByLabel("Message Kontext");
    await composer.fill("Compare the latest releases");

    await page.getByRole("button", { name: "Open composer actions" }).click();
    await page.getByRole("button", { name: "Web search" }).click();

    await expect(composer).toHaveValue("Compare the latest releases");
    const webMode = page.getByRole("button", {
      name: "Web search mode selected. Turn off Web search mode",
    });
    await expect(webMode).toBeVisible();
    const webModeBox = await webMode.boundingBox();

    await page.getByRole("button", { name: "Open composer actions" }).click();
    await page.getByRole("button", { name: "Deep research" }).click();
    const researchMode = page.getByRole("button", {
      name: "Deep research mode selected. Turn off Deep research mode",
    });
    await expect(researchMode).toBeVisible();
    const researchModeBox = await researchMode.boundingBox();

    expect(Math.abs((researchModeBox?.x ?? 0) - (webModeBox?.x ?? 0))).toBeLessThanOrEqual(1);
  });

  test("Escape closes the model picker and restores trigger focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /Choose model, currently/i });

    await trigger.click();
    await expect(page.getByRole("textbox", { name: "Search models" })).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(trigger).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Choose a model" })).not.toBeVisible();
  });

  test("dark mode keeps the primary chat action orange with dark text", async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const sendButton = page.getByRole("button", { name: "Send message" });

    await expect(sendButton).toHaveCSS("background-color", "rgb(230, 125, 43)");
    await expect(sendButton).toHaveCSS("color", "rgb(23, 24, 20)");
  });

  test("shows a centered jump-to-latest control after the reader scrolls up", async ({ page }) => {
    const longAnswer = Array.from(
      { length: 90 },
      (_, index) => `Streaming answer line ${index + 1}`,
    ).join("\n");

    await page.route("**/api/**/stream", async (route) => {
      const events = [
        { type: "status", stage: "answer", message: "Preparing the answer..." },
        { type: "token", content: longAnswer },
        { type: "done", web_sources: [] },
      ];
      await route.fulfill({
        contentType: "text/event-stream",
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      });
    });

    const composer = page.getByLabel("Message Kontext");
    await composer.fill("Give me a detailed answer");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Streaming answer line 90")).toBeVisible();

    const thread = page.locator(".chat-scrollbar");
    await thread.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });

    const jumpButton = page.getByRole("button", { name: "Scroll to latest message" });
    await expect(jumpButton).toBeVisible();
    await jumpButton.click();

    await expect
      .poll(() =>
        thread.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(2);
    await expect(jumpButton).not.toBeVisible();
  });

  test("assistant actions provide feedback, sharing, and reporting workflows", async ({ page }) => {
    const feedbackPayloads: Array<Record<string, unknown>> = [];
    await page.route("**/api/chat/messages/*/feedback", async (route) => {
      feedbackPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ saved: true }),
      });
    });
    await page.route("**/api/**/stream", async (route) => {
      const events = [
        { type: "token", content: "A practical answer from Kontext." },
        {
          type: "done",
          message_id: "550e8400-e29b-41d4-a716-446655440000",
          web_sources: [],
        },
      ];
      await route.fulfill({
        contentType: "text/event-stream",
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      });
    });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => undefined,
      });
    });

    await page.getByLabel("Message Kontext").fill("Give me a practical answer");
    await page.getByRole("button", { name: "Send message" }).click();
    const answer = page.getByText("A practical answer from Kontext.");
    await expect(answer).toBeVisible();
    await answer.hover();

    const positiveFeedback = page.getByRole("button", { name: "Good response" });
    await positiveFeedback.click();
    await expect(
      page.getByRole("button", { name: "Remove positive feedback" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Share answer" }).click();
    await expect(page.getByRole("button", { name: "Shared" })).toBeVisible();

    await page.getByRole("button", { name: "Report answer" }).click();
    await expect(page.getByRole("heading", { name: "Report this response" })).toBeVisible();
    await page.getByLabel("Reason").selectOption("citation");
    await page.getByLabel(/Details/).fill("The linked source does not support the claim.");
    await page.getByRole("button", { name: "Submit report" }).click();

    await expect(page.getByRole("heading", { name: "Report this response" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Report submitted" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => feedbackPayloads.length).toBe(2);
    expect(feedbackPayloads[0]?.rating).toBe("up");
    expect(feedbackPayloads[1]?.report_reason).toBe("citation");
  });
});

test.describe("mobile chat composer", () => {
  test.skip(
    !hasAuthenticatedState,
    "Set PLAYWRIGHT_STORAGE_STATE to an authenticated Kontext browser state.",
  );
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("keeps primary composer actions touch-sized without horizontal overflow", async ({ page }) => {
    await page.goto("/chat");

    for (const control of [
      page.getByRole("button", { name: "Open composer actions" }),
      page.getByRole("button", { name: /Choose model, currently/i }),
      page.getByRole("button", { name: "Send message" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await expect(page.getByText("Enter to send · Shift + Enter for a new line")).toBeHidden();
  });
});
