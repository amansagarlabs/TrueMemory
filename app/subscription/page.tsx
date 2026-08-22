"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CreditCard,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { PaperDither } from "@/components/ui/paper-dither";
import UsageCounter from "@/components/UsageCounter";
import { buildAuthHeaders, loadAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type BillingCycle = "monthly" | "yearly";

type SubscriptionPlan = {
  id: string;
  plan_key: string;
  plan_name: string;
  description: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  sort_order: number;
};

const FALLBACK_PLANS: SubscriptionPlan[] = [
  {
    id: "free",
    plan_key: "free",
    plan_name: "Free",
    description: "For personal context and lightweight exploration.",
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    currency: "usd",
    sort_order: 0,
  },
  {
    id: "pro",
    plan_key: "pro",
    plan_name: "Pro",
    description: "For builders running serious memory and web workflows.",
    price_monthly_cents: 999,
    price_yearly_cents: 9900,
    currency: "usd",
    sort_order: 1,
  },
  {
    id: "team",
    plan_key: "team",
    plan_name: "Team",
    description: "For teams sharing agents, sources, and operational context.",
    price_monthly_cents: 2999,
    price_yearly_cents: 29900,
    currency: "usd",
    sort_order: 2,
  },
];

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "20 conversations per day",
    "100 memory entries",
    "10 searches and scrapes per day",
    "1 workspace",
  ],
  pro: [
    "200 conversations per day",
    "5,000 memory entries",
    "Deep crawl and extraction",
    "5 agents and 10 workspaces",
    "MCP tools and PDF processing",
  ],
  team: [
    "Unlimited shared context",
    "Unlimited agents and workspaces",
    "Browser automation",
    "Team collaboration and analytics",
    "Dedicated support",
  ],
};

