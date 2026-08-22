"use client";

import { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  TrendingUp,
  Clock,
  Zap,
  ArrowRight,
  BarChart3,
  RefreshCw,
  Shield,
} from "lucide-react";
import { fetchUsageSummary, type ResourceUsage } from "@/services/subscriptions";

interface LimitData {
  error: string;
  resource: string;
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  message: string;
}

interface LimitReachedModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitData: LimitData | null;
  currentPlan?: string;
  onUpgrade?: () => void;
}

const PLAN_DISPLAY: Record<string, { name: string; color: string; icon: string }> = {
  free: { name: "Free", color: "#999", icon: "🆓" },
  pro: { name: "Pro", color: "#fa5a19", icon: "⭐" },
  team: { name: "Team", color: "#3ddc84", icon: "👥" },
  enterprise: { name: "Enterprise", color: "#8b5cf6", icon: "🏢" },
};

const RESOURCE_LABELS: Record<string, string> = {
  "crawl:scrape": "Scrapes",
  "crawl:crawl": "Crawls",
  "crawl:map": "Maps",
  "crawl:search": "Searches",
};

function getResetTime(period: string): string {
  const now = new Date();
  if (period === "day") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const hours = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));
    return `Resets in ~${hours}h`;
  }
  if (period === "month") {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const days = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `Resets in ~${days}d`;
  }
  return "";
}

export default function LimitReachedModal({
  isOpen,
  onClose,
  limitData,
  currentPlan = "free",
  onUpgrade,
}: LimitReachedModalProps) {
  const [usage, setUsage] = useState<Record<string, ResourceUsage>>({});
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState(false);

  useEffect(() => {
    if (isOpen && limitData) {
      fetchUsageStats();
    }
  }, [isOpen, limitData]);

  async function fetchUsageStats() {
    setLoadingUsage(true);
    setUsageError(false);
    try {
      const data = await fetchUsageSummary();
      setUsage(data.usage);
    } catch {
      setUsageError(true);
    } finally {
      setLoadingUsage(false);
    }
  }

  if (!isOpen || !limitData) return null;

  const planInfo = PLAN_DISPLAY[currentPlan] || PLAN_DISPLAY.free;
  const resourceName = RESOURCE_LABELS[limitData.resource] || limitData.resource;
  const resetText = getResetTime(limitData.resource.includes("craw") ? "month" : "day");
  const usagePercent = limitData.limit > 0 ? Math.min(100, (limitData.used / limitData.limit) * 100) : 0;
  const isFreeUser = currentPlan === "free";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="limit-modal-title"
    >
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#111]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#fa5a19] via-[#ff8c42] to-[#fa5a19]" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-5 text-[#999] hover:text-[#333] dark:hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fa5a19]/10">
              <AlertTriangle className="h-6 w-6 text-[#fa5a19]" />
            </div>
            <div>
              <h2 id="limit-modal-title" className="text-lg font-bold text-[#201510] dark:text-white">
                {resourceName} Limit Reached
              </h2>
              <p className="mt-0.5 text-sm text-[#666] dark:text-white/50">
                You&apos;ve used all {limitData.limit.toLocaleString()} {resourceName.toLowerCase()} on the{" "}
                <span className="font-medium" style={{ color: planInfo.color }}>
                  {planInfo.name}
                </span>{" "}
                plan.
              </p>
            </div>
          </div>

          {/* Usage breakdown card */}
          <div className="mb-5 rounded-xl border border-[#e5e7eb] bg-[#faf7f2] p-4 dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#999] dark:text-white/40">
                Current Usage
              </span>
              <button
                onClick={fetchUsageStats}
                disabled={loadingUsage}
                className="text-[#999] hover:text-[#666] dark:hover:text-white/60"
                aria-label="Refresh usage"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsage ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingUsage ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="mb-1 flex justify-between">
                      <div className="h-3 w-16 rounded bg-[#e5e7eb] dark:bg-white/10" />
                      <div className="h-3 w-10 rounded bg-[#e5e7eb] dark:bg-white/10" />
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#e5e7eb] dark:bg-white/10" />
                  </div>
                ))}
              </div>
            ) : usageError ? (
              <div className="py-3 text-center text-xs text-[#999] dark:text-white/40">
                Unable to load usage data
              </div>
            ) : Object.keys(usage).length > 0 ? (
              <div className="space-y-3">
                {/* Current resource - highlighted */}
                <UsageRow
                  label={resourceName}
                  used={limitData.used}
                  limit={limitData.limit}
                  percent={usagePercent}
                  highlight
                />
                {/* Other resources */}
                {Object.entries(usage).map(([key, val]) => {
                  const label = RESOURCE_LABELS[key] || key;
                  const percent = val.limit > 0 ? Math.min(100, (val.used / val.limit) * 100) : 0;
                  if (key === limitData.resource) return null;
                  return (
                    <UsageRow key={key} label={label} used={val.used} limit={val.limit} percent={percent} />
                  );
                })}
              </div>
            ) : null}

            {/* Reset timer */}
            <div className="mt-3 flex items-center gap-1.5 border-t border-[#e5e7eb] pt-3 dark:border-white/10">
              <Clock className="h-3.5 w-3.5 text-[#999] dark:text-white/40" />
              <span className="text-xs text-[#999] dark:text-white/40">{resetText}</span>
            </div>
          </div>

          {/* Upgrade prompt */}
          {isFreeUser && (
            <div className="mb-5 rounded-xl border border-[#fa5a19]/20 bg-[#fa5a19]/5 p-4">
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[#fa5a19]" />
                <div>
                  <p className="text-sm font-semibold text-[#201510] dark:text-white">
                    Need more {resourceName.toLowerCase()}?
                  </p>
                  <p className="mt-0.5 text-xs text-[#666] dark:text-white/50">
                    Upgrade to Pro for 20× more usage, AI instructions, and priority support.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {isFreeUser ? (
              <>
                <button
                  onClick={() => {
                    onUpgrade?.();
                    onClose();
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#fa5a19] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e04a10]"
                >
                  <TrendingUp className="h-4 w-4" />
                  Upgrade Plan
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm font-medium text-[#666] transition hover:bg-[#f3eee7] dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    onUpgrade?.();
                    onClose();
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#fa5a19] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e04a10]"
                >
                  <BarChart3 className="h-4 w-4" />
                  View Usage
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm font-medium text-[#666] transition hover:bg-[#f3eee7] dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                >
                  Close
                </button>
              </>
            )}
          </div>

          {/* Footer trust signal */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3 text-[#3ddc84]" />
            <span className="text-[10px] text-[#999] dark:text-white/30">
              SSL encrypted · 99.9% uptime · Cancel anytime
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Usage row sub-component ────────────────────────────────────────────────

function UsageRow({
  label,
  used,
  limit,
  percent,
  highlight = false,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
  highlight?: boolean;
}) {
  const barColor =
    percent >= 100
      ? "bg-[#ef4444]"
      : percent >= 80
        ? "bg-[#f59e0b]"
        : "bg-[#3ddc84]";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-xs ${highlight ? "font-semibold text-[#201510] dark:text-white" : "text-[#666] dark:text-white/60"}`}
        >
          {label}
        </span>
        <span className="text-xs text-[#999] dark:text-white/40">
          {used.toLocaleString()} / {limit === -1 ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb] dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
