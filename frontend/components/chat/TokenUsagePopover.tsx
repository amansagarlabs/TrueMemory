"use client";

import { useEffect, useState } from "react";
import { Activity, Clock3, RefreshCw, X } from "lucide-react";
import { fetchUsageSummary, type ResourceUsage } from "@/services/subscriptions";

function compact(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value);
}

export default function TokenUsagePopover() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { if (!open) return; void fetchUsageSummary().then((data) => setUsage(data.usage["ai:tokens"] || null)).catch(() => setError(true)); }, [open]);
  const total = usage ? usage.tokens_input + usage.tokens_output : 0;
  const percent = usage?.limit && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return <div className="relative">
    <button type="button" aria-label="View token usage" onClick={() => setOpen((value) => !value)} className="inline-flex size-8 items-center justify-center rounded-full text-[var(--chat-subtle-foreground)] transition hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"><Activity className="size-4" /></button>
    {open ? <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-[100] w-72 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-raised)] p-4 shadow-[0_20px_50px_-25px_rgba(0,0,0,.55)] sm:left-[max(1rem,calc(50% - 384px))]">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[var(--chat-foreground)]">Token usage</p><p className="mt-0.5 text-[10px] text-[var(--chat-subtle-foreground)]">Current subscription period</p></div><button type="button" aria-label="Close token usage" onClick={() => setOpen(false)}><X className="size-4 text-[var(--chat-subtle-foreground)]" /></button></div>
      {error ? <button type="button" onClick={() => { setError(false); setOpen(false); }} className="mt-4 flex items-center gap-2 text-xs text-[var(--chat-subtle-foreground)]"><RefreshCw className="size-3" /> Unable to load usage</button> : usage ? <><div className="mt-4 flex items-end justify-between"><span className="text-2xl font-semibold text-[var(--chat-foreground)]">{compact(total)}</span><span className="text-xs text-[var(--chat-subtle-foreground)]">/ {usage.limit < 0 ? "∞" : compact(usage.limit)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--chat-surface-muted)]"><div className="h-full rounded-full bg-[var(--chat-accent)]" style={{ width: `${percent}%` }} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--chat-subtle-foreground)]"><span>Input <strong className="text-[var(--chat-foreground)]">{compact(usage.tokens_input)}</strong></span><span>Output <strong className="text-[var(--chat-foreground)]">{compact(usage.tokens_output)}</strong></span></div><p className="mt-3 flex items-center gap-1 text-[10px] text-[var(--chat-subtle-foreground)]"><Clock3 className="size-3" /> {usage.reset_at ? `Resets ${new Date(usage.reset_at).toLocaleString()}` : "No reset limit"}</p></> : <p className="mt-4 text-xs text-[var(--chat-subtle-foreground)]">No token usage yet.</p>}
    </div> : null}
  </div>;
}
