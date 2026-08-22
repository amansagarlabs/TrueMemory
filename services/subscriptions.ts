/**
 * Subscription & Usage API client.
 * Fetches usage stats for the quota counter.
 */

import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ResourceUsage {
  used: number;
  limit: number;
  period: string;
  remaining: number;
  reset_at: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_cents: number;
}

export interface UsageSummary {
  plan: string;
  usage: Record<string, ResourceUsage>;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders("Subscriptions"),
  };
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const res = await fetch(`${API_URL}/api/subscriptions/usage`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch usage (${res.status})`);
  }
  return res.json();
}

export async function fetchResourceLimit(resourceKey: string): Promise<ResourceUsage> {
  const res = await fetch(`${API_URL}/api/subscriptions/check/${resourceKey}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to check limit (${res.status})`);
  }
  return res.json();
}
