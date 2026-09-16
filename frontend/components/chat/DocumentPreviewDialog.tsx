"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  X,
} from "lucide-react";
import type { UploadResponse } from "@/lib/types";
import {
  fetchArtifactContent,
  fetchArtifactPreview,
  type ArtifactPreviewPage,
} from "@/services/api";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: UploadResponse | null;
  file?: File | null;
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "html", "htm", "py", "js", "jsx",
  "ts", "tsx", "css", "scss", "sql", "yaml", "yml", "xml", "toml", "ini", "log",
  "java", "go", "rs", "c", "h", "cpp", "hpp", "sh", "ps1",
]);

const CODE_EXTENSIONS = new Set([
  "py", "js", "jsx", "ts", "tsx", "css", "scss", "sql", "yaml", "yml", "xml",
  "toml", "ini", "log", "java", "go", "rs", "c", "h", "cpp", "hpp", "sh", "ps1",
]);

const DATA_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);
const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico",
]);

export function DocumentPreviewDialog({ open, onOpenChange, document, file }: Props) {
  const filename = document?.filename ?? file?.name ?? "Document";
  const extension = fileExtension(filename);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<ArtifactPreviewPage[]>([]);
  const [pageCount, setPageCount] = useState(document?.page_count ?? 1);
  const [sizeBytes, setSizeBytes] = useState(document?.size_bytes ?? file?.size ?? 0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPdf = extension === "pdf";
  const isImage =
    (file?.type.startsWith("image/") ?? false) || IMAGE_EXTENSIONS.has(extension);
  const isText = TEXT_EXTENSIONS.has(extension);

  useEffect(() => {
    if (!open || (!document && !file)) return;

    let cancelled = false;
    let nextObjectUrl: string | null = null;

    async function loadPreview() {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setPages([]);
      setTruncated(false);
      setPageCount(document?.page_count ?? 1);
      setSizeBytes(document?.size_bytes ?? file?.size ?? 0);
      try {
        const content = file ?? (document ? await fetchArtifactContent(document.doc_id) : null);
        if (content) {
          nextObjectUrl = URL.createObjectURL(content);
          if (!cancelled) setObjectUrl(nextObjectUrl);
        }

        if (isPdf || isImage) return;

        if (file && isText) {
          const text = (await file.text()).slice(0, 250_000);
          if (!cancelled) {
            setPages([{ page: 1, title: extension === "csv" ? "Data preview" : null, text }]);
            setTruncated(file.size > text.length);
          }
          return;
        }

        if (document) {
          const preview = await fetchArtifactPreview(document.doc_id);
          if (!cancelled) {
            setPages(preview.pages);
            setPageCount(preview.page_count);
            setSizeBytes(preview.size_bytes);
            setTruncated(preview.truncated);
          }
          return;
        }

        throw new Error("The preview will be available when this file finishes uploading.");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "This document could not be previewed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
      setObjectUrl(null);
    };
  }, [document, extension, file, isImage, isPdf, isText, open]);

  const documentLabel = useMemo(() => documentTypeLabel(extension), [extension]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(90vh,860px)] w-[calc(100vw-1.5rem)] max-w-[1120px] flex-col gap-0 overflow-hidden rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] shadow-[0_32px_100px_-44px_rgba(0,0,0,0.72)] sm:max-w-[1120px]"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--chat-border)] px-4 py-4 pr-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]">
              <DocumentIcon extension={extension} />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold tracking-[-0.02em] sm:text-lg">
                {filename}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--chat-muted-foreground)]">
                <span>{documentLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(sizeBytes)}</span>
                {pageCount > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{pageCount} {pageUnit(extension, pageCount)}</span>
                  </>
                ) : null}
              </DialogDescription>
            </div>
            {objectUrl ? (
              <a
                href={objectUrl}
                download={filename}
                aria-label={`Download ${filename}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </a>
            ) : null}
            <DialogClose
              aria-label="Close document preview"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
            >
              <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
            </DialogClose>
          </div>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-auto bg-[var(--chat-background)] p-3 sm:p-5"
          aria-busy={loading}
        >
          {loading ? (
            <div role="status" className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center text-[var(--chat-muted-foreground)]">
              <Loader2 className="size-6 animate-spin text-[var(--chat-accent)]" aria-hidden="true" />
              <p className="text-sm font-medium">Opening document preview…</p>
            </div>
          ) : error ? (
            <PreviewUnavailable message={error} objectUrl={objectUrl} filename={filename} />
          ) : isPdf && objectUrl ? (
            <iframe
              src={objectUrl}
              title={`Preview of ${filename}`}
              className="h-full min-h-[68vh] w-full rounded-xl border border-[var(--chat-border)] bg-white"
            />
          ) : isImage && objectUrl ? (
            <div className="relative h-full min-h-[60vh] overflow-hidden rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)]">
              <Image src={objectUrl} alt={`Preview of ${filename}`} fill unoptimized className="object-contain" />
            </div>
          ) : pages.length ? (
            <div className={`mx-auto space-y-5 pb-4 ${DATA_EXTENSIONS.has(extension) ? "max-w-[1040px]" : "max-w-[820px]"}`}>
              {pages.map((page, pageIndex) => (
                <article
                  key={`${page.page}-${page.title ?? "page"}`}
                  className="min-h-80 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-5 py-7 shadow-[0_20px_50px_-38px_rgba(64,43,24,0.46)] sm:px-10 sm:py-10 lg:px-14 lg:py-12"
                >
                  <div className={DATA_EXTENSIONS.has(extension) ? "" : "mx-auto max-w-[68ch]"}>
                    <div className="mb-7 flex items-center justify-between gap-4 border-b border-[var(--chat-border)] pb-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
                        {page.title || (pageCount > 1 ? `${documentLabel} ${page.page}` : "Text document")}
                      </p>
                      <span className="font-mono text-[10px] tabular-nums text-[var(--chat-subtle-foreground)]">
                        {pageIndex + 1} / {pages.length}
                      </span>
                    </div>
                    <DocumentPageContent
                      text={page.text || "No readable text was found on this page."}
                      extension={extension}
                    />
                  </div>
                </article>
              ))}
              {truncated ? (
                <p className="px-2 text-center text-xs leading-5 text-[var(--chat-muted-foreground)]">
                  This preview is shortened for performance. Download the file to view everything.
                </p>
              ) : null}
            </div>
          ) : (
            <PreviewUnavailable message="No readable preview was found in this document." objectUrl={objectUrl} filename={filename} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentPageContent({ text, extension }: { text: string; extension: string }) {
  if (CODE_EXTENSIONS.has(extension)) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] p-4 font-mono text-[13px] leading-6 text-[var(--chat-foreground)] sm:p-5">
        <code>{text}</code>
      </pre>
    );
  }

  if (DATA_EXTENSIONS.has(extension)) {
    return <DataDocument text={text} extension={extension} />;
  }

  return <ReadableDocumentText text={text} />;
}

function ReadableDocumentText({ text }: { text: string }) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <div className="space-y-5 text-[15px] leading-7 text-[var(--chat-foreground)] sm:text-[16px] sm:leading-8">
      {blocks.map((block, index) => renderDocumentBlock(block, index))}
    </div>
  );
}

function renderDocumentBlock(block: string, index: number): ReactNode {
  const trimmed = block.trim();
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
  if (heading) {
    const level = heading[1].length;
    const className = level === 1
      ? "text-2xl font-semibold leading-8 tracking-[-0.035em] sm:text-3xl sm:leading-10"
      : level === 2
        ? "text-xl font-semibold leading-8 tracking-[-0.025em]"
        : "text-lg font-semibold leading-7 tracking-[-0.015em]";
    return <h2 key={`heading-${index}`} className={className}>{renderDocumentInline(heading[2])}</h2>;
  }

  if (lines.every((line) => /^[-*+•]\s+/.test(line))) {
    return (
      <ul key={`list-${index}`} className="space-y-2 pl-6 marker:text-[var(--chat-accent)]">
        {lines.map((line, itemIndex) => (
          <li key={itemIndex} className="pl-1 text-pretty">{renderDocumentInline(line.replace(/^[-*+•]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
    return (
      <ol key={`ordered-${index}`} className="list-decimal space-y-2 pl-6 marker:text-[var(--chat-accent)]">
        {lines.map((line, itemIndex) => (
          <li key={itemIndex} className="pl-1 text-pretty">{renderDocumentInline(line.replace(/^\d+[.)]\s+/, ""))}</li>
        ))}
      </ol>
    );
  }

  if (lines.every((line) => line.startsWith(">"))) {
    return (
      <blockquote key={`quote-${index}`} className="border-l-2 border-[var(--chat-accent)] pl-5 text-pretty italic text-[var(--chat-muted-foreground)]">
        {renderDocumentInline(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}
      </blockquote>
    );
  }

  if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
    return <hr key={`rule-${index}`} className="border-[var(--chat-border)]" />;
  }

  return (
    <p key={`paragraph-${index}`} className="text-pretty [hyphens:auto]">
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex ? " " : null}
          {renderDocumentInline(line)}
        </Fragment>
      ))}
    </p>
  );
}

function renderDocumentInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(<strong key={match.index} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={match.index} className="rounded bg-[var(--chat-surface-muted)] px-1.5 py-0.5 font-mono text-[0.88em]">{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function DataDocument({ text, extension }: { text: string; extension: string }) {
  const rows = text.replace(/\r\n?/g, "\n").split("\n").filter((row) => row.trim());
  const parsedRows = rows.slice(0, 250).map((row) =>
    extension === "csv" && row.includes(",")
      ? row.split(",").map((cell) => cell.trim())
      : row.split("|").map((cell) => cell.trim()),
  );
  const columnCount = Math.max(0, ...parsedRows.map((row) => row.length));

  if (columnCount <= 1) {
    return <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-[var(--chat-foreground)]">{text}</pre>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--chat-border)]">
      <table className="min-w-full border-collapse text-left text-xs leading-5 sm:text-sm">
        <tbody>
          {parsedRows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? "bg-[var(--chat-surface-muted)] font-semibold" : "odd:bg-[var(--chat-background)]"}>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td key={columnIndex} className="min-w-32 border-b border-r border-[var(--chat-border)] px-3 py-2.5 align-top last:border-r-0">
                  {row[columnIndex] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > parsedRows.length ? (
        <p className="px-3 py-2 text-xs text-[var(--chat-muted-foreground)]">Showing the first {parsedRows.length} rows.</p>
      ) : null}
    </div>
  );
}

function PreviewUnavailable({ message, objectUrl, filename }: { message: string; objectUrl: string | null; filename: string }) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--chat-surface-muted)] text-[var(--chat-muted-foreground)]">
        <AlertCircle className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-[var(--chat-foreground)]">Preview unavailable</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--chat-muted-foreground)]">{message}</p>
      {objectUrl ? (
        <a href={objectUrl} download={filename} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--chat-accent)] px-4 text-sm font-semibold text-[var(--chat-accent-foreground)] transition-[background-color,transform] duration-150 hover:bg-[var(--chat-accent-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]">
          <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Download document
        </a>
      ) : null}
    </div>
  );
}

function DocumentIcon({ extension }: { extension: string }) {
  if (extension === "pptx" || extension === "ppt") return <Presentation className="size-5" strokeWidth={1.8} aria-hidden="true" />;
  if (["xlsx", "xls", "csv"].includes(extension)) return <FileSpreadsheet className="size-5" strokeWidth={1.8} aria-hidden="true" />;
  return <FileText className="size-5" strokeWidth={1.8} aria-hidden="true" />;
}

function fileExtension(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "file" : "file";
}

function documentTypeLabel(extension: string): string {
  if (extension === "pdf") return "PDF document";
  if (extension === "docx" || extension === "doc") return "Word document";
  if (extension === "pptx" || extension === "ppt") return "PowerPoint presentation";
  if (extension === "xlsx" || extension === "xls") return "Excel workbook";
  if (extension === "csv") return "CSV data";
  return `${extension.toUpperCase()} document`;
}

function pageUnit(extension: string, count: number): string {
  const unit = extension === "pptx" ? "slide" : extension === "xlsx" ? "sheet" : "page";
  return `${unit}${count === 1 ? "" : "s"}`;
}

function formatBytes(size: number): string {
  if (!size) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
