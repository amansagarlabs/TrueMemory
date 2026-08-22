"use client";

import type {
  ResearchCategory,
  ResearchFilter as ResearchFilterState,
  ResearchStatus,
} from "@/lib/research-types";

/**
 * ResearchFilter - Filter controls for the research landing page
 */
export function ResearchFilter({
  filter,
  onFilterChange,
  categories,
  statuses,
  sorts,
}: {
  filter: ResearchFilterState;
  onFilterChange: (newFilter: ResearchFilterState) => void;
  categories: Array<{ label: string; value: ResearchCategory | "all" }>;
  statuses: Array<{ label: string; value: ResearchStatus | "all" }>;
  sorts: Array<{ label: string; value: string }>;
}) {
  const isActive = (value: string, filterValue?: string) => {
    return value === filterValue;
  };

  const baseClass = "inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[9px] uppercase tracking-[0.08em] text-[#737373] transition-colors duration-150 dark:bg-white/[0.03] dark:text-white/45 hover:bg-white/80 dark:hover:text-white/60";

  const activeClass = "inline-flex items-center gap-1.5 rounded-full bg-[#e67d2b] px-3 py-1.5 text-[9px] uppercase tracking-[0.08em] text-white transition-colors duration-150";

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {/* Category filter */}
        <button
          type="button"
          onClick={() => onFilterChange({ ...filter, category: "all" })}
          className={isActive("all", filter.category) ? activeClass : baseClass}
        >
          All
        </button>

        {categories.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => onFilterChange({ ...filter, category: cat.value })}
            className={isActive(cat.value, filter.category) ? activeClass : baseClass}
          >
            {cat.label}
          </button>
        ))}

        {/* Status filter */}
        <button
          type="button"
          onClick={() => onFilterChange({ ...filter, status: "all" })}
          className={isActive("all", filter.status) ? activeClass : baseClass}
        >
          All
        </button>

        {statuses.map((stat) => (
          <button
            key={stat.value}
            type="button"
            onClick={() => onFilterChange({ ...filter, status: stat.value })}
            className={isActive(stat.value, filter.status) ? activeClass : baseClass}
          >
            {stat.label}
          </button>
        ))}

        {/* Sort filter */}
        <button
          type="button"
          onClick={() => onFilterChange({ ...filter, sort: filter.sort === "latest" ? "oldest" : "latest" })}
          className={baseClass}
        >
          {filter.sort === "latest"
            ? "Latest ▼"
            : filter.sort === "oldest"
            ? "Oldest △"
            : "Latest"}
        </button>
      </div>
    </div>
  );
}
