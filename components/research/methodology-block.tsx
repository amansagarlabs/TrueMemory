"use client";

import type { MethodologyBlock, ResearchResult } from "@/lib/research-types";
import { ResearchMetric } from "./research-metrics";

/**
 * MethodologyBlock - Displays methodology information
 */
export function MethodologyBlockDisplay({
  methodology,
}: {
  methodology?: MethodologyBlock;
}) {
  if (!methodology) return null;

  return (
    <div className="rounded-xl border border-[#e5d8c9] bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03] mt-4">
      <div className="grid grid-cols-2 gap-3">
        {methodology.dataset && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Dataset</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.dataset}</span>
          </div>
        )}
        {methodology.questions && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Questions</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.questions}</span>
          </div>
        )}
        {methodology.categories && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Categories</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.categories}</span>
          </div>
        )}
        {methodology.model && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Model</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.model}</span>
          </div>
        )}
        {methodology.retrieval && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Retrieval</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.retrieval}</span>
          </div>
        )}
        {methodology.evaluation && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Evaluation</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.evaluation}</span>
          </div>
        )}
        {methodology.run && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Run</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.run}</span>
          </div>
        )}
        {methodology.commit && (
          <div>
            <span className="text-[8px] uppercase tracking-[0.06em] text-[#938377] dark:text-white/38">Commit</span>
            <span className="text-sm font-medium text-[#34251e] dark:text-white/85">{methodology.commit}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ResultsTable - Table displaying research results
 */
export function ResultsTable({
  results,
}: {
  results: ResearchResult[];
}) {
  if (!results.length) return null;

  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left text-[8px] uppercase tracking-[0.08em] text-[#938377] dark:text-white/38">
              Metric
            </th>
            <th className="text-left text-[8px] uppercase tracking-[0.08em] text-[#938377] dark:text-white/38">
              Value
            </th>
            <th className="text-left text-[8px] uppercase tracking-[0.08em] text-[#938377] dark:text-white/38">
              Comparison
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, i) => (
            <tr key={i} className="border-b border-[#e5d8c9] dark:border-white/10">
              <td className="p-2 font-medium text-[#34251e] dark:text-white/85">
                {result.metric}
              </td>
              <td className="p-2 text-[#34251e] dark:text-white/85">
                {typeof result.value === "number" ? `${result.value}${result.unit || ""}` : result.value}
              </td>
              <td className="p-2 text-[#737373] dark:text-white/45">
                {result.comparison !== undefined ? `${result.comparison}${result.unit || ""}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
