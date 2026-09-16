"use client";

import type {
  DatasetInfo,
  MetricLabel,
  MetricValue,
  ResearchStatus,
} from "@/lib/research-types";

/**
 * ResearchMetric - Compact metric display for research papers
 *
 * Usage:
 * <ResearchMetric label="Recall@10" value={94.2} />
 * <ResearchMetric label="Token usage" value={"-31%"} experimental />
 */
export function ResearchMetric({
  label,
  value,
  experimental,
}: {
  label: MetricLabel;
  value: MetricValue;
  experimental?: boolean;
}) {
  const valueClass = experimental
    ? "text-[#e67d2b] font-medium"
    : "text-[#34251e] font-medium";

  const labelClass = "text-xs font-medium uppercase tracking-[0.12em]";

  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
      {experimental && (
        <span
          className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#b84d0d]"
        >
          Experimental
        </span>
      )}
    </div>
  );
}

/**
 * ResearchMetricCompact - Even more compact metric for metric area
 */
export function ResearchMetricCompact({
  label,
  value,
  unit,
  experimental,
}: {
  label: MetricLabel;
  value: MetricValue;
  unit?: string;
  experimental?: boolean;
}) {
  const displayValue = typeof value === "number" ? `${value}${unit || ""}` : value;

  const valueClass = experimental
    ? "text-[#e67d2b] font-medium"
    : "text-[#34251e] font-medium";

  return (
    <span className="text-sm font-medium">
      <span className={valueClass}>{displayValue}</span>
      {experimental && (
        <span className="ml-1 text-[9px] uppercase tracking-[0.08em] text-[#b84d0d]">
          Experimental
        </span>
      )}
    </span>
  );
}

/**
 * MetricComparison - Side-by-side comparison of two metric values
 */
export function MetricComparison({
  label,
  current,
  previous,
  currentUnit,
  previousUnit,
  experimental,
}: {
  label: MetricLabel;
  current: MetricValue;
  previous: MetricValue;
  currentUnit?: string;
  previousUnit?: string;
  experimental?: boolean;
}) {
  const currentDisplay =
    typeof current === "number" ? `${current}${currentUnit || ""}` : current;
  const previousDisplay =
    typeof previous === "number"
      ? `${previous}${previousUnit || ""}`
      : previous;

  const isImprovement =
    typeof current === "number" &&
    typeof previous === "number" &&
    current > previous;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="text-sm font-medium">
        {currentDisplay}
      </span>
      {previousDisplay !== "—" && (
        <span className="text-[9px] uppercase tracking-[0.06em]">
          {isImprovement ? "▲" : "▼"} {previousDisplay}
        </span>
      )}
    </div>
  );
}

/**
 * ExperimentStatusBadge - Shows the status of an experiment
 */
export function ExperimentStatusBadge({
  status,
}: {
  status: ResearchStatus;
}) {
  const statusMap: Record<ResearchStatus, { className: string; label: string }> = {
    draft: {
      className: "bg-white/80 text-[#737373]",
      label: "Draft",
    },
    experimental: {
      className: "bg-[#fff1e8] text-[#b84d0d]",
      label: "Experimental",
    },
    published: {
      className: "bg-[#f0fdf4] text-[#166534]",
      label: "Published",
    },
    archived: {
      className: "bg-[#f1f5f9] text-[#64748b]",
      label: "Archived",
    },
  };

  const { className, label } = statusMap[status] || {
    className: "bg-gray-200 text-gray-500",
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-${className
        .split(" ")[1]
        .replace("bg-", "")
        .split(" ")[0]} ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * DatasetBadge - Badge showing dataset info
 */
export function DatasetBadge({
  dataset,
}: {
  dataset: DatasetInfo;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f2ea] px-2 py-1 text-[8px] uppercase tracking-[0.08em] text-[#737373]"
    >
      {dataset.name}
      {dataset.size && (
        <span className="text-[8px]">
          ({dataset.size.toLocaleString()} items)
        </span>
      )}
    </span>
  );
}

/**
 * ModelBadge - Badge showing model used
 */
export function ModelBadge({
  model,
}: {
  model: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[#e67d2b] px-2 py-1 text-[8px] uppercase tracking-[0.08em] text-white"
    >
      {model}
    </span>
  );
}

/**
 * Tags display - Chip tags for research items
 */
export function ResearchTags({
  tags,
}: {
  tags: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.06em] text-[#737373] dark:bg-white/[0.03]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/**
 * StatusTag - Simple status tag for research items
 */
export function StatusTag({
  status,
}: {
  status: ResearchStatus;
}) {
  const statusMap: Record<ResearchStatus, string> = {
    draft: "Draft",
    experimental: "Experimental",
    published: "Published",
    archived: "Archived",
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.06em] text-[#737373] dark:bg-white/[0.03]"
    >
      {statusMap[status]}
    </span>
  );
}

/**
 * ReadTimeBadge - Shows estimated read time
 */
export function ReadTimeBadge({
  minutes,
}: {
  minutes?: number;
}) {
  if (!minutes) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.06em] text-[#737373] dark:bg-white/[0.03]"
    >
      {minutes} min read
    </span>
  );
}

/**
 * CTA button for research pages
 */
export function ResearchCTA({
  primaryText,
  primaryHref,
  secondaryText,
  secondaryHref,
}: {
  primaryText: string;
  primaryHref: string;
  secondaryText: string;
  secondaryHref: string;
}) {
  return (
    <div className="flex gap-3">
      <a
        href={primaryHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#171814] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#2b2e28] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f2eb] dark:bg-[#f2f1e8] dark:text-[#171814] dark:hover:bg-[#e4e3da]"
      >
        {primaryText}
      </a>
      <a
        href={secondaryHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfd3c5] bg-white/70 px-4 text-sm font-medium text-[#6f6258] transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white"
      >
        {secondaryText}
      </a>
    </div>
  );
}
