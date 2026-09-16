"use client";

import { useState, useEffect } from "react";
import { X, Check, Zap, Sparkles } from "lucide-react";
import { buildAuthHeaders } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Plan {
  id: string;
  plan_key: string;
  plan_name: string;
  description: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  sort_order: number;
  limits: Record<string, { value: number; period: string }>;
}

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  currentPlan?: string;
  onUpgrade?: (planKey: string) => void;
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: "1", plan_key: "free", plan_name: "Free", description: "Get started with basic features",
    price_monthly_cents: 0, price_yearly_cents: 0, currency: "usd", sort_order: 0,
    limits: {
      "crawl:scrape": { value: 10, period: "day" },
      "crawl:map": { value: 5, period: "day" },
      "crawl:search": { value: 10, period: "day" },
      "crawl:crawl": { value: 0, period: "month" },
      "ai:tokens": { value: 50000, period: "month" },
    },
  },
  {
    id: "2", plan_key: "pro", plan_name: "Pro", description: "Advanced features for power users",
    price_monthly_cents: 999, price_yearly_cents: 9900, currency: "usd", sort_order: 1,
    limits: {
      "crawl:scrape": { value: 200, period: "day" },
      "crawl:map": { value: 100, period: "day" },
      "crawl:search": { value: 200, period: "day" },
      "crawl:crawl": { value: 50, period: "month" },
      "ai:tokens": { value: 500000, period: "month" },
    },
  },
  {
    id: "3", plan_key: "team", plan_name: "Team", description: "Collaborate with your team",
    price_monthly_cents: 2999, price_yearly_cents: 29900, currency: "usd", sort_order: 2,
    limits: {
      "crawl:scrape": { value: 1000, period: "day" },
      "crawl:map": { value: 500, period: "day" },
      "crawl:search": { value: 1000, period: "day" },
      "crawl:crawl": { value: 200, period: "month" },
      "ai:tokens": { value: 2000000, period: "month" },
    },
  },
];

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "10 scrapes/day",
    "5 maps/day",
    "10 searches/day",
    "50K AI tokens/month",
    "Basic extraction",
  ],
  pro: [
    "200 scrapes/day",
    "100 maps/day",
    "50 crawls/month",
    "500K AI tokens/month",
    "AI Instructions",
    "Refine Prompt",
    "Priority support",
  ],
  team: [
    "1,000 scrapes/day",
    "500 maps/day",
    "200 crawls/month",
    "2M AI tokens/month",
    "Team collaboration",
    "Usage analytics",
    "Custom agents",
    "Dedicated support",
  ],
};

function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function SubscriptionModal({ isOpen, onClose, feature, currentPlan = "free", onUpgrade }: SubscriptionModalProps) {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch(`${API_URL}/api/subscriptions/plans`)
        .then((r) => r.json())
        .then((data) => {
          if (data.plans?.length) setPlans(data.plans);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  async function handleUpgrade(planKey: string) {
    setUpgrading(planKey);
    try {
      const res = await fetch(`${API_URL}/api/subscriptions/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders("Subscriptions") },
        body: JSON.stringify({ plan_key: planKey, billing_cycle: billing }),
      });
      if (res.ok) {
        onUpgrade?.(planKey);
        onClose();
        window.location.reload();
      }
    } catch {
    } finally {
      setUpgrading(null);
    }
  }

  if (!isOpen) return null;

  const visiblePlans = plans.filter((p) => p.plan_key !== "enterprise");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#111]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute right-4 top-4 text-[#999] hover:text-[#333] dark:hover:text-white">
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fa5a19]/10">
            <Zap className="h-6 w-6 text-[#fa5a19]" />
          </div>
          <h2 className="text-xl font-bold text-[#201510] dark:text-white">
            Upgrade to unlock <span className="text-[#fa5a19]">{feature}</span>
          </h2>
          <p className="mt-1 text-sm text-[#666] dark:text-white/50">
            Affordable pricing for developers and teams.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className={`text-sm ${billing === "monthly" ? "font-semibold text-[#201510] dark:text-white" : "text-[#999] dark:text-white/40"}`}>Monthly</span>
          <button
            onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
            className={`relative h-6 w-11 rounded-full transition ${billing === "yearly" ? "bg-[#fa5a19]" : "bg-[#e5e7eb] dark:bg-white/10"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${billing === "yearly" ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <span className={`text-sm ${billing === "yearly" ? "font-semibold text-[#201510] dark:text-white" : "text-[#999] dark:text-white/40"}`}>
            Yearly
            <span className="ml-1.5 rounded-full bg-[#3ddc84]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#3ddc84]">Save 17%</span>
          </span>
        </div>

        {/* Plans */}
        <div className="grid gap-4 sm:grid-cols-3">
          {visiblePlans.map((plan) => {
            const isCurrent = currentPlan === plan.plan_key;
            const isRecommended = plan.plan_key === "pro";
            const price = billing === "monthly" ? plan.price_monthly_cents : plan.price_yearly_cents;
            const features = PLAN_FEATURES[plan.plan_key] || [];

            return (
              <div
                key={plan.plan_key}
                className={`relative rounded-xl border p-5 transition ${
                  isRecommended
                    ? "border-[#fa5a19] bg-[#fa5a19]/5 dark:border-[#fa5a19]/50"
                    : isCurrent
                      ? "border-[#e5e7eb] bg-[#faf7f2] dark:border-white/10 dark:bg-white/5"
                      : "border-[#e5e7eb] bg-white hover:border-[#fa5a19]/30 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#fa5a19] px-3 py-0.5 text-[10px] font-semibold text-white">
                    MOST POPULAR
                  </span>
                )}

                <h3 className="text-sm font-semibold text-[#201510] dark:text-white">{plan.plan_name}</h3>
                <p className="mt-1 text-[11px] text-[#999] dark:text-white/40">{plan.description}</p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#201510] dark:text-white">{formatPrice(price)}</span>
                  <span className="text-xs text-[#999] dark:text-white/40">
                    /{billing === "monthly" ? "mo" : "yr"}
                  </span>
                </div>

                {billing === "yearly" && plan.price_yearly_cents > 0 && (
                  <p className="mt-1 text-[10px] text-[#3ddc84]">
                    Save {formatPrice(plan.price_monthly_cents * 12 - plan.price_yearly_cents)}/year
                  </p>
                )}

                <ul className="mt-4 space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#666] dark:text-white/60">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#3ddc84]" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrent && handleUpgrade(plan.plan_key)}
                  disabled={isCurrent || upgrading === plan.plan_key}
                  className={`mt-5 w-full rounded-lg py-2.5 text-xs font-semibold transition ${
                    isCurrent
                      ? "cursor-default border border-[#e5e7eb] bg-[#f3eee7] text-[#999] dark:border-white/10 dark:bg-white/5 dark:text-white/40"
                      : "bg-[#fa5a19] text-white hover:bg-[#e04a10]"
                  }`}
                >
                  {isCurrent ? "Current Plan" : upgrading === plan.plan_key ? "Upgrading..." : "Upgrade"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px] text-[#999] dark:text-white/30">
          All plans include SSL, 99.9% uptime, and API access. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
