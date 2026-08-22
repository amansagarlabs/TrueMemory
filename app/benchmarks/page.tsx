"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Code2,
  FileCheck2,
  FolderKanban,
  Gauge,
  KeyRound,
  Layers3,
  Loader2,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { runEvaluation, type EvaluationCaseResult, type EvaluationReport } from "@/services/evaluation";

type ViewTab = "overview" | "cases" | "use-cases";

const PROBLEMS = [
  {
    title: "Scaffold a durable Eve agent from a complete filesystem artifact",
    icon: FolderKanban,
    tag: "Structure",
  },
  {
    title: "Define a typed tool with validated input and output",
    icon: Wrench,
    tag: "Contracts",
  },
  {
    title: "Verify agent discovery, tool calls, output, and replies before shipping",
    icon: ShieldCheck,
    tag: "Safety",
  },
  {
    title: "Run the full test loop without API keys or provider credentials",
    icon: KeyRound,
    tag: "Deterministic",
  },
] as const;

const USE_CASES = [
  { title: "Learning Eve project conventions", icon: Sparkles },
  { title: "Starting a tool-using backend agent", icon: TerminalSquare },
  { title: "Building deterministic smoke tests for an agent", icon: Gauge },
  { title: "Validating an Eve Pattern before publishing it", icon: FileCheck2 },
] as const;

const MODE_LABELS: Record<string, string> = {
  utility: "Runtime",
  direct: "Direct",
  memory: "Memory",
  document: "Document",
  search: "Web search",
  scrape: "Scrape",
  map: "Map",
  crawl: "Crawl",
  agent: "Agent",
};

