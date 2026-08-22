"use client";

import type { DatasetInfo, MethodologyBlock, ResearchResult } from "@/lib/research-types";
import { ResearchMetric } from "./research-metrics";

/**
 * BenchmarkCard - Card displaying benchmark results
 */
export function BenchmarkCard({
  title,
  dataset,
  models,
  metrics,
  date,
  methodology,
  githubUrl,
}: {
  title: string;
  dataset: DatasetInfo;
  models: string[];
  metrics: ResearchResult[];
  date: string;
  methodology?: MethodologyBlock;
  githubUrl?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5d8c9] bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3">
        <h3 className="font-medium text-lg text-[#34251e] dark:text-white/85">
          {title}
        </h3>
        <p className="text-sm text-[#737373] dark:text-white/45">
          {dataset.name} — {models.join(", ")}
        </p>

        {metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {metrics.map((metric, i) => (
              <ResearchMetric
                key={i}
                label={metric.label ?? metric.metric ?? "Metric"}
                value={metric.value}
                experimental={metric.experimental}
              />
            ))}
          </div>
        )}

        {methodology && (
          <div className="mt-3 text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">
            {methodology.dataset && (
              <div>{methodology.dataset}</div>
            )}
            {methodology.questions && (
              <div>{methodology.questions} questions</div>
            )}
          </div>
        )}

        {githubUrl && (
          <div className="mt-3">
            <a
              href={githubUrl}
              className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-[#e67d2b] hover:text-[#b84d0d]"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
