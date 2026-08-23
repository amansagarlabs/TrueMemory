"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Boxes, ChevronRight, GitBranch, Search, ShieldCheck, Terminal } from "lucide-react";

type DocEntry = { section: string; title: string; summary: string; body: string; id: string };

const entries: DocEntry[] = [
  { id: "what-is-truememory", section: "Start here", title: "What is TrueMemory?", summary: "Universal memory infrastructure for agents, applications, models, and sessions.", body: "TrueMemory is the memory layer. It exposes a REST Memory API, MCP, and SDK-friendly HTTP interfaces over scoped storage and retrieval. TrueMemory Assistant is a first-party client, not the platform identity." },
  { id: "first-memory", section: "Start here", title: "First memory", summary: "Store, search, and retrieve a scoped memory in minutes.", body: "Create a scoped token with the memory scope, POST a memory to /v1/memories, then call /v1/memories/search or /v1/memories/retrieve. Bind tokens to a Space or agent when isolation requires it." },
  { id: "system-overview", section: "Architecture", title: "System overview", summary: "REST, MCP, and SDK clients converge on the memory boundary.", body: "Clients authenticate at the API boundary. The REST and MCP routes authorize scopes and bindings before delegating to the memory client. Storage, retrieval, temporal filtering, rate limiting, and observability remain behind that boundary." },
  { id: "memory-lifecycle", section: "Memory", title: "Memory lifecycle", summary: "Ingest → validate → store → retrieve → revise → forget.", body: "The current implementation supports memory writes, search, retrieval, update, forgetting, workspace and agent bindings, temporal parameters, provenance, confidence, and history-aware retrieval where the underlying memory data provides it." },
  { id: "rest-api", section: "Developers", title: "REST API", summary: "The canonical HTTP contract for memory infrastructure.", body: "GET /v1/memories lists authorized memories. POST /v1/memories writes. POST /v1/memories/search and POST /v1/memories/retrieve recall context. POST /v1/memories/update and POST /v1/memories/forget mutate it. Authentication requires a token with the memory scope." },
  { id: "mcp", section: "Developers", title: "MCP", summary: "Connect an MCP-compatible agent to TrueMemory.", body: "The MCP JSON-RPC endpoint is POST /mcp. Available memory tools include memory_search, memory_retrieve, memory_context, memory_entities, memory_remember, and memory_update, subject to authentication, scope, bindings, and rate limits." },
  { id: "isolation", section: "Security", title: "Isolation and authorization", summary: "Tenant, Space, and agent bindings are enforced at the boundary.", body: "Authorization is enforced before memory operations. Token bindings for workspace_id and agent_id cannot be widened by a client request. Disallowed bindings return an authorization error rather than crossing the boundary." },
  { id: "verified", section: "History", title: "What is verified?", summary: "The repository is the historian; gaps are not filled with invented biography.", body: "The repository contains earlier KONTEXT, AmanAgentLab, and AmanCrawl vision documents as historical source material. The exact chronology of every experiment and the founder's personal motivations are not fully verified here and are intentionally marked unknown." },
];

