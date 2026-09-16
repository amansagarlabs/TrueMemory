"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Archive, ChevronRight, Crosshair, Minus, Network, Plus, RotateCcw, Search, Sparkles, X } from "lucide-react";
import type { MemoryItem } from "@/services/dashboard";

type Kind = "memory" | "entity" | "source" | "project" | "event" | "profile" | "document" | "conversation";
type GraphNode = { id: string; label: string; kind: Kind; x: number; y: number; detail: string; meta: string; size?: number };

const colors: Record<Kind, string> = { memory: "#f6e879", entity: "#a7e8dc", source: "#9bb8ff", project: "#d7b4ff", event: "#ffaf83", profile: "#f2a7d4", document: "#b9d58a", conversation: "#9fd5ff" };
const kindLabels: Record<Kind, string> = { memory: "Memory", entity: "Entity", source: "Source", project: "Project", event: "Event", profile: "Profile", document: "Document", conversation: "Conversation" };

function makeNodes(items: MemoryItem[]): GraphNode[] {
  const memories = items.slice(0, 5).map((item, index) => ({ id: `m-${item.id}`, label: (item.memory_key || item.key || "Memory").replaceAll("_", " "), kind: "memory" as const, x: [500, 730, 480, 760, 610][index], y: [330, 220, 520, 470, 120][index], detail: item.content, meta: item.source || "Captured memory", size: index === 0 ? 22 : 16 }));
  const fallback: GraphNode[] = [
    { id: "m-core", label: "Your working context", kind: "memory", x: 610, y: 330, detail: "The central memory cluster that grounds your next answer.", meta: "Active · high confidence", size: 28 },
    { id: "e-true", label: "TrueMemory", kind: "entity", x: 330, y: 175, detail: "The system connecting memories across your tools and workspaces.", meta: "Entity · 18 connections" },
    { id: "e-aman", label: "Aman", kind: "profile", x: 910, y: 155, detail: "Profile context and durable preferences.", meta: "Profile · private" },
    { id: "p-work", label: "Memory architecture", kind: "project", x: 985, y: 390, detail: "A living project thread across research, code, and decisions.", meta: "Project · current" },
    { id: "ev-now", label: "Today", kind: "event", x: 800, y: 590, detail: "The current temporal anchor for this network.", meta: "Event · 10 Sep 2026" },
    { id: "s-chat", label: "Chat sessions", kind: "conversation", x: 310, y: 490, detail: "Conversation traces that contributed to this cluster.", meta: "Source · 42 sessions" },
    { id: "d-research", label: "Research notes", kind: "document", x: 470, y: 665, detail: "Documents and artifacts that support these memories.", meta: "Document · 12 linked" },
    { id: "s-github", label: "GitHub", kind: "source", x: 1040, y: 105, detail: "Connected source with recent code activity.", meta: "Source · synced 4m ago" },
  ];
  return [...fallback, ...memories.filter((node) => node.id !== "m-core")];
}

const edges = [["m-core", "e-true"], ["m-core", "e-aman"], ["m-core", "p-work"], ["m-core", "ev-now"], ["m-core", "s-chat"], ["m-core", "d-research"], ["m-core", "s-github"], ["e-true", "p-work"], ["e-aman", "ev-now"], ["s-chat", "d-research"], ["p-work", "s-github"], ["d-research", "ev-now"]];
const edgeLabels: Record<string, string> = { "m-core|e-true": "relates to", "m-core|e-aman": "owned by", "m-core|p-work": "part of", "m-core|ev-now": "active at", "m-core|s-chat": "recalled from", "m-core|d-research": "supported by", "m-core|s-github": "synced from", "e-true|p-work": "shapes", "e-aman|ev-now": "happening now", "s-chat|d-research": "references", "p-work|s-github": "implemented in", "d-research|ev-now": "updated at" };

