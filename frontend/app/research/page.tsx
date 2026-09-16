"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Code2,
  FileCheck2,
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

import { researchItems } from "@/data/research-data";
import type {
  ResearchCategory,
  ResearchFilter as ResearchFilterState,
  ResearchItem,
} from "@/lib/research-types";
import { ResearchFilter } from "@/components/research/research-filter";
import { ResearchCard } from "@/components/research/research-card";
import { BenchmarkCard } from "@/components/research/benchmark-card";
import { MethodologyBlockDisplay } from "@/components/research/methodology-block";
import { ResultsTable } from "@/components/research/methodology-block";
import { ExperimentStatusBadge, ResearchCTA } from "@/components/research/research-metrics";
import { useReducedMotion } from "@/hooks/use-mobile";

export default function ResearchPage() {
  const items: ResearchItem[] = researchItems;
  const loading = false;
  const [filter, setFilter] = useState<ResearchFilterState>({});

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (filter.category && filter.category !== "all") {
      result = result.filter(
        (item) => item.category === filter.category,
      );
    }

    if (filter.status && filter.status !== "all") {
      result = result.filter((item) => item.status === filter.status);
    }

    // Sort
    switch (filter.sort) {
      case "oldest":
        result.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
        break;
      case "featured":
        result.sort((a, b) => (b.featured ? 1 : -1) * (a.featured ? 1 : -1));
        break;
      case "most-relevant":
        // Default: newest first
        result.sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        );
        break;
      case "latest":
      default:
        result.sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        );
        break;
    }

    return result;
  }, [items, filter]);

  const categoryFilterOptions = useMemo(
    () => [
      { label: "All", value: "all" as const },
      { label: "Memory", value: "memory" as const },
      { label: "Retrieval", value: "retrieval" as const },
      { label: "Context", value: "context-engineering" as const },
      { label: "Agents", value: "agents" as const },
      { label: "Knowledge", value: "knowledge" as const },
      { label: "Benchmarks", value: "benchmarks" as const },
    ],
    [],
  );

  const statusFilterOptions = useMemo(
    () => [
      { label: "All", value: "all" as const },
      { label: "Draft", value: "draft" as const },
      { label: "Experimental", value: "experimental" as const },
      { label: "Published", value: "published" as const },
      { label: "Archived", value: "archived" as const },
    ],
    [],
  );

  const sortOptions = useMemo(
    () => [
      { label: "Latest", value: "latest" as const },
      { label: "Oldest", value: "oldest" as const },
      { label: "Featured", value: "featured" as const },
      { label: "Most relevant", value: "most-relevant" as const },
    ],
    [],
  );

  return (
    <main className="min-h-screen bg-[#f7f2eb] text-[#201510]">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
        <header className="flex flex-col sm:flex-row items-center gap-4 border-b border-[#e5d8c9] pb-6 dark:border-white/10 lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              TRUE MEMORY RESEARCH
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-[#786a60] dark:text-[#786a60]/45 sm:text-lg">
              Researching the infrastructure behind persistent AI context.
              Experiments, benchmarks, and technical work on memory, retrieval,
              context engineering, and reliable AI agents.
            </p>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <ResearchCTA
              primaryText="Explore research"
              primaryHref="/research"
              secondaryText="View on GitHub"
              secondaryHref="https://github.com/kontext-ai/kontext"
            />
          </div>
        </header>

        <section className="mt-8">
          <ResearchFilter
            filter={filter}
            onFilterChange={setFilter}
            categories={categoryFilterOptions}
            statuses={statusFilterOptions}
            sorts={sortOptions}
          />
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading ? (
            <div className="col-span-2 sm:col-span-4 lg:col-span-6 xl:col-span8">
              <div className="py-8 text-center">
                <Loader2 className="size-6 mx-auto mb-4 animate-spin" aria-hidden="true" />
                <p className="text-sm text-[#737373]">Loading research…</p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="col-span-2 sm:col-span-4 lg:col-span-6 xl:col-span8">
              <div className="py-8 text-center">
                <p className="text-[12px] uppercase tracking-[0.1em] text-[#938377] dark:text-[#938377]/45">
                  No research found
                </p>
                {filter.category !== "all" && (
                  <p className="mt-2 text-base text-[#786a60] dark:text-[#786a60]/55">
                    Try adjusting the filters above.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {filteredItems.map((item) => (
            <ResearchCard
              key={item.slug}
              item={item}
              showMetrics={true}
              showStatus={true}
              showTags={true}
              showReadTime={true}
            />
          ))}
        </section>

        <nav className="mt-10 flex gap-1 border-b border-[#e5d8c9] dark:border-white/10" aria-label="Research categories">
          {(["memory", "retrieval", "context-engineering", "agents", "knowledge", "benchmarks"] as ResearchCategory[]).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, category: filter.category === cat ? "all" : cat }))}
                aria-current={filter.category === cat ? "page" : undefined}
                className={`min-h-9 rounded-t-lg border-b-2 px-3 text-sm font-medium capitalize transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] ${filter.category === cat ? "border-[#e67d2b] bg-[#fff1e8] text-[#b84d0d] dark:bg-[#e67d2b]/10 dark:text-[#b84d0d]" : "border-transparent text-[#8c7d71] hover:bg-white/60 hover:text-[#34251e] dark:text-[#7c8278] dark:hover:bg-white/[0.05] dark:hover:text-white/80"}`}
              >
                {cat.replace("-", " ")}
              </button>
            ),
          )}
        </nav>
      </div>
    </main>
  );
}
