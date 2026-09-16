"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Brain, Code2, CreditCard, FileText, Search, Settings, Sparkles, Users, X } from "lucide-react";

const ITEMS = [
  { label: "Brain", detail: "Memories and Spaces", href: "/memory", icon: Brain, keywords: "memory profile entities history spaces" },
  { label: "Assistant", detail: "Chat, research, and coding", href: "/chat", icon: Sparkles, keywords: "chat research coding artifacts skills" },
  { label: "Search", detail: "Find anything in this workspace", href: "/search", icon: Search, keywords: "find discover universal" },
  { label: "Spaces", detail: "Choose or create a Space", href: "/workspaces", icon: Users, keywords: "workspace context" },
  { label: "Connections", detail: "Manage connected applications", href: "/connectors", icon: Users, keywords: "connectors integrations" },
  { label: "API & SDK", detail: "REST, SDK, and MCP", href: "/api-sdk", icon: Code2, keywords: "api mcp developer" },
  { label: "Activity", detail: "Review recent work", href: "/activity", icon: Activity, keywords: "history events" },
  { label: "Usage", detail: "Review account usage", href: "/credits", icon: CreditCard, keywords: "credits limits" },
  { label: "Profile", detail: "Account settings", href: "/profile", icon: Settings, keywords: "settings account" },
  { label: "Artifacts", detail: "Documents and files", href: "/artifacts", icon: FileText, keywords: "documents files" },
] as const;

export function TrueMemoryCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    const onOpen = () => setOpen(true);
    window.addEventListener("truememory:open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("truememory:open-command-palette", onOpen);
    };
  }, []);

  return (
    <>
      <Command.Dialog open={open} onOpenChange={setOpen} label="TrueMemory command palette" overlayClassName="fixed inset-0 z-[100] bg-black/35 backdrop-blur-sm" contentClassName="fixed left-1/2 top-[10vh] z-[100] w-[min(600px,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-[24px] border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] text-[var(--chat-foreground)] shadow-[0_30px_100px_-40px_rgba(0,0,0,0.8)] outline-none">
        <div className="flex items-center gap-3 border-b border-[var(--chat-border)] px-5 py-4">
          <Search className="size-4 text-[var(--chat-accent)]" aria-hidden="true" />
          <Command.Input autoFocus placeholder="Search TrueMemory" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--chat-subtle-foreground)]" />
          <button type="button" aria-label="Close command palette" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-full text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"><X className="size-4" /></button>
        </div>
        <Command.List className="max-h-[min(64vh,30rem)] overflow-y-auto p-3">
          <Command.Empty className="px-4 py-10 text-center text-sm text-[var(--chat-muted-foreground)]">No TrueMemory destinations found.</Command.Empty>
          <Command.Group heading="Navigate" className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--chat-subtle-foreground)]">
            {ITEMS.map(({ label, detail, href, icon: Icon, keywords }) => (
              <Command.Item key={href} value={label} keywords={[keywords, detail]} onSelect={() => { setOpen(false); router.push(href); }} className="mt-1 flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm outline-none transition-colors data-[selected]:bg-[var(--chat-surface-muted)] hover:bg-[var(--chat-surface-muted)]">
                <span className="flex size-9 items-center justify-center rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-accent)]"><Icon className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span className="block truncate text-xs text-[var(--chat-muted-foreground)]">{detail}</span></span>
                <span className="font-mono text-[9px] text-[var(--chat-subtle-foreground)]">↵</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
