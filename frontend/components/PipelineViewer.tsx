"use client";

import { PIPELINE_STEPS } from "@/lib/concepts";
import type { PipelineStepId } from "@/lib/types";

type Props = {
  completedSteps: Set<PipelineStepId>;
};

export function PipelineViewer({ completedSteps }: Props) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Processing pipeline
      </h3>
      <ul className="mt-3 space-y-1.5 font-mono text-sm">
        {PIPELINE_STEPS.map((step) => {
          const done = completedSteps.has(step.id as PipelineStepId);
          return (
            <li
              key={step.id}
              className={`flex items-center gap-2 ${done ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}
            >
              <span>{done ? "[✔]" : "[ ]"}</span>
              {step.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
