"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileSpreadsheet, FileText, FolderOpen, Presentation, Upload } from "lucide-react";

import { DocumentPreviewDialog } from "@/components/chat/DocumentPreviewDialog";
import { PdfUpload } from "@/components/PdfUpload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaperDither } from "@/components/ui/paper-dither";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadResponse } from "@/lib/types";
import { checkBackendHealth, visualizePipeline } from "@/services/api";
import { fetchRecentArtifacts, type ArtifactItem } from "@/services/dashboard";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";

export default function ArtifactsPage() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<UploadResponse | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  useEffect(() => {
    checkBackendHealth().then((status) => {
      setBackendOk(status.status === "ok");
    }).catch(() => setBackendOk(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadArtifacts() {
      await Promise.resolve();
      if (cancelled) return;
      setArtifactsLoading(true);
      setArtifactsError(null);
      try {
        const items = await fetchRecentArtifacts(100);
        if (!cancelled) setArtifacts(items);
      } catch (error) {
        if (!cancelled) {
          setArtifacts([]);
          setArtifactsError(error instanceof Error ? error.message : "Could not load your artifacts.");
        }
      } finally {
        if (!cancelled) setArtifactsLoading(false);
      }
    }

    void loadArtifacts();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUploaded = useCallback((nextDocument: UploadResponse) => {
    setArtifacts((current) => mergeCurrentDocument(current, nextDocument));
    setUploadDialogOpen(false);
    void visualizePipeline(nextDocument.doc_id, () => undefined).catch(() => {
      // The artifact remains available even when optional retrieval indexing is offline.
    });
  }, []);

  return (
    <AuthenticatedAppShell>
    <div className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
      <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"><ArrowLeft className="size-4" />Dashboard</Link>

        <section className="relative mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0b08] p-7 lg:p-10">
          <PaperDither className="inset-y-0 right-0 w-[55%] opacity-80" dark={{ colorBack: "#0d0b0800", colorFront: "#e85d18" }} light={{ colorBack: "#fffaf6", colorFront: "#d86516" }} eager maxPixelCount={800 * 360} scale={0.7} shape="warp" size={2.2} speed={0.15} type="4x4" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0d0b08_0%,rgba(13,11,8,.95)_52%,transparent)]" />
          <div className="relative z-10 max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">Context layer / Artifacts</p>
            <h1 className="mt-3 font-heading text-4xl tracking-[-.055em]">Upload, index, and retrieve.</h1>
            <p className="mt-4 text-sm leading-7 text-white/45">Add documents, presentations, spreadsheets, text, or data files. Every upload is kept in your artifact library and can be reopened for retrieval.</p>
          </div>
        </section>

        <ArtifactLibrary
          artifacts={artifacts}
          loading={artifactsLoading}
          error={artifactsError}
          onOpen={(artifact) => setPreviewDocument(artifactToUploadResponse(artifact))}
          onUpload={() => setUploadDialogOpen(true)}
        />

      </div>

      <DocumentPreviewDialog
        open={Boolean(previewDocument)}
        onOpenChange={(open) => {
          if (!open) setPreviewDocument(null);
        }}
        document={previewDocument}
      />

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[680px] gap-0 overflow-y-auto rounded-[24px] border border-white/10 bg-[#10100f] p-0 text-white shadow-[0_32px_100px_-40px_rgba(0,0,0,0.9)] sm:max-w-[680px]">
          <DialogHeader className="border-b border-white/10 px-5 py-5 pr-14 sm:px-6">
            <DialogTitle className="text-lg font-semibold tracking-[-0.025em]">
              Upload artifact
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-white/40">
              Documents, text, data, web, and code · maximum 20 MB
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 sm:p-6">
            {backendOk === null ? (
              <div className="space-y-3" aria-label="Checking upload service">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-11 w-32 rounded-lg" />
              </div>
            ) : (
              <PdfUpload key={uploadDialogOpen ? "open" : "closed"} onUploaded={onUploaded} disabled={backendOk === false} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AuthenticatedAppShell>
  );
}

function ArtifactLibrary({
  artifacts,
  loading,
  error,
  onOpen,
  onUpload,
}: {
  artifacts: ArtifactItem[];
  loading: boolean;
  error: string | null;
  onOpen: (artifact: ArtifactItem) => void;
  onUpload: () => void;
}) {
  return (
    <section className="mt-5 rounded-[20px] border border-white/10 bg-[#10100f] p-5 sm:p-6" aria-labelledby="artifact-library-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ee7132]">Saved context</p>
          <h2 id="artifact-library-title" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Your artifacts</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">Files uploaded from chat and this workspace appear here.</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading ? <span className="font-mono text-[11px] tabular-nums text-white/35">{artifacts.length} saved</span> : null}
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e85d18] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-16px_rgba(232,93,24,0.85)] transition-[background-color,transform] duration-150 hover:bg-[#f06f2d] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10100f]"
          >
            <Upload aria-hidden="true" className="size-4" />
            Upload artifact
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading artifacts">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}
        </div>
      ) : artifacts.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => onOpen(artifact)}
              className="group min-h-32 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[#e85d18]/45 hover:bg-white/[0.045] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d18]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#e85d18]/10 text-[#ee7132]">
                  <ArtifactIcon filename={artifact.filename} />
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">
                  {fileExtension(artifact.filename)}
                </span>
              </div>
              <p className="mt-4 truncate text-sm font-semibold text-white/85" title={artifact.title || artifact.filename}>{artifact.title || artifact.filename}</p>
              {artifact.title && artifact.title !== artifact.filename ? (
                <p className="mt-1 truncate text-[11px] text-white/35" title={artifact.filename}>{artifact.filename}</p>
              ) : null}
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/35">
                <span>{formatBytes(artifact.size_bytes)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatArtifactDate(artifact.updated_at)}</span>
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-6 text-center">
          <div>
            <FolderOpen className="mx-auto size-5 text-white/20" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-white/65">No saved artifacts yet</p>
            <p className="mt-1 text-xs text-white/35">Upload a file here or attach one in chat.</p>
          </div>
        </div>
      )}

      {error ? <p role="alert" className="mt-3 text-xs leading-5 text-orange-300/80">{error}</p> : null}
    </section>
  );
}

