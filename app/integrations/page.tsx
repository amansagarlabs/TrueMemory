"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Plug,
  Sparkles,
  Database,
  Globe,
  Bot,
  FileText,
  Brain,
  Zap,
  Webhook,
  Key,
  RefreshCw,
  X,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";

import { isAuthenticated, loadAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  fetchPlatformStatus,
  testConnector,
  type PlatformStatus,
  type ConnectorTestResult,
} from "@/services/integrations";

type PlatformDef = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
};

type ConnectorDef = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  needsKey: boolean;
  needsUrl: boolean;
  keyPlaceholder: string;
  urlPlaceholder?: string;
};

const PLATFORMS: PlatformDef[] = [
  {
    id: "truememory-memory",
    name: "TrueMemory",
    description: "AI-powered memory and knowledge management system",
    icon: <Brain aria-hidden="true" className="size-5" />,
    color: "#f6e879",
    features: ["Long-term memory storage", "Context retrieval", "Knowledge graphs", "Semantic search"],
  },
  {
    id: "AmanCrawl",
    name: "Web retrieval",
    description: "Web crawling and data extraction platform",
    icon: <Globe aria-hidden="true" className="size-5" />,
    color: "#67d9bd",
    features: ["Web scraping", "Site mapping", "Content extraction", "PDF processing"],
  },
  {
    id: "aman-agent-lab",
    name: "AmanAgentLab",
    description: "Agent development and orchestration environment",
    icon: <Bot aria-hidden="true" className="size-5" />,
    color: "#8c82ff",
    features: ["Agent building", "Workflow automation", "Tool integration", "MCP support"],
  },
  {
    id: "aman-crawl",
    name: "TrueMemory Web",
    description: "Search, extract, map, crawl, and ground answers in web sources",
    icon: <Webhook aria-hidden="true" className="size-5" />,
    color: "#f06418",
    features: ["Web search", "Structured extraction", "Site mapping", "Source-grounded answers"],
  },
];

