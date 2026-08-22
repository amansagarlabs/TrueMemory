import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "user-1",
  email: "developer@example.com",
  full_name: "Context Developer",
  plan: "pro",
  workspaces: [
    {
      id: "workspace-1",
      name: "Product workspace",
      platform: "Kontext Memory",
      last_active: "2026-08-03T00:00:00Z",
    },
  ],
};

const repository = {
  id: "repo-1",
  full_name: "context/product",
  name: "product",
  description: "Agent-native product",
  html_url: "https://github.com/context/product",
  updated_at: "2026-08-03T00:00:00Z",
  visibility: "private",
  language: "TypeScript",
  default_branch: "main",
};

const recentTask = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "workspace-1",
  project_id: null,
  repository_full_name: repository.full_name,
  branch: "main",
  task_type: "implement",
  goal: "Add repository-aware task restoration",
  source: { kind: "github", fullName: repository.full_name, branch: "main" },
  interaction_mode: "plan",
  effort_profile: "balanced",
  goal_spec: {
    objective: "Add repository-aware task restoration",
    acceptanceCriteria: ["Restore into Agent"],
    constraints: ["Do not open Monaco"],
  },
  status: "completed",
  result: "The restoration plan is ready.",
  error: "",
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T01:00:00Z",
  events: [],
};

async function seedCodingSession(page: Page, activeRepository = false) {
  page.on("pageerror", (error) => console.error("coding page error:", error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("coding console error:", message.text());
  });
  page.on("requestfailed", (request) => console.error("coding request failed:", request.url(), request.failure()?.errorText));
  page.on("response", (response) => {
    if (response.status() >= 400) console.error("coding response error:", response.status(), response.url());
  });
  await page.addInitScript(
    ({ authUser, useRepository }) => {
      localStorage.setItem("app-agent-auth-user", JSON.stringify(authUser));
      localStorage.setItem("kontext-active-workspace:user-1", "workspace-1");
      if (useRepository) {
        localStorage.setItem(
          "kontext-active-github-repository:user-1:workspace-1",
          "context/product",
        );
      }
    },
    { authUser: user, useRepository: activeRepository },
  );
}

