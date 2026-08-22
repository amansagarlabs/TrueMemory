"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Braces,
  Database,
  File,
  FileArchive,
  FileText,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  fetchRecentArtifacts,
  type ArtifactItem,
} from "@/services/dashboard";

type LibraryFilter = "all" | "documents" | "data" | "code";

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: "all", label: "All files" },
  { id: "documents", label: "Documents" },
  { id: "data", label: "Data" },
  { id: "code", label: "Code" },
];

export default function LibraryPage() {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");

  useEffect(() => {
    let active = true;

    void fetchRecentArtifacts(200)
      .then((items) => {
        if (active) setArtifacts(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredArtifacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return artifacts.filter((artifact) => {
      const kind = getArtifactKind(artifact);
      const matchesFilter = filter === "all" || kind === filter;
      const matchesQuery =
        !normalizedQuery ||
        artifact.title.toLowerCase().includes(normalizedQuery) ||
        artifact.filename.toLowerCase().includes(normalizedQuery) ||
        artifact.mime_type.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [artifacts, filter, query]);

  return (
    <AuthenticatedAppShell variant="chat">
      <main className="min-h-screen bg-[#f7f2eb] text-[#17120f] dark:bg-[#070707] dark:text-white">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/chat"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 text-sm text-black/55 shadow-sm transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-black active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:shadow-none dark:hover:bg-white/[0.07] dark:hover:text-white"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Chat
            </Link>
            <Link
              href="/artifacts"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-orange-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:text-black"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add content
            </Link>
          </header>

          <section className="mt-8 max-w-3xl">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-orange-600 dark:text-orange-400">
              Knowledge library
            </p>
            <h1 className="mt-3 text-balance font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
              Everything you have given Kontext.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-black/55 dark:text-white/45">
              Browse documents, datasets, code, and indexed material that can be
              reused across conversations and projects.
            </p>
          </section>

          <section className="mt-8 overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/75 shadow-[0_1px_2px_rgba(20,14,10,0.04),0_20px_50px_-38px_rgba(20,14,10,0.35)] backdrop-blur dark:border-white/[0.08] dark:bg-[#10100f] dark:shadow-none">
            <div className="flex flex-col gap-3 border-b border-black/[0.08] p-4 dark:border-white/[0.08] lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block flex-1 lg:max-w-md">
                <span className="sr-only">Search library</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-black/35 dark:text-white/35"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search files, types, and titles"
                  className="min-h-11 w-full rounded-xl border border-black/10 bg-[#fbf8f3] pl-10 pr-4 text-sm outline-none placeholder:text-black/35 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/15 dark:border-white/10 dark:bg-black/30 dark:placeholder:text-white/25"
                />
              </label>

              <div
                className="flex items-center gap-1 overflow-x-auto rounded-xl border border-black/[0.08] bg-black/[0.025] p-1 dark:border-white/[0.08] dark:bg-black/25"
                aria-label="Library filters"
              >
                <SlidersHorizontal
                  aria-hidden="true"
                  className="mx-2 size-4 shrink-0 text-black/35 dark:text-white/35"
                />
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    aria-pressed={filter === item.id}
                    className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                      filter === item.id
                        ? "bg-white text-black shadow-sm dark:bg-white/[0.09] dark:text-white"
                        : "text-black/45 hover:text-black dark:text-white/45 dark:hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-14 items-center justify-between border-b border-black/[0.07] px-5 py-3 dark:border-white/[0.07]">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen aria-hidden="true" className="size-4 text-orange-500" />
                Library
              </div>
              {!loading && (
                <span className="rounded-lg border border-black/[0.08] bg-black/[0.025] px-2 py-1 font-mono text-[10px] tabular-nums text-black/45 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/40">
                  {filteredArtifacts.length}
                </span>
              )}
            </div>

            {loading ? (
              <LibrarySkeleton />
            ) : filteredArtifacts.length === 0 ? (
              <div className="grid min-h-72 place-items-center px-6 py-14 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-black/[0.08] bg-black/[0.025] text-black/30 dark:border-white/[0.08] dark:bg-black/25 dark:text-white/25">
                    <FileArchive aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-base font-semibold">
                    {artifacts.length === 0
                      ? "Your library is ready"
                      : "No matching content"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/45 dark:text-white/35">
                    {artifacts.length === 0
                      ? "Upload your first document to make it available across Kontext."
                      : "Try another search term or file category."}
                  </p>
                  {artifacts.length === 0 && (
                    <Link
                      href="/artifacts"
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-orange-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:text-black"
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      Upload content
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.07] dark:divide-white/[0.07]">
                {filteredArtifacts.map((artifact) => (
                  <LibraryItem key={artifact.id} artifact={artifact} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}

function LibraryItem({ artifact }: { artifact: ArtifactItem }) {
  const kind = getArtifactKind(artifact);
  const Icon =
    kind === "code"
      ? Braces
      : kind === "data"
        ? Database
        : kind === "documents"
          ? FileText
          : File;

  return (
    <article className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-black/[0.025] dark:hover:bg-white/[0.025]">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-orange-500/15 bg-orange-500/[0.08] text-orange-600 dark:text-orange-400">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">
          {artifact.title || artifact.filename}
        </h2>
        <p className="mt-1 truncate text-xs text-black/45 dark:text-white/35">
          {artifact.filename}
        </p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-black/45 dark:text-white/35">
          {formatType(artifact)}
        </p>
        <p className="mt-1 text-xs tabular-nums text-black/35 dark:text-white/25">
          {formatBytes(artifact.size_bytes)}
          {artifact.page_count ? ` · ${artifact.page_count} pages` : ""}
        </p>
      </div>
      <div className="hidden w-24 shrink-0 text-right md:block">
        <p className="text-xs text-black/40 dark:text-white/30">
          {formatDate(artifact.updated_at || artifact.created_at)}
        </p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-400">
          {artifact.status || "ready"}
        </p>
      </div>
    </article>
  );
}

function LibrarySkeleton() {
  return (
    <div className="divide-y divide-black/[0.07] dark:divide-white/[0.07]">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4">
          <div className="size-11 animate-pulse rounded-xl bg-black/[0.06] dark:bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.06]" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-black/[0.04] dark:bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getArtifactKind(artifact: ArtifactItem): LibraryFilter | "other" {
  const value = `${artifact.mime_type} ${artifact.filename}`.toLowerCase();

  if (
    value.includes("json") ||
    value.includes("csv") ||
    value.includes("spreadsheet") ||
    value.includes(".xlsx") ||
    value.includes(".xls")
  ) {
    return "data";
  }

  if (
    value.includes("javascript") ||
    value.includes("typescript") ||
    value.includes("python") ||
    value.includes(".js") ||
    value.includes(".ts") ||
    value.includes(".tsx") ||
    value.includes(".py")
  ) {
    return "code";
  }

  if (
    value.includes("pdf") ||
    value.includes("document") ||
    value.includes("text") ||
    value.includes(".doc") ||
    value.includes(".md")
  ) {
    return "documents";
  }

  return "other";
}

function formatType(artifact: ArtifactItem) {
  const extension = artifact.filename.split(".").pop();
  return extension && extension.length <= 6
    ? extension
    : artifact.source_type || "file";
}

function formatBytes(bytes: number) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
