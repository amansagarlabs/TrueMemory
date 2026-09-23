"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BarChart3, Clock3, DollarSign, MessageSquare, RefreshCw, Zap } from "lucide-react";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { fetchUsageAnalytics, fetchUsageSummary, type ResourceUsage, type UsageBucket } from "@/services/subscriptions";

type Period = "hour" | "day" | "week" | "month";
const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();

export default function UsagePage() {
  const [period, setPeriod] = useState<Period>("week");
  const [buckets, setBuckets] = useState<UsageBucket[]>([]);
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [analytics, summary] = await Promise.all([fetchUsageAnalytics(period), fetchUsageSummary()]);
      setBuckets(analytics.buckets); setUsage(summary.usage["ai:tokens"] || null); setPlan(summary.plan);
    } catch { setError(true); } finally { setLoading(false); }
  }, [period]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const totals = useMemo(() => buckets.reduce((a, b) => ({ input: a.input + b.tokens_input, output: a.output + b.tokens_output, requests: a.requests + b.requests, cost: a.cost + b.cost_cents }), { input: 0, output: 0, requests: 0, cost: 0 }), [buckets]);
  const max = Math.max(1, ...buckets.map((b) => b.tokens_total));
  const metrics: Array<{ icon: typeof Zap; label: string; value: string; detail: string }> = [
    { icon: Zap, label: "Tokens used", value: usage ? fmt(usage.used) : "—", detail: usage?.limit && usage.limit > 0 ? `of ${fmt(usage.limit)}` : "No cap" },
    { icon: BarChart3, label: "Input tokens", value: fmt(totals.input), detail: "selected period" },
    { icon: MessageSquare, label: "Requests", value: totals.requests.toLocaleString(), detail: "selected period" },
    { icon: DollarSign, label: "Estimated cost", value: `$${(totals.cost / 100).toFixed(2)}`, detail: "provider-reported" },
  ];
  return <AuthenticatedAppShell><main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-xs text-[var(--chat-subtle-foreground)] hover:text-[var(--chat-foreground)]"><ArrowLeft className="size-3.5" /> Dashboard</Link><p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--chat-accent)]">Account analytics</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Usage</h1><p className="mt-2 max-w-xl text-sm text-[var(--chat-subtle-foreground)]">Track tokens, requests, estimated cost, and subscription capacity across your TrueMemory activity.</p></div><div className="flex items-center gap-1 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1">{(["hour", "day", "week", "month"] as Period[]).map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-lg px-3 py-2 text-xs font-medium capitalize ${period === item ? "bg-[var(--chat-foreground)] text-[var(--chat-background)]" : "text-[var(--chat-subtle-foreground)] hover:text-[var(--chat-foreground)]"}`}>{item}</button>)}</div></div>
    {error ? <div className="mt-8 flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm"><span>Usage data could not be loaded.</span><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-xs"><RefreshCw className="size-3.5" /> Retry</button></div> : null}
    <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ icon: Icon, label, value, detail }) => <div key={label} className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5"><div className="flex items-center gap-2 text-xs text-[var(--chat-subtle-foreground)]"><Icon className="size-4 text-[var(--chat-accent)]" />{label}</div><p className="mt-4 text-2xl font-semibold">{loading ? "…" : value}</p><p className="mt-1 text-xs text-[var(--chat-subtle-foreground)]">{detail}</p></div>)}</section>
    <section className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]"><div className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Token activity</h2><p className="mt-1 text-xs text-[var(--chat-subtle-foreground)]">Input and output tokens by {period === "hour" ? "hour" : "day"}.</p></div><Activity className="size-4 text-[var(--chat-accent)]" /></div><div className="mt-8 flex h-52 items-end gap-2 overflow-x-auto pb-6">{buckets.length ? buckets.map((bucket) => <div key={bucket.bucket} className="group flex min-w-8 flex-1 flex-col items-center justify-end gap-2"><div className="relative w-full max-w-10 rounded-t-md bg-[var(--chat-accent)]/75 transition group-hover:bg-[var(--chat-accent)]" style={{ height: `${Math.max(5, (bucket.tokens_total / max) * 100)}%` }} title={`${fmt(bucket.tokens_total)} tokens`} /><span className="text-[9px] text-[var(--chat-subtle-foreground)]">{new Date(bucket.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>) : <p className="m-auto text-sm text-[var(--chat-subtle-foreground)]">No usage in this period.</p>}</div></div><div className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5"><h2 className="font-semibold">Subscription capacity</h2><p className="mt-1 text-xs text-[var(--chat-subtle-foreground)]">Current plan: <span className="capitalize">{plan}</span></p>{usage ? <><div className="mt-8 flex items-end justify-between"><span className="text-3xl font-semibold">{fmt(usage.used)}</span><span className="text-xs text-[var(--chat-subtle-foreground)]">{usage.limit < 0 ? "unlimited" : `${fmt(usage.limit)} tokens`}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--chat-surface-muted)]"><div className="h-full rounded-full bg-[var(--chat-accent)]" style={{ width: `${usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0}%` }} /></div><p className="mt-4 flex items-center gap-2 text-xs text-[var(--chat-subtle-foreground)]"><Clock3 className="size-3.5" />{usage.reset_at ? `Resets ${new Date(usage.reset_at).toLocaleString()}` : "No reset date"}</p></> : <p className="mt-8 text-sm text-[var(--chat-subtle-foreground)]">No token limit data.</p>}<Link href="/subscription" className="mt-8 inline-flex text-xs font-semibold text-[var(--chat-accent)] hover:underline">Manage subscription →</Link></div></section>
  </main></AuthenticatedAppShell>;
}
