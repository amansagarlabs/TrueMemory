"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, FormEvent, SVGProps } from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Code2,
  Database,
  FileText,
  GitFork,
  Globe2,
  ImageIcon,
  Loader2,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Users,
  Webhook,
  X,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaperDither } from "@/components/ui/paper-dither";
import {
  disconnectGithub,
  fetchGithubConnection,
  startGithubOAuth,
  testConnector,
  type ConnectorTestResult,
} from "@/services/integrations";
import {
  createAgentSkill,
  fetchAgentSkills,
  loadEnabledAgentSkills,
  saveEnabledAgentSkills,
  type AgentSkill,
} from "@/services/agent-skills";

type ConnectorCategory =
  | "AI providers"
  | "Knowledge"
  | "Data"
  | "Developer tools";

type DirectoryFilter = "discover" | "all" | "connected" | "available";
type ConnectorHubView = "connectors" | "skills" | "workflows";

type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  domain?: string;
  brandIcon?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accent: string;
  needsKey: boolean;
  needsUrl?: boolean;
  keyPlaceholder?: string;
  urlPlaceholder?: string;
  featured?: boolean;
  isNew?: boolean;
};

type SavedConnector = {
  connected: boolean;
  apiKey?: string;
  url?: string;
  result?: ConnectorTestResult;
};

type ConnectorSection = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  connectors: ConnectorDefinition[];
};

const STORAGE_KEY = "kontext-integrations";
const CATEGORIES: Array<"All categories" | ConnectorCategory> = [
  "All categories",
  "AI providers",
  "Knowledge",
  "Data",
  "Developer tools",
];

const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    domain: "openai.com",
    brandIcon: "openai",
    description: "Use GPT models and embeddings in TrueMemory workflows.",
    category: "AI providers",
    icon: Bot,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    needsKey: true,
    keyPlaceholder: "sk-...",
    featured: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    domain: "anthropic.com",
    brandIcon: "anthropic",
    description: "Connect Claude models for reasoning and writing tasks.",
    category: "AI providers",
    icon: Sparkles,
    accent: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
    needsKey: true,
    keyPlaceholder: "sk-ant-...",
    featured: true,
  },
  {
    id: "google",
    name: "Google AI",
    domain: "google.com",
    brandIcon: "google",
    description: "Bring Gemini models into chat and automated workflows.",
    category: "AI providers",
    icon: Globe2,
    accent: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    needsKey: true,
    keyPlaceholder: "AIza...",
    featured: true,
  },
  {
    id: "notion",
    name: "Notion",
    domain: "notion.so",
    brandIcon: "notion",
    description: "Use workspace pages and documentation as live context.",
    category: "Knowledge",
    icon: FileText,
    accent: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300",
    needsKey: true,
    keyPlaceholder: "ntn_...",
  },
  {
    id: "slack",
    name: "Slack",
    domain: "slack.com",
    brandIcon: "slack",
    description: "Send workflow updates and connect team conversations.",
    category: "Knowledge",
    icon: MessageSquare,
    accent: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
    needsKey: false,
    needsUrl: true,
    urlPlaceholder: "https://hooks.slack.com/services/...",
    isNew: true,
  },
  {
    id: "pinecone",
    name: "Pinecone",
    domain: "pinecone.io",
    brandIcon: "pinecone",
    description: "Store and retrieve embeddings from a managed vector index.",
    category: "Data",
    icon: Database,
    accent: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400",
    needsKey: true,
    keyPlaceholder: "pc-...",
  },
  {
    id: "weaviate",
    name: "Weaviate",
    domain: "weaviate.io",
    brandIcon: "weaviate",
    description: "Connect TrueMemory to a hosted vector search endpoint.",
    category: "Data",
    icon: Database,
    accent: "bg-yellow-500/12 text-yellow-700 dark:text-yellow-400",
    needsKey: false,
    needsUrl: true,
    urlPlaceholder: "https://your-cluster.weaviate.network",
  },
  {
    id: "github",
    name: "GitHub",
    domain: "github.com",
    brandIcon: "github",
    description: "Use repositories, issues, and code as project context.",
    category: "Developer tools",
    icon: GitFork,
    accent: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
    needsKey: true,
    keyPlaceholder: "ghp_...",
    featured: true,
  },
  {
    id: "webhook",
    name: "Custom webhook",
    description: "Send TrueMemory events to any HTTPS endpoint.",
    category: "Developer tools",
    icon: Webhook,
    accent: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
    needsKey: false,
    needsUrl: true,
    urlPlaceholder: "https://example.com/webhook",
  },
];

