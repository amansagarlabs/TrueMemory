"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent, type ReactNode, type SVGProps } from "react";
import {
  IconBook,
  IconBooks,
  IconCheck,
  IconLogout,
  IconMail,
  IconPlus,
  IconSparkles,
  IconCreditCard,
  IconSettings,
  IconUser,
  IconSearch,
  IconStack2,
  IconBrain,
  IconFileText,
  IconRobot,
  IconWorld,
  IconCloudDownload,
  IconMap,
  IconDatabase,
  IconChartBar,
} from "@tabler/icons-react";
import {
  Archive,
  Activity,
  Boxes,
  ChevronDown,
  ChevronRight,
  GalleryVerticalEnd,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SlidersHorizontal,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Button } from "@/components/ui/button";
import { ChevronsUpDownIcon } from "@/components/chevrons-up-down-icon";
import { DitherAvatar } from "@/components/dither-avatar";
import { ChatSearchCommandMenu } from "@/components/chat/ChatSearchCommandMenu";
import { LineNav } from "@/components/line-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type {
  AuthUser,
  AuthWorkspace,
  RecentConversation,
} from "@/lib/types";
import { fetchRecentConversations, updateConversation, type ConversationAction } from "@/services/api";

export const CHAT_NEW_EVENT = "kontext-chat-new";
export const CHAT_OPEN_EVENT = "kontext-chat-open";
export const CHAT_RECENTS_CHANGED_EVENT = "kontext-chat-recents-changed";
const RECENT_CHAT_BATCH_SIZE = 200;

type ConversationDialogState =
  | { kind: "rename"; chat: RecentConversation }
  | { kind: "delete"; chat: RecentConversation }
  | null;

const PRIMARY_NAVIGATION = [
  { label: "Chats", href: "/chat", icon: MessageCircle },
  { label: "Skills", href: "/skills", icon: IconSparkles },
  { label: "Automations", href: "/projects", icon: Activity },
  { label: "Personalization", href: "/profile", icon: SlidersHorizontal },
  { label: "Models", href: "/connectors", icon: Boxes },
] as const;

type SidebarNavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number;
};

const WORKSPACE_NAVIGATION: SidebarNavItem[] = [
  { label: "Workspaces", href: "/workspaces", icon: IconStack2 },
];

const CONTEXT_NAVIGATION: SidebarNavItem[] = [
  { label: "Memory", href: "/memory", icon: IconBrain },
  { label: "Artifacts", href: "/artifacts", icon: IconFileText },
  { label: "Agent chat", href: "/chat", icon: IconRobot },
  { label: "Skills", href: "/skills", icon: IconSparkles },
  { label: "Benchmarks", href: "/benchmarks", icon: IconChartBar },
];

const RETRIEVAL_NAVIGATION: SidebarNavItem[] = [
  { label: "Search", href: "/AmanCrawl?tool=search", icon: IconSearch },
  { label: "Crawl", href: "/AmanCrawl?tool=crawl", icon: IconWorld },
  { label: "Scrape", href: "/AmanCrawl?tool=scrape", icon: IconCloudDownload },
  { label: "Map", href: "/AmanCrawl?tool=map", icon: IconMap },
  { label: "Crawl history", href: "/AmanCrawl", icon: IconDatabase },
];

const UTILITY_NAVIGATION = [
  { label: "Library", href: "/library", icon: IconBooks },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Archive", href: "/archive", icon: Archive },
] as const;

const NAV_BADGE_CLASS_NAME =
  "right-2 top-2! rounded-md bg-sidebar-primary/10 px-1.5 text-[10px] font-semibold text-sidebar-primary";

