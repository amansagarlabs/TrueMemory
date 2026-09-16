"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadAuthUser, isAuthenticated } from "@/lib/auth";
import { PaperDither, type DitherShape } from "@/components/ui/paper-dither";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  fetchDashboardStats,
  fetchRecentConversations,
  fetchRecentMemories,
  type DashboardStats,
  type ConversationItem,
  type MemoryItem,
} from "@/services/dashboard";
import {
  FileText,
  Globe2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Brain,
  Layers3,
  ArrowUpRight,
} from "lucide-react";
import type { AuthUser } from "@/lib/types";

type Platform = "lab" | "crawl" | "both";

const PLATFORM_OPTIONS = [
  { id: "lab", label: "Memory", shortLabel: "Memory", icon: Brain },
  { id: "crawl", label: "Web retrieval", shortLabel: "Web", icon: Globe2 },
  { id: "both", label: "Everything", shortLabel: "All", icon: Layers3 },
] as const satisfies ReadonlyArray<{
  id: Platform;
  label: string;
  shortLabel: string;
  icon: typeof Brain;
}>;

const PLAN_FEATURES = {
  free: { label: "Free", artifacts: 5, crawlJobs: 20, memories: 100, pagesCrawled: 500, workspaces: 1, agents: 0, conversations: 20 },
  pro: { label: "Pro", artifacts: 100, crawlJobs: 500, memories: 5000, pagesCrawled: 20000, workspaces: 10, agents: 5, conversations: 200 },
  team: { label: "Team", artifacts: -1, crawlJobs: -1, memories: -1, pagesCrawled: -1, workspaces: -1, agents: -1, conversations: -1 },
  enterprise: { label: "Enterprise", artifacts: -1, crawlJobs: -1, memories: -1, pagesCrawled: -1, workspaces: -1, agents: -1, conversations: -1 },
} as const;