export default function BenchmarksPage() {
  const [tab, setTab] = useState<ViewTab>("overview");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshReport(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      setReport(await runEvaluation(signal));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Could not run the benchmark.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      void refreshReport(controller.signal);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, []);

  const passedPercent = report ? Math.round(report.score * 100) : 0;
  const failedResults = useMemo(
    () => report?.results.filter((result) => !result.passed) ?? [],
    [report],
  );

  return (
    <AuthenticatedAppShell variant="app">
      <main className="min-h-screen bg-[#f7f2eb] text-[#201510] dark:bg-[#070707] dark:text-white">
        <div className="mx-auto w-full max-w-[1320px] px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
          <header className="flex flex-col gap-6 border-b border-[#e5d8c9] pb-8 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e67d2b]/25 bg-[#fff1e8] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b84d0d] dark:border-[#e67d2b]/30 dark:bg-[#e67d2b]/10 dark:text-[#f2a266]">
                <Activity className="size-3.5" aria-hidden="true" />
                Evaluation engine
              </div>
              <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Benchmarks that make agents shippable.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-[#786a60] dark:text-white/55 sm:text-lg">
                A deterministic smoke suite for routing, tool contracts, memory, sources, and safe agent behavior—before a provider or API key is involved.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                href="/chat"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfd3c5] bg-white/70 px-4 text-sm font-medium text-[#6f6258] transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white"
              >
                Back to chat
              </Link>
              <button
                type="button"
                onClick={() => void refreshReport()}
                disabled={loading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d86516] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#b84d0d] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f2eb] dark:bg-[#e67d2b] dark:text-[#17110d] dark:hover:bg-[#f09a55] dark:focus-visible:ring-offset-[#070707]"
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {loading ? "Running…" : "Run benchmark"}
              </button>
            </div>
          </header>

          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Benchmark summary">
            <SummaryCard label="Cases" value={report ? String(report.cases) : "—"} detail="Core routing suite" icon={Layers3} />
            <SummaryCard label="Assertions" value={report ? String(report.assertions) : "—"} detail="Contract checks" icon={Code2} />
            <SummaryCard label="Score" value={report ? `${passedPercent}%` : "—"} detail={report ? `${report.passed_cases}/${report.cases} cases passed` : "Waiting for run"} icon={Gauge} accent />
            <SummaryCard label="Release gate" value={report ? report.gate.toUpperCase() : "—"} detail={report?.critical_failures.length ? `${report.critical_failures.length} critical failures` : "No critical failures"} icon={report?.gate === "pass" ? CheckCircle2 : CircleAlert} accent={report?.gate === "pass"} />
          </section>

          {error ? (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">Benchmark unavailable</p><p className="mt-1 opacity-80">{error}</p></div>
            </div>
          ) : null}

          <nav className="mt-10 flex gap-1 border-b border-[#e5d8c9] dark:border-white/10" aria-label="Benchmark sections">
            {(["overview", "cases", "use-cases"] as ViewTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                aria-current={tab === item ? "page" : undefined}
                className={`min-h-11 rounded-t-lg border-b-2 px-4 text-sm font-medium capitalize transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] ${tab === item ? "border-[#e67d2b] bg-[#fff1e8] text-[#b84d0d] dark:bg-[#e67d2b]/10 dark:text-[#f2a266]" : "border-transparent text-[#8c7d71] hover:bg-white/60 hover:text-[#34251e] dark:text-white/45 dark:hover:bg-white/[0.05] dark:hover:text-white/80"}`}
              >
                {item.replace("-", " ")}
              </button>
            ))}
          </nav>

          {tab === "overview" ? <Overview /> : null}
          {tab === "cases" ? <Cases results={report?.results ?? []} loading={loading} /> : null}
          {tab === "use-cases" ? <UseCases /> : null}

          {tab === "overview" && failedResults.length ? (
            <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300"><XCircle className="size-4" aria-hidden="true" />Failures need attention</div>
              <p className="mt-2 text-sm text-red-700/75 dark:text-red-200/70">{failedResults.map((result) => result.id).join(", ")}</p>
            </section>
          ) : null}

          <footer className="mt-10 flex flex-col gap-2 border-t border-[#e5d8c9] pt-5 text-xs text-[#938377] dark:border-white/10 dark:text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <span>Network-free evaluation · no provider credentials required</span>
            <span className="inline-flex items-center gap-1.5"><Route className="size-3.5" aria-hidden="true" />Route and tool behavior are scored before output quality</span>
          </footer>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string; detail: string; icon: typeof Activity; accent?: boolean }) {
  return (
    <article className="rounded-2xl border border-[#e5d8c9] bg-white/70 p-5 shadow-[0_14px_32px_-28px_rgba(64,43,24,0.5)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-[0.14em] text-[#938377] dark:text-white/38">{label}</span><Icon className={`size-4 ${accent ? "text-[#e67d2b]" : "text-[#9d8b7e] dark:text-white/35"}`} aria-hidden="true" /></div>
      <p className={`mt-4 text-3xl font-semibold tracking-[-0.04em] ${accent ? "text-[#b84d0d] dark:text-[#f2a266]" : "text-[#34251e] dark:text-white/90"}`}>{value}</p>
      <p className="mt-1 text-xs text-[#938377] dark:text-white/38">{detail}</p>
    </article>
  );
}

