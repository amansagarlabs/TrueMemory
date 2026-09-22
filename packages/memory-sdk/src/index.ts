export type Memory = {
  id: string; key: string; content: string; source?: string; updated_at?: string;
  valid_from?: string | null; valid_until?: string | null; confidence?: number; revision?: number;
  [key: string]: unknown;
};

export type MemoryInput = {
  key: string; content: string; source?: string; scope?: string; workspace_id?: string; agent_id?: string;
  valid_from?: string; valid_until?: string; confidence?: number;
};
export type RecallInput = { query?: string; scope?: string; limit?: number; workspace_id?: string; agent_id?: string; as_of?: string; include_history?: boolean };
export type MemoryResult = { items: Memory[]; count: number; tier?: string };
export type ContextResult = MemoryResult;
export type ProfileResult = { items: Memory[]; scope?: string };
export type UsageResult = Record<string, unknown>;
export type RequestOptions = { signal?: AbortSignal; retrySafe?: boolean; idempotencyKey?: string };
export type ClientOptions = { baseUrl: string; token: string; timeoutMs?: number; maxRetries?: number; fetch?: typeof fetch; headers?: Record<string, string> };

export class TrueMemoryError extends Error { constructor(message: string, readonly status: number, readonly requestId?: string, readonly details?: unknown) { super(message); this.name = "TrueMemoryError"; } }
export class AuthenticationError extends TrueMemoryError { name = "AuthenticationError"; }
export class AuthorizationError extends TrueMemoryError { name = "AuthorizationError"; }
export class ValidationError extends TrueMemoryError { name = "ValidationError"; }
export class RateLimitError extends TrueMemoryError { name = "RateLimitError"; readonly retryAfter?: number; constructor(message: string, status: number, requestId?: string, details?: unknown, retryAfter?: number) { super(message, status, requestId, details); this.retryAfter = retryAfter; } }
export class NotFoundError extends TrueMemoryError { name = "NotFoundError"; }
export class ConflictError extends TrueMemoryError { name = "ConflictError"; }
export class NetworkError extends TrueMemoryError { name = "NetworkError"; }
export class ServerError extends TrueMemoryError { name = "ServerError"; }

const safeMethods = new Set(["GET", "HEAD"]);
const MAX_RETRY_AFTER_MS = 30_000;
function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, seconds * 1000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now())) : 0;
}
function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 100 * 2 ** Math.max(0, attempt));
  return Math.max(0, Math.round(base * (0.8 + Math.random() * 0.4)));
}
function joinUrl(base: string, path: string) { return `${base.replace(/\/$/, "")}${path}`; }

