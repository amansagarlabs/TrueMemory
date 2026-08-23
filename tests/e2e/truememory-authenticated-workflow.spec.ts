import { expect, test } from "@playwright/test";

test("real signup and provider-first onboarding reach the authenticated product", async ({ page }) => {
  const email = `truememory-e2e-${Date.now()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("TrueMemory E2E");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill("TrueMemory-E2E-Password-123!");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "What are you building?" })).toBeVisible({ timeout: 15000 });
  for (let step = 1; step <= 3; step += 1) await page.locator('[data-slot="onboarding-next"]').click();
  await page.getByLabel("Space name").fill("E2E memory Space");
  await page.locator('[data-slot="onboarding-complete"]').click();
  await expect(page).toHaveURL(/\/chat\?workspace=/);
  await page.goto("/memory");
  await expect(page.getByRole("heading", { name: /Your memory, visible/ })).toBeVisible();
  await page.goto("/api-sdk");
  await expect(page.getByRole("heading", { name: /Build on one memory layer/ })).toBeVisible();
});
