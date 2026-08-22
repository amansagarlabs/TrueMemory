"use client";

import Link from "next/link";
import type { ResearchItem } from "@/lib/research-types";
import {
  ResearchMetric,
  ResearchMetricCompact,
  ExperimentStatusBadge,
  DatasetBadge,
  ModelBadge,
  ResearchTags,
  StatusTag,
  ReadTimeBadge,
  ResearchCTA,
} from "./research-metrics";

/**
 * ResearchCard - Card displaying a research item
 */
export function ResearchCard({
  item,
  showMetrics = true,
  showStatus = true,
  showTags = true,
  showReadTime = true,
  showCTA = false,
}: {
  item: ResearchItem;
  showMetrics?: boolean;
  showStatus?: boolean;
  showTags?: boolean;
  showReadTime?: boolean;
  showCTA?: boolean;
}) {
  const statusLabel = showStatus ? (
    <StatusTag status={item.status} />
  ) : null;

  const tags = showTags ? (
    <ResearchTags tags={item.tags} />
  ) : null;

  const readTime = showReadTime && item.readTime ? (
    <ReadTimeBadge minutes={item.readTime} />
  ) : null;

  const metrics = showMetrics && item.metrics && item.metrics.length > 0 ? (
    <div className="mt-4 space-y-2">
      {item.metrics.map((metric, i) => (
        <ResearchMetricCompact
          key={i}
          label={metric.label}
          value={metric.value}
          experimental={metric.experimental}
        />
      ))}
    </div>
  ) : null;

  return (
    <Link
      href={`/research/${item.slug}`}
      className="group rounded-xl border border-[#e5d8c9] bg-white/70 overflow-hidden transition-[background-color,border-color] duration-150 hover:border-[#e67d2b]/45 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-[#e67d2b]/40 dark:hover:bg-white/[0.06]"
    >
      <div className="p-5">
        <div className="flex flex-col gap-2">
          <span className="text-[9px] uppercase tracking-[0.1em]">
            {item.number}
          </span>
          <h3 className="font-semibold text-lg leading-tight text-[#34251e] dark:text-white/85">
            {item.title}
          </h3>
          {statusLabel}
        </div>

        <p className="text-sm text-[#737373] dark:text-white/45 line-clamp-3">
          {item.description}
        </p>

        {showMetrics && item.metrics && item.metrics.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {item.metrics.map((metric, i) => (
              <ResearchMetric
                key={i}
                label={metric.label}
                value={metric.value}
                experimental={metric.experimental}
              />
            ))}
          </div>
        )}

        {showTags && item.tags && item.tags.length > 0 && (
          <p className="mt-3 text-[8px] uppercase tracking-[0.08em] text-[#938377] dark:text-white/38">
            {item.tags.map((tag, i) => (
              <span key={tag} className="mr-1">
                {tag}{", ".repeat(i < item.tags.length - 1 ? 1 : 0)}
              </span>
            ))}
          </p>
        )}

        {readTime}

        {showCTA && (
          <ResearchCTA
            primaryText="Read paper"
            primaryHref={`/research/${item.slug}`}
            secondaryText="View on GitHub"
            secondaryHref={item.githubUrl || "/"}
          />
        )}
      </div>
    </Link>
  );
}
