"use client";

import type { PipelineStepId } from "@/lib/types";

type Props = {
  stepId: PipelineStepId;
  data?: Record<string, unknown>;
};

export function StepVizContent({ stepId, data }: Props) {
  if (!data) return null;

  switch (stepId) {
    case "extract":
      return <ExtractViz data={data} />;
    case "chunk":
      return <ChunkViz data={data} />;
    case "tokenize":
      return <TokenViz data={data} />;
    case "embed":
      return <EmbedViz data={data} />;
    case "milvus":
      return <MilvusViz data={data} />;
    case "ready":
      return (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          {String(data.message ?? "Ready for RAG queries.")}
        </p>
      );
    default:
      return null;
  }
}

function ExtractViz({ data }: { data: Record<string, unknown> }) {
  const pages = (data.pages as { page: number; char_count: number; preview: string }[]) ?? [];
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>{String(data.total_chars)}</strong> characters from{" "}
        <strong>{String(data.page_count)}</strong> pages
      </p>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900">
        {pages.slice(0, 4).map((p) => (
          <div key={p.page}>
            <span className="text-xs font-medium text-violet-600">Page {p.page}</span>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{p.preview}</p>
          </div>
        ))}
        {pages.length > 4 && (
          <p className="text-xs text-zinc-400">+ {pages.length - 4} more pages…</p>
        )}
      </div>
    </div>
  );
}

function ChunkViz({ data }: { data: Record<string, unknown> }) {
  const chunks = (data.chunks as { chunk_index: number; preview: string }[]) ?? [];
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>{String(data.chunk_count)}</strong> chunks · size {String(data.chunk_size)} ·
        overlap {String(data.chunk_overlap)}
        {data.truncated ? (
          <span className="ml-2 text-amber-600">
            (capped — increase PIPELINE_MAX_CHUNKS in .env)
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1">
        {chunks.map((c) => (
          <span
            key={c.chunk_index}
            className="rounded bg-violet-100 px-2 py-0.5 font-mono text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200"
          >
            #{c.chunk_index}
          </span>
        ))}
      </div>
      {chunks[0] && (
        <p className="rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">{chunks[0].preview}</p>
      )}
    </div>
  );
}

function TokenViz({ data }: { data: Record<string, unknown> }) {
  const tokens = (data.sample_tokens as string[]) ?? [];
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>{String(data.total_tokens)}</strong> total tokens · ~
        <strong>{String(data.avg_tokens_per_chunk)}</strong>/chunk · est. $
        {String(data.estimated_cost_usd)} (illustrative)
      </p>
      <p className="text-xs text-zinc-500">Sample: &quot;{String(data.sample_input)}&quot;</p>
      <div className="flex flex-wrap gap-1">
        {tokens.map((t, i) => (
          <span
            key={`${i}-${t}`}
            className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-mono text-xs dark:border-violet-800 dark:bg-violet-950"
          >
            {JSON.stringify(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmbedViz({ data }: { data: Record<string, unknown> }) {
  const head = (data.sample_vector_head as number[]) ?? [];
  return (
    <p className="text-sm">
      Model <code className="text-xs">{String(data.model)}</code> ·{" "}
      <strong>{String(data.count)}</strong> vectors · dim{" "}
      <strong>{String(data.dimension)}</strong>
      <br />
      <span className="font-mono text-xs text-zinc-500">
        First vector (8 dims): [{head.join(", ")}…]
      </span>
    </p>
  );
}

function MilvusViz({ data }: { data: Record<string, unknown> }) {
  if (data.message) {
    return <p className="text-sm text-red-600">{String(data.message)}</p>;
  }
  return (
    <p className="text-sm">
      Inserted <strong>{String(data.inserted_count)}</strong> rows into{" "}
      <code className="text-xs">{String(data.collection)}</code> on Zilliz Cloud
    </p>
  );
}
