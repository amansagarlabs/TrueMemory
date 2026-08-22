import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type CodingInteractionMode = "ask" | "plan" | "build";
export type CodingEffortProfile = "fast" | "balanced" | "deep";

export type CodingSource =
  | { kind: "github"; fullName: string; branch: string }
  | {
      kind: "local_git";
      workspaceSlug: string;
      branch: string;
      snapshotId: string;
    };

export type CodingGoal = {
  objective: string;
  acceptanceCriteria: string[];
  constraints: string[];
};

export type CodingPreferences = {
  onboardingVersion: number;
  defaultInteractionMode: CodingInteractionMode;
  defaultEffortProfile: CodingEffortProfile;
  lastSource: CodingSource | null;
  onboardingPersona?: string | null;
  onboardingHeardAbout?: string | null;
  onboardingUseCase?: string | null;
  onboardingWorkspaceName?: string | null;
  onboardingStep?: string | null;
};

export type CodingTaskStatus =
  | "planning"
  | "running"
  | "waiting_approval"
  | "testing"
  | "completed"
  | "failed"
  | "cancelled";

export type CodingTaskEvent = {
  id: string;
  event_type: string;
  phase: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CodingTaskRecord = {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  repository_full_name: string;
  branch: string;
  task_type: "explain" | "review" | "analyze" | "implement";
  goal: string;
  source?: CodingSource;
  interaction_mode?: CodingInteractionMode;
  effort_profile?: CodingEffortProfile;
  goal_spec?: CodingGoal;
  status: CodingTaskStatus;
  result: string;
  error: string;
  created_at: string;
  updated_at: string;
  events?: CodingTaskEvent[];
};

export type CodingRuntime = {
  task_id: string;
  container?: string;
  status: "disabled" | "stopped" | "created" | "running" | "exited" | "unknown";
  workspace?: string;
  network?: string;
  writable?: boolean;
  message?: string;
};

export type CodingCommandResult = {
  task_id: string;
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
};

export type CodingRuntimeDiagnostic = {
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
  code?: string;
};

export type CodingApprovalAction =
  | "run_command"
  | "apply_patch"
  | "run_tests"
  | "create_commit"
  | "create_pull_request"
  | "start_preview";

export type CodingApproval = {
  id: string;
  task_id: string;
  action: CodingApprovalAction;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "consumed" | "expired";
  created_at: string;
  expires_at: string;
  resolved_at?: string | null;
  consumed_at?: string | null;
};

export type CodingChanges = {
  task_id: string;
  files: string[];
  status: string;
  diff: string;
  applied_mode?: "git_apply" | "workspace_rebase";
  recovered_from_drift?: boolean;
  next_approval?: CodingApproval | null;
};

export type CodingWorkspaceSync = {
  task_id: string;
  total_bytes: number;
  files: Array<
    | {
        path: string;
        status: "changed";
        encoding: "base64";
        content: string;
      }
    | {
        path: string;
        status: "deleted";
      }
  >;
};

export type CodingCommit = {
  task_id: string;
  sha: string;
  summary: string;
};

export type CodingPullRequest = {
  number: number;
  url: string;
  branch: string;
  base: string;
  commit_sha: string;
  title: string;
};

export type CodingPreview = {
  id: string;
  task_id: string;
  port: number;
  command: string;
  status: "running" | "stopped" | "expired";
  path: string;
  created_at: string;
  expires_at: string;
};

export type CodingIndexStatus = {
  task_id: string;
  status: "not_indexed" | "ready";
  created_at?: number;
  files?: number;
  symbols?: number;
  chunks?: number;
  import_edges?: number;
  bytes?: number;
  reused_files?: number;
  skipped_files?: number;
  cache_hit?: boolean;
};

export type CodingIndexSearchResult = {
  path: string;
  language: string;
  start_line: number;
  end_line: number;
  symbols: string[];
  score: number;
  text: string;
};

export type CodingIndexSearch = {
  task_id: string;
  status: "ready";
  query: string;
  results: CodingIndexSearchResult[];
  repository_map: string;
  context: string;
  stats: Record<string, number>;
};

export type CodingAgentPlanStep = {
  id: string;
  title: string;
  tool: "search_code" | "inspect_changes" | "request_tests";
  reason: string;
  status: "pending" | "running" | "completed" | "failed";
  attempt: number;
  max_attempts: number;
  description?: string;
  files?: string[];
  dependencies?: string[];
  validation?: string;
};

export type CodingAgentPlanOption = {
  id: string;
  title: string;
  description: string;
  tradeoff?: string;
  recommended?: boolean;
};

export type CodingAgentPlan = {
  goal: string;
  summary: string;
  steps: CodingAgentPlanStep[];
  approach?: string;
  options?: CodingAgentPlanOption[];
  selectedOptionId?: string;
  customApproach?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  outOfScope?: string[];
  risks?: string[];
};

export type CodingPlanRecord = {
  task_id: string;
  plan: CodingAgentPlan;
  markdown: string;
  status: "draft" | "approved";
  revision: number;
  artifact_path: string;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CodingAgentStreamEvent = {
  id: string;
  type: string;
  event: string;
  timestamp: string;
  sequence: number;
  task_id: string;
  run_id?: string;
  phase:
    | "retrieving"
    | "planning"
    | "executing"
    | "testing"
    | "reviewing"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "cancelled";
  message?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type CodingAgentRunRecord = {
  id: string;
  task_id: string;
  idempotency_key: string;
  status:
    | "queued"
    | "running"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "cancelled";
  model: string;
  request: Record<string, unknown>;
  phase: string;
  checkpoint: Record<string, unknown>;
  error: string;
  created_at: string;
  updated_at: string;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  source?: CodingSource;
  interaction_mode?: CodingInteractionMode;
  effort_profile?: CodingEffortProfile;
  goal_spec?: CodingGoal;
  parent_run_id?: string | null;
  orchestration_role?: string;
};

export type CodingAgentHistoryMessage = {
  id: string;
  run_id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string | null;
};

export type CodingAgentHistory = {
  task_id: string;
  messages: CodingAgentHistoryMessage[];
  runs: Array<{
    id: string;
    status: string;
    phase: string;
    model: string;
    request: Record<string, unknown>;
    error: string;
    created_at: string;
    updated_at: string;
  }>;
  events: CodingAgentStreamEvent[];
  has_more: boolean;
  next_sequence: number;
};

export type CodingWorkerStatus = {
  connected: boolean;
  active: boolean;
  checked_at: number;
  workers: Array<{
    worker_id: string;
    hostname: string;
    process_id?: number | null;
    status: string;
    current_task_id?: string | null;
    current_run_id?: string | null;
    phase: string;
    started_at: string;
    last_seen_at: string;
    lease_expires_at?: string | null;
    lease_seconds_remaining?: number | null;
    connected: boolean;
    current_task?: CodingTaskRecord | null;
    current_run?: CodingAgentRunRecord | null;
  }>;
};

export type CodingWorkspaceSnapshot = {
  task_id: string;
  status: "missing" | "ready";
  files?: number;
  uncompressed_bytes?: number;
  compressed_bytes?: number;
  sha256?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders("Kontext coding tasks"),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The coding task request failed.",
    );
  }
  return payload as T;
}

export async function fetchCodingTasks(options: {
  workspaceId: string;
  projectId?: string;
  repository?: string;
  limit?: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    workspace_id: options.workspaceId,
    limit: String(options.limit || 20),
  });
  if (options.projectId) params.set("project_id", options.projectId);
  if (options.repository) params.set("repository", options.repository);
  const payload = await request<{ items: CodingTaskRecord[] }>(
    `/api/coding/tasks?${params.toString()}`,
    { signal: options.signal },
  );
  return payload.items;
}

