/**
 * Subscription & Usage API client.
 * Fetches usage stats for the quota counter.
 */

import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://truememory.onrender.com";

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

export interface SubscriptionPlan {
  plan_key: string;
  plan_name: string;
  description?: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
}

export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${API_URL}/api/subscriptions/plans`);
  if (!res.ok) throw new Error(`Failed to fetch plans (${res.status})`);
  return (await res.json()).plans || [];
}

export async function createPolarCheckout(
  planKey: string,
  billingCycle: "monthly" | "yearly" = "monthly",
): Promise<{ url: string }> {
  const res = await fetch(`${API_URL}/api/subscriptions/checkout`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ plan_key: planKey, billing_cycle: billingCycle }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Checkout failed (${res.status})`);
  if (!body.checkout?.url) throw new Error("Polar did not return a checkout URL");
  return { url: body.checkout.url };
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
