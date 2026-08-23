"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import {
  createAgentSkill,
  discoverAgentSkills,
  fetchAgentSkills,
  loadEnabledAgentSkills,
  saveEnabledAgentSkills,
  type AgentSkill,
  type SkillDiscoveryResult,
} from "@/services/agent-skills";

const categories = ["All", "Research", "Coding", "Documents", "Productivity", "Data"];
type MarketplaceSkill = AgentSkill & Partial<Omit<SkillDiscoveryResult, keyof AgentSkill>> & { id?: string };

export default function SkillsPage() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [discovered, setDiscovered] = useState<SkillDiscoveryResult[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"installed" | "web">("installed");
  const [category, setCategory] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAgentSkills()
      .then((items) => {
        setSkills(items);
        setEnabled(loadEnabledAgentSkills(items) ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Skills could not be loaded"));
  }, []);

  useEffect(() => {
    if (searchScope !== "web") {
      const clearTimer = window.setTimeout(() => setDiscovered([]), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(() => {
      void discoverAgentSkills(query).then(setDiscovered).catch(() => setDiscovered([]));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [query, searchScope]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source: MarketplaceSkill[] = searchScope === "web" ? discovered : skills;
    return source.filter((skill) => {
      const matchesQuery = !needle || `${skill.name} ${skill.description} ${skill.kind}`.toLowerCase().includes(needle);
      const matchesCategory = category === "All" || skill.kind.toLowerCase().includes(category.toLowerCase());
      return matchesQuery && matchesCategory;
    });
  }, [category, discovered, query, searchScope, skills]);

  function toggle(name: string) {
    setEnabled((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      saveEnabledAgentSkills(next);
      return next;
    });
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const skill = await createAgentSkill(draft);
      setSkills((current) => [...current, skill]);
      toggle(skill.name);
      setDraft({ name: "", description: "", instructions: "" });
      setShowCreate(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Skill could not be created");
    }
  }

  return (
    <AuthenticatedAppShell>
      <main className="min-h-screen bg-[var(--chat-background)] px-4 py-8 text-[var(--chat-foreground)] sm:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-5 border-b border-[var(--chat-border)] pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--chat-accent)]"><Sparkles className="size-3.5" /> TrueMemory Skills</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Skills Hub</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--chat-muted-foreground)]">Discover reusable capabilities and let the orchestrator activate them only when they improve the task.</p>
            </div>
            <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--chat-accent)] px-4 text-sm font-semibold text-[var(--chat-accent-foreground)] hover:bg-[var(--chat-accent-hover)]"><Plus className="size-4" /> Create skill</button>
          </header>

          <section className="mt-7 grid gap-3 sm:grid-cols-3">
            {[{ label: "Installed", value: skills.length }, { label: "Active", value: enabled.length }, { label: "Categories", value: categories.length - 1 }].map((item) => <div key={item.label} className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4"><p className="text-xs text-[var(--chat-muted-foreground)]">{item.label}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></div>)}
          </section>

          <section className="mt-8 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-3"><Search className="size-4 text-[var(--chat-muted-foreground)]" /><span className="sr-only">Search skills</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchScope === "web" ? "Search open-source skills from the internet" : "Search installed skills"} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--chat-subtle-foreground)]" /></label>
              <div className="flex shrink-0 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] p-1" role="tablist" aria-label="Skill search scope">
                <button type="button" role="tab" aria-selected={searchScope === "installed"} onClick={() => setSearchScope("installed")} className={`rounded-lg px-3 py-2 text-xs ${searchScope === "installed" ? "bg-[var(--chat-foreground)] text-[var(--chat-background)]" : "text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)]"}`}>Installed</button>
                <button type="button" role="tab" aria-selected={searchScope === "web"} onClick={() => setSearchScope("web")} className={`rounded-lg px-3 py-2 text-xs ${searchScope === "web" ? "bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]" : "text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)]"}`}>Open-source web</button>
              </div>
              <div className="flex gap-1 overflow-x-auto">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs ${category === item ? "bg-[var(--chat-foreground)] text-[var(--chat-background)]" : "text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)]"}`}>{item}</button>)}</div>
            </div>
          </section>

          {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <section className="mt-8">
            <div className="flex items-end justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--chat-accent)]">{searchScope === "web" ? "Open-source registries" : "Installed skills"}</p><h2 className="mt-1 text-xl font-semibold">{searchScope === "web" ? "Search the skill ecosystem" : "Your skills"}</h2></div><span className="text-xs text-[var(--chat-muted-foreground)]">{visible.length} available</span></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{visible.map((skill) => { const active = enabled.includes(skill.name); const external = Boolean(skill.registry && skill.registry !== "Local Skills"); return <article key={skill.id ?? skill.name} className="group rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4 transition-colors hover:border-[var(--chat-border-strong)]"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--chat-accent)]/10 text-[var(--chat-accent)]"><Sparkles className="size-4" /></div><button type="button" aria-pressed={active} aria-label={`${active ? "Disable" : "Enable"} ${skill.name}`} onClick={() => toggle(skill.name)} className={`grid size-9 place-items-center rounded-full border ${active ? "border-[var(--chat-accent)] bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]" : "border-[var(--chat-border)] text-[var(--chat-muted-foreground)]"}`}>{active ? <Check className="size-4" /> : <Plus className="size-4" />}</button></div><div className="mt-4 flex items-center gap-2"><h3 className="truncate font-semibold">{skill.name}</h3>{skill.verified ? <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700">Verified</span> : null}</div><p className="mt-1 text-[11px] text-[var(--chat-muted-foreground)]">by {skill.author ?? "KONTEXT"}</p><p className="mt-2 line-clamp-3 text-sm leading-5 text-[var(--chat-muted-foreground)]">{skill.description}</p><div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-[var(--chat-subtle-foreground)]"><span>{skill.registry ?? skill.kind}</span>{skill.stars !== undefined ? <span>{skill.stars} stars</span> : null}{skill.trust_score !== undefined ? <span>Trust {skill.trust_score}</span> : null}</div><div className="mt-4 flex items-center justify-between gap-2"><span className="text-[10px] text-[var(--chat-subtle-foreground)]">{external ? "External metadata" : active ? "Active" : "Available"}</span>{external && skill.source_url ? <a href={skill.source_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--chat-accent)] hover:underline">Inspect source</a> : null}</div></article>; })}</div>
            {!visible.length ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--chat-border)] p-10 text-center text-sm text-[var(--chat-muted-foreground)]">No skills match this search.</div> : null}
          </section>

          <section className="mt-10 grid gap-3 md:grid-cols-3">{["Trending skills", "Recommended for you", "Official TrueMemory skills"].map((title) => <div key={title} className="rounded-2xl border border-[var(--chat-border)] p-4"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-5 text-[var(--chat-muted-foreground)]">New capabilities will appear here as registry providers and usage signals are connected.</p></div>)}</section>
        </div>
      </main>
      {showCreate ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="presentation" onMouseDown={() => setShowCreate(false)}><form onSubmit={create} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-raised)] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Create a skill</h2><button type="button" onClick={() => setShowCreate(false)} aria-label="Close"><X className="size-4" /></button></div><div className="mt-5 space-y-3"><input required minLength={3} maxLength={64} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" className="min-h-11 w-full rounded-xl border border-[var(--chat-border)] bg-transparent px-3 text-sm outline-none" /><input required minLength={12} maxLength={400} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Description" className="min-h-11 w-full rounded-xl border border-[var(--chat-border)] bg-transparent px-3 text-sm outline-none" /><textarea required minLength={20} maxLength={12000} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="System instructions" rows={7} className="w-full resize-none rounded-xl border border-[var(--chat-border)] bg-transparent px-3 py-2.5 text-sm outline-none" /></div><button type="submit" className="mt-4 min-h-11 w-full rounded-full bg-[var(--chat-accent)] text-sm font-semibold text-[var(--chat-accent-foreground)]">Create skill</button></form></div> : null}
    </AuthenticatedAppShell>
  );
}