async function mockCodingApi(
  page: Page,
  options: {
    onboardingVersion: number;
    tasks?: typeof recentTask[];
    historyMessages?: Array<{
      id: string;
      run_id: string;
      role: "user" | "assistant";
      content: string;
    }>;
    historyEvents?: Array<Record<string, unknown>>;
    taskCreateDelayMs?: number;
    streamRequests?: Array<Record<string, unknown>>;
    buildFiles?: string[];
  },
) {
  let preferences = {
    onboardingVersion: options.onboardingVersion,
    defaultInteractionMode: "plan",
    defaultEffortProfile: "balanced",
    lastSource: options.onboardingVersion
      ? { kind: "github", fullName: repository.full_name, branch: "main" }
      : null,
  };
  let persistedPlan: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/coding/preferences") {
      if (request.method() === "PATCH") {
        preferences = { ...preferences, ...request.postDataJSON() };
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(preferences) });
      return;
    }
    if (path.endsWith("/github/repositories")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [repository] }) });
      return;
    }
    if (path.endsWith("/github/repositories/context/product/tree")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          repository: repository.full_name,
          ref: "main",
          sha: "snapshot-sha",
          truncated: false,
          entries: [
            { path: "src/page.tsx", type: "blob", sha: "file-sha", size: 42, mode: "100644" },
          ],
        }),
      });
      return;
    }
    if (path.endsWith("/github/repositories/context/product/file")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          repository: repository.full_name,
          ref: "main",
          path: "src/page.tsx",
          sha: "file-sha",
          size: 42,
          html_url: "https://github.com/context/product/blob/main/src/page.tsx",
          content: "export default function Page() { return <main>Agent native</main>; }",
        }),
      });
      return;
    }
    if (path === "/api/coding/tasks") {
      if (request.method() === "POST") {
        if (options.taskCreateDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.taskCreateDelayMs));
        }
        const body = request.postDataJSON();
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            item: {
              ...recentTask,
              id: "22222222-2222-4222-8222-222222222222",
              goal: body.goal,
              goal_spec: body.goal_spec,
              interaction_mode: body.interaction_mode,
              effort_profile: body.effort_profile,
              status: "queued",
              result: "",
            },
          }),
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: options.tasks || [] }) });
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}/plan`) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        persistedPlan = { task_id: recentTask.id, plan: body.plan, status: body.status, markdown: "# Task", artifact_path: "plans-goals/task.md", revision: 1 };
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ item: persistedPlan }) });
      } else {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ item: persistedPlan }) });
      }
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}/configuration`) {
      const body = request.postDataJSON();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ item: { ...recentTask, ...body, status: "running" } }) });
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}/runtime/changes`) {
      const files = options.buildFiles || [];
      const diff = files.length
        ? [
            "diff --git a/app/page.tsx b/app/page.tsx",
            "new file mode 100644",
            "--- /dev/null",
            "+++ b/app/page.tsx",
            "@@ -0,0 +1 @@",
            "+export default function Page() { return <main>Todo</main>; }",
          ].join("\n")
        : "";
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ task_id: recentTask.id, files, status: files.length ? "modified" : "clean", diff }) });
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}/runtime`) {
      await route.fulfill({ contentType: "application/json", status: request.method() === "POST" ? 201 : 200, body: JSON.stringify({ task_id: recentTask.id, status: request.method() === "POST" ? "running" : "stopped", branch: "main" }) });
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}/agent/stream`) {
      options.streamRequests?.push(request.postDataJSON());
      const events = [
        { id: "build-start", type: "agent.run.started", event: "agent.run.started", sequence: 1, run_id: "run-build", task_id: recentTask.id, phase: "executing", message: "Build started." },
        { id: "build-complete", type: "agent.run.completed", event: "agent.run.completed", sequence: 2, run_id: "run-build", task_id: recentTask.id, phase: "completed", message: "Build completed." },
      ];
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "X-Coding-Agent-Run-Id": "run-build" },
        body: events.map((event) => `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
      });
      return;
    }
    if (path === `/api/coding/tasks/${recentTask.id}`) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ item: recentTask }) });
      return;
    }
    if (path.endsWith(`/api/coding/tasks/${recentTask.id}/agent/history`)) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          task_id: recentTask.id,
          messages: options.historyMessages || [
              { id: "message-1", run_id: "run-1", role: "user", content: recentTask.goal },
              { id: "message-2", run_id: "run-1", role: "assistant", content: recentTask.result },
            ],
          runs: [],
          events: options.historyEvents || [],
          has_more: false,
          next_sequence: 0,
        }),
      });
      return;
    }
    if (path === "/api/coding/worker/status") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ connected: true, active: false, checked_at: 0, workers: [] }) });
      return;
    }
    if (path === "/api/chat/context/preview") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [], optimized_characters: 0, original_characters: 0, empty: true }) });
      return;
    }
    if (path === "/api/projects" || path === "/api/chat/conversations") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
      return;
    }

    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });
}

test("first coding visit requires a Git repository before completion", async ({ page }) => {
  await seedCodingSession(page);
  await mockCodingApi(page, { onboardingVersion: 0 });
  await page.goto("/coding");

  await expect(page.getByText("Kontext Coding")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with the outcome" })).toBeVisible();
  await page.getByRole("button", { name: "Skip feature tour" }).click();
  await expect(page.getByRole("heading", { name: "How should the agent begin?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  const finish = page.getByRole("button", { name: "Enter coding workspace" });
  await expect(page.getByRole("heading", { name: "Connect a Git repository" })).toBeVisible();
  await expect(finish).toBeDisabled();
  await page.getByRole("button", { name: /context\/product/ }).click();
  await expect(finish).toBeEnabled();
  await finish.click();

  await expect(page.getByRole("heading", { name: "What should the agent ship?" })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toHaveCount(0);

  await page.route("**/api/coding/preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Preferences temporarily unavailable" }),
      });
      return;
    }
    await route.fallback();
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "What should the agent ship?" })).toBeVisible();
  await expect(page.getByText("Kontext Coding")).toHaveCount(0);
});

