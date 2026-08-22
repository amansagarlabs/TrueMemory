"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Bot,
  Brain,
  Clock,
  FileSearch,
  FileText,
  Globe2,
  Map,
  RefreshCw,
  Search,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { fetchUsageSummary, type ResourceUsage } from "@/services/subscriptions";

const RESOURCE_LABELS: Record<string, string> = {
  "crawl:scrape": "Scrapes",
  "crawl:crawl": "Crawls",
  "crawl:map": "Maps",
  "crawl:search": "Searches",
  "ai:tokens": "AI Tokens",
  "ai:requests": "AI Requests",
  "documents": "Documents",
  "memory": "Memory",
};

const RESOURCE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  "crawl:scrape": FileSearch,
  "crawl:crawl": Globe2,
  "crawl:map": Map,
  "crawl:search": Search,
  "ai:tokens": Bot,
  "ai:requests": Zap,
  documents: FileText,
  memory: Brain,
};

interface UsageCounterProps {
  /** Which resources to show. If omitted, shows all. */
  resources?: string[];
  /** Compact mode: single line per resource */
  compact?: boolean;
  /** Show as a horizontal bar of mini-counters */
  horizontal?: boolean;
  /** Join horizontal counters into one segmented surface */
  integrated?: boolean;
  /** Called when user clicks upgrade */
  onUpgrade?: () => void;
  /** External trigger to refresh (e.g. after a successful scrape) */
  refreshTrigger?: number;
  /** Poll interval for live refresh in ms. */
  refreshIntervalMs?: number;
  /** Custom class */
  className?: string;
}

export function startUsageRefreshTimer(loadUsage: () => void, refreshIntervalMs: number): () => void {
  const timeout = window.setTimeout(loadUsage, 0);
  const interval = window.setInterval(loadUsage, refreshIntervalMs);
  return () => {
    window.clearTimeout(timeout);
    window.clearInterval(interval);
  };
}

function getPercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function getBarColor(percent: number): string {
  if (percent >= 100) return "bg-[#ef4444]";
  if (percent >= 90) return "bg-[#f59e0b]";
  if (percent >= 70) return "bg-[#fb923c]";
  return "bg-[#3ddc84]";
}

function formatReset(resetAt: string | null): string {
  if (!resetAt) return "";
  const now = new Date();
  const reset = new Date(resetAt);
  const diffMs = reset.getTime() - now.getTime();
  if (diffMs <= 0) return "Resets soon";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.ceil(hours / 24);
    return `Resets in ${days}d`;
  }
  if (hours > 0) return `Resets in ${hours}h ${mins}m`;
  return `Resets in ${mins}m`;
}

function formatLimit(limit: number): string {
  if (limit === -1) return "∞";
  if (limit >= 1000000) return `${(limit / 1000000).toFixed(0)}M`;
  if (limit >= 1000) return `${(limit / 1000).toFixed(0)}K`;
  return limit.toString();
}

function formatUsed(used: number): string {
  if (used >= 1000000) return `${(used / 1000000).toFixed(1)}M`;
  if (used >= 1000) return `${(used / 1000).toFixed(1)}K`;
  return used.toString();
}

