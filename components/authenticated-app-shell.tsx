"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Grid2X2, GitBranch, Home, LogOut, MessageCircle, Network, Plus, Search, Settings } from "lucide-react";

import { ChatAppSidebar } from "@/components/chat-app-sidebar";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { TrueMemoryCommandPalette } from "@/components/true-memory-command-palette";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { clearAuthSession, isAuthenticated, loadAuthUser } from "@/lib/auth";
import type { AuthUser, AuthWorkspace } from "@/lib/types";
import {
  loadActiveWorkspaceId,
  normalizeWorkspaceNames,
  saveActiveWorkspaceId,
} from "@/lib/workspaces";
import { fetchDashboardStats, type DashboardStats } from "@/services/dashboard";
import { fetchWorkspaces, persistWorkspace } from "@/services/workspaces";

const PLAN_AGENTS: Record<AuthUser["plan"], number> = { free: 0, pro: 5, team: -1, enterprise: -1 };

const CHAT_TOP_NAVIGATION = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Integrations", href: "/connectors", icon: GitBranch },
  { label: "Graph", href: "/memory?view=graph", icon: Network },
  { label: "Memories", href: "/memory", icon: Grid2X2 },
  { label: "Assistant", href: "/chat", icon: MessageCircle },
] as const;

function NavigationIsland({
  pathname,
  memoryView,
}: {
  pathname: string;
  memoryView?: string | null;
}) {
  return (
    <nav aria-label="Primary navigation" className="chat-top-nav-island absolute left-1/2 top-0 hidden -translate-x-1/2 items-center justify-between gap-0.5 rounded-b-[20px] border-x border-b border-[var(--chat-nav-border)] bg-[var(--chat-nav-shell)] px-2 pb-1.5 pt-2 shadow-[0_1px_2px_rgba(0,0,0,.16),0_14px_34px_-24px_rgba(0,0,0,.72)] md:flex">
      {CHAT_TOP_NAVIGATION.map((item) => {
        const itemPath = item.href.split("?")[0];
        const active = item.label === "Graph"
          ? pathname === "/memory" && memoryView === "graph"
          : item.label === "Memories"
            ? (pathname === "/memory" || pathname === "/brain-memory") && memoryView !== "graph"
            : item.label === "Integrations"
              ? pathname === "/connectors" || pathname === "/integrations"
              : pathname === itemPath;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`group inline-flex h-10 min-w-10 items-center justify-center overflow-hidden rounded-[12px] px-3 text-xs font-medium transition-[width,background-color,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] motion-reduce:transition-none ${
              active
                ? "w-auto bg-[var(--chat-nav-active)] text-[var(--chat-accent)] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                : "w-10 text-[var(--chat-muted-foreground)] hover:w-auto hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] focus-visible:w-auto"
            }`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-150 ease-out motion-reduce:transition-none ${active ? "ml-2 max-w-24 opacity-100" : "ml-0 max-w-0 opacity-0 group-hover:ml-2 group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-24 group-focus-visible:opacity-100"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function QueryAwareNavigationIsland({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  return <NavigationIsland pathname={pathname} memoryView={searchParams.get("view")} />;
}

export function AuthenticatedAppShell({
  children,
  variant = "app",
}: {
  children: ReactNode;
  variant?: "app" | "chat";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [stats, setStats] = useState<DashboardStats | undefined>();
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    const currentUser = loadAuthUser();
    if (!currentUser) return;
    setUser(currentUser);
    setWorkspacesLoading(true);
    try {
      const remote = normalizeWorkspaceNames(await fetchWorkspaces());
      if (remote.length) {
        const savedWorkspaceId = loadActiveWorkspaceId(currentUser.id);
        const activeRemote = remote.some((workspace) => workspace.id === savedWorkspaceId)
          ? savedWorkspaceId
          : remote[0]?.id;
        setWorkspaces(remote);
        if (activeRemote) {
          setActiveWorkspaceId(activeRemote);
          saveActiveWorkspaceId(currentUser.id, activeRemote);
        }
      } else {
        const created = await persistWorkspace({
          id: crypto.randomUUID(),
          name: "My workspace",
          platform: "Kontext Memory",
          last_active: new Date().toISOString(),
        });
        setWorkspaces([created]);
        setActiveWorkspaceId(created.id);
        saveActiveWorkspaceId(currentUser.id, created.id);
      }
      window.dispatchEvent(new Event("kontext-chat-recents-changed"));
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!isAuthenticated()) return;

      void refreshWorkspaces().catch(() => {
        // The backend is authoritative; leave the empty state visible on failure.
      });
      void fetchDashboardStats("both").then(setStats).catch(() => setStats(undefined));
    });

    window.addEventListener("kontext-workspaces-changed", refreshWorkspaces);
    window.addEventListener("kontext-auth-user-changed", refreshWorkspaces);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("kontext-workspaces-changed", refreshWorkspaces);
      window.removeEventListener("kontext-auth-user-changed", refreshWorkspaces);
    };
  }, [refreshWorkspaces]);

  function createWorkspace(name: string) {
    if (!user) return;
    const newWorkspace: AuthWorkspace = {
      id: crypto.randomUUID(),
      name,
      platform: "Kontext Memory",
      last_active: new Date().toISOString(),
    };
    const next = [
      ...workspaces,
      newWorkspace,
    ];
    setWorkspaces(next);
    setActiveWorkspaceId(newWorkspace.id);
    saveActiveWorkspaceId(user.id, newWorkspace.id);
    void persistWorkspace(newWorkspace)
      .then(() => {
        window.dispatchEvent(new Event("kontext-workspaces-changed"));
      })
      .catch(() => setWorkspaces((current) => current.filter((item) => item.id !== newWorkspace.id)));
  }

  function selectWorkspace(workspaceId: string) {
    if (!user) return;
    if (workspaceId === activeWorkspaceId) return;
    setActiveWorkspaceId(workspaceId);
    saveActiveWorkspaceId(user.id, workspaceId);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (workspace) void persistWorkspace(workspace).catch(() => undefined);
    window.dispatchEvent(new Event("kontext-chat-recents-changed"));
    if (pathname === "/chat") {
      router.replace("/chat");
      window.dispatchEvent(new Event("kontext-chat-new"));
    }
  }

  function signOut() {
    clearAuthSession();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="min-h-svh bg-[var(--chat-frame)]">
      <SidebarProvider className="bg-[var(--chat-frame)]">
        <div className="m-2 mr-0 hidden h-[calc(100svh-1rem)] w-64 shrink-0 flex-col gap-4 rounded-[22px] border border-sidebar-border bg-sidebar p-3 shadow-[0_16px_42px_-30px_rgba(0,0,0,.5)] md:flex">
          <div className="h-12 animate-pulse rounded-xl bg-sidebar-accent" />
          <div className="space-y-2">
            {["w-4/5", "w-3/5", "w-2/3", "w-4/5"].map((width, index) => <div key={`sidebar-skeleton-${index}`} className={`h-9 animate-pulse rounded-lg bg-sidebar-accent/70 ${width}`} />)}
          </div>
        </div>
        <SidebarInset className="m-2 h-[calc(100svh-1rem)] min-w-0 overflow-hidden rounded-[24px] border border-[var(--chat-frame-border)] bg-[var(--chat-background)] md:ml-2" />
      </SidebarProvider>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-[var(--chat-frame)] text-[var(--chat-foreground)]">
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-[var(--chat-foreground)] px-4 py-2 text-sm font-medium text-[var(--chat-background)] focus:not-sr-only">
        Skip to content
      </a>
      <SidebarProvider className="bg-[var(--chat-frame)]">
        <ChatAppSidebar user={user} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelectWorkspace={selectWorkspace} onCreateWorkspace={() => setCreateDialogOpen(true)} onSignOut={signOut} stats={stats} features={{ agents: PLAN_AGENTS[user.plan] }} workspacesLoading={workspacesLoading} />
        <SidebarInset id="main-content" className="m-2 h-[calc(100svh-1rem)] min-h-0 min-w-0 self-start overflow-hidden rounded-[24px] border border-[var(--chat-frame-border)] bg-[var(--chat-background)] text-[var(--chat-foreground)] shadow-[0_1px_2px_rgba(0,0,0,.08),0_18px_48px_-34px_rgba(0,0,0,.65)] md:ml-0">
        <header className="sticky top-0 z-[60] h-16 border-b border-[var(--chat-border)] bg-[color-mix(in_srgb,var(--chat-background)_88%,transparent)] backdrop-blur-xl">
          <div className="relative mx-auto flex h-full items-center gap-4 px-4 sm:px-6">
            <SidebarTrigger className="inline-flex size-9 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-muted-foreground)] shadow-sm transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] md:hidden" />
            <Suspense fallback={<NavigationIsland pathname={pathname} />}>
              <QueryAwareNavigationIsland pathname={pathname} />
            </Suspense>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => window.dispatchEvent(new Event("truememory:open-command-palette"))} aria-label="Search TrueMemory" className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--chat-border)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)]"><Search className="size-4" /></button>
              <button type="button" onClick={() => setCreateDialogOpen(true)} aria-label="Add memory" className="hidden size-9 items-center justify-center rounded-full border border-[var(--chat-border)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] sm:inline-flex"><Plus className="size-4" /></button>
              <Link href="/profile" aria-label="Settings and profile" className="hidden size-9 items-center justify-center rounded-full border border-[var(--chat-border)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] sm:inline-flex"><Settings className="size-4" /></Link>
              <button type="button" onClick={signOut} aria-label="Log out" className="size-9 rounded-full border border-[var(--chat-border)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)]"><LogOut className="mx-auto size-4" /></button>
            </div>
          </div>
        </header>
        <TrueMemoryCommandPalette />
        <div className={variant === "chat" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto"}>{children}</div>
        <CreateWorkspaceDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSubmit={createWorkspace} />
        </SidebarInset>
      </SidebarProvider>
      </div>
    );
}
