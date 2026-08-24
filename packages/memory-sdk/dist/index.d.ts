export type Memory = {
    id: string;
    key: string;
    content: string;
    source?: string;
    updated_at?: string;
    valid_from?: string | null;
    valid_until?: string | null;
    confidence?: number;
    revision?: number;
    [key: string]: unknown;
};
export type MemoryInput = {
    key: string;
    content: string;
    source?: string;
    scope?: string;
    workspace_id?: string;
    agent_id?: string;
    valid_from?: string;
    valid_until?: string;
    confidence?: number;
};
export type RecallInput = {
    query?: string;
    scope?: string;
    limit?: number;
    workspace_id?: string;
    agent_id?: string;
    as_of?: string;
    include_history?: boolean;
};
export type MemoryResult = {
    items: Memory[];
    count: number;
    tier?: string;
};
export type ContextResult = MemoryResult;
export type ProfileResult = {
    items: Memory[];
    scope?: string;
};
export type UsageResult = Record<string, unknown>;
export type RequestOptions = {
    signal?: AbortSignal;
};
export type ClientOptions = {
    baseUrl: string;
    token: string;
    timeoutMs?: number;
    maxRetries?: number;
    fetch?: typeof fetch;
    headers?: Record<string, string>;
};
export declare class KontextError extends Error {
    readonly status: number;
    readonly requestId?: string | undefined;
    readonly details?: unknown | undefined;
    constructor(message: string, status: number, requestId?: string | undefined, details?: unknown | undefined);
}
export declare class AuthenticationError extends KontextError {
    name: string;
}
export declare class AuthorizationError extends KontextError {
    name: string;
}
export declare class ValidationError extends KontextError {
    name: string;
}
export declare class RateLimitError extends KontextError {
    name: string;
    readonly retryAfter?: number;
    constructor(message: string, status: number, requestId?: string, details?: unknown, retryAfter?: number);
}
export declare class NotFoundError extends KontextError {
    name: string;
}
export declare class ConflictError extends KontextError {
    name: string;
}
export declare class NetworkError extends KontextError {
    name: string;
}
export declare class ServerError extends KontextError {
    name: string;
}
export declare class TrueMemory {
    private readonly baseUrl;
    private readonly token;
    private readonly timeoutMs;
    private readonly maxRetries;
    private readonly transport;
    private readonly extraHeaders;
    constructor(options: ClientOptions);
    private request;
    private error;
    remember(input: MemoryInput, options?: RequestOptions): Promise<{
        saved: boolean;
        id: string;
        key: string;
        scope: string;
    }>;
    search(input?: RecallInput, options?: RequestOptions): Promise<MemoryResult>;
    retrieve(input?: RecallInput, options?: RequestOptions): Promise<MemoryResult>;
    update(input: {
        id: string;
        content: string;
        source?: string;
        workspace_id?: string;
        agent_id?: string;
        valid_from?: string;
        valid_until?: string;
        confidence?: number;
    }, options?: RequestOptions): Promise<{
        updated: boolean;
        id: string;
    }>;
    forget(input: {
        id: string;
        workspace_id?: string;
        agent_id?: string;
    }, options?: RequestOptions): Promise<{
        forgotten: boolean;
        id: string;
    }>;
    context(input?: RecallInput, options?: RequestOptions): Promise<MemoryResult>;
    profile(input?: {
        scope?: string;
        limit?: number;
        workspace_id?: string;
        agent_id?: string;
    }, options?: RequestOptions): Promise<ProfileResult>;
    list(input?: {
        scope?: string;
        limit?: number;
        workspace_id?: string;
        agent_id?: string;
    }, options?: RequestOptions): Promise<ProfileResult>;
    health(options?: RequestOptions): Promise<{
        service: string;
        status: string;
    }>;
    usage(options?: RequestOptions): Promise<UsageResult>;
}
export { TrueMemory as MemoryClient };
