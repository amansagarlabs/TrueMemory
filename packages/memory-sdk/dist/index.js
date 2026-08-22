export class KontextError extends Error {
    status;
    requestId;
    details;
    constructor(message, status, requestId, details) {
        super(message);
        this.status = status;
        this.requestId = requestId;
        this.details = details;
        this.name = "KontextError";
    }
}
export class AuthenticationError extends KontextError {
    name = "AuthenticationError";
}
export class AuthorizationError extends KontextError {
    name = "AuthorizationError";
}
export class ValidationError extends KontextError {
    name = "ValidationError";
}
export class RateLimitError extends KontextError {
    name = "RateLimitError";
    retryAfter;
    constructor(message, status, requestId, details, retryAfter) { super(message, status, requestId, details); this.retryAfter = retryAfter; }
}
export class NotFoundError extends KontextError {
    name = "NotFoundError";
}
export class ConflictError extends KontextError {
    name = "ConflictError";
}
export class NetworkError extends KontextError {
    name = "NetworkError";
}
export class ServerError extends KontextError {
    name = "ServerError";
}
const safeMethods = new Set(["GET", "HEAD"]);
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
        const attempts = safeMethods.has(method) ? this.maxRetries + 1 : 1;
        let last;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            const onAbort = () => controller.abort();
            options.signal?.addEventListener("abort", onAbort, { once: true });
            try {
                const headers = new Headers(init.headers);
                headers.set("Authorization", `Bearer ${this.token}`);
                headers.set("Accept", "application/json");
                headers.set("X-Request-ID", crypto.randomUUID());
                if (init.body)
                    headers.set("Content-Type", "application/json");
                Object.entries(this.extraHeaders).forEach(([k, v]) => headers.set(k, v));
                const response = await this.transport(joinUrl(this.baseUrl, path), { ...init, headers, signal: controller.signal });
                const requestId = response.headers.get("x-request-id") ?? undefined;
                const payload = await response.json().catch(() => undefined);
                if (response.ok)
                    return payload;
                throw this.error(response.status, payload, requestId, response.headers.get("retry-after"));
            }
            catch (error) {
                if (error instanceof KontextError) {
                    if (error.status >= 500 && attempt + 1 < attempts) {
                        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
                        last = error;
                        continue;
                    }
                    throw error;
                }
                if (options.signal?.aborted)
                    throw new NetworkError("Request cancelled", 0);
                if (attempt + 1 < attempts) {
                    last = error;
                    await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
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
        return new RateLimitError(String(message), status, requestId, payload, retryAfter ? Number(retryAfter) : undefined); if (status >= 500)
        return new ServerError(...args); return new KontextError(...args); }
    remember(input, options) { return this.request("/v1/memories", { method: "POST", body: JSON.stringify(input) }, options); }
    search(input = {}, options) { return this.request("/v1/memories/search", { method: "POST", body: JSON.stringify(input) }, options); }
    retrieve(input = {}, options) { return this.request("/v1/memories/retrieve", { method: "POST", body: JSON.stringify(input) }, options); }
    update(input, options) { return this.request("/v1/memories/update", { method: "POST", body: JSON.stringify(input) }, options); }
    forget(input, options) { return this.request("/v1/memories/forget", { method: "POST", body: JSON.stringify(input) }, options); }
    context(input = {}, options) { return this.retrieve(input, options); }
    profile(input = {}, options) { const query = new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return this.request(`/v1/memories?${query}`, {}, options); }
    list(input = {}, options) { return this.profile(input, options); }
    health(options) { return this.request("/v1/memory/health", {}, options); }
    usage(options) { return this.request("/v1/memory/metrics", {}, options); }
}
export { TrueMemory as MemoryClient };