function formatPrice(cents: number) {
  if (cents === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function isAuthPlan(value: string): value is AuthUser["plan"] {
  return ["free", "pro", "team", "enterprise"].includes(value);
}

export default function SubscriptionPage() {
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [plans, setPlans] = useState<SubscriptionPlan[]>(FALLBACK_PLANS);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(`${API_URL}/api/subscriptions/plans`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load subscription plans.");
        return response.json() as Promise<{ plans?: SubscriptionPlan[] }>;
      })
      .then((data) => {
        if (!cancelled && data.plans?.length) {
          setPlans(
            data.plans
              .filter((plan) => plan.plan_key !== "enterprise")
              .sort((a, b) => a.sort_order - b.sort_order),
          );
        }
      })
      .catch(() => {
        // The local fallback keeps the billing page useful when the API is offline.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentPlan = user?.plan ?? "free";
  const currentPlanName = useMemo(
    () => plans.find((plan) => plan.plan_key === currentPlan)?.plan_name ?? currentPlan,
    [currentPlan, plans],
  );

  async function changePlan(planKey: string) {
    if (planKey === currentPlan || upgrading) return;

    setUpgrading(planKey);

    try {
      const response = await fetch(`${API_URL}/api/subscriptions/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders("Subscriptions"),
        },
        body: JSON.stringify({
          plan_key: planKey,
          billing_cycle: billing,
        }),
      });

      if (!response.ok) {
        throw new Error("The plan could not be updated. Please try again.");
      }

      if (user && isAuthPlan(planKey)) {
        const nextUser: AuthUser = { ...user, plan: planKey };
        localStorage.setItem("app-agent-auth-user", JSON.stringify(nextUser));
        window.dispatchEvent(new Event("kontext-auth-user-changed"));
        setUser(nextUser);
      }

      toast.success("Subscription updated", {
        description: `Your subscription is now on the ${planKey} plan.`,
      });
    } catch (caughtError) {
      toast.error("Subscription update failed", {
        description: caughtError instanceof Error
          ? caughtError.message
          : "The plan could not be updated. Please try again.",
      });
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <AuthenticatedAppShell>
        <main className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto w-full max-w-[1360px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/profile"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Profile
            </Link>
            <div className="flex items-center gap-2 text-xs text-white/35">
              <ShieldCheck aria-hidden="true" className="size-4 text-emerald-400" />
              Secure subscription management
            </div>
          </header>

          <section className="relative mt-7 overflow-hidden rounded-[26px] border border-white/10 bg-[#0c0a08] px-6 py-8 sm:px-9 lg:px-11 lg:py-11">
            <PaperDither
              className="inset-y-0 right-0 w-[62%] opacity-75"
              dark={{ colorBack: "#0c0a0800", colorFront: "#f06418" }}
              light={{ colorBack: "#fffaf6", colorFront: "#d86516" }}
              eager
              maxPixelCount={1000 * 500}
              scale={0.78}
              shape="warp"
              size={2.2}
              speed={0.14}
              type="4x4"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.95)_50%,rgba(12,10,8,0.12)_100%)]" />
            <div className="relative z-10 max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">
                Subscription
              </p>
              <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
                More room for your <span className="text-[#f6e879]">context to grow.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/45 sm:text-base">
                Upgrade memory, conversations, web intelligence, and agent capacity from one place.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#f6e879]/25 bg-[#f6e879]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f6e879]">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  Current: {currentPlanName}
                </span>
                <span className="text-xs text-white/35">Cancel or switch plans anytime.</span>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">
                    Choose a plan
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Subscription options</h2>
                </div>
                <div className="flex w-fit items-center rounded-xl border border-white/10 bg-black/30 p-1">
                  {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => setBilling(cycle)}
                      className={`min-h-9 rounded-lg px-4 text-xs font-semibold capitalize transition ${
                        billing === cycle
                          ? "bg-[#f6e879] text-[#171814]"
                          : "text-white/45 hover:bg-white/[0.05] hover:text-white/75"
                      }`}
                    >
                      {cycle}
                    </button>
                  ))}
                  <span className="ml-1 hidden rounded-md bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-300 sm:block">
                    Save 17%
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrent = currentPlan === plan.plan_key;
                  const recommended = plan.plan_key === "pro";
                  const price =
                    billing === "monthly"
                      ? plan.price_monthly_cents
                      : plan.price_yearly_cents;

                  return (
                    <article
                      key={plan.plan_key}
                      className={`relative flex min-h-[410px] flex-col rounded-[20px] border p-5 ${
                        recommended
                          ? "border-[#f6e879]/45 bg-[#f6e879]/[0.045]"
                          : "border-white/[0.08] bg-black/20"
                      }`}
                    >
                      {recommended ? (
                        <span className="absolute right-4 top-4 rounded-full bg-[#f6e879] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#171814]">
                          Recommended
                        </span>
                      ) : null}

                      <div className="flex size-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-[#f6e879]">
                        {plan.plan_key === "free" ? (
                          <Zap aria-hidden="true" className="size-5" />
                        ) : plan.plan_key === "pro" ? (
                          <Sparkles aria-hidden="true" className="size-5" />
                        ) : (
                          <ShieldCheck aria-hidden="true" className="size-5" />
                        )}
                      </div>
                      <h3 className="mt-5 text-lg font-semibold">{plan.plan_name}</h3>
                      <p className="mt-1 min-h-10 text-xs leading-5 text-white/40">{plan.description}</p>
                      <div className="mt-5 flex items-end gap-1">
                        <span className="text-4xl font-semibold tracking-[-0.06em]">
                          {formatPrice(price)}
                        </span>
                        <span className="pb-1 text-xs text-white/35">
                          /{billing === "monthly" ? "month" : "year"}
                        </span>
                      </div>

                      <ul className="mt-6 space-y-3">
                        {(PLAN_FEATURES[plan.plan_key] ?? []).map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-white/55">
                            <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                            {feature}
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        disabled={isCurrent || upgrading !== null}
                        onClick={() => changePlan(plan.plan_key)}
                        className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                          isCurrent
                            ? "cursor-default border border-white/10 bg-white/[0.035] text-white/35"
                            : recommended
                              ? "bg-[#f6e879] text-[#171814] hover:bg-[#fff5a5]"
                              : "border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        {upgrading === plan.plan_key ? (
                          <>
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                            Updating
                          </>
                        ) : isCurrent ? (
                          "Current plan"
                        ) : (
                          <>
                            Choose {plan.plan_name}
                            <ArrowRight aria-hidden="true" className="size-4" />
                          </>
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[22px] border border-white/[0.08] bg-[#10100f] p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#f6e879]/10 text-[#f6e879]">
                    <CreditCard aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Billing details</p>
                    <p className="mt-0.5 text-xs text-white/35">Managed securely during upgrade.</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center gap-3 text-xs text-white/45">
                    <CalendarDays aria-hidden="true" className="size-4 text-white/30" />
                    Renews on your billing date
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/45">
                    <ReceiptText aria-hidden="true" className="size-4 text-white/30" />
                    Receipts sent to {user?.email ?? "your email"}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/45">
                    <ShieldCheck aria-hidden="true" className="size-4 text-white/30" />
                    Cancel or change anytime
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-white/[0.08] bg-[#10100f] p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#67d9bd]">
                  Current usage
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Plan capacity</h2>
                <UsageCounter
                  className="mt-4 border-0 bg-transparent p-0 dark:border-0 dark:bg-transparent"
                  resources={["crawl:scrape", "crawl:map", "crawl:search", "crawl:crawl"]}
                />
              </section>
            </aside>
          </section>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
