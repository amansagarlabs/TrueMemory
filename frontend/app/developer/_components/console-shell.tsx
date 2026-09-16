"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Activity, ArrowLeft, ArrowUpRight, BookOpen, Bot, Box, ChevronDown, Code2, CreditCard, FileText, HeartPulse, KeyRound, LayoutDashboard, Menu, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Tags, Terminal, TriangleAlert, Upload, Users } from "lucide-react";
import { isAuthenticated, loadAuthUser } from "@/lib/auth";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { KeyDialog } from "./key-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
const groups = [
  { label: "Workspace", items: [["overview", "Overview", LayoutDashboard], ["playground", "Playground", Terminal], ["documents", "Documents", FileText], ["tags", "Container tags", Tags], ["graph", "Memory graph", Network]] },
  { label: "Observe", items: [["requests", "Requests", Activity], ["insights", "User insights", Users], ["health", "System health", HeartPulse], ["incidents", "Incidents", TriangleAlert]] },
  { label: "Build", items: [["connectors", "Connectors", Box], ["import", "Import", Upload], ["api-keys", "API keys", KeyRound], ["agents", "Agents & SDKs", Bot]] },
  { label: "Organization", items: [["team", "Team", Users], ["billing", "Usage & billing", CreditCard], ["settings", "Settings", Settings]] },
] as const;
const ConsoleContext = createContext({ openKey: () => {}, environment: "Production" });
export const useConsole = () => useContext(ConsoleContext);
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [ready, setReady] = useState(false); const [name, setName] = useState("My workspace");
  const [mobile, setMobile] = useState(false); const [collapsed, setCollapsed] = useState(false); const [filter, setFilter] = useState("");
  const [environment, setEnvironment] = useState("Production"); const [keyOpen, setKeyOpen] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => { if (!isAuthenticated()) { router.replace(`/login?redirect=${encodeURIComponent(pathname)}`); return; } const user = loadAuthUser(); setName(user?.full_name || user?.username || "My workspace"); setReady(true); }); return () => cancelAnimationFrame(frame); }, [pathname, router]);
  if (!ready) return <div className="dev-console dev-loading" role="status">Loading developer workspace…</div>;
  return <ConsoleContext.Provider value={{ openKey: () => setKeyOpen(true), environment }}><div className={`dev-console ${collapsed ? "dev-console-collapsed" : ""}`}>
    <a className="dev-skip" href="#console-content">Skip to console</a>
    {mobile && <button className="dev-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`dev-sidebar ${mobile ? "is-open" : ""}`}>
      <div className="dev-brand-row"><Link className="dev-brand" href="/developer"><Image src="/truememory-mark.svg" alt="" width={30} height={30} /><strong>TrueMemory<span>DEVELOPER CONSOLE</span></strong></Link><button className="dev-collapse" aria-label={collapsed ? "Expand developer sidebar" : "Collapse developer sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
      <details className="dev-workspace"><summary><span className="dev-avatar">{name[0]?.toUpperCase()}</span><span>{name}<small>Developer workspace</small></span><ChevronDown size={14} /></summary><div><Link href="/developer/settings">Workspace settings</Link><Link href="/dashboard"><ArrowLeft size={14} /> Back to TrueMemory</Link></div></details>
      <label className="dev-search"><Search size={15} /><input aria-label="Search developer navigation" placeholder="Find a page…" value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <button className="dev-button dev-create" aria-label="Create memory" title="Create memory" onClick={() => setKeyOpen(true)}><Plus size={15} /> <span>Create API key</span></button>
      <TooltipProvider delay={180}><nav aria-label="Developer navigation">{groups.map(group => <details open key={group.label} className="dev-nav-group"><summary>{group.label}<ChevronDown size={12} /></summary>{group.items.filter(([, label]) => label.toLowerCase().includes(filter.toLowerCase())).map(([id, label, Icon]) => { const href = id === "overview" ? "/developer" : `/developer/${id}`; const link = <Link href={href} onClick={() => setMobile(false)} aria-current={pathname === href ? "page" : undefined}><Icon size={16} /><span>{label}</span>{id === "incidents" && <span className="dev-nav-count">1</span>}</Link>; return collapsed ? <Tooltip key={id}><TooltipTrigger render={link} /><TooltipContent side="right" sideOffset={8}>{label}</TooltipContent></Tooltip> : link; })}</details>)}</nav></TooltipProvider>
      <div className="dev-sidebar-footer"><Link href="/developer/agents"><Code2 size={18} /><span>Build with memory.<small>Integration guide <ArrowUpRight size={11} /></small></span></Link><Link href="/dashboard"><ArrowLeft size={14} /> Back to app</Link></div>
    </aside>
    <div className="dev-body"><header className="dev-topbar"><button className="dev-icon dev-mobile-toggle" aria-label="Open navigation" onClick={() => setMobile(!mobile)}><Menu size={19} /></button><span className="dev-breadcrumb">Workspace <span>/</span> <strong>Developer</strong></span><div className="dev-top-actions"><label className="dev-environment"><span className="dev-dot" /><select aria-label="Environment" value={environment} onChange={e => setEnvironment(e.target.value)}><option>Production</option><option>Development</option><option>Staging</option></select></label><button className="dev-icon dev-top-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><AnimatedThemeToggler /><Link href="/docs"><BookOpen size={14} /> Docs</Link></div></header>
    <div className="dev-preview"><span className="dev-dot amber" /><strong>Console preview</strong><span>Sample workspace data · {environment} · Live API key creation available</span></div>
    <main id="console-content" className="dev-content">{children}</main><footer className="dev-footer"><span>TrueMemory developer platform</span><span>API · MCP · Memory</span></footer></div>
    <KeyDialog open={keyOpen} onOpenChange={setKeyOpen} />
  </div></ConsoleContext.Provider>;
}