export async function fetchCodingWorkerStatus(signal?: AbortSignal) {
  return request<CodingWorkerStatus>("/api/coding/worker/status", { signal });
}

export async function fetchCodingPreferences(signal?: AbortSignal) {
  return request<CodingPreferences>("/api/coding/preferences", { signal });
}

export async function updateCodingPreferences(
  input: Partial<CodingPreferences>,
) {
  return request<CodingPreferences>("/api/coding/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createCodingTask(input: {
  workspace_id: string;
  workspace_name?: string;
  project_id?: string;
  repository_full_name: string;
  branch: string;
  task_type: CodingTaskRecord["task_type"];
  goal: string;
  source?: CodingSource;
  interaction_mode?: CodingInteractionMode;
  effort_profile?: CodingEffortProfile;
  goal_spec?: CodingGoal;
}) {
  const payload = await request<{ item: CodingTaskRecord }>(
    "/api/coding/tasks",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return payload.item;
}

export async function uploadCodingWorkspaceSnapshot(
  taskId: string,
  archive: Uint8Array,
) {
  const response = await fetch(
    `${API_URL}/api/coding/tasks/${encodeURIComponent(taskId)}/workspace-snapshot`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        ...buildAuthHeaders("Kontext local coding workspace"),
      },
      body: new Blob([archive as BlobPart], { type: "application/zip" }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The local workspace snapshot could not be uploaded.",
    );
  }
  return payload as CodingWorkspaceSnapshot;
}

