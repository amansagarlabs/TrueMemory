import type { AuthSession, AuthUser } from "@/lib/types";

const AUTH_TOKEN_KEY = "app-agent-auth-token";
const AUTH_USER_KEY = "app-agent-auth-user";
const PLATFORM_KEY = "app-agent-platform";
export const AUTH_USER_CHANGED_EVENT = "kontext-auth-user-changed";

// ── Client-side helpers (localStorage) ─────────────────────────────────────

export function saveAuthSession(_session: AuthSession, user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_USER_CHANGED_EVENT));
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function loadAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_USER_CHANGED_EVENT));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  void credentialedFetch(`${AUTH_SERVICE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive: true,
  }).catch(() => undefined);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(PLATFORM_KEY);
  window.dispatchEvent(new Event(AUTH_USER_CHANGED_EVENT));
}

export function setPlatform(platform: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLATFORM_KEY, platform);
}

export function getPlatform(): string {
  if (typeof window === "undefined") return "Kontext Memory";
  return localStorage.getItem(PLATFORM_KEY) || "Kontext Memory";
}

export function isAuthenticated(): boolean {
  return !!loadAuthUser();
}

// ── Auth context builder (for API calls) ───────────────────────────────────

export function buildAuthHeaders(platform?: string): Record<string, string> {
  const token = getAuthToken();
  const plat = platform || getPlatform();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "x-aman-platform": plat,
  };
}

export function credentialedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(buildAuthHeaders())) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}

// ── Server-side session verification ───────────────────────────────────────

const AUTH_SERVICE_URL = process.env.AMAN_AUTH_SERVICE_URL || "http://localhost:8000";

/**
 * Verify a session token server-side. Used in middleware and API routes.
 * Returns the user object if valid, null otherwise.
 */
export async function verifySession(token: string): Promise<{ user: AuthUser; scopes: string[] } | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.user as AuthUser;
    const scopes = getScopesForPlan(user.plan || "free");
    return { user, scopes };
  } catch {
    return null;
  }
}

/**
 * Get scopes for a given plan tier.
 */
export function getScopesForPlan(plan: string): string[] {
  const scopeMap: Record<string, string[]> = {
    free: ["memory", "artifacts", "rag", "documents", "crawl:search", "crawl:scrape", "crawl:map"],
    pro: ["memory", "artifacts", "rag", "agents", "mcp", "documents", "crawl:search", "crawl:crawl", "crawl:scrape", "crawl:map", "crawl:extract", "crawl:pdf"],
    team: ["memory", "artifacts", "rag", "agents", "mcp", "documents", "crawl:search", "crawl:crawl", "crawl:scrape", "crawl:map", "crawl:extract", "crawl:browser", "crawl:pdf"],
    enterprise: ["memory", "artifacts", "rag", "agents", "mcp", "documents", "crawl:search", "crawl:crawl", "crawl:scrape", "crawl:map", "crawl:extract", "crawl:browser", "crawl:pdf"],
  };
  return scopeMap[plan] || scopeMap.free;
}
