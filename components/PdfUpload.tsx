"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import type { UploadResponse } from "@/lib/types";
import { uploadPdf } from "@/services/api";

type Props = {
  onUploaded: (doc: UploadResponse) => void;
  disabled?: boolean;
};

export function PdfUpload({ onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const selectFile = useCallback((nextFile: File) => {
    setError(null);
    setFile(nextFile);
    setName(nextFile.name.replace(/\.[^.]+$/, "").replaceAll("_", " "));
  }, []);

  const submitUpload = useCallback(async () => {
    if (!file || !name.trim() || disabled || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await uploadPdf(file, name);
      onUploaded(result);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }, [disabled, file, loading, name, onUploaded]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (disabled || loading) return;
      const nextFile = event.dataTransfer.files[0];
      if (nextFile) selectFile(nextFile);
    },
    [disabled, loading, selectFile],
  );

  return (
    <section>
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Upload a file
      </h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Stored locally in{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-white/[0.06]">
          backend/uploads/
        </code>
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !loading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-[background-color,border-color] duration-150 ${
          dragging
            ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10"
            : "border-zinc-300 bg-zinc-50/60 dark:border-white/15 dark:bg-black/15"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.docx,.pptx,.xlsx,.py,.js,.jsx,.ts,.tsx,.css,.scss,.sql,.yaml,.yml,.xml,.toml,.ini,.log,.java,.go,.rs,.c,.h,.cpp,.hpp,.sh,.ps1"
          className="hidden"
          disabled={disabled || loading}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) selectFile(nextFile);
            event.target.value = "";
          }}
        />

        <Upload className="size-5 text-zinc-400 dark:text-white/35" aria-hidden="true" />
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">Drag & drop a file here, or</p>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-orange-500 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#10100f]"
        >
          Choose file
        </button>
        <p className="mt-3 text-xs leading-5 text-zinc-400">Max 20 MB · PDF, DOCX, text, data, web, and source files</p>
      </div>

      {file ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{file.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              disabled={loading}
              onClick={() => {
                setFile(null);
                setName("");
                setError(null);
              }}
              className="grid size-11 shrink-0 place-items-center rounded-full text-zinc-500 transition-colors duration-150 hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:bg-white/10 dark:hover:text-white sm:size-9"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <label htmlFor="artifact-name" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Artifact name
          </label>
          <input
            id="artifact-name"
            value={name}
            maxLength={160}
            disabled={loading}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Q3 market research"
            className="mt-2 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500/25 dark:border-white/15 dark:bg-black/20 dark:text-white sm:text-sm"
          />

          <button
            type="button"
            disabled={loading || !name.trim()}
            onClick={() => void submitUpload()}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-orange-500 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-offset-[#171716]"
          >
            <Upload className="size-4" aria-hidden="true" />
            {loading ? "Uploading…" : "Upload artifact"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </section>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