test("coding home restores recent tasks in Agent without opening Monaco", async ({ page }) => {
  await seedCodingSession(page, true);
  await mockCodingApi(page, { onboardingVersion: 1, tasks: [recentTask] });
  await page.goto("/coding");

  await expect(page.getByRole("heading", { name: "What should the agent ship?" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(recentTask.goal) }).click();
  await expect(page).toHaveURL(new RegExp(`/coding\\?task=${recentTask.id}$`));
  await expect(page.getByText(recentTask.result)).toBeVisible();
  await expect(page.locator(".coding-command-sidebar").getByText("Recent tasks", { exact: true })).toBeVisible();
  await expect(page.locator(".agent-native-home").getByText("Recent tasks", { exact: true })).toHaveCount(0);
  const surfaces = page.getByRole("navigation", { name: "Workspace surfaces" });
  await expect(surfaces.getByRole("button", { name: "Agent" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("shows task understanding while a new run is being prepared", async ({ page }) => {
  await seedCodingSession(page, true);
  await mockCodingApi(page, { onboardingVersion: 1, taskCreateDelayMs: 2_000 });
  await page.goto("/coding");

  const composer = page.getByRole("textbox", { name: "Agent task" });
  await composer.fill("Create a focused to-do application");
  await page.getByRole("button", { name: "Run agent" }).click();

  await expect(page.getByRole("article").getByText("Create a focused to-do application", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Understanding your task" })).toBeVisible();
  await expect(page.locator(".coding-command-sidebar").getByText("Recent tasks", { exact: true })).toHaveCount(0);
});

test("planning threads hide retries, tool payloads, and inline diffs", async ({ page }) => {
  const plan = {
    goal: recentTask.goal,
    summary: "Create the app through a small, validated implementation sequence.",
    approach: "Keep repository discovery separate from implementation and validate each milestone.",
    options: [
      { id: "repository-native", title: "Repository-native build", description: "Keep repository discovery separate from implementation and validate each milestone.", tradeoff: "Best balance of compatibility and completeness.", recommended: true },
      { id: "minimal", title: "Minimal page change", description: "Implement only the observable todo flow in the existing route.", tradeoff: "Faster, with less structural separation.", recommended: false },
    ],
    selectedOptionId: "repository-native",
    acceptanceCriteria: ["The todo flow works without opening Monaco automatically."],
    constraints: ["Preserve the agent-first workspace."],
    outOfScope: ["Redesigning the code editor."],
    risks: ["The repository may not contain an existing application scaffold."],
    steps: [
      { id: "inspect", title: "Inspect the repository", tool: "search_code", reason: "Confirm the current scaffold.", description: "Map the existing app structure and conventions.", files: ["package.json", "app/page.tsx"], dependencies: [], validation: "Confirm the framework and entry route.", status: "completed", attempt: 1, max_attempts: 2 },
      { id: "design", title: "Define the todo flow", tool: "inspect_changes", reason: "Keep state and UI responsibilities clear.", description: "Define the smallest complete user flow before implementation.", files: ["app/page.tsx"], dependencies: ["inspect"], validation: "Check the flow against the acceptance criteria.", status: "pending", attempt: 0, max_attempts: 2 },
    ],
  };
  await seedCodingSession(page, true);
  await mockCodingApi(page, {
    onboardingVersion: 1,
    tasks: [recentTask],
    historyMessages: [
      { id: "user-1", run_id: "run-1", role: "user", content: recentTask.goal },
      { id: "error-1", run_id: "run-1", role: "assistant", content: "github_repository_archive_not_found" },
      { id: "user-2", run_id: "run-2", role: "user", content: recentTask.goal },
      { id: "patch-1", run_id: "run-2", role: "assistant", content: "```diff\ndiff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-old\n+new\n```" },
      { id: "user-3", run_id: "run-3", role: "user", content: recentTask.goal },
      { id: "tool-1", run_id: "run-3", role: "assistant", content: "I'll inspect the repository. <toolcall>read<argkey>filepath</argkey><argvalue>package.json</argvalue></toolcall>" },
      { id: "user-4", run_id: "run-4", role: "user", content: recentTask.goal },
      { id: "transport-1", run_id: "run-4", role: "assistant", content: "peer closed connection without sending complete message body (incomplete chunked read)" },
    ],
    historyEvents: [
      {
        id: "plan-event",
        type: "agent.plan.created",
        event: "agent.plan.created",
        timestamp: "2026-08-03T01:00:00Z",
        sequence: 1,
        task_id: recentTask.id,
        run_id: "run-3",
        phase: "planning",
        message: plan.summary,
        metadata: { plan },
      },
    ],
  });
  await page.goto(`/coding?task=${recentTask.id}`);

  await expect(page.getByText("Implementation plan")).toBeVisible();
  await expect(page.getByText("Choose an approach")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Implementation approach" }).getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("radio", { name: /Repository-native build/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Build sequence")).toBeVisible();
  await expect(page.getByText("Done looks like")).toBeHidden();
  await expect(page.getByRole("textbox", { name: /Plan step/ })).toHaveCount(0);
  await page.locator("summary").filter({ hasText: "Plan details" }).click();
  await expect(page.getByText("Done looks like")).toBeVisible();
  await expect(page.getByText("plans-goals/task.md")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and build" })).toBeVisible();
  await page.getByRole("radio", { name: /Custom approach/ }).click();
  await expect(page.getByRole("button", { name: "Approve and build" })).toBeDisabled();
  await page.getByLabel("Custom implementation direction").fill("Use a server action and keep the todo UI in one route.");
  await expect(page.getByRole("button", { name: "Approve and build" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Plan feedback" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send plan feedback" })).toBeDisabled();
  const desktopHomeBox = await page.locator(".agent-native-home").boundingBox();
  const desktopComposerBox = await page.getByRole("textbox", { name: "Agent task" }).boundingBox();
  expect(desktopHomeBox && desktopComposerBox && desktopComposerBox.y + desktopComposerBox.height <= desktopHomeBox.y + desktopHomeBox.height).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByText("Implementation draft is available in Changes")).toBeVisible();
  await expect(page.getByText("github_repository_archive_not_found", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/<toolcall>/)).toHaveCount(0);
  await expect(page.getByText(/diff --git/)).toHaveCount(0);
  await expect(page.getByText(/peer closed connection/)).toHaveCount(0);
  await expect(page.locator("article").filter({ hasText: recentTask.goal })).toHaveCount(1);
});

test("approved plans start Build with bounded context and reveal created files", async ({ page }) => {
  const streamRequests: Array<Record<string, unknown>> = [];
  const longApproach = `Use the repository-native implementation. ${"Preserve existing conventions. ".repeat(120)}`;
  const plan = {
    goal: recentTask.goal,
    summary: "Implement the approved task restoration flow.",
    approach: longApproach,
    options: [
      { id: "repository-native", title: "Repository-native build", description: longApproach, tradeoff: "Validated integration.", recommended: true },
      { id: "minimal", title: "Minimal change", description: "Change only the restoration boundary.", tradeoff: "Smaller scope.", recommended: false },
    ],
    selectedOptionId: "repository-native",
    acceptanceCriteria: ["The task restores on Agent."],
    constraints: ["Do not open Monaco."],
    outOfScope: [],
    risks: [],
    steps: [
      { id: "build", title: "Implement restoration", tool: "apply_patch", reason: "Restore state safely.", description: "Update the task restoration boundary.", files: ["app/page.tsx"], dependencies: [], validation: "Open the restored task.", status: "pending", attempt: 0, max_attempts: 2 },
    ],
  };
  await seedCodingSession(page, true);
  await mockCodingApi(page, {
    onboardingVersion: 1,
    tasks: [recentTask],
    streamRequests,
    buildFiles: ["app/page.tsx"],
    historyEvents: [{
      id: "approved-plan",
      type: "agent.plan.created",
      event: "agent.plan.created",
      timestamp: "2026-08-03T01:00:00Z",
      sequence: 1,
      task_id: recentTask.id,
      run_id: "run-plan",
      phase: "planning",
      message: plan.summary,
      metadata: { plan },
    }],
  });
  await page.goto(`/coding?task=${recentTask.id}`);

  const approve = page.getByRole("button", { name: "Approve and build" });
  await expect(approve).toBeVisible();
  await approve.click();
  await expect.poll(() => streamRequests.length).toBe(1);

  const contextItems = (streamRequests[0].context_items || []) as Array<{ content?: string }>;
  expect(contextItems.every((item) => (item.content || "").length <= 2_000)).toBe(true);
  const surfaces = page.getByRole("navigation", { name: "Workspace surfaces" });
  await expect(surfaces.getByRole("button", { name: "Changes" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("AI Code Changes")).toBeVisible();
  const agentRail = page.locator("aside").last();
  expect(await agentRail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await surfaces.getByRole("button", { name: "Agent" }).click();
  await expect(page.locator("summary").filter({ hasText: "Implementation plan" })).toBeVisible();
  await expect(page.getByText("Choose an approach", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry build" })).toHaveCount(0);
  await surfaces.getByRole("button", { name: "Changes" }).click();
  await page.getByRole("button", { name: "Open in editor" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace surfaces" }).getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tree", { name: "Repository files" }).getByText("page.tsx", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "AI code changes" })).toBeHidden();
  await expect(page.getByRole("code")).toBeVisible();
  await expect(page.getByText("The coding agent could not start.", { exact: true })).toHaveCount(0);
});

test.describe("compact coding home", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has no horizontal overflow and keeps surfaces explicit", async ({ page }) => {
    await seedCodingSession(page, true);
    await mockCodingApi(page, { onboardingVersion: 1 });
    await page.goto("/coding");

    await expect(page.getByRole("heading", { name: "What should the agent ship?" })).toBeVisible();
    const surfaces = page.getByRole("navigation", { name: "Workspace surfaces" });
    await expect(surfaces.getByRole("button", { name: "Agent" })).toBeVisible();
    await expect(surfaces.getByRole("button", { name: "Code" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await surfaces.getByRole("button", { name: "Code" }).click();
    await expect(page.getByText("Select a file to inspect it in Monaco.")).toBeVisible();
  });

  test("keeps plan choices and custom editing inside the viewport", async ({ page }) => {
    const compactPlan = {
      goal: recentTask.goal,
      summary: "Restore tasks without opening the editor.",
      approach: "Keep task restoration separate from file selection.",
      options: [
        { id: "agent-first", title: "Agent-first", description: "Restore the task on the centered Agent surface.", tradeoff: "Preserves task context.", recommended: true },
        { id: "minimal", title: "Minimal", description: "Restore only task metadata and messages.", tradeoff: "Less workspace context.", recommended: false },
      ],
      selectedOptionId: "agent-first",
      acceptanceCriteria: ["Agent remains the active surface."],
      constraints: ["Do not open Monaco."],
      outOfScope: [],
      risks: [],
      steps: [
        { id: "restore", title: "Restore the task", tool: "search_code", reason: "Find restoration state.", description: "Load task state independently.", files: ["app/coding/page.tsx"], dependencies: [], validation: "Open the task route on mobile.", status: "pending", attempt: 0, max_attempts: 2 },
      ],
    };
    await seedCodingSession(page, true);
    await mockCodingApi(page, {
      onboardingVersion: 1,
      tasks: [recentTask],
      historyEvents: [{
        id: "compact-plan",
        type: "agent.plan.created",
        event: "agent.plan.created",
        timestamp: "2026-08-03T01:00:00Z",
        sequence: 1,
        task_id: recentTask.id,
        run_id: "run-compact",
        phase: "planning",
        message: compactPlan.summary,
        metadata: { plan: compactPlan },
      }],
    });
    await page.goto(`/coding?task=${recentTask.id}`);

    await expect(page.getByRole("radiogroup", { name: "Implementation approach" }).getByRole("radio")).toHaveCount(3);
    await page.getByRole("radio", { name: /Custom approach/ }).click();
    await page.getByLabel("Custom implementation direction").fill("Keep the mobile Agent surface compact and defer Code until selected.");
    const compactHomeBox = await page.locator(".agent-native-home").boundingBox();
    const compactComposerBox = await page.getByRole("textbox", { name: "Agent task" }).boundingBox();
    expect(compactHomeBox && compactComposerBox && compactComposerBox.y + compactComposerBox.height <= compactHomeBox.y + compactHomeBox.height).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