export function MemoryGraph({ items }: { items: MemoryItem[] }) {
  const nodes = useMemo(() => makeNodes(items), [items]);
  const [selected, setSelected] = useState("m-core");
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [timeLens, setTimeLens] = useState("all");
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeKinds, setActiveKinds] = useState<Kind[]>(["memory", "entity", "source", "project", "event", "profile", "document", "conversation"]);
  const selectedNode = nodes.find((node) => node.id === selected) || nodes[0];
  const visible = nodes.filter((node) => activeKinds.includes(node.kind) && (!query || node.label.toLowerCase().includes(query.toLowerCase())));
  const toggleKind = (kind: Kind) => setActiveKinds((current) => current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind]);
  const visibleIds = new Set(visible.map((node) => node.id));
  const pointFromEvent = (event: PointerEvent<Element>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  };
  const getPosition = (node: GraphNode) => positions[node.id] || node;
  const beginDrag = (event: PointerEvent<SVGGElement>, node: GraphNode) => {
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (!point) return;
    const current = getPosition(node);
    dragging.current = { id: node.id, dx: point.x - current.x, dy: point.y - current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(node.id);
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = dragging.current;
    const point = pointFromEvent(event);
    if (!active || !point) return;
    setPositions((current) => ({ ...current, [active.id]: { x: point.x - active.dx, y: point.y - active.dy } }));
  };
  const endDrag = () => { dragging.current = null; };
  return <div className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0e0f] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
    <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]"><span className="size-1.5 animate-pulse rounded-full bg-[#f6e879]" />Live memory network</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Everything you remember, in relationship.</h2><p className="mt-1 text-sm text-white/40">Explore the connective tissue between facts, people, projects, and moments.</p></div>
      <label className="flex min-h-11 w-full max-w-[300px] items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3"><Search className="size-4 text-white/30" /><span className="sr-only">Find in graph</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a node..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" /></label>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-h-[620px] overflow-hidden bg-[radial-gradient(circle_at_50%_44%,rgba(246,232,121,.09),transparent_25%),linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[length:auto,44px_44px,44px_44px]">
        <div className="absolute left-5 top-5 z-10 rounded-lg border border-white/10 bg-[#111516]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-white/35 backdrop-blur">{visible.length} nodes · {edges.length} relationships</div>
        <div className="absolute right-5 top-5 z-10 flex overflow-hidden rounded-xl border border-white/10 bg-[#111516]/80 backdrop-blur"><button aria-label="Zoom out" onClick={() => setScale((value) => Math.max(.7, value - .1))} className="grid size-11 place-items-center text-white/45 hover:bg-white/10"><Minus className="size-4" /></button><button aria-label="Reset zoom" onClick={() => setScale(1)} className="border-x border-white/10 px-3 font-mono text-[10px] text-white/35">{Math.round(scale * 100)}%</button><button aria-label="Zoom in" onClick={() => setScale((value) => Math.min(1.5, value + .1))} className="grid size-11 place-items-center text-white/45 hover:bg-white/10"><Plus className="size-4" /></button></div>
        <div className="absolute left-5 top-[66px] z-10 flex flex-wrap gap-2"><button onClick={() => setFocusMode((value) => !value)} aria-pressed={focusMode} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs ${focusMode ? "border-[#f6e879]/40 bg-[#f6e879]/10 text-[#f6e879]" : "border-white/10 bg-[#111516]/80 text-white/45"}`}><Crosshair className="size-3.5" />Focus selection</button><button onClick={() => { setPositions({}); setScale(1); setSelected("m-core"); setFocusMode(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#111516]/80 px-3 text-xs text-white/45"><RotateCcw className="size-3.5" />Reset layout</button><label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#111516]/80 px-3 text-xs text-white/45"><span className="font-mono text-[10px] uppercase tracking-[.1em]">Lens</span><select value={timeLens} onChange={(event) => setTimeLens(event.target.value)} className="bg-transparent text-xs text-white/60 outline-none"><option value="all">All time</option><option value="recent">Recent activity</option><option value="history">Historical</option></select></label></div>
        <div className="absolute bottom-[78px] right-5 z-10 rounded-lg border border-white/10 bg-[#111516]/80 px-3 py-2 text-[11px] text-white/35 backdrop-blur">Drag nodes to explore</div>
        <svg ref={svgRef} viewBox="0 0 1220 760" role="img" aria-label="Interactive network of connected memories" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="h-full min-h-[620px] w-full touch-none" style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%", transition: dragging.current ? "none" : "transform 180ms ease-out" }}>
          <defs><filter id="glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {edges.map(([from, to]) => { const a = nodes.find((n) => n.id === from); const b = nodes.find((n) => n.id === to); if (!a || !b || !visibleIds.has(from) || !visibleIds.has(to)) return null; const pa = getPosition(a); const pb = getPosition(b); const hot = selected === from || selected === to; const dim = focusMode && !hot; return <g key={`${from}-${to}`} opacity={dim ? ".12" : 1}><line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={hot ? "#f6e879" : "#637078"} strokeOpacity={hot ? ".72" : ".3"} strokeWidth={hot ? 2 : 1} strokeDasharray={hot ? "" : "4 8"} /><text x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 - 7} textAnchor="middle" fill="#91a0a2" fontSize="9" opacity={hot ? ".9" : ".42"}>{edgeLabels[`${from}|${to}`]}</text></g>; })}
          {visible.map((node) => { const position = getPosition(node); const dim = focusMode && selected !== node.id && !edges.some(([from, to]) => (from === selected && to === node.id) || (to === selected && from === node.id)); return <g key={node.id} onPointerDown={(event) => beginDrag(event, node)} onClick={() => setSelected(node.id)} role="button" tabIndex={0} aria-label={`${node.label}, ${kindLabels[node.kind]}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(node.id); }} className="cursor-grab active:cursor-grabbing" opacity={dim ? ".14" : 1}><circle cx={position.x} cy={position.y} r={(node.size || 13) + (selected === node.id ? 10 : 3)} fill={colors[node.kind]} opacity={selected === node.id ? ".14" : ".06"} />{selected === node.id ? <circle cx={position.x} cy={position.y} r={(node.size || 13) + 5} fill="none" stroke={colors[node.kind]} strokeOpacity=".75" strokeDasharray="3 5" /> : null}<circle cx={position.x} cy={position.y} r={node.size || 13} fill={colors[node.kind]} filter={selected === node.id ? "url(#glow)" : undefined} /><text x={position.x} y={position.y + (node.size || 13) + 25} textAnchor="middle" fill={selected === node.id ? "#fff" : "#b7c0c1"} fontSize="14" fontWeight={selected === node.id ? "600" : "400"}>{node.label}</text><text x={position.x} y={position.y + (node.size || 13) + 42} textAnchor="middle" fill={colors[node.kind]} opacity=".8" fontSize="9" letterSpacing="1.5">{kindLabels[node.kind].toUpperCase()}</text></g>; })}
        </svg>
        <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">{(Object.keys(kindLabels) as Kind[]).map((kind) => <button key={kind} onClick={() => toggleKind(kind)} aria-pressed={activeKinds.includes(kind)} className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[11px] transition-colors ${activeKinds.includes(kind) ? "border-white/15 bg-white/[.07] text-white/70" : "border-white/5 bg-black/20 text-white/20"}`}><span className="size-2 rounded-full" style={{ backgroundColor: colors[kind] }} />{kindLabels[kind]}</button>)}</div>
      </div>
      <aside className="border-t border-white/10 bg-[#111516] lg:border-l lg:border-t-0"><div className="flex items-center justify-between border-b border-white/10 p-5"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Selected node</p><button aria-label="Close selection" onClick={() => setSelected("m-core")} className="grid size-9 place-items-center rounded-lg text-white/30 hover:bg-white/10"><X className="size-4" /></button></div><div className="p-5"><div className="grid size-12 place-items-center rounded-2xl" style={{ backgroundColor: `${colors[selectedNode.kind]}18`, color: colors[selectedNode.kind] }}><Network className="size-5" /></div><p className="mt-5 font-mono text-[10px] uppercase tracking-[.14em]" style={{ color: colors[selectedNode.kind] }}>{kindLabels[selectedNode.kind]}</p><h3 className="mt-2 text-xl font-semibold tracking-[-.03em]">{selectedNode.label}</h3><p className="mt-3 text-sm leading-6 text-white/55">{selectedNode.detail}</p><p className="mt-5 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[.1em] text-white/30">{selectedNode.meta}</p><button className="mt-6 flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 text-sm text-white/60 hover:bg-white/[.08]">Open memory details <ChevronRight className="size-4" /></button></div><div className="border-t border-white/10 p-5"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-white/30">Network pulse</p><div className="mt-4 space-y-3 text-xs text-white/45"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><Sparkles className="size-3 text-[#f6e879]" />New connections</span><span className="font-mono text-white/70">+12</span></div><div className="flex items-center justify-between"><span className="flex items-center gap-2"><Archive className="size-3 text-[#9bb8ff]" />Synced today</span><span className="font-mono text-white/70">38</span></div></div></div></aside>
    </div>
  </div>;
}