const groups = ["Start here", "Product", "Memory", "Architecture", "Developers", "Agents", "Operations", "Security", "Performance", "Releases", "History"];

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter((entry) => !normalized || `${entry.title} ${entry.summary} ${entry.body}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <main className="min-h-screen bg-[#080807] text-white">
      <header className="border-b border-white/10 bg-[#0b0b0a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-5 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="size-5 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f27a28)]" />TrueMemory</Link>
          <span className="text-white/20">/</span><span className="text-sm text-white/55">Documentation</span>
          <div className="ml-auto hidden items-center gap-3 text-xs text-white/40 sm:flex"><GitBranch className="size-3.5" /> current <Link href="/api-sdk" className="text-[#f6e879] hover:underline">API &amp; SDK <ArrowRight className="inline size-3" /></Link></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[210px_minmax(0,760px)_220px] lg:py-12">
        <aside className="hidden lg:block"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-white/35">Documentation</p><nav className="mt-4 space-y-1 text-sm text-white/50">{groups.map((group) => { const first = entries.find((entry) => entry.section === group); return first ? <a key={group} href={`#${first.id}`} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/[.05] hover:text-white">{group}<ChevronRight className="size-3 opacity-40" /></a> : <span key={group} className="block px-3 py-2 text-white/20">{group}</span>; })}</nav></aside>
        <article>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">TrueMemory / Human + agent docs</p>
          <h1 className="mt-4 font-heading text-5xl tracking-[-.06em] sm:text-6xl">Understand the memory layer. Build on it.</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/50">Product story, architecture reference, developer guide, and agent-readable source of truth — built from the repository’s verified implementation.</p>
          <label className="mt-8 flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4"><Search className="size-4 text-white/35" /><span className="sr-only">Search documentation</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search docs, APIs, architecture, history…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30" /></label>
          <section className="mt-12 rounded-2xl border border-[#f6e879]/25 bg-[#f6e879]/[.06] p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-semibold text-[#f6e879]"><Terminal className="size-4" /> Quickstart · the memory loop</div><p className="mt-3 text-sm leading-6 text-white/65">One token, one Space, three calls. The same flow works for an application or an agent.</p><pre className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-6 text-white/75"><code>{`const memory = await fetch("/v1/memories", {\n  method: "POST", headers: auth, body: JSON.stringify({ content })\n});\nawait fetch("/v1/memories/search", { method: "POST", headers: auth, body: JSON.stringify({ query }) });\nawait fetch("/v1/memories/retrieve", { method: "POST", headers: auth, body: JSON.stringify({ memory_ids }) });`}</code></pre><Link href="#rest-api" className="mt-4 inline-flex items-center text-xs font-semibold text-[#f6e879] hover:underline">Read the REST contract <ArrowRight className="ml-1 size-3" /></Link></section>
          <section className="mt-8 grid gap-3 sm:grid-cols-2"><DocCard icon={BookOpen} title="Start here" body="Learn the product model and make your first memory." href="#first-memory" /><DocCard icon={Terminal} title="Build with TrueMemory" body="REST, TypeScript, Python, HTTP, and MCP integration paths." href="#rest-api" /><DocCard icon={Boxes} title="Architecture" body="See how clients, authorization, memory, retrieval, and storage connect." href="#system-overview" /><DocCard icon={ShieldCheck} title="Security" body="Scopes, bindings, isolation, token lifecycle, and failure boundaries." href="#isolation" /></section>
          <div className="mt-12 space-y-10">{filtered.length ? filtered.map((entry) => <section key={entry.id} id={entry.id} className="scroll-mt-24 border-t border-white/10 pt-7"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/30">{entry.section}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">{entry.title}</h2><p className="mt-2 text-sm text-[#f6e879]">{entry.summary}</p><p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">{entry.body}</p></section>) : <p className="mt-12 text-sm text-white/45">No verified documentation matches “{query}”.</p>}</div>
        </article>
        <aside className="hidden xl:block"><div className="sticky top-8 rounded-2xl border border-white/10 bg-white/[.03] p-4"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Agent-ready</p><p className="mt-3 text-sm leading-6 text-white/60">Programmatic consumers can start with the generated llms.txt files.</p><a href="/llms.txt" className="mt-4 inline-flex text-xs font-semibold text-[#f6e879] hover:underline">Open llms.txt <ArrowRight className="ml-1 size-3" /></a></div></aside>
      </div>
    </main>
  );
}

function DocCard({ icon: Icon, title, body, href }: { icon: typeof BookOpen; title: string; body: string; href: string }) {
  return <a href={href} className="group rounded-2xl border border-white/10 bg-white/[.03] p-5 transition hover:border-[#f6e879]/30 hover:bg-white/[.05]"><Icon className="size-4 text-[#f6e879]" /><h2 className="mt-5 flex items-center justify-between text-sm font-semibold">{title}<ArrowRight className="size-3 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" /></h2><p className="mt-2 text-sm leading-6 text-white/45">{body}</p></a>;
}
