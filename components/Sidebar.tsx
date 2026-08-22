"use client";

import { useState } from "react";
import { CONCEPTS, type Concept } from "@/lib/concepts";

type Props = { className?: string };

export function Sidebar({ className = "" }: Props) {
  const [active, setActive] = useState<Concept>(CONCEPTS[0]);

  return (
    <aside
      className={`flex h-full w-72 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
          Learn
        </p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          AI PDF Workspace
        </h1>
        <p className="mt-1 text-xs text-zinc-500">RAG chat live</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-medium text-zinc-400">Topics</p>
        <ul className="space-y-0.5">
          {CONCEPTS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActive(c)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active.id === c.id
                    ? "bg-violet-100 font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">{active.title}</p>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{active.summary}</p>
        <p className="mt-3 text-xs font-medium text-zinc-500">Why it matters</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{active.whyItMatters}</p>
        <p className="mt-3 text-xs font-medium text-zinc-500">In this pipeline</p>
        <p className="mt-1 text-violet-700 dark:text-violet-300">{active.pipelineStage}</p>
      </div>
    </aside>
  );
}
