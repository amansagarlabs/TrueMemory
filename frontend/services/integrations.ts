/**
 * Integrations API client — real connectivity checks.
 */

import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PlatformStatus = {
  id: string;
  connected: boolean;
  latency_ms: number;
  status_code?: number;
  error?: string;
};

export type ConnectorTestResult = {
  connector_id: string;
  connected: boolean;
  latency_ms: number;
  error?: string;
  models?: number;
  indexes?: number;
  results?: number;
  user?: string;
  status_code?: number;
};

export type ConnectorsEnv = {
  env_configured: Record<string, boolean>;
};

export type GithubConnection = {
  connector_id: "github";
  connected: boolean;
  user?: string;
  scopes?: string[];
  connected_at?: string | null;
};

export async function fetchPlatformStatus(): Promise<PlatformStatus[]> {
  const res = await fetch(`${API_URL}/api/integrations/platforms`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch platform status (${res.status})`);
  const data = await res.json();
  return data.platforms as PlatformStatus[];
}

export async function testConnector(
  connectorId: string,
  apiKey?: string,
  url?: string,
): Promise<ConnectorTestResult> {
  const res = await fetch(`${API_URL}/api/integrations/connectors/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({ connector_id: connectorId, api_key: apiKey, url }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Test failed (${res.status})`);
  }
  return res.json() as Promise<ConnectorTestResult>;
}

export async function fetchConnectorsEnv(): Promise<ConnectorsEnv> {
  const res = await fetch(`${API_URL}/api/integrations/connectors`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch connectors (${res.status})`);
  return res.json() as Promise<ConnectorsEnv>;
}

export async function fetchGithubConnection(): Promise<GithubConnection> {
  const res = await fetch(`${API_URL}/api/integrations/github/status`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub connection (${res.status})`);
  return res.json() as Promise<GithubConnection>;
}

export function startGithubOAuth(): void {
  if (typeof window === "undefined") return;
  window.location.assign(`${API_URL}/api/integrations/github/connect`);
}

export async function disconnectGithub(): Promise<void> {
  const res = await fetch(`${API_URL}/api/integrations/github`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to disconnect GitHub (${res.status})`);
}
