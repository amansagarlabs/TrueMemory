"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Brain,
  FileArchive,
  FileText,
  History,
  MessageSquareText,
  RefreshCw,
  Search,
} from "lucide-react";

import { isAuthenticated } from "@/lib/auth";
import { PaperDither } from "@/components/ui/paper-dither";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  fetchRecentConversations,
  fetchRecentArtifacts,
  fetchRecentMemories,
  type ArtifactItem,
  type ConversationItem,
  type MemoryItem,
} from "@/services/dashboard";

type ActivityView = "all" | "conversations" | "memory" | "artifacts";

type ActivityEntry =
  | { id: string; kind: "conversation"; date: string; item: ConversationItem }
  | { id: string; kind: "memory"; date: string; item: MemoryItem }
  | { id: string; kind: "artifact"; date: string; item: ArtifactItem };

const VIEW_OPTIONS: Array<{
  id: ActivityView;
  label: string;
  icon: typeof History;
}> = [
  { id: "all", label: "All activity", icon: History },
  { id: "conversations", label: "Conversations", icon: MessageSquareText },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "artifacts", label: "Artifacts", icon: FileArchive },
];

export default function ActivityPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [view, setView] = useState<ActivityView>("all");
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!isAuthenticated()) {
        router.replace("/login?redirect=/activity");
        return;
      }

      const requestedView = new URLSearchParams(window.location.search).get("view");
      if (
        requestedView === "conversations" ||
        requestedView === "memory" ||
        requestedView === "artifacts"
      ) {
        setView(requestedView);
      }
      setAuthorized(true);
      void loadActivity();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  async function loadActivity(background = false) {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [conversationItems, memoryItems, artifactItems] = await Promise.all([
        fetchRecentConversations(500),
        fetchRecentMemories(500),
        fetchRecentArtifacts(500),
      ]);
      setConversations(conversationItems);
      setMemories(memoryItems);
      setArtifacts(artifactItems);
    } catch {
      setError("Activity history is temporarily unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const entries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activity: ActivityEntry[] = [
      ...conversations.map(
        (item): ActivityEntry => ({
          id: `conversation:${item.id}`,
          kind: "conversation",
          date: item.updated_at,
          item,
        }),
      ),
      ...memories.map(
        (item): ActivityEntry => ({
          id: `memory:${item.key}`,
          kind: "memory",
          date: item.updated_at,
          item,
        }),
      ),
      ...artifacts.map(
        (item): ActivityEntry => ({
          id: `artifact:${item.id}`,
          kind: "artifact",
          date: item.updated_at || item.created_at,
          item,
        }),
      ),
    ];

    return activity
      .filter((entry) => {
        if (view === "conversations" && entry.kind !== "conversation") return false;
        if (view === "memory" && entry.kind !== "memory") return false;
        if (view === "artifacts" && entry.kind !== "artifact") return false;
        if (!normalizedQuery) return true;

        if (entry.kind === "conversation") {
          return [entry.item.title, entry.item.last_message]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedQuery));
        }

        if (entry.kind === "memory") {
          return [entry.item.key, entry.item.content, entry.item.source].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          );
        }

        return [
          entry.item.title,
          entry.item.filename,
          entry.item.mime_type,
          entry.item.status,
          entry.item.source_type,
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [artifacts, conversations, memories, query, view]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, ActivityEntry[]>();
    entries.forEach((entry) => {
      const label = dateGroupLabel(entry.date);
      groups.set(label, [...(groups.get(label) ?? []), entry]);
    });
    return Array.from(groups.entries());
  }, [entries]);

  if (!authorized) return null;

  return (
    <AuthenticatedAppShell>
    <main className="min-h-full bg-[#f6f1ea] text-[#15110f] dark:bg-[#070707] dark:text-white">
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dfd3c5] bg-[#fffaf6] px-4 text-sm font-medium text-[#77675d] transition-[background-color,color,transform] duration-150 hover:bg-[#f3e9df] hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus-visible:ring-[#f6e879]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Dashboard
          </Link>
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <span
              aria-hidden="true"
              className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)]"
            />
            TrueMemory
          </Link>
        </header>

        <section className="relative mt-7 overflow-hidden rounded-[24px] border border-[#ded0c1] bg-[#f3eadf] p-6 shadow-[0_18px_50px_-38px_rgba(73,43,20,0.35)] sm:p-8 lg:p-10 dark:border-white/10 dark:bg-[#0c0a08] dark:shadow-none">
          <PaperDither
            className="inset-y-0 right-0 w-[58%] opacity-55 [mask-image:linear-gradient(to_right,transparent_0%,black_26%,black_100%)] dark:opacity-70"
            dark={{ colorBack: "#0c0a0800", colorFront: "#e85d18" }}
            light={{ colorBack: "#f3eadf00", colorFront: "#d85b12" }}
            eager
            maxPixelCount={900 * 420}
            scale={0.74}
            shape="wave"
            size={2.2}
            speed={0.1}
            type="4x4"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#f3eadf_0%,rgba(243,234,223,0.95)_50%,rgba(243,234,223,0.3)_100%)] dark:bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.94)_50%,rgba(12,10,8,0.2)_100%)]" />
          <div className="relative z-10 max-w-2xl">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.17em] text-[#b64d0c] dark:text-[#f6e879]">
              TrueMemory / Activity
            </p>
            <h1 className="mt-3 text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] sm:text-5xl">
              Everything happening across your memory layer.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#77695f] dark:text-white/45">
              Review stored memories, conversations, and artifacts from the latest activity back through its history.
            </p>
          </div>
        </section>

        <section aria-label="Activity totals" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="All remembered work"
            value={conversations.length + memories.length + artifacts.length}
            icon={History}
          />
          <SummaryCard label="Conversations" value={conversations.length} icon={MessageSquareText} />
          <SummaryCard label="Memory entries" value={memories.length} icon={Brain} />
          <SummaryCard label="Artifacts" value={artifacts.length} icon={FileArchive} />
        </section>

        <section className="mt-5 overflow-hidden rounded-[20px] border border-[#dfd3c5] bg-[#fffaf6] shadow-[0_16px_40px_-34px_rgba(73,43,20,0.35)] dark:border-white/10 dark:bg-[#10100f] dark:shadow-none">
          <div className="flex flex-col gap-4 border-b border-[#e7dbcf] p-4 sm:p-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[#e2d5c8] bg-[#f3e9df] p-1 dark:border-white/10 dark:bg-black/25">
              {VIEW_OPTIONS.map((option) => {
                const ViewIcon = option.icon;
                const active = view === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setView(option.id)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:focus-visible:ring-[#f6e879] ${
                      active
                        ? "bg-[#201510] text-white dark:bg-[#e67d2b]/16 dark:text-[#f3a05f] dark:shadow-[inset_0_0_0_1px_rgba(230,125,43,0.28)]"
                        : "text-[#75665b] hover:bg-white/75 hover:text-[#201510] dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
                    }`}
                  >
                    <ViewIcon aria-hidden="true" className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <label className="relative min-w-0 flex-1 lg:w-72" htmlFor="activity-search">
                <span className="sr-only">Search activity history</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9a897c] dark:text-white/30"
                />
                <input
                  id="activity-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search activity, files, or memory"
                  className="min-h-11 w-full rounded-xl border border-[#dfd3c5] bg-white pl-10 pr-4 text-sm text-[#201510] outline-none placeholder:text-[#9a897c] focus:border-[#e67d2b]/70 focus:ring-2 focus:ring-[#e67d2b]/10 dark:border-white/10 dark:bg-[#090909] dark:text-white/80 dark:placeholder:text-white/28"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadActivity(true)}
                disabled={refreshing}
                aria-label="Refresh activity history"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#dfd3c5] bg-white text-[#75665b] transition-[background-color,color,transform] duration-150 hover:bg-[#f3e9df] hover:text-[#201510] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] disabled:cursor-wait disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus-visible:ring-[#f6e879]"
              >
                <RefreshCw aria-hidden="true" className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <ActivitySkeleton />
          ) : groupedEntries.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-[#e2d5c8] bg-[#f3e9df] text-[#8a786b] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                <History aria-hidden="true" className="size-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold">No matching activity</h2>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#8d7d72] dark:text-white/35">
                {query ? "Try a different search or activity filter." : "Activity will appear here as you use TrueMemory."}
              </p>
            </div>
          ) : (
            <div className="px-4 pb-5 sm:px-5">
              {groupedEntries.map(([label, group]) => (
                <section key={label} aria-labelledby={`activity-${slugify(label)}`} className="pt-5">
                  <div className="mb-2 flex items-center gap-3">
                    <h2
                      id={`activity-${slugify(label)}`}
                      className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-[#9a897c] dark:text-white/30"
                    >
                      {label}
                    </h2>
                    <div className="h-px flex-1 bg-[#e7dbcf] dark:bg-white/[0.07]" />
                    <span className="font-mono text-[10px] text-[#ae9d90] dark:text-white/25">{group.length}</span>
                  </div>
                  <div className="overflow-hidden rounded-[16px] border border-[#e4d8cc] bg-white/70 dark:border-white/[0.08] dark:bg-black/20">
                    {group.map((entry) =>
                      entry.kind === "conversation" ? (
                        <ConversationEntry key={entry.id} item={entry.item} />
                      ) : entry.kind === "artifact" ? (
                        <ArtifactEntry key={entry.id} item={entry.item} />
                      ) : (
                        <MemoryEntry key={entry.id} item={entry.item} />
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
    </AuthenticatedAppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof History;
}) {
  return (
    <article className="flex min-h-24 items-center gap-4 rounded-[18px] border border-[#dfd3c5] bg-[#fffaf6] p-4 shadow-[0_14px_36px_-32px_rgba(73,43,20,0.4)] dark:border-white/[0.08] dark:bg-[#10100f] dark:shadow-none">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e67d2b]/20 bg-[#e67d2b]/10 text-[#d86516] dark:text-[#f08a35]">
        <Icon aria-hidden="true" className="size-[18px]" />
      </div>
      <div>
        <div className="font-heading text-3xl font-semibold leading-none tracking-[-0.05em] tabular-nums">{value}</div>
        <div className="mt-1.5 text-xs font-medium text-[#8b7b70] dark:text-white/38">{label}</div>
      </div>
    </article>
  );
}

function ConversationEntry({ item }: { item: ConversationItem }) {
  return (
    <Link
      href={`/chat?id=${item.id}`}
      className="group flex min-h-20 items-center gap-4 border-b border-[#e7dbcf] px-4 py-4 transition-colors duration-150 last:border-0 hover:bg-[#f3e9df]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b64d0c] dark:border-white/[0.07] dark:hover:bg-white/[0.045] dark:focus-visible:ring-[#f6e879] sm:px-5"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e67d2b]/20 bg-[#fff1e8] text-[#d86516] dark:bg-[#e67d2b]/10 dark:text-[#f08a35]">
        <FileText aria-hidden="true" className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-[15px] font-semibold text-[#34251e] group-hover:text-[#201510] dark:text-white/82 dark:group-hover:text-white">
            {item.title || "Untitled conversation"}
          </h3>
          <span className="rounded-md bg-[#f3e9df] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#89786c] dark:bg-white/[0.05] dark:text-white/35">
            Conversation
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#8e7e73] dark:text-white/35">
          {item.last_message || `${item.message_count} messages in this conversation`}
        </p>
        <p className="mt-1 font-mono text-[10px] text-[#aa998c] dark:text-white/25">
          {formatDateTime(item.updated_at)} · {item.message_count} messages
        </p>
      </div>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-[#a39285] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#d86516] dark:text-white/25 dark:group-hover:text-[#f08a35]"
      />
    </Link>
  );
}

function MemoryEntry({ item }: { item: MemoryItem }) {
  return (
    <article className="flex min-h-20 gap-4 border-b border-[#e7dbcf] px-4 py-4 last:border-0 dark:border-white/[0.07] sm:px-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#c9671d]/20 bg-[#c9671d]/10 text-[#bd5917] dark:text-[#e8833b]">
        <Brain aria-hidden="true" className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold capitalize text-[#3b2b23] dark:text-white/78">
            {item.key.replace(/_/g, " ")}
          </h3>
          <span className="rounded-md bg-[#f3e9df] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#89786c] dark:bg-white/[0.05] dark:text-white/35">
            Memory
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-5 text-[#77685e] dark:text-white/45">{item.content}</p>
        <p className="mt-1.5 font-mono text-[10px] text-[#aa998c] dark:text-white/25">
          {formatDateTime(item.updated_at)} · {item.source || "TrueMemory"}
        </p>
      </div>
    </article>
  );
}

function ArtifactEntry({ item }: { item: ArtifactItem }) {
  return (
    <Link
      href="/artifacts"
      className="group flex min-h-20 items-center gap-4 border-b border-[#e7dbcf] px-4 py-4 transition-colors duration-150 last:border-0 hover:bg-[#f3e9df]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b64d0c] dark:border-white/[0.07] dark:hover:bg-white/[0.045] dark:focus-visible:ring-[#f6e879] sm:px-5"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#d96c1f]/20 bg-[#fff1e8] text-[#cc6017] dark:bg-[#e67d2b]/10 dark:text-[#f08a35]">
        <FileArchive aria-hidden="true" className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-[15px] font-semibold text-[#34251e] group-hover:text-[#201510] dark:text-white/82 dark:group-hover:text-white">
            {item.title || item.filename || "Untitled artifact"}
          </h3>
          <span className="rounded-md bg-[#f3e9df] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#89786c] dark:bg-white/[0.05] dark:text-white/35">
            Artifact
          </span>
          <span className="rounded-md border border-[#e1d4c8] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#9a7760] dark:border-white/10 dark:text-[#e58a4a]">
            {item.status || "uploaded"}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#8e7e73] dark:text-white/35">
          {item.filename}
        </p>
        <p className="mt-1 font-mono text-[10px] text-[#aa998c] dark:text-white/25">
          {formatDateTime(item.updated_at || item.created_at)} · {formatBytes(item.size_bytes)}
          {item.page_count ? ` · ${item.page_count} ${item.page_count === 1 ? "page" : "pages"}` : ""}
        </p>
      </div>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-[#a39285] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#d86516] dark:text-white/25 dark:group-hover:text-[#f08a35]"
      />
    </Link>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-[16px] border border-[#e4d8cc] p-4 dark:border-white/[0.08]">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function dateGroupLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Size unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