export class TrueMemory {
  private readonly baseUrl: string; private readonly token: string; private readonly timeoutMs: number; private readonly maxRetries: number; private readonly transport: typeof fetch; private readonly extraHeaders: Record<string, string>;
  constructor(options: ClientOptions) { if (!options.baseUrl || !options.token) throw new ValidationError("baseUrl and token are required", 0); this.baseUrl = options.baseUrl; this.token = options.token; this.timeoutMs = options.timeoutMs ?? 15000; this.maxRetries = Math.max(0, options.maxRetries ?? 2); this.transport = options.fetch ?? globalThis.fetch; if (!this.transport) throw new ValidationError("fetch is unavailable", 0); this.extraHeaders = options.headers ?? {}; }
  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase(); const attempts = (safeMethods.has(method) || options.retrySafe || options.idempotencyKey) ? this.maxRetries + 1 : 1; let last: unknown;
    const requestId = crypto.randomUUID();
    for (let attempt = 0; attempt < attempts; attempt++) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); const onAbort = () => controller.abort(); options.signal?.addEventListener("abort", onAbort, { once: true });
      try { const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${this.token}`); headers.set("Accept", "application/json"); headers.set("X-Request-ID", requestId); if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey); if (init.body) headers.set("Content-Type", "application/json"); Object.entries(this.extraHeaders).forEach(([k, v]) => headers.set(k, v)); const response = await this.transport(joinUrl(this.baseUrl, path), { ...init, headers, signal: controller.signal }); const responseRequestId = response.headers.get("x-request-id") ?? requestId; const payload = await response.json().catch(() => undefined); if (response.ok) return payload as T; throw this.error(response.status, payload, responseRequestId, response.headers.get("retry-after")); }
      catch (error) { if (error instanceof TrueMemoryError) { const retryable = [408, 429, 502, 503, 504].includes(error.status); if (retryable && attempt + 1 < attempts) { const retryAfter = error instanceof RateLimitError ? (error.retryAfter ?? 0) * 1000 : 0; await new Promise(resolve => setTimeout(resolve, retryAfter || backoffMs(attempt))); last = error; continue; } throw error; } if (options.signal?.aborted) throw new NetworkError("Request cancelled", 0); if (attempt + 1 < attempts) { last = error; await new Promise(resolve => setTimeout(resolve, backoffMs(attempt))); continue; } throw new NetworkError("Network request failed", 0, undefined, error); } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", onAbort); }
    } throw last;
  }
  private error(status: number, payload: unknown, requestId?: string, retryAfter?: string | null): TrueMemoryError { const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; const detail = body.detail && typeof body.detail === "object" ? body.detail as Record<string, unknown> : body.detail; const detailMessage = detail && typeof detail === "object" ? (detail as Record<string, unknown>).message : detail; const message = detailMessage ?? body.message ?? `Request failed (${status})`; const args = [String(message), status, requestId, payload] as const; if (status === 401) return new AuthenticationError(...args); if (status === 403) return new AuthorizationError(...args); if (status === 404) return new NotFoundError(...args); if (status === 409) return new ConflictError(...args); if (status === 422) return new ValidationError(...args); if (status === 429) return new RateLimitError(String(message), status, requestId, payload, retryAfter ? retryAfterMs(retryAfter) / 1000 : undefined); if (status >= 500) return new ServerError(...args); return new TrueMemoryError(...args); }
  remember(input: MemoryInput, options?: RequestOptions) { return this.request<{ saved: boolean; id: string; key: string; scope: string }>("/v1/memories", { method: "POST", body: JSON.stringify(input) }, options); }
  store(input: MemoryInput, options?: RequestOptions) { return this.request<{ saved: boolean; id: string; key: string; scope: string }>("/v1/memory/store", { method: "POST", body: JSON.stringify(input) }, options); }
  search(input: RecallInput = {}, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memories/search", { method: "POST", body: JSON.stringify(input) }, { ...options, retrySafe: true }); }
  retrieve(input: RecallInput = {}, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memories/retrieve", { method: "POST", body: JSON.stringify(input) }, { ...options, retrySafe: true }); }
  currentState(input: { workspace_id: string; project_id?: string }, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memory/current-state", { method: "POST", body: JSON.stringify(input) }, options); }
  timeline(input: { workspace_id: string; project_id?: string; as_of?: string }, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memory/timeline", { method: "POST", body: JSON.stringify(input) }, options); }
  related(input: RecallInput = {}, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memory/related", { method: "POST", body: JSON.stringify(input) }, options); }
  update(input: { id: string; content: string; source?: string; workspace_id?: string; agent_id?: string; valid_from?: string; valid_until?: string; confidence?: number }, options?: RequestOptions) { return this.request<{ updated: boolean; id: string }>("/v1/memories/update", { method: "POST", body: JSON.stringify(input) }, options); }
  forget(input: { id: string; workspace_id?: string; agent_id?: string }, options?: RequestOptions) { return this.request<{ forgotten: boolean; id: string }>("/v1/memories/forget", { method: "POST", body: JSON.stringify(input) }, options); }
  context(input: RecallInput = {}, options?: RequestOptions) { return this.retrieve(input, options); }
  profile(input: { scope?: string; limit?: number; workspace_id?: string; agent_id?: string } = {}, options?: RequestOptions) { const query = new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return this.request<ProfileResult>(`/v1/memories?${query}`, {}, options); }
  list(input: { scope?: string; limit?: number; workspace_id?: string; agent_id?: string } = {}, options?: RequestOptions) { return this.profile(input, options); }
  health(options?: RequestOptions) { return this.request<{ service: string; status: string }>("/v1/memory/health", {}, options); }
  usage(options?: RequestOptions) { return this.request<UsageResult>("/v1/memory/metrics", {}, options); }
  exportMemory(input: RecallInput = {}, options?: RequestOptions) { return this.request<Record<string, unknown>>("/v1/memory/export", { method: "POST", body: JSON.stringify(input) }, options); }
  importMemory(document: Record<string, unknown>, options?: RequestOptions) { return this.request<Record<string, unknown>>("/v1/memory/import", { method: "POST", body: JSON.stringify({ document }) }, options); }
  extractNotes(text: string, options?: RequestOptions) { return this.request<Record<string, unknown>>("/v1/memory/import/notes", { method: "POST", body: JSON.stringify({ text }) }, options); }
  importNotes(text: string, selected: number[], options?: RequestOptions) { return this.request<Record<string, unknown>>("/v1/memory/import/notes", { method: "POST", body: JSON.stringify({ text, selected }) }, options); }
  exportNotes(input: RecallInput = {}, options?: RequestOptions) { return this.request<{ format: string; notes: string; lossy: boolean }>("/v1/memory/export/notes", { method: "POST", body: JSON.stringify(input) }, options); }
}

export { TrueMemory as MemoryClient };
