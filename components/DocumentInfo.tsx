"use client";

import type { UploadResponse } from "@/lib/types";

type Props = { document: UploadResponse };

export function DocumentInfo({ document }: Props) {
  const uploaded = new Date(document.uploaded_at).toLocaleString();

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        Document stored
      </h3>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <Item label="Filename" value={document.filename} />
        <Item label="Size" value={document.size_human} />
        <Item label="Pages / sections" value={String(document.page_count)} />
        <Item label="Uploaded" value={uploaded} />
        <Item label="Document ID" value={document.doc_id} mono />
        <Item label="Path" value={document.stored_path} mono />
      </dl>
    </section>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd
        className={`mt-0.5 break-all text-zinc-800 dark:text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
