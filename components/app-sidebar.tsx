"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  IconDashboard,
  IconUser,
  IconStack2,
  IconBrain,
  IconFileText,
  IconRobot,
  IconSearch,
  IconWorld,
  IconCloudDownload,
  IconMap,
  IconDatabase,
  IconChartBar,
  IconPlus,
  IconCheck,
  IconSettings,
  IconBook,
  IconMail,
  IconCreditCard,
  IconLogout,
  IconSparkles,
  type Icon,
} from "@tabler/icons-react";
import { GalleryVerticalEnd } from "lucide-react";
import { ChevronsUpDownIcon } from "@/components/chevrons-up-down-icon";
import { DitherAvatar, AvatarPicker } from "@/components/dither-avatar";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

type NavItem = {
  label: string;
  icon: Icon;
  href: string;
  badge?: number | string;
};

type Workspace = {
  id: string;
  name: string;
  platform?: string;
  last_active?: string;
};

const NAV_BADGE_CLASS_NAME =
  "right-2 top-2! rounded-md bg-sidebar-primary/10 px-1.5 text-[10px] font-semibold text-sidebar-primary";

interface AppSidebarProps {
  displayName: string;
  email?: string;
  planLabel: string;
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace?: (id: string) => void;
  onCreateWorkspace?: () => void;
  onSignOut?: () => void;
  stats?: {
    memory_entries?: number;
    artifacts?: number;
    crawl_jobs?: number;
  };
  features?: {
    agents: number;
  };
}