function mergeCurrentDocument(items: ArtifactItem[], document: UploadResponse | null): ArtifactItem[] {
  if (!document || items.some((item) => item.id === document.doc_id)) return items;
  const title = document.title || document.filename.replace(/\.[^.]+$/, "").replaceAll("_", " ");
  return [
    {
      id: document.doc_id,
      title,
      filename: document.filename,
      mime_type: mimeTypeForFilename(document.filename),
      size_bytes: document.size_bytes,
      page_count: document.page_count,
      source_type: "upload",
      status: "uploaded",
      created_at: document.uploaded_at,
      updated_at: document.uploaded_at,
    },
    ...items,
  ];
}

function artifactToUploadResponse(artifact: ArtifactItem): UploadResponse {
  return {
    doc_id: artifact.id,
    title: artifact.title,
    filename: artifact.filename,
    size_bytes: artifact.size_bytes,
    size_human: formatBytes(artifact.size_bytes),
    page_count: artifact.page_count ?? 1,
    uploaded_at: artifact.created_at,
    stored_path: "",
    pipeline_step: artifact.status,
  };
}

function ArtifactIcon({ filename }: { filename: string }) {
  const extension = fileExtension(filename).toLowerCase();
  if (["xlsx", "xls", "csv"].includes(extension)) return <FileSpreadsheet className="size-4" aria-hidden="true" />;
  if (["pptx", "ppt"].includes(extension)) return <Presentation className="size-4" aria-hidden="true" />;
  return <FileText className="size-4" aria-hidden="true" />;
}

function fileExtension(filename: string): string {
  return (filename.split(".").pop() || "file").toUpperCase().slice(0, 5);
}

function mimeTypeForFilename(filename: string): string {
  const extension = fileExtension(filename).toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "csv") return "text/csv";
  return "text/plain";
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatArtifactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently uploaded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
