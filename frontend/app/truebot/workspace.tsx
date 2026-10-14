"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, Bot, Boxes, CircleHelp, Clock, House, Layers, Menu, MessageSquare, Plus, Settings, Sparkles, Wrench, X, Zap } from "lucide-react";
import { botRequest, type AgentInput, type BotAgent, type BotConfig, type BotRun, type BotUsage } from "@/services/truebot";
import { fetchWorkspaces } from "@/services/workspaces";
import type { AuthWorkspace } from "@/lib/types";
import { PaperDither } from "@/components/ui/paper-dither";

const destinations = [
  { id: "home", label: "Home", icon: House }, { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "agents", label: "My Agents", icon: Bot }, { id: "templates", label: "Agent Templates", icon: Layers },
  { id: "runs", label: "Tasks and Runs", icon: Clock }, { id: "workspaces", label: "Workspaces", icon: Boxes, href: "/workspaces" },
  { id: "memory", label: "Memory", icon: Sparkles, href: "/memory" }, { id: "tools", label: "Tools and Integrations", icon: Wrench },
  { id: "automations", label: "Automations", icon: Zap }, { id: "usage", label: "Usage and Limits", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];
const initial: AgentInput = { name: "", description: "", instructions: "", provider: "openai", model: "", workspace_id: null, memory_enabled: true, tools: ["memory.search"], max_output_tokens: 1024, max_steps: 4, timeout_seconds: 60, status: "active" };
const isPending = (run: BotRun) => run.status === "queued" || run.status === "running";
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function TrueBotWorkspace() {
  const [view, setView] = useState("home");
  const [menu, setMenu] = useState(false);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [agents, setAgents] = useState<BotAgent[]>([]);
  const [runs, setRuns] = useState<BotRun[]>([]);
  const [usage, setUsage] = useState<BotUsage | null>(null);
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [task, setTask] = useState("");
  const [consent, setConsent] = useState({ external: false, memory: false, write: false });
  const [form, setForm] = useState<AgentInput | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState("");
  const submission = useRef<{ agent: string; task: string; key: string } | null>(null);
  const editorOpen = Boolean(form);
  const modalOpen = editorOpen || Boolean(deleteId);
  const chooseAgent = (id: string) => { setSelected(id); setConsent({ external: false, memory: false, write: false }); };
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overlay = document.querySelector<HTMLElement>(".tb-overlay");
    const elements = () => Array.from(overlay?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? []);
    elements()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setForm(null); setDeleteId(null); }
      if (event.key !== "Tab") return;
      const items = elements(); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, [modalOpen, busy]);
  const refresh = useCallback(async () => {
    const [agentData, runData, usageData] = await Promise.all([
      botRequest<{ items: BotAgent[] }>("/agents"), botRequest<{ items: BotRun[] }>("/runs"), botRequest<BotUsage>("/usage"),
    ]);
    setAgents(agentData.items); setRuns(runData.items); setUsage(usageData);
    setSelected(value => value || agentData.items.find(agent => agent.status === "active")?.id || "");
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await botRequest<BotConfig>("/config"); setConfig(data);
      if (data.enabled) await refresh();
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!editorOpen) return;
    let live = true;
    fetchWorkspaces().then(items => { if (live) setWorkspaces(items); }).catch(err => { if (live) setError(message(err)); });
    return () => { live = false; };
  }, [editorOpen]);
  const pending = runs.some(isPending);
  useEffect(() => {
    if (!pending) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await botRequest<{ items: BotRun[] }>("/runs");
        if (live) { setRuns(data.items); setUsage(await botRequest<BotUsage>("/usage")); }
      } catch (err) { if (live) setError(message(err)); }
      finally { if (live) timer = setTimeout(poll, 3000); }
    };
    timer = setTimeout(poll, 3000);
    return () => { live = false; clearTimeout(timer); };
  }, [pending]);

  const mutate = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  const create = (template?: BotConfig["templates"][number]) => {
    const provider = config?.providers.find(item => item.configured);
    setEditing(null); setForm({ ...initial, provider: provider?.id || "openai", model: provider?.models[0] || "", ...(template ? { name: template.name, description: template.description, instructions: template.instructions, tools: template.tools } : {}) });
  };
  const save = (event: FormEvent) => {
    event.preventDefault(); if (!form) return;
    void mutate(async () => {
      await botRequest(editing ? `/agents/${editing}` : "/agents", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setForm(null); await refresh(); setView("agents");
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault(); const text = task.trim(); if (!text || !selected || !runnable || !hasConsent) return;
    void mutate(async () => {
      if (!submission.current || submission.current.agent !== selected || submission.current.task !== text) submission.current = { agent: selected, task: text, key: crypto.randomUUID() };
      const data = await botRequest<{ item: BotRun }>("/runs", { method: "POST", body: JSON.stringify({ agent_id: selected, task: text, idempotency_key: submission.current.key, allow_external_provider: consent.external, allow_memory_access: consent.memory, allow_memory_write: consent.write }) });
      setRuns(items => [data.item, ...items.filter(item => item.id !== data.item.id)]); setTask(""); setConsent({ external: false, memory: false, write: false }); submission.current = null;
      await refresh();
    });
  };
  const agent = agents.find(item => item.id === selected);
  const runnable = config?.enabled && config.worker_ready && config.providers.some(provider => provider.id === agent?.provider && provider.configured) && agent?.status === "active";
  const hasConsent = consent.external && (!agent?.memory_enabled || consent.memory) && (!agent?.tools.includes("memory.save") || consent.write);
  const filteredRuns = runs.filter(run => view === "chat" ? run.agent_id === selected : !runFilter || run.agent_id === runFilter);
  const title = destinations.find(item => item.id === view)?.label || "Home";

  return <div className="theme-surface-page truebot-shell">
    <aside className={`tb-sidebar ${menu ? "tb-open" : ""}`}>
      <Link className="tb-brand" href="/truebot"><span className="tb-mark"><Bot size={20} /></span>TrueBot<span className="tb-label">WORKSPACE</span></Link>
      <div className="tb-sidebar-caption">BUILD WITH CONTEXT</div>
      <nav aria-label="TrueBot navigation">{destinations.map(item => item.href ? <Link key={item.id} href={item.href}><item.icon size={17} />{item.label}<ArrowUpRight size={13} className="tb-external" /></Link> : <button key={item.id} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setMenu(false); }}><item.icon size={17} />{item.label}{item.id === "runs" && pending && <span className="tb-live" />}</button>)}</nav>
      <div className="tb-sidebar-footer"><p>Persistent context.<br />Purposeful agents.</p><Link href="/dashboard">Back to TrueMemory <ArrowUpRight size={14} /></Link></div>
    </aside>
    <div className="tb-main">
      <header className="tb-header"><button className="tb-mobile-menu" aria-label={menu ? "Close navigation" : "Open navigation"} onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button><span>TrueBot <span className="tb-divider">/</span> {title}</span><span className="tb-service"><span className={`tb-dot ${config?.enabled ? "enabled" : ""}`} />{loading ? "Connecting" : config?.enabled ? "Hosted workspace" : "Service unavailable"}</span></header>
      <main id="truebot-content" className="tb-content">
        <div className={`tb-heading ${view === "home" ? "tb-heading-home" : ""}`}>
          {view === "home" && <div className="tb-hero-art" aria-hidden="true"><PaperDither className="inset-y-0 right-0 w-full" dark={{ colorBack: "#0c0a0800", colorFront: "#e85d18" }} light={{ colorBack: "#0c0a0800", colorFront: "#e85d18" }} eager maxPixelCount={600 * 300} scale={0.74} shape="warp" size={2.2} speed={0.16} type="4x4" /></div>}
          <div className="tb-heading-copy"><p className="tb-eyebrow">TrueMemory / TrueBot</p><h1>{view === "home" ? "Make your context work." : title}</h1><p className="tb-muted">{view === "home" ? "Configure an agent. Give it a task. Keep the context." : view === "chat" ? "Run a task with your agent and review its persisted results." : "Manage your agents and their persistent context."}</p></div>{["home", "agents", "templates"].includes(view) && <button className="tb-primary" disabled={!config?.enabled || busy} onClick={() => create()}><Plus size={16} />Create agent</button>}
        </div>
        {error && <div className="tb-error" role="alert"><span>{error}</span><button disabled={loading || busy} onClick={() => void load()}>Retry connection</button><Link href="/login?redirect=%2Ftruebot">Sign in</Link></div>}
        {loading ? <div className="tb-empty" role="status"><Activity size={26} /><h2>Connecting to your workspace</h2><p>Loading agents, configuration and saved runs.</p></div> : !config?.enabled ? <div className="tb-empty"><CircleHelp size={30} /><h2>TrueBot is not available yet</h2><p>The agent service must be enabled and a provider configured by your administrator.</p><button onClick={() => void load()}>Check again</button></div> : <>
          {view === "home" && <><section className="tb-overview" aria-label="Workspace usage"><div><span>AGENTS</span><strong>{usage?.agents ?? agents.length}<small> / {config.limits.max_agents}</small></strong></div><div><span>RUNS TODAY</span><strong>{usage?.runs_today ?? "—"}<small> / {config.limits.daily_runs}</small></strong></div><div><span>ACTIVE RUNS</span><strong>{usage?.active_runs ?? "—"}<small> / {config.limits.concurrent_runs}</small></strong></div></section><div className="tb-section-title"><h2>Your agents</h2><button onClick={() => setView("templates")}>Browse templates <ArrowUpRight size={14} /></button></div></>}
          {["home", "agents"].includes(view) && (agents.length ? <div className="tb-agent-list">{agents.map(item => <article key={item.id}><span className="tb-agent-icon"><Bot size={21} /></span><div className="tb-agent-copy"><h2>{item.name}<span className="tb-status">{item.status}</span></h2><p>{item.description || "No description added"}</p><small>{item.provider} / {item.model} · {item.memory_enabled ? "Memory enabled" : "Memory disabled"}</small></div><div className="tb-actions"><button disabled={item.status !== "active"} onClick={() => { chooseAgent(item.id); setView("chat"); }}>Open chat</button><button onClick={() => { setEditing(item.id); const { id: _id, created_at: _created, updated_at: _updated, ...input } = item; void _id; void _created; void _updated; setForm(input); }}>Configure</button><button aria-label={`Delete ${item.name}`} onClick={() => setDeleteId(item.id)}>Delete</button></div></article>)}</div> : <div className="tb-empty"><Bot size={32} /><h2>Your first agent starts here</h2><p>Choose instructions, permitted tools and execution limits. Your tasks and results stay in your workspace.</p><button className="tb-primary" onClick={() => create()}>Create your first agent <Plus size={16} /></button><button onClick={() => setView("templates")}>Start from a template</button></div>)}
          {view === "templates" && <div className="tb-template-list">{config.templates.map(template => <article key={template.id}><div><h2>{template.name}</h2><p className="tb-muted">{template.description}</p><small>{template.tools.length ? template.tools.join(" · ") : "No tools enabled by default"}</small></div><button onClick={() => create(template)}>Use template <Plus size={15} /></button></article>)}</div>}
          {["chat", "runs"].includes(view) && <><div className="tb-run-controls"><label>{view === "chat" ? "Agent" : "Filter by agent"}<select value={view === "chat" ? selected : runFilter} onChange={event => view === "chat" ? chooseAgent(event.target.value) : setRunFilter(event.target.value)}><option value="">{view === "chat" ? "Select an agent" : "All agents"}</option>{agents.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === "paused" ? " (paused)" : ""}</option>)}</select></label><button disabled={busy} onClick={() => void mutate(refresh)}>Refresh history</button></div>{view === "chat" && <form className="tb-composer" onSubmit={submit}><label htmlFor="tb-task">What should your agent do?</label><textarea id="tb-task" value={task} maxLength={16000} onChange={event => setTask(event.target.value)} placeholder="Describe a task and the outcome you need…" required disabled={busy} /><fieldset className="tb-consent"><legend>Permission for this task</legend><label className="tb-check"><input type="checkbox" checked={consent.external} onChange={event => setConsent({ ...consent, external: event.target.checked })} />Allow {agent?.provider || "the selected provider"} to process this task and any context shared with it.</label>{agent?.memory_enabled && <label className="tb-check"><input type="checkbox" checked={consent.memory} onChange={event => setConsent({ ...consent, memory: event.target.checked })} />Allow this task to retrieve my TrueMemory context and share relevant context with the model provider.</label>}{agent?.tools.includes("memory.save") && <label className="tb-check"><input type="checkbox" checked={consent.write} onChange={event => setConsent({ ...consent, write: event.target.checked })} />Allow this task to save new information to my TrueMemory context.</label>}</fieldset>{!config.worker_ready && <p role="status" className="tb-run-error">The execution worker is unavailable. You can configure agents; task execution will be available when the worker reconnects.</p>}<footer><span>{agent ? `${agent.model} · ${agent.memory_enabled ? "Persistent memory" : "No memory"}` : "Choose an agent to get started"}</span><button className="tb-primary" disabled={busy || !runnable || !hasConsent || !task.trim()} type="submit">{busy ? "Submitting…" : "Run task"}<ArrowUpRight size={16} /></button></footer>{agent && config.worker_ready && !runnable && <p className="tb-muted">This agent is paused or its provider is unavailable. Update its configuration to run tasks.</p>}</form>}<div className="tb-section-title"><h2>{view === "chat" ? "Conversation and task history" : "Saved runs"}</h2><span className="tb-muted">{filteredRuns.length} runs</span></div>{!filteredRuns.length ? <div className="tb-empty"><MessageSquare size={28} /><h2>No tasks yet</h2><p>Submitted tasks and their actual results will appear here.</p></div> : <div className="tb-run-list">{filteredRuns.map(run => <article key={run.id}><header><span className={`tb-status tb-status-${run.status}`}>{run.status}</span><span>{agents.find(item => item.id === run.agent_id)?.name || "Deleted agent"}</span><time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time>{isPending(run) && <button disabled={busy} onClick={() => void mutate(async () => { await botRequest(`/runs/${run.id}/cancel`, { method: "POST" }); await refresh(); })}>Cancel run</button>}</header><p className="tb-task-text">{run.task}</p>{run.output && <pre className="tb-output">{run.output}</pre>}{run.error && <p className="tb-run-error">{run.error}</p>}{isPending(run) && <p role="status" className="tb-muted">{run.status === "queued" ? "Waiting for an execution slot." : "Agent is working. Updates every 3 seconds."}</p>}<details><summary>Execution details</summary><p className="tb-mono">Run {run.id}</p><pre>{JSON.stringify(run.usage, null, 2)}</pre></details></article>)}</div>}</>}
          {view === "tools" && <><div className="tb-section-title"><h2>Available tools</h2><Link href="/connectors">Manage integrations <ArrowUpRight size={14} /></Link></div><div className="tb-template-list">{config.tools.map(tool => <article key={tool.id}><div><h2>{tool.name}</h2><p className="tb-muted">{tool.description}</p><small className="tb-mono">{tool.id}</small></div><span className="tb-status">Per-agent permission</span></article>)}</div><h2 className="tb-subheading">Model providers</h2><div className="tb-template-list">{config.providers.map(provider => <article key={provider.id}><div><h2>{provider.name}</h2><p className="tb-muted">{provider.runtime} · {provider.capabilities.join(", ")}</p><small>{provider.models.join(", ") || "No models configured"}</small></div><span className="tb-status">{provider.configured ? "Configured" : "Unavailable"}</span></article>)}</div></>}
          {view === "automations" && <div className="tb-empty"><Zap size={30} /><h2>Automations are not available</h2><p>Scheduled and triggered tasks are not enabled in this release. Run tasks from Chat and track them in Tasks and Runs.</p><button onClick={() => setView("chat")}>Open chat</button></div>}
          {view === "usage" && <><p className="tb-muted">Limits are enforced by the server for your account.</p><dl className="tb-usage"><div><dt>Agents</dt><dd>{usage?.agents ?? "—"} / {config.limits.max_agents}</dd></div><div><dt>Runs today</dt><dd>{usage?.runs_today ?? "—"} / {config.limits.daily_runs}</dd></div><div><dt>Concurrent runs</dt><dd>{usage?.active_runs ?? "—"} / {config.limits.concurrent_runs}</dd></div></dl><Link className="tb-link" href="/usage">View TrueMemory usage <ArrowUpRight size={15} /></Link></>}
          {view === "settings" && <div className="tb-template-list"><article><div><h2>Agent settings</h2><p className="tb-muted">Configure instructions, memory, tools and execution limits for each agent.</p></div><button onClick={() => setView("agents")}>My Agents</button></article><article><div><h2>Account and access</h2><p className="tb-muted">Manage your TrueMemory account and subscription.</p></div><Link href="/profile">Account <ArrowUpRight size={15} /></Link></article><article><div><h2>Provider credentials</h2><p className="tb-muted">Provider credentials are configured securely on the server by your administrator.</p></div><span className="tb-status">Server managed</span></article></div>}
        </>}
      </main>
    </div>
    {form && <div className="tb-overlay"><section className="tb-editor" role="dialog" aria-modal="true" aria-labelledby="tb-editor-title"><header><h2 id="tb-editor-title">{editing ? "Configure agent" : "Create agent"}</h2><button aria-label="Close editor" disabled={busy} onClick={() => setForm(null)}><X size={20} /></button></header><form onSubmit={save}><label>Name<input autoFocus required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Description<input maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><label>Instructions and role<textarea required rows={5} maxLength={16000} value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} /></label><div className="tb-form-grid"><label>Provider<select value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value, model: config?.providers.find(provider => provider.id === event.target.value)?.models[0] || "" })}>{config?.providers.map(provider => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.name}{!provider.configured ? " (unavailable)" : ""}</option>)}</select></label><label>Model<select required value={form.model} onChange={event => setForm({ ...form, model: event.target.value })}><option value="">Select a model</option>{config?.providers.find(provider => provider.id === form.provider)?.models.map(model => <option key={model}>{model}</option>)}</select></label><label>Workspace<select value={form.workspace_id || ""} onChange={event => setForm({ ...form, workspace_id: event.target.value || null })}><option value="">Personal context</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AgentInput["status"] })}><option value="active">Active</option><option value="paused">Paused</option></select></label></div><fieldset><legend>Memory and tool permissions</legend><label className="tb-check"><input type="checkbox" checked={form.memory_enabled} onChange={event => setForm({ ...form, memory_enabled: event.target.checked, tools: event.target.checked ? form.tools : [] })} />Enable persistent TrueMemory context</label>{config?.tools.map(tool => <label className="tb-check" key={tool.id}><input type="checkbox" disabled={!form.memory_enabled} checked={form.tools.includes(tool.id)} onChange={event => setForm({ ...form, tools: event.target.checked ? [...form.tools, tool.id] : form.tools.filter(item => item !== tool.id) })} />{tool.name}<span className="tb-muted">{tool.description}</span></label>)}</fieldset><div className="tb-form-grid"><label>Maximum output tokens<input required type="number" min={256} max={4096} value={form.max_output_tokens} onChange={event => setForm({ ...form, max_output_tokens: Number(event.target.value) })} /></label><label>Maximum steps<input required type="number" min={1} max={6} value={form.max_steps} onChange={event => setForm({ ...form, max_steps: Number(event.target.value) })} /></label><label>Timeout (seconds)<input required type="number" min={15} max={120} value={form.timeout_seconds} onChange={event => setForm({ ...form, timeout_seconds: Number(event.target.value) })} /></label></div>{error && <p className="tb-run-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="tb-primary" disabled={busy || !config?.providers.some(provider => provider.id === form.provider && provider.configured)} type="submit">{busy ? "Saving…" : "Save agent"}</button></footer></form></section></div>}
    {deleteId && <div className="tb-overlay"><section className="tb-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tb-delete-title"><h2 id="tb-delete-title">Delete this agent?</h2><p>Its saved runs remain in your history. You cannot undo this action.</p><div className="tb-actions"><button disabled={busy} onClick={() => setDeleteId(null)}>Keep agent</button><button className="tb-danger" disabled={busy} onClick={() => void mutate(async () => { await botRequest(`/agents/${deleteId}`, { method: "DELETE" }); setDeleteId(null); await refresh(); })}>Delete agent</button></div>{error && <p role="alert">{error}</p>}</section></div>}
  </div>;
}