const CONNECTORS: ConnectorDef[] = [
  { id: "openai", name: "OpenAI", description: "GPT models and embeddings", icon: <Zap aria-hidden="true" className="size-5" />, category: "AI Providers", needsKey: true, needsUrl: false, keyPlaceholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", description: "Claude models", icon: <Sparkles aria-hidden="true" className="size-5" />, category: "AI Providers", needsKey: true, needsUrl: false, keyPlaceholder: "sk-ant-..." },
  { id: "google", name: "Google AI", description: "Gemini and PaLM models", icon: <Globe aria-hidden="true" className="size-5" />, category: "AI Providers", needsKey: true, needsUrl: false, keyPlaceholder: "AIza..." },
  { id: "pinecone", name: "Pinecone", description: "Vector database for embeddings", icon: <Database aria-hidden="true" className="size-5" />, category: "Vector Databases", needsKey: true, needsUrl: false, keyPlaceholder: "pc-..." },
  { id: "weaviate", name: "Weaviate", description: "Vector search engine", icon: <Database aria-hidden="true" className="size-5" />, category: "Vector Databases", needsKey: false, needsUrl: true, keyPlaceholder: "optional api key", urlPlaceholder: "https://..." },
  { id: "milvus", name: "Milvus / Zilliz", description: "Scalable vector database", icon: <Database aria-hidden="true" className="size-5" />, category: "Vector Databases", needsKey: false, needsUrl: false, keyPlaceholder: "" },
  { id: "slack", name: "Slack", description: "Team messaging integration", icon: <MessageIcon />, category: "Productivity", needsKey: false, needsUrl: true, keyPlaceholder: "", urlPlaceholder: "https://hooks.slack.com/services/..." },
  { id: "notion", name: "Notion", description: "Workspace and documentation", icon: <FileText aria-hidden="true" className="size-5" />, category: "Productivity", needsKey: true, needsUrl: false, keyPlaceholder: "ntn_..." },
  { id: "github", name: "GitHub", description: "Code repository integration", icon: <FileText aria-hidden="true" className="size-5" />, category: "Development", needsKey: true, needsUrl: false, keyPlaceholder: "ghp_..." },
  { id: "webhook", name: "Custom Webhook", description: "Generic HTTP webhook endpoint", icon: <Webhook aria-hidden="true" className="size-5" />, category: "Development", needsKey: false, needsUrl: true, keyPlaceholder: "", urlPlaceholder: "https://your-webhook.com/endpoint" },
];

const STORAGE_KEY = "kontext-integrations";

function loadSaved(): Record<string, { connected: boolean; apiKey?: string; url?: string; result?: ConnectorTestResult }> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSaved(data: Record<string, { connected: boolean; apiKey?: string; url?: string; result?: ConnectorTestResult }>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function MessageIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [user] = useState<AuthUser | null>(() => (isAuthenticated() ? loadAuthUser() : null));
  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({});
  const [connectorResults, setConnectorResults] = useState<Record<string, ConnectorTestResult>>({});
  const [saved, setSaved] = useState<Record<string, { connected: boolean; apiKey?: string; url?: string; result?: ConnectorTestResult }>>(loadSaved);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [modalConnector, setModalConnector] = useState<ConnectorDef | null>(null);
  const [modalApiKey, setModalApiKey] = useState("");
  const [modalUrl, setModalUrl] = useState("");
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    if (!user) router.replace("/login?redirect=/integrations");
  }, [router, user]);

  const checkPlatforms = useCallback(async () => {
    setLoadingPlatforms(true);
    try {
      const platforms = await fetchPlatformStatus();
      const map: Record<string, PlatformStatus> = {};
      for (const p of platforms) map[p.id] = p;
      setPlatformStatus(map);
    } catch {
      // Platform check failed - backend might be down
    }
    setLoadingPlatforms(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void checkPlatforms(), 0);
    return () => window.clearTimeout(timer);
  }, [user, checkPlatforms]);

  if (!user) return null;

  async function handleTestConnector() {
    if (!modalConnector) return;
    setTesting(modalConnector.id);
    setModalError("");

    try {
      const result = await testConnector(modalConnector.id, modalApiKey || undefined, modalUrl || undefined);
      const newSaved = { ...saved, [modalConnector.id]: { connected: result.connected, apiKey: modalApiKey, url: modalUrl, result } };
      setSaved(newSaved);
      saveSaved(newSaved);
      setConnectorResults((prev) => ({ ...prev, [modalConnector.id]: result }));
      if (result.connected) {
        setModalConnector(null);
        setModalApiKey("");
        setModalUrl("");
      } else {
        setModalError(result.error || "Connection failed");
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Test failed");
    }
    setTesting(null);
  }

  function handleDisconnect(id: string) {
    const newSaved = { ...saved };
    delete newSaved[id];
    setSaved(newSaved);
    saveSaved(newSaved);
    setConnectorResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const connectorCategories = [...new Set(CONNECTORS.map((c) => c.category))];

  return (
    <AuthenticatedAppShell>
    <main className="dark min-h-full bg-[#070707] text-white">
      <div className="mx-auto w-full max-w-[1360px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
        <header className="flex items-center justify-between gap-4">
          <Link href="/profile" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Profile
          </Link>
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <span aria-hidden="true" className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)]" />
            TrueMemory
          </Link>
        </header>

        <div className="mt-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Integrations</p>
          <h1 className="mt-3 font-heading text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Connect your tools</h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">Manage TrueMemory connections and supported platform integrations.</p>
        </div>

        {/* Platform Integrations */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Plug aria-hidden="true" className="size-5 text-[#f6e879]" />
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Platform Integrations</h2>
            </div>
            <button type="button" onClick={checkPlatforms} disabled={loadingPlatforms} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/40 transition hover:text-white/60 disabled:opacity-50">
              <RefreshCw aria-hidden="true" className={`size-3 ${loadingPlatforms ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <p className="mt-1 text-sm text-white/40">Core TrueMemory connections — checks real backend connectivity.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {PLATFORMS.map((platform) => {
              const status = platformStatus[platform.id];
              const isConnected = status?.connected ?? false;
              const latency = status?.latency_ms;

              return (
                <div key={platform.id} className={`rounded-[20px] border bg-[#10100f] p-5 transition ${isConnected ? "border-white/[0.12]" : "border-white/[0.06]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${platform.color}15`, color: platform.color }}>
                        {platform.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold tracking-[-0.02em]">{platform.name}</h3>
                        <p className="text-xs text-white/40">{platform.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {latency !== undefined && (
                        <span className="flex items-center gap-1 text-[10px] text-white/30">
                          <Clock aria-hidden="true" className="size-3" />
                          {latency}ms
                        </span>
                      )}
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${isConnected ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-400" : status?.error ? "border border-red-400/25 bg-red-400/10 text-red-400" : "border border-white/10 bg-white/[0.03] text-white/35"}`}>
                        {isConnected ? "Online" : status?.error ? "Offline" : loadingPlatforms ? "Checking..." : "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {platform.features.map((feature) => (
                      <span key={feature} className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-0.5 text-[11px] text-white/45">
                        {feature}
                      </span>
                    ))}
                  </div>

                  {status?.error && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-400/10 bg-red-400/[0.04] px-3 py-2 text-xs text-red-300/60">
                      <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
                      {status.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Third-Party Connectors */}
        <section className="mt-10">
          <div className="flex items-center gap-2.5">
            <Key aria-hidden="true" className="size-5 text-[#8c82ff]" />
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Third-Party Connectors</h2>
          </div>
          <p className="mt-1 text-sm text-white/40">External services — enter your API key to test real connectivity.</p>

          {connectorCategories.map((category) => (
            <div key={category} className="mt-6">
              <h3 className="text-sm font-medium text-white/50">{category}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CONNECTORS.filter((c) => c.category === category).map((connector) => {
                  const savedEntry = saved[connector.id];
                  const result = connectorResults[connector.id] || savedEntry?.result;
                  const isConnected = savedEntry?.connected ?? false;

                  return (
                    <div key={connector.id} className={`rounded-xl border bg-[#10100f] px-4 py-3 transition ${isConnected ? "border-emerald-400/20" : "border-white/[0.06] hover:border-white/[0.12]"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/50">
                            {connector.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{connector.name}</p>
                            <p className="text-xs text-white/35 truncate">{connector.description}</p>
                          </div>
                        </div>
                        {isConnected ? (
                          <div className="flex items-center gap-1.5">
                            {result?.latency_ms !== undefined && (
                              <span className="text-[10px] text-white/25">{result.latency_ms}ms</span>
                            )}
                            <span className="grid size-6 place-items-center rounded-md bg-emerald-400/10 text-emerald-400">
                              <Check aria-hidden="true" className="size-3" />
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setModalConnector(connector); setModalApiKey(savedEntry?.apiKey || ""); setModalUrl(savedEntry?.url || ""); setModalError(""); }}
                            disabled={connector.id === "milvus"}
                            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-[#8c82ff]/30 hover:text-[#8c82ff] disabled:pointer-events-none disabled:opacity-30"
                          >
                            {connector.id === "milvus" ? "Env" : "Connect"}
                          </button>
                        )}
                      </div>

                      {isConnected && result && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {result.models !== undefined && (
                            <span className="rounded-md border border-emerald-400/10 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-300/60">{result.models} models</span>
                          )}
                          {result.indexes !== undefined && (
                            <span className="rounded-md border border-emerald-400/10 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-300/60">{result.indexes} indexes</span>
                          )}
                          {result.user && (
                            <span className="rounded-md border border-emerald-400/10 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-300/60">@{result.user}</span>
                          )}
                        </div>
                      )}

                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(connector.id)}
                          className="mt-2 w-full rounded-lg border border-red-400/10 bg-transparent px-3 py-1.5 text-[11px] font-medium text-red-300/50 transition hover:bg-red-400/[0.06] hover:text-red-300"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* API Key Modal */}
      {modalConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalConnector(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#10100f] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-white/50">
                  {modalConnector.icon}
                </div>
                <div>
                  <h3 className="font-semibold">{modalConnector.name}</h3>
                  <p className="text-xs text-white/40">{modalConnector.description}</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalConnector(null)} className="text-white/40 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {modalConnector.needsKey && (
                <div>
                  <label className="block text-sm font-medium text-white/60">API Key</label>
                  <input
                    type="password"
                    value={modalApiKey}
                    onChange={(e) => setModalApiKey(e.target.value)}
                    placeholder={modalConnector.keyPlaceholder}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#8c82ff]/50 focus:ring-1 focus:ring-[#8c82ff]/25"
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-white/25">Your key is tested then stored locally. It is never sent to our servers.</p>
                </div>
              )}
              {modalConnector.needsUrl && (
                <div>
                  <label className="block text-sm font-medium text-white/60">Endpoint URL</label>
                  <input
                    type="url"
                    value={modalUrl}
                    onChange={(e) => setModalUrl(e.target.value)}
                    placeholder={modalConnector.urlPlaceholder}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#8c82ff]/50 focus:ring-1 focus:ring-[#8c82ff]/25"
                    autoFocus={!modalConnector.needsKey}
                  />
                </div>
              )}
              {!modalConnector.needsKey && !modalConnector.needsUrl && (
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/50">
                  This connector is configured via environment variables. No API key needed.
                </div>
              )}

              {modalError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                  {modalError}
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setModalConnector(null)}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.07]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTestConnector}
                disabled={testing === modalConnector.id || (!modalConnector.needsKey && !modalConnector.needsUrl)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-[#8c82ff]/30 bg-[#8c82ff]/10 px-4 py-2.5 text-sm font-medium text-[#8c82ff] transition hover:bg-[#8c82ff]/20 disabled:pointer-events-none disabled:opacity-50"
              >
                {testing === modalConnector.id ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Zap aria-hidden="true" className="size-4" />
                )}
                {testing === modalConnector.id ? "Testing..." : "Test Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </AuthenticatedAppShell>
  );
}