export async function fetchCodingWorkspaceSnapshotStatus(taskId: string) {
  return request<CodingWorkspaceSnapshot>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/workspace-snapshot`,
  );
}

export async function fetchCodingTask(taskId: string) {
  const payload = await request<{ item: CodingTaskRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}`,
  );
  return payload.item;
}

export async function fetchCodingAgentHistory(
  taskId: string,
  options?: { signal?: AbortSignal },
) {
  let afterSequence = 0;
  let history: CodingAgentHistory | null = null;
  const events: CodingAgentStreamEvent[] = [];
  do {
    const page = await request<CodingAgentHistory>(
      `/api/coding/tasks/${encodeURIComponent(taskId)}/agent/history?after_sequence=${afterSequence}&event_limit=1000`,
      { signal: options?.signal },
    );
    history = page;
    events.push(...page.events);
    afterSequence = page.next_sequence;
  } while (history.has_more);
  return { ...history, events, has_more: false };
}

export async function updateCodingTask(
  taskId: string,
  input: {
    status: CodingTaskStatus;
    result?: string;
    error?: string;
  },
) {
  const payload = await request<{ item: CodingTaskRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return payload.item;
}

export async function configureCodingTask(
  taskId: string,
  input: {
    interaction_mode: CodingInteractionMode;
    effort_profile: CodingEffortProfile;
    goal_spec: CodingGoal;
  },
) {
  const payload = await request<{ item: CodingTaskRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/configuration`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return payload.item;
}

export async function fetchCodingPlan(taskId: string) {
  const payload = await request<{ item: CodingPlanRecord | null }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/plan`,
  );
  return payload.item;
}

export async function saveCodingPlan(
  taskId: string,
  plan: CodingAgentPlan,
  status: "draft" | "approved" = "draft",
) {
  const payload = await request<{ item: CodingPlanRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/plan`,
    {
      method: "PUT",
      body: JSON.stringify({ plan, status }),
    },
  );
  return payload.item;
}

export async function appendCodingTaskEvent(
  taskId: string,
  input: {
    event_type: string;
    phase?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const payload = await request<{ item: CodingTaskEvent }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return payload.item;
}

export async function buildCodingIndex(
  taskId: string,
  options?: { force?: boolean },
) {
  const params = options?.force ? "?force=true" : "";
  return request<CodingIndexStatus>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/index${params}`,
    { method: "POST" },
  );
}

export async function searchCodingIndex(
  taskId: string,
  query: string,
  options?: { limit?: number; maxChars?: number; mode?: "hybrid" | "literal" | "regex" },
) {
  const params = new URLSearchParams({
    q: query,
    mode: options?.mode || "hybrid",
    limit: String(options?.limit || 12),
    max_chars: String(options?.maxChars || 18_000),
  });
  return request<CodingIndexSearch>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/index/search?${params.toString()}`,
  );
}

function codingAgentErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return "";
  return detail
    .slice(0, 4)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const issue = item as { loc?: unknown; msg?: unknown };
      const location = Array.isArray(issue.loc)
        ? issue.loc.slice(1).map(String).join(".")
        : "request";
      return typeof issue.msg === "string"
        ? `${location || "request"}: ${issue.msg}`
        : "";
    })
    .filter(Boolean)
    .join("; ");
}

export async function streamCodingAgent(
  taskId: string,
  input: {
    selected_model?: string;
      prompt?: string;
      task_type?: CodingTaskRecord["task_type"];
      active_file?: string;
      recovery?: boolean;
      interaction_mode?: CodingInteractionMode;
      effort_profile?: CodingEffortProfile;
      goal_spec?: CodingGoal;
      parent_run_id?: string;
      idempotency_key?: string;
      run_id?: string;
      after_sequence?: number;
    context_items?: Array<{
      kind: string;
      label: string;
      content?: string;
      score?: number;
    }>;
  },
  onEvent: (event: CodingAgentStreamEvent) => void,
  options?: { signal?: AbortSignal; onRunId?: (runId: string) => void },
  ): Promise<{ runId: string; lastSequence: number }> {
    const normalizedInput = {
      ...input,
      prompt: input.prompt?.slice(0, 4_000),
      active_file: input.active_file?.slice(0, 1_000),
      context_items: (input.context_items || []).slice(0, 24).map((item) => ({
        kind: item.kind.slice(0, 80),
        label: item.label.slice(0, 300),
        content: item.content?.slice(0, 2_000) || "",
        score: Math.min(100, Math.max(0, item.score || 0)),
      })),
    };
    const idempotencyKey =
      input.idempotency_key ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    let runId = input.run_id || "";
    let lastSequence = input.after_sequence || 0;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(
          `${API_URL}/api/coding/tasks/${encodeURIComponent(taskId)}/agent/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...buildAuthHeaders("Kontext coding agent"),
            },
            body: JSON.stringify({
              ...normalizedInput,
              idempotency_key: idempotencyKey,
              run_id: runId || undefined,
              after_sequence: lastSequence,
            }),
            cache: "no-store",
            signal: options?.signal,
          },
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            codingAgentErrorDetail(payload) ||
              "The coding agent could not start. The backend rejected the run request.",
          );
        }
        runId = response.headers.get("X-Coding-Agent-Run-Id") || runId;
        if (runId) {
          options?.onRunId?.(runId);
        }
        if (!response.body) {
          throw new TypeError("The coding agent stream is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let terminalEventSeen = false;
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const lines = frame.split(/\r?\n/);
            const transportId = lines
              .find((line) => line.startsWith("id:"))
              ?.slice(3)
              .trim();
            if (transportId && Number.isSafeInteger(Number(transportId))) {
              lastSequence = Math.max(lastSequence, Number(transportId));
            }
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data || data === "[DONE]") continue;
            let event: CodingAgentStreamEvent;
            try {
              event = JSON.parse(data) as CodingAgentStreamEvent;
            } catch {
              continue;
            }
            if (
              event.type === "agent.run.completed" ||
              event.type === "agent.run.error" ||
              event.type === "agent.run.cancelled" ||
              event.type === "operation.completed" ||
              event.type === "operation.failed" ||
              event.type === "operation.cancelled"
            ) {
              terminalEventSeen = true;
            }
            onEvent(event);
          }
          if (done) {
            if (terminalEventSeen) return { runId, lastSequence };
            throw new TypeError("The coding agent stream disconnected before completion.");
          }
        }
      } catch (reason) {
        if (
          options?.signal?.aborted ||
          reason instanceof DOMException ||
          !(reason instanceof TypeError) ||
          attempt === 2
        ) {
          if (reason instanceof TypeError && attempt === 2) {
            throw new Error(
              "The coding agent could not reach the backend worker. Check that the coding worker is online and try again.",
            );
          }
          throw reason;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return { runId, lastSequence };
  }

export async function cancelCodingAgentRun(taskId: string, runId: string) {
  return request<{ item: Record<string, unknown> }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/agent/runs/${encodeURIComponent(runId)}`,
    { method: "DELETE" },
  );
}

export async function fetchCodingAgentRun(taskId: string, runId: string) {
  const response = await request<{ item: CodingAgentRunRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/agent/runs/${encodeURIComponent(runId)}`,
  );
  return response.item;
}