const CATEGORY_ICONS: Record<
  ConnectorCategory,
  ComponentType<{ className?: string }>
> = {
  "AI providers": BrainCircuit,
  Knowledge: FileText,
  Data: Database,
  "Developer tools": Code2,
};

const FILTERS: Array<{ id: DirectoryFilter; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "available", label: "Available" },
];

const WORKFLOWS = [
  {
    name: "Thumbnail creator",
    description:
      "Generate multiple thumbnail directions with distinct compositions, styles, and visual hooks.",
    category: "Media",
    icon: ImageIcon,
  },
  {
    name: "Three-statement model",
    description:
      "Build a linked financial model with editable assumptions, valuation outputs, and source notes.",
    category: "Finance",
    icon: BriefcaseBusiness,
  },
  {
    name: "Precedent transactions",
    description:
      "Build a precedent M&A transaction-comps analysis with normalized deal terms and controls.",
    category: "Finance",
    icon: BriefcaseBusiness,
  },
  {
    name: "Update investment thesis",
    description:
      "Refresh an existing investment memo by tracking developments against each core thesis.",
    category: "Finance",
    icon: BriefcaseBusiness,
  },
  {
    name: "Contract review",
    description:
      "Review a contract against a playbook with clause analysis, risk ratings, and suggested edits.",
    category: "Legal",
    icon: FileText,
  },
  {
    name: "Submission package builder",
    description:
      "Assemble complete submission packages with required forms, schedules, and supporting files.",
    category: "Operations",
    icon: FileText,
  },
  {
    name: "Background removal",
    description:
      "Upload an image and produce a clean transparent PNG ready for product or editorial use.",
    category: "Media",
    icon: ImageIcon,
  },
  {
    name: "Product photos",
    description:
      "Create product image variations across lighting setups, camera angles, and backgrounds.",
    category: "Media",
    icon: ImageIcon,
  },
] as const;

function loadSavedConnectors(): Record<string, SavedConnector> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      SavedConnector
    >;
  } catch {
    return {};
  }
}

