"use client";

import { useState } from "react";
import { runAdminEvaluation, type EvaluationReport } from "@/services/evaluation";

export default function AdminMetricsPage() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setReport(await runAdminEvaluation());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin metrics unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const metrics = report?.metrics;
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-8 px-6 py-12">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-orange-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Evaluation metrics</h1>
        <p className="mt-2 text-sm text-muted-foreground">Routing quality and unnecessary web-search monitoring.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? "Running…" : "Run evaluation"}
      </button>
      {error ? <p className="rounded-lg border border-red-500/30 p-4 text-sm text-red-600">{error}</p> : null}
      {report ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Gate" value={report.gate} />
          <Metric label="Intent" value={formatPercent(metrics?.intent_accuracy)} />
          <Metric label="Subject" value={formatPercent(metrics?.subject_accuracy)} />
          <Metric label="Web accuracy" value={formatPercent(metrics?.web_accuracy)} />
          <Metric label="Unnecessary web" value={formatPercent(metrics?.unnecessary_web_rate)} />
        </section>
      ) : <p className="text-sm text-muted-foreground">Admin data loads only after an evaluation run.</p>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function formatPercent(value: number | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}
