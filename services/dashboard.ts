/**
 * Dashboard API client — fetches real user data from the backend.
 */

import { buildAuthHeaders, credentialedFetch as fetch, loadAuthUser } from "@/lib/auth";
import { loadActiveProjectId } from "@/lib/active-project";
import { loadActiveWorkspaceId } from "@/lib/workspaces";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    ...buildAuthHeaders("Kontext Memory"),
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
  options: { query?: string; status?: string } = {},
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
  if (!res.ok) return [];
  const data = await res.json();
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
