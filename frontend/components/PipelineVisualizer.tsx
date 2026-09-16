"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StepVizContent } from "@/components/pipeline/StepVizContent";
import { PIPELINE_STEPS } from "@/lib/concepts";
import type {
  PipelineEvent,
  PipelineStepId,
  PipelineStepState,
  UploadResponse,
} from "@/lib/types";
import { visualizePipeline } from "@/services/api";

const STEP_IDS = PIPELINE_STEPS.map((s) => s.id as PipelineStepId);

type Props = {
  document: UploadResponse;
  completedSteps: Set<PipelineStepId>;
  onStepsUpdate: (steps: Set<PipelineStepId>) => void;
  autoRun?: boolean;
};

export function PipelineVisualizer({
  document,
  completedSteps,
  onStepsUpdate,
  autoRun = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [steps, setSteps] = useState<PipelineStepState[]>(() =>
    STEP_IDS.map((id) => ({
      id,
      label: PIPELINE_STEPS.find((s) => s.id === id)?.label ?? id,
      status: id === "upload" || completedSteps.has(id) ? "done" : "pending",
    })),
  );

  const runVisualization = useCallback(async () => {
    setOpen(true);
    setRunning(true);
    setError(null);
    setMetrics(null);

    setSteps(
      STEP_IDS.map((id) => ({
        id,
        label: PIPELINE_STEPS.find((s) => s.id === id)?.label ?? id,
        status: id === "upload" ? "done" : "pending",
      })),
    );

    const done = new Set<PipelineStepId>(["upload"]);

    try {
      await visualizePipeline(document.doc_id, (event: PipelineEvent) => {
        if (event.type === "error") {
          setError(event.message ?? "Pipeline failed");
          return;
        }

        if (event.type === "step" && event.id) {
          if (event.status === "done") {
            done.add(event.id);
            onStepsUpdate(new Set(done));
          }
          setSteps((prev) =>
            prev.map((s) => {
              if (s.id !== event.id) return s;
              const status =
                event.status === "running"
                  ? "running"
                  : event.status === "error"
                    ? "error"
                    : event.status === "done"
                      ? "done"
                      : s.status;
              return {
                ...s,
                label: event.label ?? s.label,
                status,
                duration_ms: event.duration_ms ?? s.duration_ms,
                data: event.data ?? s.data,
              };
            }),
          );
        }

        if (event.type === "complete" && event.metrics) {
          setMetrics(event.metrics);
          onStepsUpdate(new Set(STEP_IDS));
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }, [document.doc_id, onStepsUpdate]);

  const totalMs = useMemo(
    () => metrics?.total_ms ?? steps.reduce((a, s) => a + (s.duration_ms ?? 0), 0),
    [metrics, steps],
  );

  useEffect(() => {
    if (!autoRun) return;
    const timer = window.setTimeout(() => {
      void runVisualization();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoRun, runVisualization]);

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-100">
            Pipeline visualization
          </h3>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            Run extract → chunk → tokenize → embed → Milvus. Re-run after code updates
            so chunks get correct page numbers.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => void runVisualization()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {running ? "Running pipeline…" : "Visualize full pipeline"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {(open || running) && (
        <div className="mt-4 space-y-3">
          {steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}

          {metrics && (
            <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                Timing metrics
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {metrics.extraction_ms != null && (
                  <li>Extraction: {metrics.extraction_ms} ms</li>
                )}
                {metrics.chunking_ms != null && (
                  <li>Chunking: {metrics.chunking_ms} ms</li>
                )}
                {metrics.tokenization_ms != null && (
                  <li>Tokenization: {metrics.tokenization_ms} ms</li>
                )}
                {metrics.embedding_ms != null && (
                  <li>Embedding: {metrics.embedding_ms} ms</li>
                )}
                {metrics.milvus_ms != null && (
                  <li>Milvus insert: {metrics.milvus_ms} ms</li>
                )}
                <li className="font-medium text-violet-700 dark:text-violet-300">
                  Total: {totalMs} ms
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StepCard({ step }: { step: PipelineStepState }) {
  const icon =
    step.status === "done"
      ? "✔"
      : step.status === "running"
        ? "…"
        : step.status === "error"
          ? "✗"
          : " ";

  const border =
    step.status === "running"
      ? "border-violet-400 ring-1 ring-violet-200"
      : step.status === "done"
        ? "border-emerald-300 dark:border-emerald-800"
        : step.status === "error"
          ? "border-red-300"
          : "border-zinc-200 dark:border-zinc-800";

  return (
    <div className={`rounded-lg border bg-white p-3 dark:bg-zinc-950 ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-sm">
          <span className="mr-2 text-violet-600">[{icon}]</span>
          {step.label}
        </p>
        {step.duration_ms != null && (
          <span className="text-xs text-zinc-500">{step.duration_ms} ms</span>
        )}
      </div>
      {step.data && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <StepVizContent stepId={step.id} data={step.data} />
        </div>
      )}
    </div>
  );
}
