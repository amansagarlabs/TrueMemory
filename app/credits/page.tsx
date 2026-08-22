"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, CreditCard, Gauge, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { PaperDither } from "@/components/ui/paper-dither";
import { buildAuthHeaders, loadAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type UsageBucket = {
  used: number;
  limit: number;
  remaining: number;
  period?: string;
  reset_at?: string | null;
  tokens_input?: number;
  tokens_output?: number;
  cost_cents?: number;
};

type UsageSummaryResponse = {
  plan?: string;
  usage?: Record<string, UsageBucket>;
};

type ProviderSummaryResponse = {
  providers?: Array<{
    provider: string;
    used: number;
    cost_cents: number;
  }>;
};

function formatLimit(limit: number) {
  if (limit >= 1000) return `${Math.round(limit / 1000)}K`;
  return String(limit);
}

function formatBucket(bucket: UsageBucket | undefined, fallbackLimit: number) {
  const used = bucket?.used ?? 0;
  const limit = bucket?.limit ?? fallbackLimit;
  const remaining = bucket?.remaining ?? Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  return { used, limit, remaining, percentUsed, resetAt: bucket?.reset_at ?? null };
}

function formatResetLabel(resetAt?: string | null) {
  if (!resetAt) return "No reset";
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return "No reset";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function CreditsPage() {
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [usage, setUsage] = useState<Record<string, UsageBucket>>({});
  const [providers, setProviders] = useState<ProviderSummaryResponse["providers"]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refreshCredits() {
      setRefreshing(true);
      try {
        const response = await fetch(`${API_URL}/api/subscriptions/usage`, {
          credentials: "include",
          headers: buildAuthHeaders("Credits"),
        });
        if (!response.ok) throw new Error("Unable to load usage.");
        const data = (await response.json()) as UsageSummaryResponse;
        const providerResponse = await fetch(`${API_URL}/api/subscriptions/usage/providers`, {
          credentials: "include",
          headers: buildAuthHeaders("Credits"),
        });
        if (!cancelled) {
          setUsage(data.usage ?? {});
          setProviders(providerResponse.ok ? ((await providerResponse.json()) as ProviderSummaryResponse).providers ?? [] : []);
          setUser(loadAuthUser());
        }
      } catch {
        if (!cancelled) {
          toast.error("Credits refresh failed", {
            description: "Showing the last known usage summary.",
          });
          setUsage({});
          setProviders([]);
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    void refreshCredits();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const cards = useMemo(() => {
    const resources = [
      { id: "crawl:scrape", label: "Scrapes", fallbackLimit: 1000, accent: "#f06418" },
      { id: "crawl:map", label: "Maps", fallbackLimit: 500, accent: "#e9b8ff" },
      { id: "crawl:search", label: "Searches", fallbackLimit: 1000, accent: "#9ee7d8" },
      { id: "crawl:crawl", label: "Crawls", fallbackLimit: 200, accent: "#f6e879" },
    ];
    return resources.map((resource) => {
      const bucket = formatBucket(usage[resource.id], resource.fallbackLimit);
      return {
        id: resource.id,
        label: resource.label,
        usageLabel: `${bucket.used} used this cycle`,
        balance: `${bucket.used} / ${formatLimit(bucket.limit)}`,
        percentUsed: bucket.percentUsed,
        used: bucket.used,
        limit: bucket.limit,
        remaining: bucket.remaining,
        resetAt: bucket.resetAt,
        accent: resource.accent,
      };
    });
  }, [usage]);

  const providerCards = useMemo(() => {
    const palette = {
      openrouter: "#f06418",
      codex: "#e9b8ff",
      claude: "#9ee7d8",
    } as Record<string, string>;
    const seeds = providers?.length
      ? providers
      : [
          { provider: "openrouter", used: 0, cost_cents: 0 },
          { provider: "codex", used: 0, cost_cents: 0 },
          { provider: "claude", used: 0, cost_cents: 0 },
        ];
    return seeds.map((provider) => ({
      provider: provider.provider,
      title: provider.provider.charAt(0).toUpperCase() + provider.provider.slice(1),
      spend: formatDollars(provider.cost_cents),
      usageLabel: `${provider.used} requests this cycle`,
      accent: palette[provider.provider] ?? "#f6e879",
      used: provider.used,
    }));
  }, [providers]);

  const totalUsed = cards.reduce((sum, card) => sum + card.used, 0);
  const totalLimit = cards.reduce((sum, card) => sum + card.limit, 0);
  const currentPlan = user?.plan ?? "free";

  return (
    <AuthenticatedAppShell>
        <main className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto w-full max-w-[1360px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/subscription" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Subscription
            </Link>
            <div className="flex items-center gap-2 text-xs text-white/35">
              <ShieldCheck aria-hidden="true" className="size-4 text-emerald-400" />
              Backend usage summary
            </div>
          </header>

          <section className="relative mt-7 overflow-hidden rounded-[26px] border border-white/10 bg-[#0c0a08] px-6 py-8 sm:px-9 lg:px-11 lg:py-11">
            <PaperDither className="inset-y-0 right-0 w-[62%] opacity-75" dark={{ colorBack: "#0c0a0800", colorFront: "#f06418" }} light={{ colorBack: "#fffaf6", colorFront: "#d86516" }} eager maxPixelCount={1000 * 500} scale={0.78} shape="warp" size={2.2} speed={0.14} type="4x4" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.95)_48%,rgba(12,10,8,0.12)_100%)]" />
            <div className="relative z-10 max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Credits</p>
              <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">One usage ledger for every <span className="text-[#f6e879]">web action.</span></h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/45 sm:text-base">This page is driven from the authenticated backend usage summary, so the numbers match what the server enforces for your account.</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#f6e879]/25 bg-[#f6e879]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f6e879]">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  Current: {currentPlan}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                  <Gauge aria-hidden="true" className="size-3.5 text-[#f6e879]" />
                  {totalUsed} / {totalLimit} total used
                </span>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-5 shadow-[0_18px_55px_-40px_rgba(0,0,0,0.9)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{card.label}</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">{card.balance}</h2>
                      </div>
                      <div className="flex size-11 items-center justify-center rounded-2xl border" style={{ borderColor: `${card.accent}40`, backgroundColor: `${card.accent}15` }}>
                        <CreditCard aria-hidden="true" className="size-5" style={{ color: card.accent }} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/45">{card.usageLabel}</p>
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/35">
                        <span>Usage</span>
                        <span>{formatResetLabel(card.resetAt)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(6, card.percentUsed)}%`, background: `linear-gradient(90deg, ${card.accent}, #f6e879)` }} />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/35">
                      <span>Remaining</span>
                      <span>{card.remaining}</span>
                    </div>
                  </article>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {providerCards.map((provider) => (
                  <article key={provider.provider} className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-5 shadow-[0_18px_55px_-40px_rgba(0,0,0,0.9)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Provider</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">{provider.title}</h2>
                      </div>
                      <div className="flex size-11 items-center justify-center rounded-2xl border" style={{ borderColor: `${provider.accent}40`, backgroundColor: `${provider.accent}15` }}>
                        <CreditCard aria-hidden="true" className="size-5" style={{ color: provider.accent }} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/45">{provider.usageLabel}</p>
                    <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                      <span className="text-sm text-white/55">Spend</span>
                      <span className="font-mono text-sm text-white">{provider.spend}</span>
                    </div>
                  </article>
                ))}
              </div>

              <section className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Controls</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Keep usage fresh</h2>
                  </div>
                  <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/70 transition hover:bg-white/[0.07] hover:text-white">
                    <RefreshCw aria-hidden="true" className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <Link href="/subscription" className="group rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-4 transition hover:-translate-y-0.5 hover:border-[#f6e879]/20 hover:bg-[#f6e879]/5">
                    <div className="flex items-center justify-between">
                      <CreditCard aria-hidden="true" className="size-4 text-[#f6e879]" />
                      <ArrowRight aria-hidden="true" className="size-4 text-white/30 transition group-hover:text-white/60" />
                    </div>
                    <p className="mt-4 text-sm font-medium">Subscription</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">Adjust plan and limits.</p>
                  </Link>
                  <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-4">
                    <Clock3 aria-hidden="true" className="size-4 text-[#9ee7d8]" />
                    <p className="mt-4 text-sm font-medium">Reset windows</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">Matches backend periods and reset times.</p>
                  </div>
                  <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-4">
                    <ShieldCheck aria-hidden="true" className="size-4 text-[#f6e879]" />
                    <p className="mt-4 text-sm font-medium">Protected</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">Authenticated summary only.</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-5 sm:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Summary</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Balance at a glance</h2>
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-white/55">Plan</span>
                    <span className="font-mono text-sm text-[#f6e879]">{currentPlan}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-white/55">Tracked resources</span>
                    <span className="font-mono text-sm text-white">{cards.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-white/55">Refresh state</span>
                    <span className="font-mono text-sm text-white">{refreshing ? "updating" : "live"}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-white/[0.08] bg-[#0d0d0c] p-5 sm:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Routing</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">What this page shows</h2>
                <p className="mt-3 text-sm leading-6 text-white/45">The backend decides your limits. The UI mirrors that source so the credit view stays consistent everywhere in the app.</p>
                <Link href="/subscription" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#f6e879]/25 bg-[#f6e879]/10 px-4 text-sm font-medium text-[#f6e879] transition hover:border-[#f6e879]/40 hover:bg-[#f6e879]/15">
                  Manage subscription
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </section>
            </aside>
          </section>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
