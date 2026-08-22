"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Folder,
  History,
  MessageSquareText,
  Plus,
  Search,
  X,
} from "lucide-react";

import { loadActiveProjectId, saveActiveProjectId } from "@/lib/active-project";
import type { AuthProject, RecentConversation } from "@/lib/types";
import { fetchProjects } from "@/services/projects";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type ChatSearchCommandMenuProps = {
  userId: string;
  workspaceId?: string;
  workspaceName?: string;
  recentChats: RecentConversation[];
  activeConversationId: string | null;
  onOpenChat: (conversationId: string) => void;
  onStartNewChat: () => void;
};

export function ChatSearchCommandMenu({
  userId,
  workspaceId,
  workspaceName,
  recentChats,
  activeConversationId,
  onOpenChat,
  onStartNewChat,
}: ChatSearchCommandMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleRecentCount, setVisibleRecentCount] = useState(10);
  const [projects, setProjects] = useState<AuthProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(() => Boolean(workspaceId && userId));
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState(() =>
    workspaceId && userId ? loadActiveProjectId(userId, workspaceId) : "",
  );
  const hasProjectScope = Boolean(workspaceId && userId);
  const visibleProjects = hasProjectScope ? projects : [];
  const visibleProjectsLoading = hasProjectScope ? projectsLoading : false;
  const visibleProjectsError = hasProjectScope ? projectsError : null;
  const visibleActiveProjectId = hasProjectScope ? activeProjectId : "";
  const visibleRecentChats = recentChats.slice(0, visibleRecentCount);
  const hasMoreRecentChats = recentChats.length > visibleRecentCount;

  useEffect(() => {
    if (!workspaceId || !userId) return;

    let active = true;

    void fetchProjects(workspaceId)
      .then((items) => {
        if (!active) return;
        setProjects(items);

        const savedProjectId = loadActiveProjectId(userId, workspaceId);
        if (savedProjectId && !items.some((project) => project.id === savedProjectId)) {
          setActiveProjectId("");
          saveActiveProjectId(userId, workspaceId, null);
        }
      })
      .catch((error) => {
        if (!active) return;
        setProjects([]);
        setProjectsError(
          error instanceof Error ? error.message : "Projects could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, workspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const openHistory = () => setOpen(true);
    window.addEventListener("kontext:open-chat-history", openHistory);
    return () =>
      window.removeEventListener("kontext:open-chat-history", openHistory);
  }, []);

  useEffect(() => {
    const openSearch = () => setOpen(true);
    window.addEventListener("kontext:open-chat-search", openSearch);
    return () =>
      window.removeEventListener("kontext:open-chat-search", openSearch);
  }, []);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setVisibleRecentCount(10);
  }

  function openConversation(conversationId: string) {
    closeMenu();
    onOpenChat(conversationId);
  }

  function openProject(project: AuthProject) {
    if (!workspaceId) return;
    closeMenu();
    setActiveProjectId(project.id);
    saveActiveProjectId(userId, workspaceId, project.id);
    router.replace(`/chat?project=${encodeURIComponent(project.id)}`);
  }

  function openQuickAction(action: "new-chat" | "projects" | "activity") {
    closeMenu();
    if (action === "new-chat") {
      onStartNewChat();
      return;
    }
    if (action === "projects") {
      router.push("/projects");
      return;
    }
    router.push("/activity?view=conversations");
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        tooltip="Search chats"
        aria-haspopup="dialog"
        aria-expanded={open}
        isActive={open}
        onClick={() => setOpen(true)}
        className="h-9 rounded-lg px-2.5 text-[13px] font-medium group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
      >
        <Search className="size-4 shrink-0 text-sidebar-foreground/72" strokeWidth={1.8} aria-hidden="true" />
        <span className="group-data-[collapsible=icon]:hidden">Search chats</span>
      </SidebarMenuButton>

      <Command.Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) closeMenu();
        }}
        label="Search chats and projects"
        overlayClassName="fixed inset-0 z-[80] bg-[var(--chat-background)]/55 backdrop-blur-sm"
        contentClassName="fixed left-1/2 top-[10vh] z-[80] w-[min(560px,calc(100vw-1rem))] -translate-x-1/2 overflow-hidden rounded-[24px] border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] shadow-[0_30px_100px_-40px_rgba(0,0,0,0.8)] outline-none"
      >
        <div className="border-b border-[var(--chat-border)] px-5 py-5">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-accent)]/90">
              <Search className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--chat-muted-foreground)]">
                Search workspace
              </p>
              <p className="truncate text-[15px] font-semibold leading-5 text-[var(--chat-foreground)]">
                {workspaceName ? `Searching ${workspaceName}` : "Search chats and projects"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close search"
              onClick={closeMenu}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-subtle-foreground)] transition-[background-color,color,transform] duration-150 hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <label className="mt-5 flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-4 text-[var(--chat-muted-foreground)]">
            <Search className="size-4 shrink-0 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search chats and projects"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--chat-foreground)] outline-none placeholder:text-[var(--chat-subtle-foreground)]"
            />
            <kbd className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-background)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
              esc
            </kbd>
          </label>
        </div>

        <Command.List className="max-h-[min(60vh,36rem)] overflow-y-auto px-4 py-4">
          <Command.Group heading="Quick actions" className="pb-1 ">
            <div className="mt-3 flex flex-wrap gap-2">
              <Command.Item
                value="New chat"
                keywords={["start conversation", "fresh chat", "new message"]}
                onSelect={() => openQuickAction("new-chat")}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--chat-border)] bg-transparent px-3.5 text-sm outline-none transition-[background-color,border-color,transform] duration-150 data-[selected]:border-[var(--chat-accent)]/40 data-[selected]:bg-[var(--chat-surface-muted)]/50 hover:bg-[var(--chat-surface-muted)]/50 active:scale-[0.98]"
              >
                <Plus className="size-4 shrink-0 text-[var(--chat-accent)]" aria-hidden="true" />
                <span className="font-medium">New chat</span>
              </Command.Item>

              <Command.Item
                value="Projects page"
                keywords={["projects", "workspace projects", "project manager"]}
                onSelect={() => openQuickAction("projects")}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--chat-border)] bg-transparent px-3.5 text-sm outline-none transition-[background-color,border-color,transform] duration-150 data-[selected]:border-[var(--chat-accent)]/40 data-[selected]:bg-[var(--chat-surface-muted)]/50 hover:bg-[var(--chat-surface-muted)]/50 active:scale-[0.98]"
              >
                <Folder className="size-4 shrink-0 text-[var(--chat-accent)]" aria-hidden="true" />
                <span className="font-medium">Browse projects</span>
              </Command.Item>

              <Command.Item
                value="Activity history"
                keywords={["activity", "conversation history", "recent work"]}
                onSelect={() => openQuickAction("activity")}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--chat-border)] bg-transparent px-3.5 text-sm outline-none transition-[background-color,border-color,transform] duration-150 data-[selected]:border-[var(--chat-accent)]/40 data-[selected]:bg-[var(--chat-surface-muted)]/50 hover:bg-[var(--chat-surface-muted)]/50 active:scale-[0.98]"
              >
                <History className="size-4 shrink-0 text-[var(--chat-accent)]" aria-hidden="true" />
                <span className="font-medium">Open activity</span>
              </Command.Item>
            </div>
          </Command.Group>

          <Command.Separator className="my-4 h-px bg-[var(--chat-border)]" />

          <div className="rounded-[22px] border border-[var(--chat-border)] bg-[var(--chat-background)]/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--chat-muted-foreground)]">
                  Recent history
                </p>
                <p className="text-xs text-[var(--chat-subtle-foreground)] mb-2">
                  Recently opened chats
                </p>
              </div>
            </div>

            {visibleRecentChats.length ? (
              visibleRecentChats.map((chat) => (
                <Command.Item
                  key={chat.id}
                  value={chat.title || "Untitled conversation"}
                  keywords={[
                    chat.last_message || "",
                    String(chat.message_count),
                    chat.is_pinned ? "pinned" : "",
                    "conversation",
                  ]}
                  onSelect={() => openConversation(chat.id)}
                  className={`mt-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm outline-none transition-[background-color,transform] duration-100 data-[selected]:bg-[var(--chat-surface-muted)]/60 data-[selected]:text-[var(--chat-foreground)] hover:bg-[var(--chat-surface-muted)]/60 ${
                    activeConversationId === chat.id ? "bg-transparent" : ""
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-accent)]">
                    <MessageSquareText className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <span className="truncate">{chat.title || "Untitled conversation"}</span>
                      {chat.is_pinned ? (
                        <span className="rounded-md border border-[var(--chat-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">
                          Pinned
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-[var(--chat-muted-foreground)]">
                      {chat.last_message || `${chat.message_count} messages`}
                    </span>
                  </span>
                </Command.Item>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--chat-border)] px-3 py-4 text-sm text-[var(--chat-muted-foreground)]">
                No saved chats yet.
              </div>
            )}
            {hasMoreRecentChats ? (
              <button
                type="button"
                onClick={() => setVisibleRecentCount((count) => count + 10)}
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 text-[11px] font-medium text-[var(--chat-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                Load more
                <span className="text-[var(--chat-subtle-foreground)]">
                  ({Math.max(recentChats.length - visibleRecentCount, 0)} more)
                </span>
              </button>
            ) : null}
          </div>

          <Command.Separator className="my-4 h-px bg-[var(--chat-border)]" />

          <Command.Group heading="Projects" className="pb-1">
            {visibleProjectsLoading ? (
              <Command.Loading className="mt-1 rounded-xl border border-dashed border-[var(--chat-border)] px-3 py-4 text-sm text-[var(--chat-muted-foreground)]">
                Loading projects...
              </Command.Loading>
            ) : null}

            {visibleProjectsError ? (
              <div className="mt-1 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs leading-5 text-amber-200">
                {visibleProjectsError}
              </div>
            ) : null}

            {!visibleProjectsLoading && visibleProjects.length ? (
              visibleProjects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={project.name}
                  keywords={[project.description || "", "project", workspaceName || ""]}
                  onSelect={() => openProject(project)}
                  className={`mt-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm outline-none transition-[background-color,transform] duration-100 data-[selected]:bg-[var(--chat-surface-muted)]/60 data-[selected]:text-[var(--chat-foreground)] hover:bg-[var(--chat-surface-muted)]/60 ${
                    visibleActiveProjectId === project.id ? "bg-transparent" : ""
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-accent)]">
                    <Folder className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <span className="truncate">{project.name}</span>
                      {visibleActiveProjectId === project.id ? (
                        <span className="rounded-md border border-[var(--chat-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">
                          Active
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-[var(--chat-muted-foreground)]">
                      {project.description || "No description added"}
                    </span>
                  </span>
                </Command.Item>
              ))
            ) : null}
          </Command.Group>

          <Command.Empty className="rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-muted-foreground)]">
            No matches for {query}.
          </Command.Empty>
        </Command.List>
      </Command.Dialog>
    </SidebarMenuItem>
  );
}
