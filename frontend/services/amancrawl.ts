/**
 * AmanCrawlAPI client — web intelligence for AI agents.
 *
 * Includes auth headers from localStorage when user is authenticated.
 * Supports optional AI instructions for advanced scraping/crawling.
 */

import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ScrapeResult {
  url: string;
  status_code: number;
  title: string;
  description: string;
  headings: { level: string; text: string }[];
  links: { text: string; url: string }[];
  images: { src: string; alt: string }[];
  content_length: number;
  markdown?: string;
  html?: string;
  text?: string;
  ai_instruction?: string;
  provider?: string;
  /** Human-readable adapter label (for example, "Jina AI Reader (advanced)"). */
  provider_label?: string;
  latency_ms?: number;
  cached?: boolean;
  scrapeId?: string;
  interact_status?: "active" | "checkpointed" | "restored" | "stale" | "expired";
  interact_recoverable?: boolean;
}

export interface CrawlResult {
  start_url: string;
  pages_crawled: number;
  pages: {
    url: string;
    title: string;
    status_code: number;
    content_length: number;
    text: string;
  }[];
  ai_instruction?: string;
  provider?: string;
  provider_label?: string;
  latency_ms?: number;
  cached?: boolean;
}

export interface MapResult {
  start_url: string;
  total_links: number;
  links: string[];
  structure: Record<string, unknown>;
  ai_instruction?: string;
  provider?: string;
  provider_label?: string;
  latency_ms?: number;
  cached?: boolean;
}

export interface SearchResult {
  query: string;
  results: {
    title: string;
    url: string;
    snippet: string;
  }[];
  ai_instruction?: string;
  provider?: string;
  provider_label?: string;
  latency_ms?: number;
  attempted?: { provider: string; error: string; latency_ms: number }[];
  cached?: boolean;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders("Kontext Crawl"),
  };
}

function errDetail(data: Record<string, unknown>): string {
  const d = data.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return JSON.stringify(d);
  return "";
}

export interface LimitError {
  error: string;
  resource: string;
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  message: string;
}

export class LimitReachedError extends Error {
  public limitData: LimitError;
  constructor(data: LimitError) {
    super(data.message);
    this.limitData = data;
  }
}

function throwIfLimitError(res: Response, data: Record<string, unknown>): void {
  if (res.status === 429 && data.detail && typeof data.detail === "object") {
    const d = data.detail as Record<string, unknown>;
    if (d.error) {
      throw new LimitReachedError({
        error: d.error as string,
        resource: d.resource as string,
        plan: d.plan as string,
        limit: d.limit as number,
        used: d.used as number,
        remaining: d.remaining as number,
        message: d.message as string,
      });
    }
  }
}

export async function scrapeUrl(
  url: string,
  formats: string[] = ["markdown"],
  instruction?: string,
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/scrape`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, formats, instruction }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwIfLimitError(res, data);
    throw new Error(errDetail(data) || `Scrape failed (${res.status})`);
  }
  const payload = await res.json();
  const data = payload.data ?? payload.raw ?? payload;
  return {
    ...data,
    cached: payload.cached,
    interact_status: data.session?.status,
    interact_recoverable: data.session?.canRestore,
    url,
    status_code: data.metadata?.statusCode ?? data.status_code ?? 200,
    title: data.metadata?.title ?? data.title ?? "",
    description: data.metadata?.description ?? data.description ?? "",
    headings: [],
    links: (data.links || []).map((item: string | { text?: string; url?: string }) =>
      typeof item === "string" ? { text: item, url: item } : { text: item.text || item.url || "", url: item.url || "" },
    ),
    images: [],
    content_length: (data.markdown || data.html || data.text || "").length,
    markdown: data.markdown,
    html: data.html,
    text: data.text || data.markdown,
  } as ScrapeResult;
}

export async function getInteractSessionStatus(scrapeId: string): Promise<{ status: string; canRestore: boolean; lastAction?: string } | null> {
  const data = await fetch(`/api/web/interact/${encodeURIComponent(scrapeId)}/status`, { method: "GET", headers: authHeaders() });
  if (data.status === 404) return null;
  const body = await data.json().catch(() => null);
  if (!body?.success) return null;
  return body.data;
}

export async function restoreInteractSession(scrapeId: string): Promise<{ status: string; canRestore: boolean; lastAction?: string }> {
  const response = await fetch(`/api/web/interact/${encodeURIComponent(scrapeId)}/restore`, {
    method: "POST",
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(errDetail(body) || `Session restore failed (${response.status})`);
  }
  return body.data;
}

export async function discardInteractSession(scrapeId: string): Promise<void> {
  const response = await fetch(`/api/web/interact/${encodeURIComponent(scrapeId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errDetail(body) || `Session close failed (${response.status})`);
  }
}

export async function crawlSite(
  url: string,
  maxPages: number = 10,
  instruction?: string,
  signal?: AbortSignal,
): Promise<CrawlResult> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/crawl`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, max_pages: maxPages, instruction: instruction || undefined }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwIfLimitError(res, data);
    throw new Error(errDetail(data) || `Crawl failed (${res.status})`);
  }
  return res.json();
}

export async function mapSite(
  url: string,
  instruction?: string,
  signal?: AbortSignal,
): Promise<MapResult> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/map`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, instruction: instruction || undefined }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwIfLimitError(res, data);
    throw new Error(errDetail(data) || `Map failed (${res.status})`);
  }
  const payload = await res.json();
  const data = payload.data ?? payload.raw ?? payload;
  return {
    start_url: url,
    total_links: data.total_links ?? data.links?.length ?? 0,
    links: (data.links || []).map((item: string | { url: string }) => typeof item === "string" ? item : item.url),
    structure: {},
    cached: payload.cached,
  } as MapResult;
}

export async function searchWeb(
  query: string,
  numResults: number = 5,
  instruction?: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query, num_results: numResults, instruction }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwIfLimitError(res, data);
    throw new Error(errDetail(data) || `Search failed (${res.status})`);
  }
  const payload = await res.json();
  const data = payload.data ?? payload.raw ?? payload;
  return {
    query,
    results: (data.results || data.web || []).map((item: { title: string; url: string; description?: string; snippet?: string; markdown?: string }) => ({
      title: item.title,
      url: item.url,
      snippet: item.description || item.snippet || item.markdown?.slice(0, 160) || "",
    })),
    cached: payload.cached,
  } as SearchResult;
}

export async function refinePrompt(
  instruction: string,
  context: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/refine-prompt`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ instruction, context }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Refine failed (${res.status})`);
  }
  const data = await res.json();
  return data.refined;
}

// ── AI Agent extraction ──────────────────────────────────────────────────

export interface AgentExtractResult {
  url: string;
  instruction: string;
  result: unknown;
  raw_content: string;
  raw_length: number;
  model: string;
  tokens_used: number;
  error?: string;
  provider?: string;
  latency_ms?: number;
}

export async function agentExtract(
  url: string,
  instruction: string,
  outputFormat: string = "auto",
  model: string = "openai/gpt-4o-mini",
  signal?: AbortSignal,
): Promise<AgentExtractResult> {
  const res = await fetch(`${API_URL}/api/AmanCrawl/agent/extract`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, instruction, output_format: outputFormat, model }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwIfLimitError(res, data);
    throw new Error(errDetail(data) || `Agent extract failed (${res.status})`);
  }
  return res.json();
}