export default function UsageCounter({
  resources,
  compact = false,
  horizontal = false,
  integrated = false,
  onUpgrade,
  refreshTrigger,
  refreshIntervalMs = 60_000,
  className = "",
}: UsageCounterProps) {
  const [usage, setUsage] = useState<Record<string, ResourceUsage>>({});
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadUsage = useCallback(async () => {
    try {
      const data = await fetchUsageSummary();
      setUsage(data.usage);
      setPlan(data.plan);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return startUsageRefreshTimer(loadUsage, refreshIntervalMs);
  }, [loadUsage, refreshTrigger]);

  if (loading) {
    return (
      <div className={`rounded-xl border border-[#e5e7eb] bg-white p-3 dark:border-white/10 dark:bg-white/5 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#fa5a19]" />
          <span className="text-xs text-[#999] dark:text-white/40">Loading usage...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl border border-[#e5e7eb] bg-white p-3 dark:border-white/10 dark:bg-white/5 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#999] dark:text-white/40">Unable to load usage</span>
          <button onClick={loadUsage} className="text-[#999] hover:text-[#666] dark:hover:text-white/60">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const entries = resources
    ? resources.flatMap((key) =>
        usage[key] ? ([[key, usage[key]]] as [string, ResourceUsage][]) : []
      )
    : Object.entries(usage);

  if (entries.length === 0) return null;

  const hasBlocked = entries.some(([, v]) => v.limit > 0 && v.used >= v.limit);

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {entries.map(([key, val]) => {
          const ResourceIcon = RESOURCE_ICON_COMPONENTS[key] || TrendingUp;
          const resetText = formatReset(val.reset_at);
          const blocked = val.limit > 0 && val.used >= val.limit;

          return (
            <div key={key} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
                <ResourceIcon aria-hidden="true" className="size-3.5 text-[#fa5a19]" />
                <span className={`text-xs font-medium ${blocked ? "text-[#ef4444]" : "text-[#201510] dark:text-white"}`}>
                  {formatUsed(val.used)}/{formatLimit(val.limit)}
                </span>
                <span className="text-[10px] text-[#999] dark:text-white/40">
                  {RESOURCE_LABELS[key] || key}
                </span>
              </div>
              {resetText && (
                <span className="hidden text-[10px] text-[#999] dark:text-white/30 sm:inline">{resetText}</span>
              )}
            </div>
          );
        })}
        {hasBlocked && onUpgrade && (
          <button
            onClick={onUpgrade}
            className="flex items-center gap-1 rounded-lg bg-[#fa5a19]/10 px-2 py-1 text-[10px] font-medium text-[#fa5a19] transition hover:bg-[#fa5a19]/20"
          >
            <TrendingUp className="h-3 w-3" />
            Upgrade
          </button>
        )}
      </div>
    );
  }

  if (horizontal) {
    return (
      <div
        className={
          integrated
            ? `grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 lg:grid-cols-4 ${className}`
            : `flex gap-2 overflow-x-auto ${className}`
        }
      >
        {entries.map(([key, val]) => {
          const ResourceIcon = RESOURCE_ICON_COMPONENTS[key] || TrendingUp;
          const percent = getPercent(val.used, val.limit);
          const barColor = getBarColor(percent);
          const resetText = formatReset(val.reset_at);
          const blocked = val.limit > 0 && val.used >= val.limit;

          return (
            <div
              key={key}
              className={`min-w-[120px] flex-1 p-4 ${
                blocked
                  ? "border-[#ef4444]/30 bg-[#ef4444]/5"
                  : integrated
                    ? "bg-[#11120f]/95"
                    : "rounded-xl border border-[#e5e7eb] bg-white dark:border-white/10 dark:bg-white/5"
              } ${integrated ? "min-w-0" : ""}`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[#fa5a19]/20 bg-[#fa5a19]/10 text-[#fa5a19]">
                    <ResourceIcon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#999] dark:text-white/45">
                    {RESOURCE_LABELS[key] || key}
                  </span>
                </div>
                {blocked && <AlertTriangle className="h-3 w-3 text-[#ef4444]" />}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`text-2xl font-semibold tracking-[-0.04em] ${blocked ? "text-[#ef4444]" : "text-[#201510] dark:text-white"}`}>
                  {formatUsed(val.used)}
                </span>
                <span className="text-xs text-[#999] dark:text-white/40">/ {formatLimit(val.limit)}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5e7eb] dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              {resetText && (
                <div className="mt-1.5 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5 text-[#999] dark:text-white/30" />
                  <span className="text-[10px] text-[#999] dark:text-white/30">{resetText}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default: vertical list
  return (
    <div className={`rounded-xl border border-[#e5e7eb] bg-white p-4 dark:border-white/10 dark:bg-white/5 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#fa5a19]" />
          <span className="text-sm font-semibold text-[#201510] dark:text-white">Usage</span>
          <span className="rounded-full bg-[#e5e7eb] px-2 py-0.5 text-[10px] font-medium text-[#666] dark:bg-white/10 dark:text-white/50">
            {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </span>
        </div>
        <button onClick={loadUsage} className="text-[#999] hover:text-[#666] dark:hover:text-white/60" aria-label="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {entries.map(([key, val]) => {
          const ResourceIcon = RESOURCE_ICON_COMPONENTS[key] || TrendingUp;
          const percent = getPercent(val.used, val.limit);
          const barColor = getBarColor(percent);
          const resetText = formatReset(val.reset_at);
          const blocked = val.limit > 0 && val.used >= val.limit;
          const warning = percent >= 80 && !blocked;

          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ResourceIcon aria-hidden="true" className="size-3.5 text-[#fa5a19]" />
                  <span className="text-xs font-medium text-[#201510] dark:text-white">
                    {RESOURCE_LABELS[key] || key}
                  </span>
                  {(blocked || warning) && (
                    <AlertTriangle className={`h-3 w-3 ${blocked ? "text-[#ef4444]" : "text-[#f59e0b]"}`} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${blocked ? "text-[#ef4444]" : "text-[#201510] dark:text-white"}`}>
                    {formatUsed(val.used)} / {formatLimit(val.limit)}
                  </span>
                  {resetText && (
                    <span className="text-[10px] text-[#999] dark:text-white/30">{resetText}</span>
                  )}
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb] dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              {blocked && (
                <p className="mt-1 text-[10px] text-[#ef4444]">
                  Limit reached. {onUpgrade && (
                    <button onClick={onUpgrade} className="font-semibold underline hover:no-underline">
                      Upgrade plan
                    </button>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
