export class TrueMemoryError extends Error {
    status;
    requestId;
    details;
    constructor(message, status, requestId, details) {
        super(message);
        this.status = status;
        this.requestId = requestId;
        this.details = details;
        this.name = "TrueMemoryError";
    }
}
export class AuthenticationError extends TrueMemoryError {
    name = "AuthenticationError";
}
export class AuthorizationError extends TrueMemoryError {
    name = "AuthorizationError";
}
export class ValidationError extends TrueMemoryError {
    name = "ValidationError";
}
export class RateLimitError extends TrueMemoryError {
    name = "RateLimitError";
    retryAfter;
    constructor(message, status, requestId, details, retryAfter) { super(message, status, requestId, details); this.retryAfter = retryAfter; }
}
export class NotFoundError extends TrueMemoryError {
    name = "NotFoundError";
}
export class ConflictError extends TrueMemoryError {
    name = "ConflictError";
}
export class NetworkError extends TrueMemoryError {
    name = "NetworkError";
}
export class ServerError extends TrueMemoryError {
    name = "ServerError";
}
const safeMethods = new Set(["GET", "HEAD"]);
const MAX_RETRY_AFTER_MS = 30_000;
function retryAfterMs(value) {
    if (!value)
        return 0;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds))
        return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, seconds * 1000));
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now())) : 0;
}
function backoffMs(attempt) {
    const base = Math.min(8_000, 100 * 2 ** Math.max(0, attempt));
    return Math.max(0, Math.round(base * (0.8 + Math.random() * 0.4)));
}
function joinUrl(base, path) { return `${base.replace(/\/$/, "")}${path}`; }
export class TrueMemory {
    baseUrl;
    token;
    timeoutMs;
    maxRetries;
    transport;
    extraHeaders;
    constructor(options) { if (!options.baseUrl || !options.token)
        throw new ValidationError("baseUrl and token are required", 0); this.baseUrl = options.baseUrl; this.token = options.token; this.timeoutMs = options.timeoutMs ?? 15000; this.maxRetries = Math.max(0, options.maxRetries ?? 2); this.transport = options.fetch ?? globalThis.fetch; if (!this.transport)
        throw new ValidationError("fetch is unavailable", 0); this.extraHeaders = options.headers ?? {}; }
    async request(path, init = {}, options = {}) {
        const method = (init.method ?? "GET").toUpperCase();
        const attempts = (safeMethods.has(method) || options.retrySafe || options.idempotencyKey) ? this.maxRetries + 1 : 1;
        let last;
        const requestId = crypto.randomUUID();
        for (let attempt = 0; attempt < attempts; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            const onAbort = () => controller.abort();
            options.signal?.addEventListener("abort", onAbort, { once: true });
            try {
                const headers = new Headers(init.headers);
                headers.set("Authorization", `Bearer ${this.token}`);
                headers.set("Accept", "application/json");
                headers.set("X-Request-ID", requestId);
                if (options.idempotencyKey)
                    headers.set("Idempotency-Key", options.idempotencyKey);
                if (init.body)
                    headers.set("Content-Type", "application/json");
                Object.entries(this.extraHeaders).forEach(([k, v]) => headers.set(k, v));
                const response = await this.transport(joinUrl(this.baseUrl, path), { ...init, headers, signal: controller.signal });
                const responseRequestId = response.headers.get("x-request-id") ?? requestId;
                const payload = await response.json().catch(() => undefined);
                if (response.ok)
                    return payload;
                throw this.error(response.status, payload, responseRequestId, response.headers.get("retry-after"));
            }
            catch (error) {
                if (error instanceof TrueMemoryError) {
                    const retryable = [408, 429, 502, 503, 504].includes(error.status);
                    if (retryable && attempt + 1 < attempts) {
                        const retryAfter = error instanceof RateLimitError ? (error.retryAfter ?? 0) * 1000 : 0;
                        await new Promise(resolve => setTimeout(resolve, retryAfter || backoffMs(attempt)));
                        last = error;
                        continue;
                    }
                    throw error;
                }
                if (options.signal?.aborted)
                    throw new NetworkError("Request cancelled", 0);
                if (attempt + 1 < attempts) {
                    last = error;
                    await new Promise(resolve => setTimeout(resolve, backoffMs(attempt)));
                    continue;
                }
                throw new NetworkError("Network request failed", 0, undefined, error);
            }
            finally {
                clearTimeout(timer);
                options.signal?.removeEventListener("abort", onAbort);
            }
        }
        throw last;
    }
    error(status, payload, requestId, retryAfter) { const body = payload && typeof payload === "object" ? payload : {}; const detail = body.detail && typeof body.detail === "object" ? body.detail : body.detail; const detailMessage = detail && typeof detail === "object" ? detail.message : detail; const message = detailMessage ?? body.message ?? `Request failed (${status})`; const args = [String(message), status, requestId, payload]; if (status === 401)
        return new AuthenticationError(...args); if (status === 403)
        return new AuthorizationError(...args); if (status === 404)
        return new NotFoundError(...args); if (status === 409)
        return new ConflictError(...args); if (status === 422)
        return new ValidationError(...args); if (status === 429)
        return new RateLimitError(String(message), status, requestId, payload, retryAfter ? retryAfterMs(retryAfter) / 1000 : undefined); if (status >= 500)
        return new ServerError(...args); return new TrueMemoryError(...args); }
    remember(input, options) { return this.request("/v1/memories", { method: "POST", body: JSON.stringify(input) }, options); }
    store(input, options) { return this.request("/v1/memory/store", { method: "POST", body: JSON.stringify(input) }, options); }
    search(input = {}, options) { return this.request("/v1/memories/search", { method: "POST", body: JSON.stringify(input) }, { ...options, retrySafe: true }); }
    retrieve(input = {}, options) { return this.request("/v1/memories/retrieve", { method: "POST", body: JSON.stringify(input) }, { ...options, retrySafe: true }); }
    currentState(input, options) { return this.request("/v1/memory/current-state", { method: "POST", body: JSON.stringify(input) }, options); }
    timeline(input, options) { return this.request("/v1/memory/timeline", { method: "POST", body: JSON.stringify(input) }, options); }
    related(input = {}, options) { return this.request("/v1/memory/related", { method: "POST", body: JSON.stringify(input) }, options); }
    update(input, options) { return this.request("/v1/memories/update", { method: "POST", body: JSON.stringify(input) }, options); }
    forget(input, options) { return this.request("/v1/memories/forget", { method: "POST", body: JSON.stringify(input) }, options); }
    context(input = {}, options) { return this.retrieve(input, options); }
    profile(input = {}, options) { const query = new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return this.request(`/v1/memories?${query}`, {}, options); }
    list(input = {}, options) { return this.profile(input, options); }
    health(options) { return this.request("/v1/memory/health", {}, options); }
    usage(options) { return this.request("/v1/memory/metrics", {}, options); }
    exportMemory(input = {}, options) { return this.request("/v1/memory/export", { method: "POST", body: JSON.stringify(input) }, options); }
    importMemory(document, options) { return this.request("/v1/memory/import", { method: "POST", body: JSON.stringify({ document }) }, options); }
    extractNotes(text, options) { return this.request("/v1/memory/import/notes", { method: "POST", body: JSON.stringify({ text }) }, options); }
    importNotes(text, selected, options) { return this.request("/v1/memory/import/notes", { method: "POST", body: JSON.stringify({ text, selected }) }, options); }
    exportNotes(input = {}, options) { return this.request("/v1/memory/export/notes", { method: "POST", body: JSON.stringify(input) }, options); }
}
export { TrueMemory as MemoryClient };