export async function queueApprovedCodingOperation(
  taskId: string,
  approvalId: string,
  action: CodingApprovalAction,
  payload: Record<string, unknown>,
) {
  const response = await request<{ item: CodingAgentRunRecord }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/operations`,
    {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        action,
        payload,
      }),
    },
  );
  return response.item;
}

export async function fetchCodingRuntime(taskId: string) {
  return request<CodingRuntime>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime`,
  );
}

export async function startCodingRuntime(taskId: string) {
  return request<CodingRuntime>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime`,
    { method: "POST" },
  );
}

export async function stopCodingRuntime(taskId: string) {
  return request<CodingRuntime>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime`,
    { method: "DELETE" },
  );
}

export async function runCodingCommand(
  taskId: string,
  command: string,
  approvalId: string,
  timeoutSeconds = 60,
) {
  return request<CodingCommandResult>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/commands`,
    {
      method: "POST",
      body: JSON.stringify({
        command,
        approval_id: approvalId,
        timeout_seconds: timeoutSeconds,
      }),
    },
  );
}

export async function requestCodingApproval(
  taskId: string,
  input: {
    action: CodingApprovalAction;
    title: string;
    description?: string;
    payload: Record<string, unknown>;
  },
) {
  const response = await request<{ item: CodingApproval }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/approvals`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return response.item;
}

