import type { ReactNode } from "react";

import { ArchiveRestore, Link2, ShieldCheck, Sparkles } from "lucide-react";

const chipIcons = {
  "Source linked": Link2,
  "Permission aware": ShieldCheck,
  "Always retrievable": ArchiveRestore,
};

type GlassBrandPanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  chips: string[];
  topLabel?: string;
  topMeta?: string;
  brandLabel?: ReactNode;
};

export function GlassBrandPanel({
  eyebrow,
  title,
  description,
  chips,
  topLabel = "TrueMemory access",
  topMeta = "01 / memory",
  brandLabel = "TrueMemory",
}: GlassBrandPanelProps) {
  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col justify-between py-10 pl-5 pr-10 xl:py-14 xl:pl-7 xl:pr-14">
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#3c2a20]/65 dark:text-white/55">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#5a3218]/12 bg-[#fffaf2]/55 px-3 py-2 shadow-[0_8px_28px_rgba(111,56,20,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.02] dark:shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
          <Sparkles aria-hidden="true" className="size-3.5 text-[#d85d16] dark:text-[#f6e879]" />
          {topLabel}
        </span>
        <span className="rounded-full border border-[#5a3218]/12 bg-[#fffaf2]/55 px-3 py-2 shadow-[0_8px_28px_rgba(111,56,20,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.02] dark:shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
          {topMeta}
        </span>
      </div>

      <div className="max-w-2xl pb-8">
        <div className="inline-flex items-center rounded-full border border-[#5a3218]/12 bg-[#fffaf2]/58 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#251811]/80 shadow-[0_8px_28px_rgba(111,56,20,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.02] dark:text-white/80 dark:shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
          {brandLabel}
        </div>

        <div className="mt-6 rounded-[2rem] border border-[#5a3218]/12 bg-[#fffaf2]/68 p-8 shadow-[0_24px_70px_-28px_rgba(111,56,20,0.22)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.018] dark:shadow-[0_24px_90px_rgba(0,0,0,0.18)]">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c94f0b] dark:text-[#f6e879]">
            {eyebrow}
          </p>
          <h2 className="mt-5 max-w-xl text-balance font-heading text-5xl font-medium leading-[0.96] tracking-[-0.06em] text-[#1d1410] xl:text-6xl dark:text-white">
            {title}
          </h2>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#3b2b23]/72 dark:text-white/60">
            {description}
          </p>
        </div>

        <div className="mt-8 grid max-w-xl gap-2 sm:grid-cols-3">
          {chips.map((item) => {
            const Icon = chipIcons[item as keyof typeof chipIcons] ?? Sparkles;

            return (
              <div
                key={item}
                className="flex items-center gap-2 rounded-xl border border-[#5a3218]/12 bg-[#fffaf2]/58 px-3 py-3 text-xs text-[#2d2019]/75 shadow-[0_8px_24px_rgba(111,56,20,0.07)] backdrop-blur dark:border-white/10 dark:bg-black/35 dark:text-white/70 dark:shadow-none"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[#d85d16] dark:text-[#f6e879]" />
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