function Overview() {
  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[1.12fr_.88fr]">
      <section>
        <SectionIntro eyebrow="Problems solved" title="The checks that keep an agent honest" description="Technical challenges this implementation handles out of the box." />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PROBLEMS.map(({ title, icon: Icon, tag }, index) => (
            <article key={title} className="group rounded-2xl border border-[#e5d8c9] bg-white/70 p-5 transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[#e67d2b]/45 hover:bg-white dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-[#e67d2b]/40 dark:hover:bg-white/[0.06]">
              <div className="flex items-start justify-between gap-4"><span className="flex size-10 items-center justify-center rounded-xl bg-[#fff1e8] text-[#d86516] dark:bg-[#e67d2b]/10 dark:text-[#f2a266]"><Icon className="size-5" aria-hidden="true" /></span><span className="font-mono text-[10px] text-[#b19e91] dark:text-white/30">0{index + 1}</span></div>
              <p className="mt-7 text-[15px] font-semibold leading-6 text-[#34251e] dark:text-white/85">{title}</p>
              <span className="mt-4 inline-flex rounded-full bg-[#f3e9df] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8c6b54] dark:bg-white/[0.07] dark:text-white/45">{tag}</span>
            </article>
          ))}
        </div>
      </section>
      <section>
        <SectionIntro eyebrow="Use cases" title="A practical starting point" description="Products and workflows this pattern is designed to support." />
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#e5d8c9] bg-white/70 dark:border-white/10 dark:bg-white/[0.035]">
          {USE_CASES.map(({ title, icon: Icon }, index) => (
            <article key={title} className="flex min-h-[84px] items-center gap-4 border-b border-[#e5d8c9] px-5 py-4 last:border-0 dark:border-white/10"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e67d2b]/20 bg-[#fffaf6] text-[#d86516] dark:border-[#e67d2b]/25 dark:bg-[#e67d2b]/10 dark:text-[#f2a266]"><Icon className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#34251e] dark:text-white/82">{title}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a99689] dark:text-white/30">Pattern {String.fromCharCode(65 + index)}</p></div><ArrowRight className="size-4 text-[#b9a99e] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" /></article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cases({ results, loading }: { results: EvaluationCaseResult[]; loading: boolean }) {
  return (
    <section className="mt-8">
      <SectionIntro eyebrow="Core suite" title="Every case is inspectable" description="Route decisions are checked without calling a model, web provider, or external credential." />
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e5d8c9] bg-white/70 dark:border-white/10 dark:bg-white/[0.035]">
        {loading && !results.length ? <div className="p-8 text-sm text-[#938377] dark:text-white/45">Running deterministic cases…</div> : results.map((result) => <CaseRow key={result.id} result={result} />)}
        {!loading && !results.length ? <div className="p-8 text-sm text-[#938377] dark:text-white/45">Run the benchmark to populate this list.</div> : null}
      </div>
    </section>
  );
}

function CaseRow({ result }: { result: EvaluationCaseResult }) {
  return (
    <article className="flex flex-col gap-4 border-b border-[#e5d8c9] px-5 py-4 last:border-0 dark:border-white/10 sm:flex-row sm:items-center">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${result.passed ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"}`}>{result.passed ? <Check className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#34251e] dark:text-white/82">{result.id}</p><p className="mt-1 truncate text-xs text-[#938377] dark:text-white/38">{result.question}</p></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-[#f3e9df] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8c6b54] dark:bg-white/[0.07] dark:text-white/45">{MODE_LABELS[result.route.mode] ?? result.route.mode}</span>{result.route.needs_web ? <span className="rounded-full bg-[#fff1e8] px-2.5 py-1 text-[10px] font-semibold text-[#b84d0d] dark:bg-[#e67d2b]/10 dark:text-[#f2a266]">web</span> : null}</div>
    </article>
  );
}

function UseCases() {
  return (
    <section className="mt-8 grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
      <div><SectionIntro eyebrow="Pattern library" title="From first run to release confidence" description="Use the suite as a learning surface, a smoke test, and a publishing gate." /><Link href="/chat" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d86516] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#b84d0d] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:bg-[#e67d2b] dark:text-[#17110d] dark:hover:bg-[#f09a55]">Try it in chat <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      <div className="grid gap-3 sm:grid-cols-2">{USE_CASES.map(({ title, icon: Icon }) => <article key={title} className="rounded-2xl border border-[#e5d8c9] bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.035]"><Icon className="size-5 text-[#d86516] dark:text-[#f2a266]" aria-hidden="true" /><p className="mt-8 text-sm font-semibold leading-6 text-[#34251e] dark:text-white/82">{title}</p><p className="mt-2 text-sm leading-6 text-[#938377] dark:text-white/42">Keep the workflow observable, repeatable, and safe to publish.</p></article>)}</div>
    </section>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d86516] dark:text-[#f2a266]">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#938377] dark:text-white/45">{description}</p></div>;
}
