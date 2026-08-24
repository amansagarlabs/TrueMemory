import { expect, test } from "@playwright/test";

const apiBase = process.env.TM_BASE_URL ?? "http://127.0.0.1:8000";
const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

test.use({ baseURL: origin });

test("TrueMemory works from an independent browser page", async ({ page, request }) => {
  const bootstrap = process.env.TM_TOKEN;
  const workspaceId = process.env.TM_WS ?? "00000000-0000-4000-8000-000000000002";
  const agentId = process.env.TM_AGENT ?? "00000000-0000-4000-8000-000000000003";
  expect(bootstrap, "TM_TOKEN must be a permitted onboarding/session credential").toBeTruthy();

  const issued = process.env.TM_TOKEN ? { token: process.env.TM_TOKEN } : await (async () => {
    const tokenResponse = await request.post(`${apiBase}/api/auth/api-tokens`, {
      headers: { Authorization: `Bearer ${bootstrap}`, Origin: origin },
      data: { name: "browser compatibility test", scopes: ["memory"], expires_days: 1, workspace_id: workspaceId, agent_id: agentId },
    });
    expect(tokenResponse.ok(), await tokenResponse.text()).toBeTruthy();
    return tokenResponse.json();
  })();

  const consoleErrors: string[] = [];
  const networkFailures: string[] = [];
  const responses: Array<{ url: string; status: number }> = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", requestEvent => networkFailures.push(`${requestEvent.url()}: ${requestEvent.failure()?.errorText}`));
  page.on("response", response => { if (response.url().startsWith(apiBase)) responses.push({ url: response.url(), status: response.status() }); });

  await page.goto("/");
  await page.evaluate(({ api, token, workspaceId: workspace, agentId: agent }) => {
    (globalThis as typeof globalThis & { __TRUEMEMORY_BROWSER_CONFIG__?: unknown }).__TRUEMEMORY_BROWSER_CONFIG__ = { baseUrl: api, token, workspaceId: workspace, agentId: agent };
  }, { api: apiBase, token: issued.token, workspaceId, agentId });
  await page.getByRole("button", { name: /run browser compatibility probe/i }).click();
  await expect(page.locator("#output")).toHaveText(/\S+/, { timeout: 30_000 });
  await expect(page.locator("#output")).not.toContainText("Provide a short-lived");
  const probe = JSON.parse(await page.locator("#output").textContent() ?? "{}");
  expect(probe.retrieved.items.some((item: { key: string; content: string }) => item.key === probe.key && item.content === "browser compatibility value")).toBeTruthy();
  expect(probe.searched.count).toBeGreaterThan(0);

  const wrongWorkspace = await page.evaluate(async ({ token, api }) => {
    const response = await fetch(`${api}/v1/memories/retrieve`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "browser", workspace_id: "wrong-workspace", agent_id: "browser-client" }) });
    return { status: response.status, body: await response.json() };
  }, { token: issued.token, api: apiBase });
  expect(wrongWorkspace.status).toBe(403);

  const disallowedPage = await page.context().newPage();
  await disallowedPage.goto("http://127.0.0.1:3000/");
  const disallowed = await disallowedPage.evaluate(async api => {
    try {
      await fetch(`${api}/v1/memory/health`, { headers: { Authorization: "Bearer intentionally-not-a-credential" } });
      return false;
    } catch {
      return true;
    }
  }, apiBase);
  expect(disallowed).toBeTruthy();
  await disallowedPage.close();
  expect(responses.some(response => response.status === 200)).toBeTruthy();
  expect(consoleErrors).toEqual(["Failed to load resource: the server responded with a status of 403 (Forbidden)"]);
  expect(networkFailures).toEqual([]);
});
