/**
 * Frontend → Backend API client.
 * WHY: One place for base URL and fetch helpers (upload, chat SSE in later steps).
 */

import type {
  ChatMode,
  ChatStreamEvent,
  ConversationType,
  ImageOcrResponse,
  PipelineEvent,
  RecentConversation,
  QueryRouteDecision,
  StoredConversationMessage,
  UploadResponse,
} from "@/lib/types";
import {
  buildAuthHeaders,
  credentialedFetch as fetch,
  loadAuthUser,
} from "@/lib/auth";
import { loadActiveWorkspaceId } from "@/lib/workspaces";
import { loadActiveProjectId } from "@/lib/active-project";
import { prepareQueryInput } from "@/lib/query-input";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const RUNTIME_QUESTION_RE =
  /\b(current\s+)?(date|time|day of (the )?week|timezone)\b|\bwhat day is it\b/i;

export function isRuntimeQuestion(question: string) {
  return RUNTIME_QUESTION_RE.test(question);
}

function emitLocalRuntimeAnswer(
  question: string,
  timezone: string,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (!isRuntimeQuestion(question)) return false;

  let resolvedTimezone = timezone || "UTC";
  const date = new Date();
  try {
    // Validate the browser's ICU timezone data before formatting. If the
    // configured zone is unavailable, UTC is safer than inventing a value.
    new Intl.DateTimeFormat("en-US", { timeZone: resolvedTimezone }).format(date);
  } catch {
    resolvedTimezone = "UTC";
  }

  const wantsTime = /\btime\b/i.test(question);
  const wantsDay = /\bday\b/i.test(question) && !/\bdate\b/i.test(question);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const answer = wantsTime
    ? `It is ${new Intl.DateTimeFormat("en-US", {
        timeZone: resolvedTimezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(date)} on ${dateLabel} in ${resolvedTimezone}.`
    : wantsDay
      ? `Today is ${new Intl.DateTimeFormat("en-US", {
          timeZone: resolvedTimezone,
          weekday: "long",
        }).format(date)} in ${resolvedTimezone}.`
      : `Today is ${dateLabel} in ${resolvedTimezone}.`;

  onEvent({
    type: "route.decision",
    route: {
      mode: "utility",
      needs_fresh_data: false,
      needs_web: false,
      needs_citations: false,
      target_urls: [],
      search_queries: [],
      reason: "This can be answered from the runtime clock.",
      reason_code: "runtime_utility_client_fallback",
      confidence: 1,
      max_tool_calls: 0,
      fallback_mode: null,
      requires_confirmation: false,
    },
  });
  onEvent({
    type: "plan.created",
    plan: {
      route: "utility",
      steps: [
        {
          id: "tool-utility",
          mode: "utility",
          label: "Read the runtime clock",
          status: "complete",
        },
      ],
      max_tool_calls: 0,
      allows_replan: false,
    },
  });
  onEvent({ type: "token", content: answer });
  onEvent({ type: "done", web_sources: [] });
  return true;
}