export default function ConnectorsPage() {
  const pageScrollRef = useRef<HTMLElement>(null);
  const [activeView, setActiveView] =
    useState<ConnectorHubView>("connectors");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("discover");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("All categories");
  const [saved, setSaved] = useState<Record<string, SavedConnector>>(
    loadSavedConnectors,
  );
  const [selected, setSelected] = useState<ConnectorDefinition | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchGithubConnection()
      .then((connection) => {
        if (!active) return;
        setSaved((current) => {
          const next = { ...current };
          if (connection.connected) {
            next.github = {
              connected: true,
              result: {
                connector_id: "github",
                connected: true,
                user: connection.user,
                latency_ms: 0,
              },
            };
          } else {
            delete next.github;
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const connectedCount = Object.values(saved).filter(
    (connector) => connector.connected,
  ).length;

  const filteredConnectors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return CONNECTORS.filter((connector) => {
      const connected = Boolean(saved[connector.id]?.connected);
      const matchesFilter =
        filter === "discover" ||
        filter === "all" ||
        (filter === "connected" && connected) ||
        (filter === "available" && !connected);
      const matchesCategory =
        category === "All categories" || connector.category === category;
      const matchesQuery =
        !normalizedQuery ||
        `${connector.name} ${connector.description} ${connector.category}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesFilter && matchesCategory && matchesQuery;
    });
  }, [category, filter, query, saved]);

  const sections = useMemo<ConnectorSection[]>(() => {
    if (filter === "discover" && category === "All categories" && !query.trim()) {
      const popular = filteredConnectors.filter((connector) => connector.featured);
      const grouped = CATEGORIES.filter(
        (item): item is ConnectorCategory => item !== "All categories",
      ).map((item) => ({
        id: item.toLowerCase().replace(/\s+/g, "-"),
        label: item,
        icon: CATEGORY_ICONS[item],
        connectors: filteredConnectors.filter(
          (connector) => connector.category === item,
        ),
      }));
      return [
        { id: "popular", label: "Popular", icon: Sparkles, connectors: popular },
        ...grouped,
      ].filter((section) => section.connectors.length > 0);
    }

    return CATEGORIES.filter(
      (item): item is ConnectorCategory => item !== "All categories",
    )
      .map((item) => ({
        id: item.toLowerCase().replace(/\s+/g, "-"),
        label: item,
        icon: CATEGORY_ICONS[item],
        connectors: filteredConnectors.filter(
          (connector) => connector.category === item,
        ),
      }))
      .filter((section) => section.connectors.length > 0);
  }, [category, filter, filteredConnectors, query]);

  function persist(next: Record<string, SavedConnector>) {
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function openConnector(connector: ConnectorDefinition) {
    const existing = saved[connector.id];
    setSelected(connector);
    setApiKey("");
    setUrl(existing?.url || "");
    setError("");
  }

  async function connect() {
    if (!selected) return;
    if (selected.id === "github") {
      startGithubOAuth();
      return;
    }
    setTesting(true);
    setError("");

    try {
      const result = await testConnector(
        selected.id,
        apiKey || undefined,
        url || undefined,
      );
      if (!result.connected) {
        setError(result.error || "TrueMemory could not verify this connection.");
        return;
      }

      persist({
        ...saved,
        [selected.id]: {
          connected: true,
          url,
          result,
        },
      });
      setSelected(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Connection test failed.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function disconnect(id: string) {
    if (id === "github") {
      try {
        await disconnectGithub();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "GitHub could not be disconnected.");
        return;
      }
    }
    const next = { ...saved };
    delete next[id];
    persist(next);
  }

  return (
    <AuthenticatedAppShell>
      <main
        ref={pageScrollRef}
        className="theme-surface-page connectors-page h-svh overflow-y-auto bg-[var(--chat-background)] text-[var(--chat-foreground)] [scrollbar-gutter:stable]"
      >
        <nav
          aria-label="Connector workspace sections"
          className="sticky top-0 z-[5] border-b border-white/[0.07] bg-[#070707]/92 backdrop-blur-xl"
        >
          <div className="mx-auto flex h-14 w-full max-w-[1280px] items-end gap-6 overflow-x-auto px-5 sm:px-8 lg:px-10">
            {[
              { id: "connectors", label: "Connectors" },
              { id: "skills", label: "Skills" },
              { id: "workflows", label: "Workflows" },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                aria-current={activeView === item.id ? "page" : undefined}
                onClick={() => {
                  setActiveView(item.id as ConnectorHubView);
                  pageScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
                }}
                className={`relative flex min-h-11 shrink-0 items-center px-0.5 pb-3 text-xs font-semibold transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeView === item.id
                    ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#e85d18]"
                    : "text-white/40 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {activeView === "connectors" ? (
        <>
        <section className="relative mx-auto mt-6 w-[calc(100%-2.5rem)] max-w-[1200px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0b08] p-7 sm:w-[calc(100%-4rem)] lg:w-[calc(100%-5rem)] lg:p-10">
          <PaperDither
            className="inset-y-0 right-0 w-[55%] opacity-80"
            dark={{ colorBack: "#0d0b0800", colorFront: "#e85d18" }}
            light={{ colorBack: "#fffaf6", colorFront: "#d86516" }}
            eager
            maxPixelCount={800 * 360}
            scale={0.7}
            shape="warp"
            size={2.2}
            speed={0.15}
            type="4x4"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0d0b08_0%,rgba(13,11,8,.95)_52%,transparent)]" />
          <div className="relative z-10 max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">
              TrueMemory / Connections
            </p>
            <h1 className="mt-3 font-heading text-4xl tracking-[-.055em]">
              Connect what uses your memory.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/45">
              Connect supported agents, applications, data sources, and developer tools to the memory Spaces they use. Every connector is tested before it is enabled.
            </p>
          </div>
        </section>

        <div className="mx-auto mb-6 mt-5 w-[calc(100%-2.5rem)] max-w-[1200px] rounded-[20px] border border-white/10 bg-[#10100f] p-5 sm:w-[calc(100%-4rem)] sm:p-6 lg:w-[calc(100%-5rem)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filter === item.id
                      ? "border-[var(--chat-accent)] bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]"
                      : "border-black/10 bg-white/55 text-black/50 hover:border-black/20 hover:bg-white hover:text-[#17120f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  }`}
                >
                  {item.label}
                  {item.id === "connected" && connectedCount > 0
                    ? ` ${connectedCount}`
                    : ""}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search all connectors</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search connectors"
                  className="h-10 w-full rounded-full border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs outline-none transition-[border-color,background-color,box-shadow] duration-100 placeholder:text-white/30 hover:bg-white/[0.055] focus:border-[#e85d18] focus:bg-white/[0.055] focus:ring-2 focus:ring-[#e85d18]/25"
                />
              </label>
              <CategorySelector
                label="Filter connectors by category"
                value={category}
                options={CATEGORIES}
                onValueChange={(value) =>
                  setCategory(value as (typeof CATEGORIES)[number])
                }
              />
            </div>
          </div>

          {sections.length ? (
            <div className="space-y-8 pb-1 pt-5">
              {sections.map((section) => (
                <ConnectorSectionView
                  key={section.id}
                  section={section}
                  saved={saved}
                  onConnect={openConnector}
                  onDisconnect={disconnect}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center border-b border-black/[0.07] text-center dark:border-white/[0.07]">
              <div>
                <Search
                  aria-hidden="true"
                  className="mx-auto size-5 text-black/35 dark:text-white/35"
                />
                <h2 className="mt-3 text-sm font-semibold">No connectors found</h2>
                <p className="mt-1 text-xs text-black/45 dark:text-white/45">
                  Try another search or filter.
                </p>
              </div>
            </div>
          )}
        </div>
        </>
        ) : activeView === "skills" ? (
          <SkillsView />
        ) : (
          <WorkflowsView />
        )}
      </main>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !testing) setSelected(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[20px] border border-white/10 bg-[#10100f] p-0 text-white shadow-[0_32px_100px_-40px_rgba(0,0,0,0.9)] sm:max-w-md"
        >
          {selected ? (
            <>
              <DialogHeader className="relative border-b border-black/[0.07] px-6 pb-5 pt-6 pr-20 text-left dark:border-white/[0.07]">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/10 bg-white p-1.5">
                    <ConnectorLogo connector={selected} className="size-8" />
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-base">
                      Connect {selected.name}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-xs">
                      Credentials are verified before this connector is enabled.
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close connector dialog"
                  disabled={testing}
                  onClick={() => setSelected(null)}
                  className="absolute right-4 top-4 grid size-11 place-items-center rounded-xl text-muted-foreground transition-[background-color,color,transform] duration-100 hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </DialogHeader>

              <div className="space-y-4 px-6 py-6">
                {selected.id === "github" ? (
                  <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-4 py-4 text-sm leading-6 text-white/70">
                    Connect your GitHub account to search repositories and use authorized code, issues, and pull requests as project context. TrueMemory never exposes your GitHub token to the browser.
                  </div>
                ) : selected.needsKey ? (
                  <div>
                    <label
                      htmlFor="connector-api-key"
                      className="text-xs font-semibold"
                    >
                      API key
                    </label>
                    <input
                      id="connector-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={selected.keyPlaceholder}
                      autoFocus
                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm outline-none placeholder:text-black/35 focus:border-[var(--chat-accent)] focus:ring-2 focus:ring-[var(--chat-focus)] dark:border-white/10 dark:bg-white/[0.035] dark:placeholder:text-white/30"
                    />
                  </div>
                ) : null}

                {selected.needsUrl ? (
                  <div>
                    <label
                      htmlFor="connector-url"
                      className="text-xs font-semibold"
                    >
                      Endpoint URL
                    </label>
                    <input
                      id="connector-url"
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder={selected.urlPlaceholder}
                      autoFocus={!selected.needsKey}
                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm outline-none placeholder:text-black/35 focus:border-[var(--chat-accent)] focus:ring-2 focus:ring-[var(--chat-focus)] dark:border-white/10 dark:bg-white/[0.035] dark:placeholder:text-white/30"
                    />
                  </div>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-xs leading-5 text-destructive"
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    {error}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={
                    testing ||
                    (selected.id !== "github" && selected.needsKey && !apiKey.trim()) ||
                    (selected.needsUrl && !url.trim())
                  }
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--chat-accent)] px-4 text-sm font-semibold text-[var(--chat-accent-foreground)] transition-[background-color,opacity,transform] duration-100 hover:bg-[var(--chat-accent-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {testing ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Code2 aria-hidden="true" className="size-4" />
                  )}
                  {testing ? "Testing connection..." : selected.id === "github" ? "Continue with GitHub" : "Connect app"}
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AuthenticatedAppShell>
  );
}

function SkillsView() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    instructions: "",
  });

  useEffect(() => {
    let active = true;
    void fetchAgentSkills()
      .then((items) => {
        if (!active) return;
        setSkills(items);
        setEnabledSkills(
          loadEnabledAgentSkills(items) ?? items.map((item) => item.name),
        );
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof Error ? error.message : "Skills could not be loaded",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSkills = skills.filter(
    (skill) =>
      (filter === "all" ||
        (filter === "enabled" && enabledSkills.includes(skill.name)) ||
        (filter === "disabled" && !enabledSkills.includes(skill.name))) &&
      (!normalizedQuery ||
        `${skill.name} ${skill.description}`
          .toLowerCase()
          .includes(normalizedQuery)),
  );

  function toggleSkill(name: string) {
    setEnabledSkills((current) => {
      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];
      saveEnabledAgentSkills(next);
      return next;
    });
  }

  async function submitSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createAgentSkill(draft);
      setSkills((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setEnabledSkills((current) => {
        const next = Array.from(new Set([...current, created.name]));
        saveEnabledAgentSkills(next);
        return next;
      });
      setDraft({ name: "", description: "", instructions: "" });
      setCreateOpen(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Skill could not be created",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto my-6 w-[calc(100%-2.5rem)] max-w-[1200px] rounded-[20px] border border-white/10 bg-[#10100f] p-5 sm:w-[calc(100%-4rem)] sm:p-6 lg:w-[calc(100%-5rem)]">
      <DirectoryHeader
        eyebrow="Reusable capabilities"
        title="Skills"
        description="Runtime capabilities discovered from SKILL.md and loaded only when a request needs them."
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search skills"
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            { id: "all", label: "All" },
            { id: "enabled", label: "Enabled" },
            { id: "disabled", label: "Disabled" },
          ].map((item) => (
            <FilterButton
              key={item.id}
              active={filter === item.id}
              onClick={() => setFilter(item.id as typeof filter)}
            >
              {item.label}
            </FilterButton>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 text-xs text-white/55">
            <BrainCircuit
              aria-hidden="true"
              className="size-4 text-[var(--chat-accent)]"
            />
            {enabledSkills.length} enabled
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--chat-accent)] px-3.5 text-xs font-semibold text-[var(--chat-accent-foreground)] transition-transform duration-150 hover:bg-[var(--chat-accent-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
          >
            <Plus aria-hidden="true" className="size-4" />
            Create skill
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.025] motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : loadError ? (
        <DirectoryEmpty label={loadError} />
      ) : visibleSkills.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visibleSkills.map((skill) => {
            const enabled = enabledSkills.includes(skill.name);
            return (
              <article
                key={skill.name}
                className="group flex min-h-24 items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3.5 transition-[background-color,border-color] duration-150 hover:border-white/15 hover:bg-white/[0.05]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-semibold">
                      {skill.name}
                    </h2>
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">
                      {skill.kind}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/50">
                    {skill.description}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`${enabled ? "Disable" : "Enable"} ${skill.name}`}
                  aria-pressed={enabled}
                  onClick={() => toggleSkill(skill.name)}
                  className={`grid size-10 shrink-0 place-items-center rounded-xl border transition-[background-color,border-color,color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
                    enabled
                      ? "border-[var(--chat-accent)]/45 bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]"
                      : "border-white/10 bg-white/[0.03] text-white/35 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {enabled ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <Plus aria-hidden="true" className="size-4" />
                  )}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <DirectoryEmpty label="No skills found" />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-[#121211] text-white">
          <DialogHeader>
            <DialogTitle>Create a skill</DialogTitle>
            <DialogDescription className="text-white/50">
              Add reusable instructions that TrueMemory can load when a request matches.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitSkill}>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-white/70">Name</span>
              <input
                required
                minLength={3}
                maxLength={64}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="customer-interview"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-colors placeholder:text-white/25 focus:border-[var(--chat-accent)]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-white/70">When to use it</span>
              <textarea
                required
                minLength={12}
                maxLength={400}
                rows={2}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Use when the user asks to synthesize customer interviews and identify recurring needs."
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm leading-5 outline-none transition-colors placeholder:text-white/25 focus:border-[var(--chat-accent)]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-white/70">Instructions</span>
              <textarea
                required
                minLength={20}
                maxLength={12000}
                rows={7}
                value={draft.instructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
                placeholder="Describe the workflow, output format, quality checks, and constraints."
                className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 font-mono text-xs leading-5 outline-none transition-colors placeholder:text-white/25 focus:border-[var(--chat-accent)]"
              />
            </label>
            {createError ? (
              <p role="alert" className="text-xs text-red-300">
                {createError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-10 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/65 hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--chat-accent)] px-4 text-xs font-semibold text-[var(--chat-accent-foreground)] disabled:opacity-50"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                {creating ? "Creating..." : "Create skill"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkflowsView() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"browse" | "pinned">("browse");
  const [category, setCategory] = useState("All categories");
  const normalizedQuery = query.trim().toLowerCase();
  const categories = [
    "All categories",
    ...Array.from(new Set(WORKFLOWS.map((workflow) => workflow.category))),
  ];
  const workflows =
    filter === "pinned"
      ? []
      : WORKFLOWS.filter(
          (workflow) =>
            (category === "All categories" ||
              workflow.category === category) &&
            (!normalizedQuery ||
              `${workflow.name} ${workflow.description} ${workflow.category}`
                .toLowerCase()
                .includes(normalizedQuery)),
        );
  const primary = workflows.slice(0, 6);
  const media = workflows.filter((workflow) => workflow.category === "Media");

  return (
    <div className="mx-auto my-6 w-[calc(100%-2.5rem)] max-w-[1200px] rounded-[20px] border border-white/10 bg-[#10100f] p-5 sm:w-[calc(100%-4rem)] sm:p-6 lg:w-[calc(100%-5rem)]">
      <DirectoryHeader
        eyebrow="Guided automation"
        title="Workflows"
        description="Turn complex tasks into dependable, repeatable steps."
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search workflows"
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <FilterButton
            active={filter === "browse"}
            onClick={() => setFilter("browse")}
          >
            Browse
          </FilterButton>
          <FilterButton
            active={filter === "pinned"}
            onClick={() => setFilter("pinned")}
          >
            Pinned
          </FilterButton>
        </div>
        <CategorySelector
          label="Filter workflows by category"
          value={category}
          options={categories}
          onValueChange={setCategory}
        />
      </div>

      {primary.length ? (
        <>
          <section className="mt-7" aria-labelledby="for-you-workflows">
            <h2 id="for-you-workflows" className="text-sm font-semibold">
              For you
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {primary.map((workflow) => (
                <WorkflowCard key={workflow.name} workflow={workflow} />
              ))}
            </div>
          </section>

          {category === "All categories" && media.length ? (
            <section className="mt-10" aria-labelledby="media-workflows">
              <h2 id="media-workflows" className="text-sm font-semibold">
                Media
              </h2>
              <div className="mt-4 grid gap-x-10 gap-y-3 lg:grid-cols-2">
                {media.map((workflow) => (
                  <div
                    key={`media-${workflow.name}`}
                    className="flex min-h-20 items-center gap-3 border-b border-black/[0.07] py-3 dark:border-white/[0.07]"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-black/10 bg-white/55 dark:border-white/10 dark:bg-white/[0.03]">
                      <workflow.icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold">{workflow.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/50 dark:text-white/50">
                        {workflow.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <DirectoryEmpty
          label={
            filter === "pinned"
              ? "No pinned workflows yet"
              : "No workflows found"
          }
        />
      )}
    </div>
  );
}

function DirectoryHeader({
  eyebrow,
  title,
  description,
  query,
  onQueryChange,
  searchLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  query: string;
  onQueryChange: (value: string) => void;
  searchLabel: string;
}) {
  return (
    <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-accent)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em]">
          {title}
        </h1>
        <p className="mt-1 max-w-xl text-sm leading-6 text-black/55 dark:text-white/50">
          {description}
        </p>
      </div>
      <label className="relative block">
        <span className="sr-only">{searchLabel}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-black/40 dark:text-white/40"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchLabel}
          className="h-11 w-full rounded-full border border-black/10 bg-white/65 pl-10 pr-4 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-100 placeholder:text-black/35 hover:bg-white/85 focus:border-[var(--chat-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--chat-focus)] dark:border-white/10 dark:bg-white/[0.035] dark:placeholder:text-white/30 dark:hover:bg-white/[0.055] dark:focus:bg-white/[0.055]"
        />
      </label>
    </header>
  );
}

function CategorySelector({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="flex min-h-10 min-w-44 items-center justify-between gap-4 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/55 transition-[background-color,border-color,color,transform] duration-100 hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d18]"
          />
        }
      >
        <span className="truncate">{value}</span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 rotate-90 text-white/35"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-44 rounded-xl border border-white/10 bg-[#151513] p-1.5 text-white shadow-[0_18px_50px_-24px_rgba(0,0,0,0.95)] ring-0"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            onValueChange(nextValue);
            setOpen(false);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className="min-h-10 rounded-lg px-3 pr-9 text-xs text-white/60 focus:bg-white/[0.07] focus:text-white"
            >
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
        active
          ? "border-[var(--chat-accent)] bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]"
          : "border-black/10 bg-white/55 text-black/50 hover:border-black/20 hover:bg-white hover:text-black dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function WorkflowCard({
  workflow,
}: {
  workflow: (typeof WORKFLOWS)[number];
}) {
  const Icon = workflow.icon;
  return (
    <article className="flex min-h-40 flex-col justify-between rounded-2xl border border-black/[0.08] bg-white/55 p-4 transition-[background-color,border-color] duration-100 hover:border-black/15 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-white/15 dark:hover:bg-white/[0.05]">
      <span className="grid size-10 place-items-center rounded-xl border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/[0.03]">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="mt-6">
        <h3 className="text-sm font-semibold">{workflow.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/50 dark:text-white/50">
          {workflow.description}
        </p>
      </div>
    </article>
  );
}

function DirectoryEmpty({ label }: { label: string }) {
  return (
    <div className="grid min-h-64 place-items-center text-center">
      <div>
        <Search
          aria-hidden="true"
          className="mx-auto size-5 text-black/35 dark:text-white/35"
        />
        <p className="mt-3 text-sm font-semibold">{label}</p>
      </div>
    </div>
  );
}

function ConnectorLogo({
  connector,
  className,
}: {
  connector: ConnectorDefinition;
  className: string;
}) {
  const publishableKey =
    process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY?.trim();
  const [source, setSource] = useState<
    "the-svg" | "domain-icon" | "logo-dev" | "fallback"
  >(
    connector.brandIcon
      ? "the-svg"
      : publishableKey && connector.domain
        ? "logo-dev"
        : "fallback",
  );
  const FallbackIcon = connector.icon;
  const logoUrl =
    connector.brandIcon && source === "the-svg"
      ? `https://cdn.jsdelivr.net/npm/@thesvg/icons/icons/${encodeURIComponent(
          connector.brandIcon,
        )}.svg`
      : connector.domain && source === "domain-icon"
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
            connector.domain,
          )}&sz=128`
      : connector.domain && source === "logo-dev"
      ? `https://img.logo.dev/${connector.domain}?size=80&format=png&retina=true&fallback=monogram&token=${encodeURIComponent(
          publishableKey || "",
        )}`
      : "";

  if (!logoUrl || source === "fallback") {
    return (
      <span
        className={`grid place-items-center rounded-lg ${connector.accent} ${className}`}
      >
        <FallbackIcon aria-hidden="true" className="size-1/2" />
      </span>
    );
  }

  return (
    // theSVG assets are decorative here; the adjacent connector name provides
    // the accessible label. Logo.dev remains an optional secondary fallback.
    <img
      src={logoUrl}
      alt=""
      width={80}
      height={80}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() =>
        setSource((current) =>
          current === "the-svg" && connector.domain
            ? "domain-icon"
            : current === "domain-icon" &&
                publishableKey &&
                connector.domain
              ? "logo-dev"
              : "fallback",
        )
      }
      className={`${className} rounded-lg object-contain`}
    />
  );
}

function ConnectorSectionView({
  section,
  saved,
  onConnect,
  onDisconnect,
}: {
  section: ConnectorSection;
  saved: Record<string, SavedConnector>;
  onConnect: (connector: ConnectorDefinition) => void;
  onDisconnect: (id: string) => void;
}) {
  const SectionIcon = section.icon;

  return (
    <section aria-labelledby={`connector-section-${section.id}`}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2
          id={`connector-section-${section.id}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-black/50 dark:text-white/50"
        >
          <SectionIcon aria-hidden="true" className="size-3.5" />
          {section.label}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-black/40 dark:text-white/40">
          {section.connectors.length}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {section.connectors.map((connector) => {
          const connected = Boolean(saved[connector.id]?.connected);
          return (
            <article
              key={`${section.id}-${connector.id}`}
              className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-black/[0.08] bg-white/55 px-3 py-2.5 transition-[background-color,border-color] duration-100 hover:border-black/15 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-white/15 dark:hover:bg-white/[0.05]"
            >
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white p-1.5">
                <ConnectorLogo connector={connector} className="size-7" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-xs font-semibold">
                    {connector.name}
                  </h3>
                  {connector.featured ? (
                    <span className="text-[9px] font-medium text-[var(--chat-accent)]">
                      Popular
                    </span>
                  ) : connector.isNew ? (
                    <span className="text-[9px] font-medium text-[var(--chat-accent)]">
                      New
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-[1.35] text-black/45 dark:text-white/45">
                  {connector.id === "github" && saved.github?.result?.user
                    ? `Connected as @${saved.github.result.user}. Repository context is ready.`
                    : connector.description}
                </p>
              </div>

              <button
                type="button"
                aria-label={
                  connected
                    ? `Disconnect ${connector.name}`
                    : `Connect ${connector.name}`
                }
                title={connected ? "Connected. Click to disconnect." : "Connect"}
                onClick={() =>
                  connected ? onDisconnect(connector.id) : onConnect(connector)
                }
                className={`grid size-11 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] duration-100 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  connected
                    ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "text-black/35 hover:bg-black/[0.05] hover:text-[#17120f] dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                {connected ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