export function AppSidebar({
  displayName,
  email,
  planLabel,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onSignOut,
  stats,
  features,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const chevronsRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  const workspaceItems: NavItem[] = [
    { label: "Dashboard", icon: IconDashboard, href: "/dashboard" },
    { label: "Profile", icon: IconUser, href: "/profile" },
    { label: "Workspaces", icon: IconStack2, badge: workspaces.length, href: "/workspaces" },
  ];

  const contextItems: NavItem[] = [
    { label: "Memory", icon: IconBrain, badge: stats?.memory_entries ?? 0, href: "/memory" },
    { label: "Artifacts", icon: IconFileText, badge: stats?.artifacts ?? 0, href: "/artifacts" },
    { label: "Agent chat", icon: IconRobot, badge: features?.agents ?? 0, href: "/chat" },
    { label: "Skills", icon: IconSparkles, href: "/skills" },
    { label: "Benchmarks", icon: IconChartBar, href: "/benchmarks" },
  ];

  const retrievalItems: NavItem[] = [
    {
      label: "Search",
      icon: IconSearch,
      href: "/AmanCrawl?tool=search",
    },
    {
      label: "Crawl",
      icon: IconWorld,
      href: "/AmanCrawl?tool=crawl",
    },
    {
      label: "Scrape",
      icon: IconCloudDownload,
      href: "/AmanCrawl?tool=scrape",
    },
    {
      label: "Map",
      icon: IconMap,
      href: "/AmanCrawl?tool=map",
    },
    { label: "Crawl History", icon: IconDatabase, badge: stats?.crawl_jobs ?? 0, href: "/AmanCrawl" },
  ];

  return (
    <Sidebar collapsible="icon" side="left">
      <SidebarTrigger className="absolute -right-11 top-[18px] z-20 hidden size-8 rounded-md text-sidebar-foreground/50 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.97] focus-visible:ring-2 md:flex group-data-[collapsible=icon]:top-2" />

      {/* Header - Workspace Switcher */}
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="h-12 rounded-lg bg-sidebar-accent px-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:bg-transparent"
                  />
                }
              >
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                  <GalleryVerticalEnd className="size-4" aria-hidden="true" />
                </div>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">
                    {activeWorkspace?.name || "Kontext"}
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/65">
                    {planLabel}
                  </span>
                </div>
                <ChevronsUpDownIcon
                  ref={chevronsRef}
                  className="ml-auto size-4 shrink-0 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => onSelectWorkspace?.(workspace.id)}
                    className="gap-2 py-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md bg-sidebar-accent text-xs font-medium text-sidebar-foreground">
                      {workspace.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate text-sm">{workspace.name}</span>
                    {workspace.id === activeWorkspaceId && (
                      <IconCheck className="size-4 shrink-0 text-sidebar-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
                {onCreateWorkspace && (
                  <>
                    <div className="h-px bg-sidebar-border mx-1 my-1" />
                    <DropdownMenuItem onClick={() => onCreateWorkspace()} className="gap-3 py-2.5">
                      <div className="flex size-6 items-center justify-center rounded-md border border-dashed border-sidebar-border">
                        <IconPlus className="size-3.5 text-sidebar-foreground/50" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Create workspace</span>
                        <span className="text-[11px] text-sidebar-foreground/50">Collaborate in a shared workspace</span>
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      {/* Content */}
      <SidebarContent className="px-2 py-2">
        {/* Workspace */}
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarGroupLabel className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2">
              {workspaceItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-medium data-active:font-semibold group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1.5!"
                  >
                    <item.icon className="size-5! shrink-0" stroke={1.6} />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                  {item.badge !== undefined && Number(item.badge) !== 0 && (
                    <SidebarMenuBadge className={NAV_BADGE_CLASS_NAME}>
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2 my-1 group-data-[collapsible=icon]:mx-1 group-data-[collapsible=icon]:my-2" />

        {/* Context Layer */}
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarGroupLabel className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            Context layer
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2">
              {contextItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-medium data-active:font-semibold group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1.5!"
                  >
                    <item.icon className="size-5! shrink-0" stroke={1.6} />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                  {item.badge !== undefined && Number(item.badge) !== 0 && (
                    <SidebarMenuBadge className={NAV_BADGE_CLASS_NAME}>
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2 my-1 group-data-[collapsible=icon]:mx-1 group-data-[collapsible=icon]:my-2" />

        {/* Retrieval Tools */}
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarGroupLabel className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            Retrieval tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2">
              {retrievalItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === "/AmanCrawl" && item.href === "/AmanCrawl"}
                    tooltip={item.label}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-medium data-active:font-semibold group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1.5!"
                  >
                    <item.icon className="size-5! shrink-0" stroke={1.6} />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                  {item.badge !== undefined && Number(item.badge) !== 0 && (
                    <SidebarMenuBadge className={NAV_BADGE_CLASS_NAME}>
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-2">
        <SidebarSeparator className="mx-0 mb-2" />
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-12 min-w-0 flex-1 rounded-lg px-2 data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0!" />}>
                <DitherAvatar className="size-8 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none text-left group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-medium">{displayName}</span>
                  <span className="text-[10px] text-sidebar-foreground/50">{planLabel} plan</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                align="start"
                side="top"
              >
                {/* User info with clickable avatar */}
                <div className="flex items-center gap-3 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setAvatarPickerOpen(true)}
                    className="relative group/avatar"
                  >
                    <DitherAvatar className="size-9" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover/avatar:opacity-100">
                      <span className="text-[10px] font-medium text-white">Change</span>
                    </span>
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{displayName}</span>
                    <span className="text-[11px] text-sidebar-foreground/50">{email || `${planLabel} plan`}</span>
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

                {/* Menu items */}
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
                      aria-label="Switch color theme"
                      title="Switch between light and dark theme"
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-sm text-popover-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                    >
                      <span>Appearance</span>
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        Light / Dark
                      </span>
                    </AnimatedThemeToggler>
                  </>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={onSignOut} className="gap-2.5 py-2 text-red-400 focus:text-red-300">
                  <IconLogout className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {sidebarState === "expanded" && (
              <AnimatedThemeToggler
                variant="circle"
                aria-label="Switch color theme"
                title="Switch between light and dark theme"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/65 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-5 [&_svg]:shrink-0"
              />
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <AvatarPicker open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen} />
    </Sidebar>
  );
}