export async function checkBackendHealth(): Promise<{
  status: string;
  zilliz_configured: boolean;
  openrouter_configured: boolean;
  postgres_connected: boolean;
  postgres_mode: string;
  postgres_database: string;
  postgres_host: string;
  postgres_user?: string;
  postgres_reason?: string;
  step?: number;
}> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Backend unreachable (${res.status})`);
  return res.json();
}

export type ContextPreview = {
  nodes: Array<{
    id: string;
    kind: string;
    label: string;
    score: number;
    preview: string;
    metadata: Record<string, string>;
  }>;
  edges: Array<{ source: string; target: string; relation: string }>;
  optimized_characters: number;
  original_characters: number;
  empty: boolean;
  message?: string | null;
};

export async function fetchContextPreview(
  question: string,
  contextMentions: Array<{ kind: string; id: string; label: string }>,
  signal?: AbortSignal,
  workspaceId?: string,
  projectId?: string,
): Promise<ContextPreview> {
  const response = await fetch(`${API_URL}/api/chat/context/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders("Kontext Memory"),
    },
    body: JSON.stringify({
      question: question.slice(0, 20_000),
      workspace_id: workspaceId || undefined,
      project_id: projectId || undefined,
      context_mentions: contextMentions.slice(0, 12),
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Context preview failed (${response.status})`);
  return response.json() as Promise<ContextPreview>;
}

export async function uploadPdf(
  file: File,
  title?: string,
  context: { workspaceId?: string; projectId?: string } = {},
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (title?.trim()) form.append("title", title.trim());
  const user = loadAuthUser();
  const workspaceId =
    context.workspaceId || (user ? loadActiveWorkspaceId(user.id) : "");
  const projectId =
    context.projectId || (user && workspaceId ? loadActiveProjectId(user.id, workspaceId) : "");
  if (workspaceId) form.append("workspace_id", workspaceId);
  if (projectId) form.append("project_id", projectId);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: buildAuthHeaders("Kontext Memory"),
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : `Upload failed (${res.status})`;
    throw new Error(detail);
  }
  return data as UploadResponse;
}

export async function readImageWithOcr(file: File): Promise<ImageOcrResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/api/ocr/image`, {
    method: "POST",
    headers: buildAuthHeaders("Kontext Memory"),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : `Image OCR failed (${res.status})`;
    throw new Error(detail);
  }
  return data as ImageOcrResponse;
}

export type ArtifactPreviewPage = {
  page: number;
  title?: string | null;
  text: string;
};

export type ArtifactPreviewResponse = {
  artifact_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number;
  pages: ArtifactPreviewPage[];
  truncated: boolean;
};

export async function fetchArtifactPreview(docId: string): Promise<ArtifactPreviewResponse> {
  const res = await fetch(`${API_URL}/api/artifacts/${encodeURIComponent(docId)}/preview`, {
    headers: buildAuthHeaders("Kontext Memory"),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Preview failed (${res.status})`,
    );
  }
  return data as ArtifactPreviewResponse;
}

export async function fetchArtifactContent(docId: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/artifacts/${encodeURIComponent(docId)}/content`, {
    headers: buildAuthHeaders("Kontext Memory"),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Document loading failed (${res.status})`,
    );
  }
  return res.blob();
}

export async function visualizePipeline(
  docId: string,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/pipeline/${docId}/visualize`, {
    method: "POST",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Pipeline failed (${res.status})`,
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as PipelineEvent);
      } catch {
        /* skip malformed */
      }
    }
  }

}

export async function streamChat(
  docId: string | null,
  question: string,
  conversationId: string,
  onEvent: (event: ChatStreamEvent) => void,
  chatMode: ChatMode | null = null,
  replyContext: string | null = null,
  options: {
    signal?: AbortSignal;
    approvedToolCalls?: string[];
    promptContext?: string;
    attachmentContext?: string;
    fastMode?: boolean;
    workspaceId?: string;
    workspaceName?: string;
    projectId?: string;
    conversationType?: ConversationType;
    selectedModel?: string;
    imageAttachments?: Array<{
      artifact_id: string;
      filename: string;
      mime_type: string;
    }>;
    enabledSkills?: string[];
    contextMentions?: Array<{
      kind: "memory" | "workspace" | "project" | "agent" | "file" | "connector" | "web" | "skill" | "mcp_server" | "github_repository" | "document" | "api" | "database" | "skills" | "connectors";
      id: string;
      label: string;
    }>;
  } = {},
): Promise<void> {
  const preparedInput = prepareQueryInput(
    question,
    options.attachmentContext,
  );
  const payload: {
    doc_id?: string;
    chat_mode?: ChatMode;
    reply_context?: string;
    prompt_context?: string;
    attachment_context?: string;
    fast_mode?: boolean;
    workspace_id?: string;
    workspace_name?: string;
    project_id?: string;
    conversation_type?: ConversationType;
    selected_model?: string;
    image_attachments?: Array<{
      artifact_id: string;
      filename: string;
      mime_type: string;
    }>;
    enabled_skills?: string[];
    context_mentions?: Array<{
      kind: "memory" | "workspace" | "project" | "agent" | "file" | "connector" | "web" | "skill" | "mcp_server" | "github_repository" | "document" | "api" | "database" | "skills" | "connectors";
      id: string;
      label: string;
    }>;
    question: string;
    conversation_id: string;
    mode: "auto" | "direct" | "search" | "agent";
    timezone: string;
    options: {
      web_allowed: boolean;
      citations_required: boolean;
      max_results: number;
      approved_tool_calls: string[];
    };
  } = {
    question: preparedInput.question,
    conversation_id: conversationId,
    mode:
      chatMode === "thinking"
        ? "auto"
        : chatMode === "web-search"
          ? "search"
          : chatMode === "deep-research"
            ? "agent"
            : "auto",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    options: {
      web_allowed: true,
      citations_required: chatMode === "web-search" || chatMode === "deep-research",
      max_results: 5,
      approved_tool_calls: options.approvedToolCalls ?? [],
    },
  };

  if (docId?.trim()) {
    payload.doc_id = docId.trim();
  }
  if (chatMode) {
    payload.chat_mode = chatMode;
  }
  if (replyContext?.trim()) {
    payload.reply_context = replyContext.trim().slice(0, 4000);
  }
  const promptContext = [preparedInput.promptContext, options.promptContext]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 16_000);
  if (promptContext) {
    payload.prompt_context = promptContext;
  }
  if (options.fastMode) {
    payload.fast_mode = true;
  }
  if (preparedInput.attachmentContext) {
    payload.attachment_context = preparedInput.attachmentContext;
  }
  if (options.workspaceId?.trim()) {
    payload.workspace_id = options.workspaceId.trim();
    payload.workspace_name = options.workspaceName?.trim().slice(0, 120) || "My workspace";
  }
  if (options.projectId?.trim()) {
    payload.project_id = options.projectId.trim();
  }
  if (options.conversationType) {
    payload.conversation_type = options.conversationType;
  }
  if (options.selectedModel?.trim()) {
    payload.selected_model = options.selectedModel.trim().slice(0, 80);
  }
  if (options.imageAttachments?.length) {
    payload.image_attachments = options.imageAttachments.slice(0, 4);
  }
  if (options.enabledSkills) {
    payload.enabled_skills = options.enabledSkills.slice(0, 32);
  }
  if (options.contextMentions?.length) {
    payload.context_mentions = options.contextMentions.slice(0, 12);
  }

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders("Kontext Memory"),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  };

  // Date/time is a zero-tool runtime fact. Resolve it before touching either
  // the unified or legacy stream so an old frontend/backend process cannot
  // answer from an outdated model completion.
  if (emitLocalRuntimeAnswer(preparedInput.question, payload.timezone, onEvent)) {
    return;
  }

  const res = await fetch(`${API_URL}/api/v1/query/stream`, requestInit);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error("Your TrueMemory session expired. Please sign in again.");
    }
    if (res.status === 403) {
      throw new Error("Your workspace plan does not allow this chat operation.");
    }
    if (
      res.status === 400 &&
      typeof data.detail === "string" &&
      data.detail.includes("OPENROUTER_API_KEY missing")
    ) {
      throw new Error(
        "TrueMemory query is missing OPENROUTER_API_KEY on the backend. Add it to the server environment, then retry.",
      );
    }
    const validationMessage =
      Array.isArray(data.detail) &&
      data.detail.find(
        (item: unknown): item is { msg: string } =>
          Boolean(
            item &&
              typeof item === "object" &&
              "msg" in item &&
              typeof item.msg === "string",
          ),
      )?.msg;
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : validationMessage || `Chat failed (${res.status})`,
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      let event: ChatStreamEvent;
      try {
        event = JSON.parse(line.slice(6)) as ChatStreamEvent;
      } catch {
        /* skip malformed server frames */
        continue;
      }
      // Do not swallow errors raised by the consumer. In particular, the
      // chat UI intentionally throws for an SSE `error` event so a failed
      // model response cannot be mistaken for a successful empty answer.
      onEvent(event);
    }
  }

  // Some proxies flush the final SSE event without the usual blank line.
  // Process that trailing frame instead of dropping the final token/done event.
  const trailing = buffer.trim();
  if (trailing.startsWith("data: ")) {
    let event: ChatStreamEvent | null = null;
    try {
      event = JSON.parse(trailing.slice(6)) as ChatStreamEvent;
    } catch {
      /* skip malformed trailing frame */
    }
    if (event) onEvent(event);
  }
}

export async function submitMessageFeedback(
  messageId: string,
  payload: {
    rating?: "up" | "down" | null;
    report_reason?: string | null;
    report_details?: string | null;
    question?: string | null;
    route?: QueryRouteDecision | null;
  },
): Promise<{ saved: boolean }> {
  const res = await fetch(
    `${API_URL}/api/chat/messages/${encodeURIComponent(messageId)}/feedback`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders("Kontext Memory"),
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Feedback could not be saved (${res.status})`,
    );
  }
  return { saved: Boolean(data.saved) };
}

export async function fetchRecentConversations(
  limit = 200,
  workspaceId?: string,
  conversationType: ConversationType = "artifact_chat",
): Promise<RecentConversation[]> {
  const user = loadAuthUser();
  const resolvedWorkspaceId =
    workspaceId || (user ? loadActiveWorkspaceId(user.id) : "");
  const requestedLimit = Math.min(Math.max(Math.trunc(limit), 1), 2000);
  const request = (requestLimit: number) => {
    const params = new URLSearchParams({
      status: "active",
      limit: String(requestLimit),
    });
    if (resolvedWorkspaceId) {
      params.set("workspace_id", resolvedWorkspaceId);
    }
    params.set("conversation_type", conversationType);
    return fetch(
      `${API_URL}/api/chat/conversations?${params.toString()}`,
      { cache: "no-store", headers: buildAuthHeaders("Kontext Memory") },
    );
  };

  let res = await request(requestedLimit);
  // Older running backend images cap this endpoint at 100. Keep recents
  // available until Docker has been rebuilt with the new 250-item ceiling.
  if (res.status === 422) {
    res = await request(100);
  }
  if (!res.ok) throw new Error(`Recent chats failed (${res.status})`);
  const data = await res.json();
  return (data.items ?? []) as RecentConversation[];
}

export async function fetchArchivedConversations(
  limit = 50,
): Promise<RecentConversation[]> {
  const params = new URLSearchParams({
    status: "archived",
    limit: String(limit),
  });
  const res = await fetch(
    `${API_URL}/api/chat/conversations?${params.toString()}`,
    { cache: "no-store", headers: buildAuthHeaders("Kontext Archive") },
  );
  if (!res.ok) throw new Error(`Archived chats failed (${res.status})`);
  const data = await res.json();
  return (data.items ?? []) as RecentConversation[];
}

export type ConversationAction =
  | "rename"
  | "pin"
  | "unpin"
  | "archive"
  | "unarchive"
  | "delete";

export async function updateConversation(
  conversationId: string,
  action: ConversationAction,
  title?: string,
): Promise<RecentConversation | null> {
  const res = await fetch(
    `${API_URL}/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      headers: {
        ...buildAuthHeaders("Kontext Conversation"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, title }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Conversation could not be updated (${res.status})`,
    );
  }
  return (data.item ?? null) as RecentConversation | null;
}

export async function fetchConversationMessages(
  conversationId: string,
): Promise<StoredConversationMessage[]> {
  const res = await fetch(
    `${API_URL}/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    { cache: "no-store", headers: buildAuthHeaders("Kontext Memory") },
  );
  if (!res.ok) throw new Error(`Conversation history failed (${res.status})`);
  const data = await res.json();
  return (data.items ?? []) as StoredConversationMessage[];
}

export { API_URL };
