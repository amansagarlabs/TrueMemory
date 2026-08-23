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
export type RequestOptions = { signal?: AbortSignal };
export type ClientOptions = { baseUrl: string; token: string; timeoutMs?: number; maxRetries?: number; fetch?: typeof fetch; headers?: Record<string, string> };

export class KontextError extends Error { constructor(message: string, readonly status: number, readonly requestId?: string, readonly details?: unknown) { super(message); this.name = "KontextError"; } }
export class AuthenticationError extends KontextError { name = "AuthenticationError"; }
export class AuthorizationError extends KontextError { name = "AuthorizationError"; }
export class ValidationError extends KontextError { name = "ValidationError"; }
export class RateLimitError extends KontextError { name = "RateLimitError"; readonly retryAfter?: number; constructor(message: string, status: number, requestId?: string, details?: unknown, retryAfter?: number) { super(message, status, requestId, details); this.retryAfter = retryAfter; } }
export class NotFoundError extends KontextError { name = "NotFoundError"; }
export class ConflictError extends KontextError { name = "ConflictError"; }
export class NetworkError extends KontextError { name = "NetworkError"; }
export class ServerError extends KontextError { name = "ServerError"; }

const safeMethods = new Set(["GET", "HEAD"]);
function joinUrl(base: string, path: string) { return `${base.replace(/\/$/, "")}${path}`; }

export class TrueMemory {
  private readonly baseUrl: string; private readonly token: string; private readonly timeoutMs: number; private readonly maxRetries: number; private readonly transport: typeof fetch; private readonly extraHeaders: Record<string, string>;
  constructor(options: ClientOptions) { if (!options.baseUrl || !options.token) throw new ValidationError("baseUrl and token are required", 0); this.baseUrl = options.baseUrl; this.token = options.token; this.timeoutMs = options.timeoutMs ?? 15000; this.maxRetries = Math.max(0, options.maxRetries ?? 2); this.transport = options.fetch ?? globalThis.fetch; if (!this.transport) throw new ValidationError("fetch is unavailable", 0); this.extraHeaders = options.headers ?? {}; }
  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase(); const attempts = safeMethods.has(method) ? this.maxRetries + 1 : 1; let last: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); const onAbort = () => controller.abort(); options.signal?.addEventListener("abort", onAbort, { once: true });
      try { const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${this.token}`); headers.set("Accept", "application/json"); headers.set("X-Request-ID", crypto.randomUUID()); if (init.body) headers.set("Content-Type", "application/json"); Object.entries(this.extraHeaders).forEach(([k, v]) => headers.set(k, v)); const response = await this.transport(joinUrl(this.baseUrl, path), { ...init, headers, signal: controller.signal }); const requestId = response.headers.get("x-request-id") ?? undefined; const payload = await response.json().catch(() => undefined); if (response.ok) return payload as T; throw this.error(response.status, payload, requestId, response.headers.get("retry-after")); }
      catch (error) { if (error instanceof KontextError) { if (error.status >= 500 && attempt + 1 < attempts) { await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt)); last = error; continue; } throw error; } if (options.signal?.aborted) throw new NetworkError("Request cancelled", 0); if (attempt + 1 < attempts) { last = error; await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt)); continue; } throw new NetworkError("Network request failed", 0, undefined, error); } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", onAbort); }
    } throw last;
  }
  private error(status: number, payload: unknown, requestId?: string, retryAfter?: string | null): KontextError { const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; const detail = body.detail && typeof body.detail === "object" ? body.detail as Record<string, unknown> : body.detail; const detailMessage = detail && typeof detail === "object" ? (detail as Record<string, unknown>).message : detail; const message = detailMessage ?? body.message ?? `Request failed (${status})`; const args = [String(message), status, requestId, payload] as const; if (status === 401) return new AuthenticationError(...args); if (status === 403) return new AuthorizationError(...args); if (status === 404) return new NotFoundError(...args); if (status === 409) return new ConflictError(...args); if (status === 422) return new ValidationError(...args); if (status === 429) return new RateLimitError(String(message), status, requestId, payload, retryAfter ? Number(retryAfter) : undefined); if (status >= 500) return new ServerError(...args); return new KontextError(...args); }
  remember(input: MemoryInput, options?: RequestOptions) { return this.request<{ saved: boolean; id: string; key: string; scope: string }>("/v1/memories", { method: "POST", body: JSON.stringify(input) }, options); }
  search(input: RecallInput = {}, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memories/search", { method: "POST", body: JSON.stringify(input) }, options); }
  retrieve(input: RecallInput = {}, options?: RequestOptions) { return this.request<MemoryResult>("/v1/memories/retrieve", { method: "POST", body: JSON.stringify(input) }, options); }
  update(input: { id: string; content: string; source?: string; workspace_id?: string; agent_id?: string; valid_from?: string; valid_until?: string; confidence?: number }, options?: RequestOptions) { return this.request<{ updated: boolean; id: string }>("/v1/memories/update", { method: "POST", body: JSON.stringify(input) }, options); }
  forget(input: { id: string; workspace_id?: string; agent_id?: string }, options?: RequestOptions) { return this.request<{ forgotten: boolean; id: string }>("/v1/memories/forget", { method: "POST", body: JSON.stringify(input) }, options); }
  context(input: RecallInput = {}, options?: RequestOptions) { return this.retrieve(input, options); }
  profile(input: { scope?: string; limit?: number; workspace_id?: string; agent_id?: string } = {}, options?: RequestOptions) { const query = new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return this.request<ProfileResult>(`/v1/memories?${query}`, {}, options); }
  list(input: { scope?: string; limit?: number; workspace_id?: string; agent_id?: string } = {}, options?: RequestOptions) { return this.profile(input, options); }
  health(options?: RequestOptions) { return this.request<{ service: string; status: string }>("/v1/memory/health", {}, options); }
  usage(options?: RequestOptions) { return this.request<UsageResult>("/v1/memory/metrics", {}, options); }
}

export { TrueMemory as MemoryClient };