export async function decideCodingApproval(
  taskId: string,
  approvalId: string,
  approved: boolean,
) {
  const response = await request<{ item: CodingApproval }>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ approved }),
    },
  );
  return response.item;
}

export async function fetchCodingChanges(taskId: string) {
  return request<CodingChanges>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/changes`,
  );
}

export async function fetchCodingWorkspaceSync(taskId: string) {
  return request<CodingWorkspaceSync>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/workspace-sync`,
  );
}

export async function applyCodingPatch(
  taskId: string,
  approvalId: string,
  patch: string,
) {
  return request<CodingChanges>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/patch`,
    {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId, patch }),
    },
  );
}

export async function runCodingTests(
  taskId: string,
  approvalId: string,
  command: string,
  timeoutSeconds = 120,
) {
  return request<CodingCommandResult>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/tests`,
    {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        command,
        timeout_seconds: timeoutSeconds,
      }),
    },
  );
}

export async function createCodingCommit(
  taskId: string,
  approvalId: string,
  message: string,
) {
  return request<CodingCommit>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/commit`,
    {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId, message }),
    },
  );
}

export async function createCodingPullRequest(
  taskId: string,
  approvalId: string,
  input: {
    title: string;
    body: string;
    base: string;
    branch: string;
  },
) {
  return request<CodingPullRequest>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/pull-request`,
    {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        ...input,
      }),
    },
  );
}

export async function startCodingPreview(
  taskId: string,
  approvalId: string,
  command: string,
  port: number,
) {
  const preview = await request<CodingPreview>(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/runtime/preview`,
    {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        command,
        port,
      }),
    },
  );
  return {
    ...preview,
    path: `${API_URL}${preview.path}`,
  };
}
