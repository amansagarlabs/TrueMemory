"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ChatAppSidebar } from "@/components/chat-app-sidebar";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { clearAuthSession, isAuthenticated, loadAuthUser } from "@/lib/auth";
import type { AuthUser, AuthWorkspace } from "@/lib/types";
import {
  loadActiveWorkspaceId,
  normalizeWorkspaceNames,
  saveActiveWorkspaceId,
} from "@/lib/workspaces";
import {
  fetchDashboardStats,
  type DashboardStats,
} from "@/services/dashboard";
import { fetchWorkspaces, persistWorkspace } from "@/services/workspaces";

const PLAN_AGENTS: Record<AuthUser["plan"], number> = {
  free: 0,
  pro: 5,
  team: -1,
  enterprise: -1,
};

export function AuthenticatedAppShell({
  children,
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
      void fetchDashboardStats("both")
        .then(setStats)
        .catch(() => setStats(undefined));
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
      <SidebarProvider>
        <div className="hidden h-svh w-64 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-3 md:flex">
          <div className="h-12 animate-pulse rounded-xl bg-sidebar-accent" />
          <div className="space-y-2">
            {["w-4/5", "w-3/5", "w-2/3", "w-4/5"].map((width, index) => (
              <div key={`sidebar-skeleton-${index}`} className={`h-9 animate-pulse rounded-lg bg-sidebar-accent/70 ${width}`} />
            ))}
          </div>
        </div>
        <SidebarInset className="min-w-0 overflow-hidden" />
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <ChatAppSidebar
        user={user}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={() => setCreateDialogOpen(true)}
        onSignOut={signOut}
        stats={stats}
        features={{ agents: PLAN_AGENTS[user.plan] }}
        workspacesLoading={workspacesLoading}
      />

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={createWorkspace}
      />

      <SidebarInset className="min-w-0 overflow-hidden">
        <SidebarTrigger className="fixed left-3 top-3 z-[70] flex size-9 rounded-lg border border-[#dfd3c5] bg-[#fffaf6] text-[#6f6258] shadow-sm transition-[background-color,color,transform] duration-150 hover:bg-[#f3e9df] hover:text-[#201510] active:scale-[0.97] dark:border-white/[0.08] dark:bg-[#0d0d0c] dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white/80 md:hidden" />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
