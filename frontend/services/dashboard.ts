/**
 * Dashboard API client — fetches real user data from the backend.
 */

import { buildAuthHeaders, credentialedFetch as fetch, loadAuthUser } from "@/lib/auth";
import { loadActiveProjectId } from "@/lib/active-project";
import { loadActiveWorkspaceId } from "@/lib/workspaces";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://truememory.onrender.com";

export interface CrawlUsage {
  used: number;
  limit: number;
  period: string;
  remaining: number;
}

export interface DashboardStats {
  conversations: number;
  memory_entries: number;
  artifacts: number;
  crawl_jobs: number;
  pages_crawled: number;
  crawl_scrape: CrawlUsage;
  crawl_search: CrawlUsage;
  crawl_map: CrawlUsage;
  crawl_crawl: CrawlUsage;
  errors: string[];
}

export interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
}

export interface MemoryItem {
  id: string;
  key: string;
  memory_key?: string;
  memory_type?: string;
  content: string;
  source: string;
  updated_at: string;
  status?: "pending" | "approved" | "rejected" | "superseded" | "archived";
  is_pinned?: boolean;
  confidence_score?: number;
  importance_score?: number;
  project_id?: string | null;
  project_name?: string | null;
  conversation_id?: string | null;
  conversation_title?: string | null;
  source_message_id?: string | null;
  artifact_id?: string | null;
  artifact_title?: string | null;
  supersedes_memory_id?: string | null;
  managed_by?: "profile";
  created_at?: string;
}

export interface ArtifactItem {
  id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  source_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders("TrueMemory Memory"),
  };
}

const EMPTY_STATS: DashboardStats = {
  conversations: 0,
  memory_entries: 0,
  artifacts: 0,
  crawl_jobs: 0,
  pages_crawled: 0,
  crawl_scrape: { used: 0, limit: 0, period: "day", remaining: 0 },
  crawl_search: { used: 0, limit: 0, period: "day", remaining: 0 },
  crawl_map: { used: 0, limit: 0, period: "day", remaining: 0 },
  crawl_crawl: { used: 0, limit: 0, period: "month", remaining: 0 },
  errors: [],
};

export async function fetchDashboardStats(platform: "lab" | "crawl" | "both" = "both"): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/dashboard/stats?platform=${platform}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("unauthorized");
    return EMPTY_STATS;
  }
  return res.json();
}

export async function fetchRecentConversations(limit = 10): Promise<ConversationItem[]> {
  const res = await fetch(`${API_URL}/api/dashboard/conversations?limit=${limit}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function fetchRecentMemories(
  limit = 10,
  options: { query?: string; status?: string; strict?: boolean } = {},
): Promise<MemoryItem[]> {
  const user = loadAuthUser();
  const workspaceId = user ? loadActiveWorkspaceId(user.id) : "";
  const projectId = user && workspaceId ? loadActiveProjectId(user.id, workspaceId) : "";
  const params = new URLSearchParams({ limit: String(limit) });
  if (workspaceId) params.set("workspace_id", workspaceId);
  if (projectId) params.set("project_id", projectId);
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.status) params.set("status", options.status);
  const res = await fetch(`${API_URL}/api/dashboard/memories?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    if (!options.strict) return [];
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === "string" ? data.detail : "Could not retrieve memories.";
    throw new Error(detail);
  }
  const data = await res.json();
  if (options.strict && typeof data.error === "string" && data.error) {
    throw new Error(data.error);
  }
  return (data.items || []).map((item: MemoryItem) => ({
    ...item,
    key: item.key || item.memory_key || item.id,
  }));
}

export async function fetchRecentArtifacts(limit = 10): Promise<ArtifactItem[]> {
  const user = loadAuthUser();
  const workspaceId = user ? loadActiveWorkspaceId(user.id) : "";
  const projectId = user && workspaceId ? loadActiveProjectId(user.id, workspaceId) : "";
  const params = new URLSearchParams({ limit: String(limit) });
  if (workspaceId) params.set("workspace_id", workspaceId);
  if (projectId) params.set("project_id", projectId);
  const res = await fetch(`${API_URL}/api/dashboard/artifacts?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Could not load artifacts (${res.status}).`);
  const data = await res.json();
  if (typeof data.error === "string") throw new Error(data.error);
  return data.items || [];
}

export async function importMemories(items: Array<{ key: string; content: string; source: string }>) {
  const res = await fetch(`${API_URL}/api/dashboard/memories/import`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error("Could not import memory data.");
  return res.json() as Promise<{ imported: number }>;
}

export interface MemoryNoteCandidate {
  key: string;
  content: string;
  memory_type: string;
  confidence: number;
  subject: string;
  locator: string;
  source_type: string;
}
export interface MemoryNoteRelationship { from: string; type: string; to: string; kind: string; locator: string; }

export async function previewMemoryNotes(text: string) {
  const res = await fetch(`${API_URL}/v1/memory/import/notes`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not extract memory notes.");
  return data as { candidates: MemoryNoteCandidate[]; relationships: MemoryNoteRelationship[]; requires_confirmation: boolean };
}

export async function saveMemoryNotes(text: string, selected: number[]) {
  const res = await fetch(`${API_URL}/v1/memory/import/notes`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify({ text, selected }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save memory notes.");
  return data as { count: number };
}

export interface ConsolidationEpisode { content: string; source?: string; conversation_id?: string; run_id?: string; metadata?: Record<string, unknown>; }
export interface ConsolidationCandidate { candidate_id: string; key: string; value: string; content: string; evidence_ids: string[]; stability: number; reason: string; signals: Record<string, unknown>; novelty: Record<string, boolean>; }
export interface ConsolidationReport { mode: string; dry_run: boolean; candidates: ConsolidationCandidate[]; decisions: Array<Record<string, unknown>>; metrics: Record<string, number>; }

export async function previewConsolidation(experiences: ConsolidationEpisode[]): Promise<ConsolidationReport> {
  const res = await fetch(`${API_URL}/v1/memory/consolidate/preview`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ experiences, dry_run: true }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not preview consolidation.");
  return data;
}

export async function commitConsolidation(candidateId: string, experiences: ConsolidationEpisode[]) {
  const res = await fetch(`${API_URL}/v1/memory/consolidate/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ candidate_id: candidateId, approved: true, experiences, dry_run: false }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not commit consolidation.");
  return data as { status: "committed" | "unchanged" | "rejected" | "stale"; candidate_id: string; revision?: number; reason?: string; evidence_ids?: string[]; semantic_memory?: MemoryItem };
}

export async function exportMemoryNotes() {
  const res = await fetch(`${API_URL}/v1/memory/export/notes`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not export memory notes.");
  return data as { notes: string; lossy: boolean };
}

export async function deleteMemory(key: string) {
  const res = await fetch(`${API_URL}/api/dashboard/memories/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not delete this memory.");
}

export async function updateMemory(
  id: string,
  action: "edit" | "pin" | "unpin" | "approve" | "reject" | "archive",
  content?: string,
): Promise<MemoryItem> {
  const res = await fetch(`${API_URL}/api/dashboard/memories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ action, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Memory could not be updated.");
  }
  return data.item as MemoryItem;
}

export type ConnectionStatus = Record<string, { connected: boolean; driver?: string; path?: string; collection?: string; database?: string; host?: string; reason?: string }>;

export async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${API_URL}/api/dashboard/connections`, { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error("Could not load connection status.");
  return res.json();
}