const POLL_INTERVAL = 30000; // 30 seconds

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [platform, setPlatform] = useState<Platform>("both");

  // Real data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  // Keep the first client render identical to the server render, then hydrate auth state.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!isAuthenticated()) {
        router.replace("/login?redirect=/dashboard");
        return;
      }

      const authenticatedUser = loadAuthUser();
      if (!authenticatedUser) {
        router.replace("/login?redirect=/dashboard");
        return;
      }

      setUser(authenticatedUser);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  const loadData = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoadingData(true);
    setFetchErrors([]);
    try {
      const [s, c, m] = await Promise.all([
        fetchDashboardStats(platform).catch((e) => {
          setFetchErrors((prev) => [...prev, `stats: ${e.message}`]);
          return null;
        }),
        platform === "crawl"
          ? Promise.resolve([])
          : fetchRecentConversations(8).catch((e) => {
              setFetchErrors((prev) => [...prev, `conversations: ${e.message}`]);
              return [];
            }),
        platform === "crawl"
          ? Promise.resolve([])
          : fetchRecentMemories(5).catch((e) => {
              setFetchErrors((prev) => [...prev, `memories: ${e.message}`]);
              return [];
            }),
      ]);
      if (s) setStats(s);
      setConversations(c);
      setMemories(m);
      setLastRefresh(new Date());
    } finally {
      setLoadingData(false);
    }
  }, [user, platform]);

  useEffect(() => {
    if (!user) return;
    const id = setTimeout(() => {
      void loadData(true);
    }, 0);
    return () => clearTimeout(id);
  }, [user, loadData]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      void loadData(false);
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [user, loadData]);

  const plan = (user?.plan as keyof typeof PLAN_FEATURES) || "free";
  const features = PLAN_FEATURES[plan];
  const displayName = user?.full_name || user?.username || user?.email?.split("@")[0] || "User";

  if (!user) return null;

  // Filter stats based on platform
  const showConversations = platform !== "crawl";
  const showCrawl = platform !== "lab";

  return (
    <AuthenticatedAppShell>
        {/* ── SIDEBAR ── */}

        {/* ── MAIN ── */}
          <main className="min-h-full min-w-0 bg-[#f6f1ea] text-[#15110f] transition-colors duration-150 dark:bg-[#070707] dark:text-white">
            <div className="mx-auto max-w-[1440px] p-4 sm:p-7 lg:p-8">

            {/* Topbar */}
            <div className="relative mb-6 overflow-hidden rounded-[22px] border border-[#ded0c1] bg-[#f3eadf] p-5 shadow-[0_18px_50px_-38px_rgba(73,43,20,0.35)] sm:p-7 dark:border-white/10 dark:bg-[#0d0b08] dark:shadow-none">
          <PaperDither
            className="inset-y-0 right-0 w-[62%] opacity-60 [mask-image:linear-gradient(to_right,transparent_0%,black_24%,black_100%)]"
            dark={{ colorBack: "#0d0b0800", colorFront: "#e85d18" }}
            light={{ colorBack: "#f3eadf00", colorFront: "#d85b12" }}
            eager
            maxPixelCount={900 * 420}
            scale={0.72}
            shape="wave"
            size={2.2}
            speed={0.08}
            type="4x4"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#f3eadf_0%,rgba(243,234,223,0.95)_45%,rgba(243,234,223,0.48)_100%)] dark:bg-[linear-gradient(90deg,#0d0b08_0%,rgba(13,11,8,0.94)_45%,rgba(13,11,8,0.46)_100%)]" />
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-3">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#b64d0c] dark:text-[#f6e879]"><Sparkles className="size-4" /> TrueMemory home</div>
            </div>
            <h1 className="max-w-4xl text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] text-[#201510] sm:text-5xl dark:text-white">Good to see you, {displayName}.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#75685e] dark:text-white/55">One memory layer for your agents, applications, and sessions.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/connectors" className="inline-flex min-h-10 items-center rounded-lg bg-[#201510] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#34251e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:bg-[#f6e879] dark:text-[#1a170f] dark:hover:bg-[#fff09a]">Connect your first agent</Link>
              <Link href="/memory" className="inline-flex min-h-10 items-center rounded-lg border border-[#d9cabb] bg-[#fffaf6]/70 px-3.5 text-xs font-semibold text-[#6f6258] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]">Store your first memory</Link>
              <Link href="/chat" className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold text-[#6f6258] transition-colors hover:text-[#201510] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:text-white/55 dark:hover:text-white">Try Assistant</Link>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[15px] leading-6 text-[#75685e] dark:text-white/48">
              <span>{new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <span aria-hidden="true" className="text-[#b4a394] dark:text-white/20">|</span>
              <span>All systems operational</span>
              {lastRefresh && (
                <>
                  <span aria-hidden="true" className="text-[#b4a394] dark:text-white/20">|</span>
                  <span className="text-xs text-[#938477] dark:text-white/30">
                    Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:items-end">
            <span className="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d6c5f] dark:text-white/45">
              Workspace view
            </span>
            <div className="flex w-full items-center gap-2 xl:w-auto">
              <div
                className="flex min-w-0 flex-1 items-center rounded-[18px] border border-[#e2d5c8] bg-[#f3e9df] p-1 shadow-[0_12px_32px_-20px_rgba(78,47,23,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-black/25 dark:shadow-[0_12px_32px_-18px_rgba(0,0,0,0.9)] xl:flex-none"
                role="group"
                aria-label="Workspace view"
              >
                {PLATFORM_OPTIONS.map((option) => {
                  const active = platform === option.id;
                  const PlatformIcon = option.icon;

                  return (
                    <Fragment key={option.id}>
                      {option.id !== PLATFORM_OPTIONS[0].id && (
                        <span
                          aria-hidden="true"
                          className="shrink-0 px-0.5 text-xs text-[#c5b5a6] dark:text-white/18"
                        >
                          |
                        </span>
                      )}
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPlatform(option.id)}
                        className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:focus-visible:ring-[#f6e879] ${
                          active
                            ? "bg-[#201510] text-white shadow-[0_5px_16px_-8px_rgba(104,55,19,0.55)] dark:bg-[#e67d2b]/16 dark:text-[#f3a05f] dark:shadow-[inset_0_0_0_1px_rgba(230,125,43,0.28)]"
                            : "text-[#736358] hover:bg-white/75 hover:text-[#201510] dark:text-white/62 dark:hover:bg-white/[0.065] dark:hover:text-white"
                        }`}
                      >
                        <PlatformIcon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate sm:hidden">{option.shortLabel}</span>
                        <span className="hidden truncate sm:inline">{option.label}</span>
                      </button>
                    </Fragment>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void loadData(false)}
                disabled={loadingData}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-[#d9cabb] bg-[#fffaf6] px-4 text-xs font-semibold text-[#736358] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl transition-[background-color,color,transform] duration-150 hover:bg-[#f3e9df] hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] disabled:cursor-wait disabled:opacity-50 dark:border-white/[0.12] dark:bg-[#090806] dark:text-white/68 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] dark:hover:bg-[#17130f] dark:hover:text-white dark:focus-visible:ring-[#f6e879]"
                title="Refresh dashboard data"
              >
                <RefreshCw className={`size-4 ${loadingData ? "animate-spin" : ""}`} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
          </div>
        </div>

        {/* ── NEXT BEST ACTION ── */}
        <section className="relative mb-6 overflow-hidden rounded-[20px] border border-[#d9cabb] bg-[#17130f] p-4 text-white shadow-[0_18px_50px_-36px_rgba(0,0,0,.7)] sm:p-5 dark:border-white/10 dark:bg-[#0d111b]" aria-label="Get more from TrueMemory">
          <div className="pointer-events-none absolute -right-12 -top-24 size-64 rounded-full bg-[#1769e0]/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3.5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6e879] text-[#17130f]"><Sparkles className="size-5" /></span><div><p className="text-sm font-semibold">Build your memory system</p><p className="mt-1 max-w-xl text-xs leading-5 text-white/52">Start with one Space, one source, and one interface. You can expand the system as your context grows.</p></div></div>
            <div className="flex shrink-0 flex-wrap gap-2"><Link href="/connectors" className="inline-flex min-h-9 items-center rounded-lg bg-white/[.08] px-3 text-xs font-semibold transition hover:bg-white/[.14]">Connect a source <ArrowUpRight className="ml-1 size-3" /></Link><Link href="/api-sdk" className="inline-flex min-h-9 items-center rounded-lg border border-white/12 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[.08] hover:text-white">Open API &amp; SDK</Link></div>
          </div>
        </section>

        {/* ── QUICK ACTIONS ── */}
        <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Quick actions">
          <QuickAction href="/memory" eyebrow="Remember" title="Write a memory" description="Capture a decision, preference, or fact." icon={<Brain className="size-4" />} />
          <QuickAction href="/connectors" eyebrow="Connect" title="Add a source" description="Bring trusted context into a Space." icon={<Layers3 className="size-4" />} />
          <QuickAction href="/api-sdk" eyebrow="Build" title="Create an API token" description="Give an app or agent scoped access." icon={<FileText className="size-4" />} />
        </section>

        {/* ── FETCH ERRORS ── */}
        {fetchErrors.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/5 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-medium">Some data couldn&apos;t load:</span>
              <ul className="mt-1 space-y-0.5">
                {fetchErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
            <div className={`mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${showConversations && showCrawl ? "xl:grid-cols-5" : showConversations || showCrawl ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
          {showConversations && (
            <>
              <StatCard color="#e67d2b" label="Conversations" value={stats?.conversations ?? 0} max={features.conversations} loading={loadingData} shape="wave" />
              <StatCard color="#c9671d" label="Memory entries" value={stats?.memory_entries ?? 0} max={features.memories} loading={loadingData} shape="warp" />
              <StatCard color="#f08a35" label="Artifacts" value={stats?.artifacts ?? 0} max={features.artifacts} loading={loadingData} shape="sphere" />
            </>
          )}
          {showCrawl && (
            <>
              <StatCard color="#e67d2b" label="Scrapes today" value={stats?.crawl_scrape?.used ?? 0} max={stats?.crawl_scrape?.limit ?? 0} loading={loadingData} shape="ripple" />
              {!showConversations && (
                <>
                  <StatCard color="#c9671d" label="Searches today" value={stats?.crawl_search?.used ?? 0} max={stats?.crawl_search?.limit ?? 0} loading={loadingData} shape="simplex" />
                  <StatCard color="#f08a35" label="Maps today" value={stats?.crawl_map?.used ?? 0} max={stats?.crawl_map?.limit ?? 0} loading={loadingData} shape="dots" />
                </>
              )}
              <StatCard color="#e67d2b" label="Crawls this month" value={stats?.crawl_crawl?.used ?? 0} max={stats?.crawl_crawl?.limit ?? 0} loading={loadingData} shape="swirl" />
            </>
          )}
        </div>

        {/* ── QUICK TOOL ── */}
        {/* ── TWO COL: Conversations + Memories ── */}
        {showConversations && (
          <div id="context-activity" className="mb-6 grid scroll-mt-6 grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Recent Conversations */}
            <Panel
              title="Recent Conversations"
              count={stats?.conversations ?? conversations.length}
              color="#e67d2b"
              href="/activity?view=conversations"
              icon={<MessageIcon className="size-5" />}
            >
              {loadingData ? (
                <LoadingSkeleton rows={4} />
              ) : conversations.length === 0 ? (
                <EmptyState
                  icon={<MessageIcon className="size-5" />}
                  message="No conversations yet"
                  sub="Start a chat to see your history here"
                />
              ) : (
                conversations.map((c) => (
                <Link key={c.id} href={`/chat?id=${c.id}`} className="group flex min-h-16 items-center gap-3.5 border-b border-[#e5d8c9] px-5 py-3.5 transition-colors duration-150 last:border-0 hover:bg-[#f1e8dc] dark:border-white/10 dark:hover:bg-white/[0.045]">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e67d2b]/20 bg-[#fff1e8] dark:bg-[#e67d2b]/10">
                      <MessageIcon className="size-[18px] text-[#e67d2b]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[15px] font-semibold leading-5 text-[#34251e] transition-colors duration-150 group-hover:text-[#201510] dark:text-white/85 dark:group-hover:text-white">{c.title || "Untitled"}</div>
                      <div className="mt-1 text-xs font-medium text-[#938377] dark:text-white/32">{timeAgo(c.updated_at)}</div>
                    </div>
                  </Link>
                ))
              )}
            </Panel>

            {/* Recent Memories */}
            <Panel
              title="Recent Memory"
              count={stats?.memory_entries ?? memories.length}
              color="#c9671d"
              href="/activity?view=memory"
              icon={<Brain className="size-5" />}
            >
              {loadingData ? (
                <LoadingSkeleton rows={4} />
              ) : memories.length === 0 ? (
                <EmptyState
                  icon={<Brain className="size-5" />}
                  message="No memories yet"
                  sub="Your profile facts will appear here"
                />
              ) : (
                memories.map((m, i) => (
                  <div key={i} className="flex min-h-16 gap-3.5 border-b border-[#e5d8c9] px-5 py-3.5 last:border-0 dark:border-white/10">
                    <div className="mt-1 w-0.5 shrink-0 rounded-full bg-[#e67d2b]/45" style={{ minHeight: 36 }} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold capitalize text-[#666] dark:text-white/78">{m.key.replace(/_/g, " ")}</div>
                      <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#999] dark:text-white/42">{m.content}</div>
                      <div className="mt-1.5 text-xs font-medium text-[#bbb] dark:text-white/28">{timeAgo(m.updated_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </Panel>
          </div>
        )}
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({
  color,
  label,
  value,
  max,
  loading,
  shape,
}: {
  color: string;
  label: string;
  value: number;
  max: number;
  loading: boolean;
  shape: DitherShape;
}) {
  const display = max === -1 ? "∞" : `${value}/${max}`;
  return (
    <article
      aria-label={`${label}: ${value}${max === -1 ? ", unlimited usage" : ` of ${max} used`}`}
      className="relative isolate min-h-[164px] overflow-hidden rounded-[18px] border border-[#dfd3c5] bg-[#fffaf6] p-5 shadow-[0_16px_40px_-34px_rgba(73,43,20,0.35),inset_0_1px_0_rgba(255,255,255,0.82)] sm:p-6 dark:border-white/[0.08] dark:bg-[#10100f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_40px_-32px_rgba(0,0,0,0.9)]"
    >
      <div
        className="absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, ${color}, transparent 78%)` }}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 w-[46%] overflow-hidden" aria-hidden="true">
        <PaperDither
          className="inset-0 opacity-[0.18] [mask-image:linear-gradient(to_left,black_15%,rgba(0,0,0,0.82)_55%,transparent_100%)] dark:opacity-[0.24]"
          dark={{ colorBack: "#10100f00", colorFront: color }}
          light={{ colorBack: "#fffaf600", colorFront: color }}
          maxPixelCount={220 * 180}
          scale={0.72}
          shape={shape}
          size={2.5}
          speed={0}
          type="4x4"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_50%,rgba(230,125,43,0.06),transparent_58%)] dark:bg-[radial-gradient(circle_at_78%_50%,rgba(255,255,255,0.045),transparent_58%)]" />
      </div>

      <div className="relative z-10 flex min-h-[116px] max-w-[70%] flex-col justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[#75665b] dark:text-white/65">
          <span
            className="size-2 shrink-0 rounded-full shadow-[0_0_16px_currentColor]"
            style={{ backgroundColor: color, color }}
          />
          <span>{label}</span>
        </div>

        <div>
          {loading ? (
            <Skeleton className="h-12 w-20 rounded-lg" />
          ) : (
            <div
              data-numeric
              className="font-heading text-5xl font-semibold leading-none tracking-[-0.06em] text-[#201510] tabular-nums sm:text-[3.5rem] dark:text-white"
            >
              {value}
            </div>
          )}
          <div className="mt-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#9a897c] dark:text-white/32">
            {loading ? "Loading usage" : max === -1 ? "Unlimited usage" : `${display} used`}
          </div>
        </div>
      </div>
    </article>
  );
}

function Panel({
  title,
  count,
  color,
  href,
  icon,
  children,
}: {
  title: string;
  count: number;
  color: string;
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#dfd3c5] bg-[#fffaf6] shadow-[0_16px_40px_-34px_rgba(73,43,20,0.35),inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/[0.08] dark:bg-[#10100f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="relative flex min-h-[88px] items-center gap-3 border-b border-[#e7dbcf] px-5 py-4 dark:border-white/[0.08]">
        <div className="absolute inset-x-0 top-0 h-px opacity-65" style={{ background: `linear-gradient(90deg, ${color}, transparent 62%)` }} />
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border"
          style={{ backgroundColor: `${color}12`, borderColor: `${color}30`, color }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#9b897c] dark:text-white/30">
            Latest activity
          </div>
          <h2 className="mt-1 truncate text-base font-semibold tracking-[-0.02em] text-[#2d201a] dark:text-white/85">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#8a7769] transition-[background-color,color,transform] duration-150 hover:bg-[#f3e9df] hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b64d0c] dark:text-white/42 dark:hover:bg-white/[0.06] dark:hover:text-white/82 dark:focus-visible:ring-[#f6e879]"
        >
          <span className="hidden sm:inline">View all</span>
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
        <div
          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          style={{ backgroundColor: `${color}0d`, borderColor: `${color}28` }}
          aria-label={`${count} ${title.toLowerCase()}`}
        >
          <span className="font-mono text-sm font-semibold leading-none text-[#4b382e] tabular-nums dark:text-white/78">
            {count}
          </span>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">{children}</div>
    </section>
  );
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickAction({ href, eyebrow, title, description, icon }: { href: string; eyebrow: string; title: string; description: string; icon: React.ReactNode }) {
  return <Link href={href} className="group flex min-h-[116px] items-start gap-3 rounded-2xl border border-[#dfd3c5] bg-[#fffaf6] p-4 shadow-[0_12px_30px_-28px_rgba(73,43,20,.5)] transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[#cbb9a7] hover:bg-white dark:border-white/[.08] dark:bg-[#10100f] dark:hover:border-white/[.16] dark:hover:bg-white/[.045]"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e67d2b]/20 bg-[#fff1e8] text-[#c9671d] dark:bg-[#e67d2b]/10 dark:text-[#f6e879]">{icon}</span><span className="min-w-0"><span className="block font-mono text-[10px] uppercase tracking-[.16em] text-[#9b897c] dark:text-white/32">{eyebrow}</span><span className="mt-2 flex items-center gap-1 text-sm font-semibold text-[#34251e] dark:text-white/82">{title}<ArrowUpRight className="size-3 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" /></span><span className="mt-1 block text-xs leading-5 text-[#918074] dark:text-white/38">{description}</span></span></Link>;
}

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div className="flex min-h-[184px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-[#e2d5c8] bg-[#f3e9df] text-[#8a786b] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-white/42 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold tracking-[-0.02em] text-[#3b2b23] dark:text-white/75">{message}</div>
      <div className="mt-1.5 max-w-xs text-[13px] leading-5 text-[#918074] dark:text-white/32">{sub}</div>
    </div>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return <FileText className={className} />;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}
