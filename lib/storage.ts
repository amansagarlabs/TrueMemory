import type { PipelineStepId, UploadResponse } from "@/lib/types";

const DOC_KEY = "ai-workspace-document";
const STEPS_KEY = "ai-workspace-pipeline-steps";
const CHAT_MODE_KEY = "ai-workspace-chat-mode";
const CONVERSATION_KEY = "ai-workspace-conversation-id";

export type ChatViewMode = "simple" | "learning";

export function saveDocument(doc: UploadResponse) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DOC_KEY, JSON.stringify(doc));
}

export function loadDocument(): UploadResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DOC_KEY);
    return raw ? (JSON.parse(raw) as UploadResponse) : null;
  } catch {
    return null;
  }
}

export function clearDocument() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DOC_KEY);
}

export function savePipelineSteps(steps: PipelineStepId[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STEPS_KEY, JSON.stringify(steps));
}

export function clearPipelineSteps() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STEPS_KEY);
}

export function loadChatViewMode(): ChatViewMode {
  if (typeof window === "undefined") return "simple";
  const v = localStorage.getItem(CHAT_MODE_KEY);
  return v === "learning" ? "learning" : "simple";
}

export function saveChatViewMode(mode: ChatViewMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAT_MODE_KEY, mode);
}

export function getOrCreateConversationId(): string {
  if (typeof window === "undefined") return "server-conversation";
  const existing = sessionStorage.getItem(CONVERSATION_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `conv-${Date.now()}`;
  sessionStorage.setItem(CONVERSATION_KEY, next);
  return next;
}

export function resetConversationId() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CONVERSATION_KEY);
}

export function setConversationId(conversationId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CONVERSATION_KEY, conversationId);
}

export function loadPipelineSteps(): Set<PipelineStepId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STEPS_KEY);
    const arr = raw ? (JSON.parse(raw) as PipelineStepId[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}