export function ChatAppSidebar({
  user,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onSignOut,
  stats,
  features,
  workspacesLoading = false,
}: {
  user: AuthUser;
  workspaces: AuthWorkspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onSignOut: () => void;
  stats?: {
    memory_entries?: number;
    artifacts?: number;
    crawl_jobs?: number;
  };
  features?: { agents: number };
  workspacesLoading?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { state: sidebarState } = useSidebar();
  const [recentChats, setRecentChats] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreRecents, setLoadingMoreRecents] = useState(false);
  const [hasMoreRecents, setHasMoreRecents] = useState(false);
  const [pinnedHistoryOpen, setPinnedHistoryOpen] = useState(false);
  const [recentHistoryOpen, setRecentHistoryOpen] = useState(false);
  const recentLimitRef = useRef(RECENT_CHAT_BATCH_SIZE);
  const [conversationActionError, setConversationActionError] = useState<string | null>(null);
  const [conversationDialog, setConversationDialog] = useState<ConversationDialogState>(null);
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationActionPending, setConversationActionPending] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    workspace: false,
    context: false,
    retrieval: false,
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () =>
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("id"),
  );

  const loadRecents = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchRecentConversations(recentLimitRef.current);
      setRecentChats(items);
      setHasMoreRecents(items.length >= recentLimitRef.current);
    } catch {
      setRecentChats([]);
      setHasMoreRecents(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const showMoreRecents = useCallback(async () => {
    if (loadingMoreRecents || !hasMoreRecents) return;
    const nextLimit = recentLimitRef.current + RECENT_CHAT_BATCH_SIZE;
    setLoadingMoreRecents(true);
    try {
      const items = await fetchRecentConversations(nextLimit);
      recentLimitRef.current = nextLimit;
      setRecentChats(items);
      setHasMoreRecents(items.length >= nextLimit);
    } catch (error) {
      setConversationActionError(
        error instanceof Error ? error.message : "More chats could not be loaded.",
      );
    } finally {
      setLoadingMoreRecents(false);
    }
  }, [hasMoreRecents, loadingMoreRecents]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecents(), 0);
    function handleRecentsChanged(event: Event) {
      const conversationId = (event as CustomEvent<string>).detail;
      if (conversationId) setActiveConversationId(conversationId);
      void loadRecents();
    }

    window.addEventListener(CHAT_RECENTS_CHANGED_EVENT, handleRecentsChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHAT_RECENTS_CHANGED_EVENT, handleRecentsChanged);
    };
  }, [loadRecents]);

  function startNewChat() {
    setActiveConversationId(null);
    router.replace("/chat");
    window.dispatchEvent(new Event(CHAT_NEW_EVENT));
  }

  function openConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    router.replace(`/chat?id=${encodeURIComponent(conversationId)}`);
    window.dispatchEvent(
      new CustomEvent<string>(CHAT_OPEN_EVENT, { detail: conversationId }),
    );
  }

  function openChat(event: React.MouseEvent<HTMLAnchorElement>, conversationId: string) {
    if (pathname !== "/chat") return;
    event.preventDefault();
    openConversation(conversationId);
  }

  function handleConversationAction(chat: RecentConversation, action: ConversationAction) {
    if (action === "rename") {
      setConversationActionError(null);
      setConversationTitle(chat.title);
      setConversationDialog({ kind: "rename", chat });
      return;
    }
    if (action === "delete") {
      setConversationActionError(null);
      setConversationDialog({ kind: "delete", chat });
      return;
    }

    void commitConversationAction(chat, action);
  }

  async function commitConversationAction(
    chat: RecentConversation,
    action: ConversationAction,
    title?: string,
  ) {
    setConversationActionError(null);
    setConversationActionPending(true);
    try {
      await updateConversation(chat.id, action, title);
      if (activeConversationId === chat.id && (action === "archive" || action === "delete")) {
        startNewChat();
      }
      await loadRecents();
      setConversationDialog(null);
    } catch (error) {
      setConversationActionError(
        error instanceof Error ? error.message : "Conversation could not be updated.",
      );
    } finally {
      setConversationActionPending(false);
    }
  }

  function submitConversationDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversationDialog) return;

    if (conversationDialog.kind === "rename") {
      const title = conversationTitle.trim();
      if (!title || title === conversationDialog.chat.title.trim()) {
        if (title === conversationDialog.chat.title.trim()) setConversationDialog(null);
        return;
      }
      void commitConversationAction(conversationDialog.chat, "rename", title);
      return;
    }

    void commitConversationAction(conversationDialog.chat, "delete");
  }

  const displayName =
    user.full_name || user.username || user.email.split("@")[0] || "User";
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ||
    workspaces[0];
  const activeChat = recentChats.find((chat) => chat.id === activeConversationId);
  const isChatRoute = pathname === "/chat";
  const pinnedChats = recentChats.filter((chat) => chat.is_pinned);
  const regularChats = recentChats.filter((chat) => !chat.is_pinned);

  function toggleSection(section: string) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function isNavActive(href: string) {
    return pathname === href.split("?")[0];
  }

  function getNavHref(href: string) {
    if (href === "/workspaces" && activeWorkspaceId) {
      return `${href}?workspace=${encodeURIComponent(activeWorkspaceId)}`;
    }
    return href;
  }

  function renderNavItems(items: readonly SidebarNavItem[]) {
    return (
      <SidebarMenu className="gap-0.5">
        {items.map((item) => (
          <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
              render={<Link href={getNavHref(item.href)} />}
              isActive={isNavActive(item.href)}
              tooltip={item.label}
              className="h-9 rounded-lg px-2.5 text-[13px] font-medium group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            >
              <item.icon aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground" strokeWidth={1.8} />
              <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
            </SidebarMenuButton>
            {item.badge !== undefined && item.badge !== 0 ? (
              <SidebarMenuBadge className={NAV_BADGE_CLASS_NAME}>{item.badge}</SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  return (
    <>
    <Sidebar
      collapsible="icon"
      side="left"
      variant={isChatRoute ? "floating" : "sidebar"}
      className={isChatRoute ? "[&_[data-slot=sidebar-inner]]:rounded-[22px] [&_[data-slot=sidebar-inner]]:border [&_[data-slot=sidebar-inner]]:border-sidebar-border [&_[data-slot=sidebar-inner]]:shadow-[0_1px_2px_rgba(0,0,0,.12),0_16px_42px_-30px_rgba(0,0,0,.72)]" : undefined}
    >
      {isChatRoute && sidebarState === "collapsed" && activeChat && (
        <div className="absolute left-[calc(100%+3rem)] top-1.5 z-50 hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`More options for ${activeChat.title}`}
                  title={`More options for ${activeChat.title}`}
                  className="flex h-9 max-w-[min(20rem,calc(100vw-8rem))] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent"
                />
              }
            >
              <span className="truncate">{activeChat.title}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={4}
              className="w-52 rounded-xl p-1.5"
            >
              <DropdownMenuItem
                onClick={() =>
                  void handleConversationAction(
                    activeChat,
                    activeChat.is_pinned ? "unpin" : "pin",
                  )
                }
                className="min-h-9 gap-2 rounded-lg"
              >
                {activeChat.is_pinned ? (
                  <StarOff className="size-3.5 text-muted-foreground" />
                ) : (
                  <Star className="size-3.5 text-muted-foreground" />
                )}
                {activeChat.is_pinned ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleConversationAction(activeChat, "rename")}
                className="min-h-9 gap-2 rounded-lg"
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleConversationAction(activeChat, "archive")}
                className="min-h-9 gap-2 rounded-lg"
              >
                <Archive className="size-3.5 text-muted-foreground" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleConversationAction(activeChat, "delete")}
                className="min-h-9 gap-2 rounded-lg"
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isChatRoute && sidebarState === "collapsed" && !loading && recentChats.length > 0 ? (
        <div className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 hidden w-[280px] -translate-y-1/2 md:block">
          <span className="absolute bottom-full left-0 mb-2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/45">
            Recent chats
          </span>
          <ScrollArea
            aria-label={`${recentChats.length} recent chats`}
            className="w-full"
            maxHeight="calc(100svh - 112px)"
            orientation="vertical"
            scrollbar={false}
          >
            <LineNav
              activeHref={
                activeConversationId
                  ? `/chat?id=${encodeURIComponent(activeConversationId)}`
                  : undefined
              }
              className="pointer-events-auto w-8 overflow-visible"
              density="dense"
              floatingLabelSide="right"
              items={recentChats.map((chat) => ({
                title: chat.title || "Untitled conversation",
                description: chat.last_message || `${chat.message_count} messages`,
                href: `/chat?id=${encodeURIComponent(chat.id)}`,
              }))}
              lineWidths={{ normal: 8, active: 24, hover: 24 }}
              markerPosition="left"
              orientation="vertical"
              scrollActiveIntoView={false}
              revealLabelOnHover
              onItemClick={(item, event) => {
                const conversationId = new URL(item.href, window.location.origin).searchParams.get("id");
                if (conversationId) openChat(event, conversationId);
              }}
            />
            {hasMoreRecents ? (
              <button
                type="button"
                disabled={loadingMoreRecents}
                className="pointer-events-auto flex min-h-11 w-24 items-center pl-1 text-left text-[10px] font-medium text-sidebar-foreground/45 transition-colors duration-100 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-wait disabled:opacity-50"
                onClick={() => void showMoreRecents()}
              >
                {loadingMoreRecents ? "Loading..." : "Show more"}
              </button>
            ) : null}
          </ScrollArea>
        </div>
      ) : null}

      <SidebarHeader className="gap-0 p-2">
        <div className="relative mb-2 flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1">
          <Link href="/dashboard" aria-label="TrueMemory home" className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.04em] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-sidebar-accent p-1.5 shadow-[0_4px_12px_-7px_rgba(228,95,24,.65)] ring-1 ring-sidebar-border group-data-[collapsible=icon]:size-8">
              <Image src="/truememory-mark.svg" alt="" width={40} height={40} className="size-full object-contain" />
            </span>
            <span className="truncate group-data-[collapsible=icon]:hidden">TrueMemory</span>
          </Link>
          <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
            <button type="button" aria-label="Search TrueMemory" title="Search TrueMemory (Ctrl+K)" onClick={() => window.dispatchEvent(new Event("truememory:open-command-palette"))} className="inline-flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden">
              <IconSearch aria-hidden="true" className="size-4" />
            </button>
            {sidebarState === "expanded" ? (
              <SidebarTrigger aria-label="Collapse sidebar" title="Collapse sidebar" className="relative size-8 rounded-lg border-0 text-sidebar-foreground/60 shadow-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2" />
            ) : null}
          </div>
        </div>
        <div className="flex items-start gap-2 group-data-[collapsible=icon]:hidden">
          <div className="min-w-0 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={activeWorkspace?.name || "Choose workspace"}
                    className="h-11 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/70 px-2.5 shadow-none transition-colors duration-150 hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0!"
                  />
                }
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e67d2b] text-[#171814] shadow-[0_8px_18px_-12px_rgba(128,62,14,0.7)]">
                  <GalleryVerticalEnd aria-hidden="true" className="size-4" />
                </div>
                <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  {workspacesLoading ? (
                    <>
                      <span className="h-3.5 w-28 animate-pulse rounded bg-sidebar-foreground/15" />
                      <span className="mt-1.5 h-2.5 w-16 animate-pulse rounded bg-sidebar-foreground/10" />
                    </>
                  ) : (
                    <>
                      <span className="truncate text-[13px] font-semibold">
                        {activeWorkspace?.name || "My workspace"}
                      </span>
                      <span className="truncate text-[11px] text-sidebar-foreground/58">
                        {user.plan} plan
                      </span>
                    </>
                  )}
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 rounded-xl p-1.5"
                align="start"
                side="bottom"
                sideOffset={6}
              >
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => onSelectWorkspace(workspace.id)}
                    className="min-h-11 gap-3 rounded-lg px-2.5 py-2"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
                      {workspace.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {workspace.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {workspace.platform}
                      </p>
                    </div>
                    {workspace.id === activeWorkspaceId && (
                      <IconCheck
                        aria-hidden="true"
                        className="size-4 shrink-0 text-primary"
                      />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onCreateWorkspace}
                  className="min-h-11 gap-3 rounded-lg px-2.5 py-2"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border">
                    <IconPlus
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Create workspace</p>
                    <p className="text-[10px] text-muted-foreground">
                      Start a separate context space
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>
        <button
          type="button"
          aria-label="Search TrueMemory"
          title="Search TrueMemory (Ctrl+K)"
          onClick={() => window.dispatchEvent(new Event("truememory:open-command-palette"))}
          className="mt-2 hidden min-h-10 w-full items-center justify-start gap-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/50 px-3 text-[12px] font-medium text-sidebar-foreground/65 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
        >
          <IconSearch aria-hidden="true" className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Search TrueMemory</span>
          <kbd className="ml-auto rounded border border-sidebar-border/70 px-1.5 py-0.5 font-mono text-[9px] opacity-60 group-data-[collapsible=icon]:hidden">Ctrl K</kbd>
        </button>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      <SidebarContent className="overflow-hidden px-1.5 py-1.5">
        <SidebarGroup className="shrink-0 p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <div className="flex items-center gap-1.5">
                  <SidebarMenuButton
                    type="button"
                    onClick={startNewChat}
                    tooltip="New chat"
                    isActive={!activeConversationId}
                    className="h-10 flex-1 gap-2 rounded-xl px-3 text-[13px] font-semibold group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                  >
                    <IconPlus aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground/70" />
                    <span className="group-data-[collapsible=icon]:hidden">New chat</span>
                  </SidebarMenuButton>
                </div>
              </SidebarMenuItem>

              <div className="hidden" aria-hidden="true">
                <ChatSearchCommandMenu
                  key={`${user.id}:${activeWorkspaceId || "no-workspace"}`}
                  userId={user.id}
                  workspaceId={activeWorkspaceId}
                  workspaceName={activeWorkspace?.name}
                  recentChats={recentChats}
                  activeConversationId={activeConversationId}
                  onOpenChat={openConversation}
                  onStartNewChat={startNewChat}
                />
              </div>

              {PRIMARY_NAVIGATION.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-medium group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                  >
                    <item.icon aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground" strokeWidth={1.8} />
                    <span className="text-[13px] group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              ))}

              <SidebarMenuItem className="mt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton
                        tooltip="More"
                        isActive={UTILITY_NAVIGATION.some((item) => isNavActive(item.href))}
                        className="h-9 rounded-lg px-2.5 text-[13px] font-medium data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                      />
                    }
                  >
                    <MoreHorizontal aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground/70" />
                    <span className="group-data-[collapsible=icon]:hidden">More</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" sideOffset={10} className="w-64 rounded-xl p-1.5">
                    {[
                      { key: "workspace", label: "Workspace", items: WORKSPACE_NAVIGATION },
                      {
                        key: "context",
                        label: "Context layer",
                        items: CONTEXT_NAVIGATION.map((item) => ({
                          ...item,
                          badge:
                            item.label === "Memory"
                              ? stats?.memory_entries ?? 0
                              : item.label === "Artifacts"
                                ? stats?.artifacts ?? 0
                                : item.label === "Agent chat"
                                  ? features?.agents ?? 0
                                  : undefined,
                        })),
                      },
                      {
                        key: "retrieval",
                        label: "Retrieval tools",
                        items: RETRIEVAL_NAVIGATION.map((item) => ({
                          ...item,
                          badge: item.label === "Crawl history" ? stats?.crawl_jobs ?? 0 : undefined,
                        })),
                      },
                    ].map((section) => (
                      <div key={section.key}>
                        <button
                          type="button"
                          aria-expanded={openSections[section.key]}
                          onClick={() => toggleSection(section.key)}
                          className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[11px] font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        >
                          <span>{section.label}</span>
                          <ChevronRight className={`ml-auto size-3.5 transition-transform duration-150 ${openSections[section.key] ? "rotate-90" : ""}`} aria-hidden="true" />
                        </button>
                        {openSections[section.key] ? <div className="pl-1">{renderNavItems(section.items)}</div> : null}
                      </div>
                    ))}
                    <div className="my-1 border-t border-sidebar-border/60" />
                    {UTILITY_NAVIGATION.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-[12px] font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      >
                        <item.icon aria-hidden="true" className="size-4 text-sidebar-foreground/55" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-1.5 my-2.5 shrink-0 group-data-[collapsible=icon]:mx-1" />

        <SidebarGroup className="min-h-0 flex-1 overflow-hidden p-0 group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent className="min-h-0 flex-1 overflow-hidden">
            <div className="chat-scrollbar h-full space-y-3 overflow-y-auto overscroll-contain pr-0.5">
              {loading ? (
                <RecentChatSkeleton />
              ) : (
                <>
                  <CollapsibleHistorySection
                    label="Pinned"
                    count={pinnedChats.length}
                    open={pinnedHistoryOpen}
                    onToggle={() => setPinnedHistoryOpen((value) => !value)}
                  >
                    {pinnedChats.length ? (
                      <div className="space-y-1">
                        {pinnedChats.map((chat) => (
                          <ConversationRow
                            key={chat.id}
                            chat={chat}
                            active={activeConversationId === chat.id}
                            onOpen={(event) => openChat(event, chat.id)}
                            onAction={handleConversationAction}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="px-2 py-2 text-[11px] leading-5 text-sidebar-foreground/40">
                        No pinned chats yet.
                      </p>
                    )}
                  </CollapsibleHistorySection>

                  <CollapsibleHistorySection
                    label="Recents"
                    count={regularChats.length}
                    open={recentHistoryOpen}
                    onToggle={() => setRecentHistoryOpen((value) => !value)}
                  >
                    {regularChats.length ? (
                      <div className="space-y-1">
                        {regularChats.map((chat) => (
                          <ConversationRow
                            key={chat.id}
                            chat={chat}
                            active={activeConversationId === chat.id}
                            onOpen={(event) => openChat(event, chat.id)}
                            onAction={handleConversationAction}
                            compact
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="px-2 py-2 text-[11px] leading-5 text-sidebar-foreground/40">
                        No saved chats yet.
                      </p>
                    )}

                    {!loading && recentChats.length > 0 && hasMoreRecents ? (
                      <button
                        type="button"
                        disabled={loadingMoreRecents}
                        className="mt-1 flex min-h-9 w-full items-center justify-center rounded-lg text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45 transition-colors duration-100 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-wait disabled:opacity-50"
                        onClick={() => void showMoreRecents()}
                      >
                        {loadingMoreRecents ? "Loading..." : "Show more"}
                      </button>
                    ) : null}
                  </CollapsibleHistorySection>

                  {conversationActionError ? (
                    <p role="alert" className="px-2 py-2 text-[11px] leading-4 text-red-400">
                      {conversationActionError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarSeparator className="mx-0 mb-2" />
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="h-12 min-w-0 flex-1 rounded-lg px-2 data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0!"
                  />
                }
              >
                <DitherAvatar className="size-8 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left leading-none group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-medium">{displayName}</span>
                  <span className="text-[10px] text-sidebar-foreground/50">
                    {user.plan} plan
                  </span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                align="start"
                side="top"
              >
                <div className="flex items-center gap-3 px-2 py-2">
                  <DitherAvatar className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Link href="/subscription">
                  <DropdownMenuItem className="mx-1 mb-1 gap-2.5 rounded-lg border border-[#e67d2b]/25 bg-[#e67d2b]/10 px-2.5 py-2.5 text-[#b94f0d] focus:bg-[#e67d2b]/15 focus:text-[#9d3f07] dark:text-[#f3a05f] dark:focus:text-[#ffc08d]">
                    <div className="flex size-7 items-center justify-center rounded-md bg-[#e67d2b] text-white shadow-[0_5px_14px_-8px_rgba(230,125,43,0.9)]">
                      <IconSparkles className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Upgrade plan</div>
                      <div className="text-[10px] font-normal text-current opacity-65">
                        Unlock higher limits
                      </div>
                    </div>
                  </DropdownMenuItem>
                </Link>
                <Link href="/credits">
                  <DropdownMenuItem className="mx-1 mb-1 gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2.5 text-sidebar-foreground focus:bg-white/[0.06]">
                    <div className="flex size-7 items-center justify-center rounded-md bg-white/10 text-white">
                      <IconCreditCard className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Credits</div>
                      <div className="text-[10px] font-normal text-current opacity-65">
                        Provider spend and balances
                      </div>
                    </div>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <Link href="/profile">
                  <DropdownMenuItem className="gap-2.5 py-2">
                    <IconUser className="size-4 text-sidebar-foreground/50" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem className="gap-2.5 py-2">
                  <IconSettings className="size-4 text-sidebar-foreground/50" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2.5 py-2">
                  <IconBook className="size-4 text-sidebar-foreground/50" />
                  <span>Docs</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2.5 py-2">
                  <IconMail className="size-4 text-sidebar-foreground/50" />
                  <span>Contact us</span>
                </DropdownMenuItem>
                {sidebarState === "collapsed" && (
                  <>
                    <DropdownMenuSeparator />
                    <AnimatedThemeToggler
                      variant="circle"
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-sm hover:bg-accent"
                    >
                      <span>Appearance</span>
                    </AnimatedThemeToggler>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onSignOut}
                  className="gap-2.5 py-2 text-red-400 focus:text-red-300"
                >
                  <IconLogout className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {sidebarState === "expanded" && (
              <AnimatedThemeToggler
                variant="circle"
                aria-label="Switch color theme"
                title="Switch color theme"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/65 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-5"
              />
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <Dialog
        open={conversationDialog !== null}
        onOpenChange={(open) => {
          if (!open && !conversationActionPending) {
            setConversationDialog(null);
            setConversationActionError(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={!conversationActionPending}
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[20px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] shadow-[0_28px_80px_-36px_rgba(64,43,24,0.5)] dark:shadow-black/80 sm:max-w-[440px]"
        >
          <form onSubmit={submitConversationDialog} className="grid gap-5 p-5 sm:p-6">
            <DialogHeader className="gap-2 pr-8">
              <DialogTitle className="text-lg font-semibold tracking-[-0.025em]">
                {conversationDialog?.kind === "delete"
                  ? "Delete conversation?"
                  : "Rename conversation"}
              </DialogTitle>
              <DialogDescription className="leading-6">
                {conversationDialog?.kind === "delete"
                  ? `“${conversationDialog.chat.title}” will be permanently removed. This action cannot be undone.`
                  : "Choose a clear title so this conversation is easy to find later."}
              </DialogDescription>
            </DialogHeader>

            {conversationDialog?.kind === "rename" ? (
              <label className="grid gap-2 text-sm font-medium">
                Chat name
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={conversationTitle}
                  onChange={(event) => setConversationTitle(event.target.value)}
                  className="h-11 rounded-xl border border-[var(--chat-border)] bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-[var(--chat-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]/25"
                  placeholder="Conversation title"
                />
              </label>
            ) : null}

            {conversationActionError ? (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {conversationActionError}
              </p>
            ) : null}

            <DialogFooter className="-mx-5 -mb-5 mt-1 px-5 sm:-mx-6 sm:-mb-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={conversationActionPending}
                onClick={() => {
                  setConversationDialog(null);
                  setConversationActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={conversationDialog?.kind === "delete" ? "destructive" : "default"}
                size="lg"
                disabled={
                  conversationActionPending ||
                  (conversationDialog?.kind === "rename" && !conversationTitle.trim())
                }
              >
                {conversationActionPending
                  ? "Saving…"
                  : conversationDialog?.kind === "delete"
                    ? "Delete"
                    : "Save name"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
    {sidebarState === "collapsed" ? (
      <SidebarTrigger
        aria-label="Expand sidebar"
        title="Expand sidebar"
        style={{ left: isChatRoute ? "calc(var(--sidebar-width-icon) + 20px)" : "calc(var(--sidebar-width-icon) + 6px)" }}
        className="fixed top-2 z-[80] hidden size-8 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-surface-raised)] text-[var(--chat-foreground)] shadow-[0_8px_24px_-12px_rgba(0,0,0,.55)] backdrop-blur-xl transition-[background-color,color,transform] hover:bg-[var(--chat-highlight)] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] md:inline-flex"
      />
    ) : null}
    </>
  );
}

function RecentChatSkeleton() {
  return (
    <div className="space-y-2 px-2 py-2" aria-label="Loading recent conversations">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg py-1">
          <div className="h-3 w-4/5 animate-pulse rounded bg-sidebar-accent" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-sidebar-accent/70" />
        </div>
      ))}
    </div>
  );
}

function CollapsibleHistorySection({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${label} ${count} chats`}
        title={`${label} ${count > 0 ? `(${count})` : ""}`.trim()}
        className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sidebar-foreground/75 transition-[background-color,color,transform] duration-100 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`ml-auto size-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-150 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      {open ? <div className="space-y-1">{children}</div> : null}
    </section>
  );
}

function ConversationRow({
  chat,
  active,
  compact = false,
  onOpen,
  onAction,
}: {
  chat: RecentConversation;
  active: boolean;
  compact?: boolean;
  onOpen: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onAction: (chat: RecentConversation, action: ConversationAction) => void;
}) {
  return (
    <div
      className={`group/chat-row relative rounded-xl transition-colors duration-150 ease-out hover:bg-sidebar-accent focus-within:bg-sidebar-accent ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
      }`}
    >
      <Link
        href={`/chat?id=${encodeURIComponent(chat.id)}`}
        onClick={onOpen}
        className={`block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
          compact ? "px-2.5 py-1.5 pr-14" : "px-2.5 py-2 pr-16"
        }`}
      >
        <p className={`truncate font-semibold leading-5 ${compact ? "text-[13px]" : "text-[14px]"} text-sidebar-foreground/85`}>
          {chat.title || "Untitled conversation"}
        </p>
      </Link>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {chat.is_pinned ? (
          <Pin aria-label="Pinned" className="size-4 shrink-0 text-[#e67d2b]" />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`More options for ${chat.title || "conversation"}`}
                className={`inline-flex items-center justify-center rounded-md text-sidebar-foreground/45 opacity-0 translate-y-0.5 transition-[opacity,background-color,color,transform] duration-150 ease-out hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/chat-row:opacity-100 group-hover/chat-row:translate-y-0 data-popup-open:opacity-100 data-popup-open:translate-y-0 ${
                  compact ? "size-6" : "size-7"
                }`}
              />
            }
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={8} className="w-48 rounded-xl p-1.5">
            <DropdownMenuItem
              onClick={() => void onAction(chat, "rename")}
              className="min-h-9 gap-2 rounded-lg"
            >
              <Pencil className="size-3.5 text-muted-foreground" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void onAction(chat, chat.is_pinned ? "unpin" : "pin")}
              className="min-h-9 gap-2 rounded-lg"
            >
              {chat.is_pinned ? (
                <PinOff className="size-3.5 text-muted-foreground" />
              ) : (
                <Pin className="size-3.5 text-muted-foreground" />
              )}
              {chat.is_pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void onAction(chat, "archive")}
              className="min-h-9 gap-2 rounded-lg"
            >
              <Archive className="size-3.5 text-muted-foreground" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void onAction(chat, "delete")}
              className="min-h-9 gap-2 rounded-lg"
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
