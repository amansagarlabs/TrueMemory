"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SiteFooter } from "@/components/ui/site-footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  latency_ms: number;
  description: string;
}

interface StatusResponse {
  status: "operational" | "degraded" | "outage";
  services: ServiceStatus[];
  uptime: string;
}

const STATUS_CONFIG = {
  operational: { label: "Operational", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/10", icon: CheckCircle2 },
  degraded: { label: "Degraded", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-500/10", icon: AlertTriangle },
  down: { label: "Down", color: "text-red-600", bg: "bg-red-50 dark:bg-red-500/10", icon: XCircle },
};

export default function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function fetchStatus() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${API_URL}/api/status`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setStatus(data);
      setLastChecked(new Date());
    } catch {
      setError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchStatus(), 0);
    const interval = setInterval(fetchStatus, 30000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, []);

  const overallStatus = error ? "outage" : status?.status || "operational";
  const OverallConfig = STATUS_CONFIG[overallStatus === "outage" ? "down" : overallStatus];

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] dark:border-white/10">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#999] hover:text-[#666] dark:hover:text-white/60 transition mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#201510] dark:text-white">System Status</h1>
              <p className="mt-1 text-sm text-[#999] dark:text-white/40">
                amansagar.in
              </p>
            </div>
            <div className="flex items-center gap-2">
              {status && (
                <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${OverallConfig.bg} ${OverallConfig.color}`}>
                  <OverallConfig.icon className="h-3.5 w-3.5" />
                  {OverallConfig.label}
                </span>
              )}
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] dark:border-white/10 px-3 py-1.5 text-xs text-[#999] hover:text-[#666] dark:hover:text-white/60 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {lastChecked && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#bbb] dark:text-white/30">
              <Clock className="h-3 w-3" />
              Last checked: {lastChecked.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        {error ? (
          <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 p-6 text-center">
            <WifiOff className="mx-auto h-8 w-8 text-red-400" />
            <h2 className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">Unable to connect</h2>
            <p className="mt-1 text-xs text-red-600/70 dark:text-red-400/60">
              The backend service appears to be offline. Please try again later.
            </p>
          </div>
        ) : status ? (
          <>
            {/* Services */}
            <div className="rounded-xl border border-[#e5e7eb] dark:border-white/10 overflow-hidden">
              <div className="border-b border-[#e5e7eb] dark:border-white/10 bg-[#faf7f2] dark:bg-white/5 px-4 py-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#999] dark:text-white/40">Services</h2>
              </div>
              {status.services.map((svc, i) => {
                const cfg = STATUS_CONFIG[svc.status];
                return (
                  <div
                    key={svc.name}
                    className={`flex items-center justify-between px-4 py-3.5 ${
                      i < status.services.length - 1 ? "border-b border-[#e5e7eb] dark:border-white/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                      <div>
                        <span className="text-sm font-medium text-[#201510] dark:text-white">{svc.name}</span>
                        <p className="text-[11px] text-[#999] dark:text-white/40">{svc.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {svc.latency_ms > 0 && (
                        <span className="text-[10px] text-[#bbb] dark:text-white/30">{svc.latency_ms}ms</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Uptime */}
            <div className="mt-6 rounded-xl border border-[#e5e7eb] dark:border-white/10 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#201510] dark:text-white">Uptime (Last 90 Days)</h3>
                  <p className="mt-0.5 text-[11px] text-[#999] dark:text-white/40">
                    Based on continuous health checks
                  </p>
                </div>
                <span className="text-2xl font-bold text-[#201510] dark:text-white">{status.uptime}</span>
              </div>
              {/* Uptime bar */}
              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: 90 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1 rounded-sm bg-emerald-400 dark:bg-emerald-500"
                    title={`Day ${90 - i}`}
                  />
                ))}
              </div>
            </div>

            {/* Recent Incidents */}
            <div className="mt-6 rounded-xl border border-[#e5e7eb] dark:border-white/10 p-5">
              <h3 className="text-sm font-semibold text-[#201510] dark:text-white">Recent Incidents</h3>
              <p className="mt-3 text-center text-sm text-[#999] dark:text-white/40">
                No incidents reported in the last 30 days.
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-[#999]" />
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
