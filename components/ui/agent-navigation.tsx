"use client"

import Link from "next/link"
import {
  Globe2,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Sparkles,
  X,
} from "lucide-react"
import { useState } from "react"

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"
import { ContextMark } from "@/components/brand/ContextMark"

type AgentNavigationProps = {
  active?: "workspace" | "crawl" | "chat"
  compact?: boolean
  onCollapse?: () => void
  variant?: "header" | "rail"
}

const items = [
  {
    href: "/dashboard",
    label: "Workspace",
    id: "workspace",
    icon: LayoutDashboard,
  },
  { href: "/AmanCrawl", label: "Web", id: "crawl", icon: Globe2 },
  { href: "/chat", label: "Chat", id: "chat", icon: MessageSquareText },
] as const

export function AgentNavigation({
  active,
  compact = false,
  onCollapse,
  variant = "header",
}: AgentNavigationProps) {
  const [open, setOpen] = useState(false)

  if (variant === "rail") {
    return <AgentNavigationRail active={active} />
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#c8d6d1] bg-[#f7f9f6]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#11140f]/90">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6821f]">
          <ContextMark aria-hidden="true" className="size-9 text-[#e45f18]" />
          <span className="text-sm font-semibold tracking-[-0.03em] text-[#18201d] dark:text-white">TrueMemory</span>
          <span className="hidden rounded-full border border-[#a7bdb6] bg-[#CAE0DA] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#31564d] sm:inline">Agent workspace</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Workspace navigation">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={`rounded-lg px-3 py-2 text-[13px] font-medium transition ${active === item.id ? "bg-[#dceae5] text-[#17211d] dark:bg-[#CAE0DA]/15 dark:text-[#CAE0DA]" : "text-[#65716b] hover:bg-[#e9efec] hover:text-[#17211d] dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white"}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <AnimatedThemeToggler aria-label="Switch color theme" variant="circle" className="inline-flex size-9 items-center justify-center rounded-lg border border-[#c8d6d1] text-[#52635c] hover:border-[#f6821f] dark:border-white/10 dark:text-white/70" />
          {!compact && <Link href="/chat" className="hidden items-center gap-2 rounded-lg bg-[#18201d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#33423b] sm:flex dark:bg-[#f6821f] dark:text-[#17120e]"><Sparkles className="size-3.5" /> New task</Link>}
          {onCollapse && <button onClick={onCollapse} className="hidden size-9 items-center justify-center rounded-lg border border-[#c8d6d1] text-[#52635c] hover:border-[#f6821f] md:inline-flex dark:border-white/10 dark:text-white/70" aria-label="Collapse navigation"><PanelLeftClose className="size-4" /></button>}
          <button onClick={() => setOpen((value) => !value)} className="inline-flex size-9 items-center justify-center rounded-lg border border-[#c8d6d1] text-[#52635c] md:hidden dark:border-white/10 dark:text-white/70" aria-label="Toggle navigation">{open ? <X className="size-4" /> : <Menu className="size-4" />}</button>
        </div>
      </div>
      {open && <nav className="border-t border-[#c8d6d1] bg-[#f7f9f6] px-4 py-3 md:hidden dark:border-white/10 dark:bg-[#11140f]" aria-label="Mobile workspace navigation"><div className="grid gap-1">{items.map((item) => <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${active === item.id ? "bg-[#CAE0DA] text-[#17211d]" : "text-[#65716b] dark:text-white/65"}`}>{item.label}</Link>)}</div></nav>}
    </header>
  )
}

function AgentNavigationRail({
  active,
}: {
  active?: AgentNavigationProps["active"]
}) {
  return (
    <nav
      aria-label="Agent workspace navigation"
      className="fixed inset-y-0 right-3 z-40 my-auto flex h-fit flex-col items-center gap-1 rounded-2xl border border-[#c8d6d1] bg-[#f7f9f6]/92 p-1.5 shadow-[0_1px_2px_rgba(18,28,23,0.06),0_18px_48px_-30px_rgba(18,28,23,0.38)] backdrop-blur-xl dark:border-white/10 dark:bg-[#171a16]/92 dark:shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]"
    >
      <RailLink href="/" label="Home">
        <ContextMark aria-hidden="true" className="size-8 text-[#e45f18]" />
        <Home aria-hidden="true" className="sr-only" />
      </RailLink>

      <span
        aria-hidden="true"
        className="my-0.5 h-px w-7 bg-[#c8d6d1] dark:bg-white/10"
      />

      {items.map((item) => (
        <RailLink
          key={item.id}
          href={item.href}
          label={item.label}
          active={active === item.id}
        >
          <item.icon aria-hidden="true" className="size-[18px]" />
        </RailLink>
      ))}

      <span
        aria-hidden="true"
        className="my-0.5 h-px w-7 bg-[#c8d6d1] dark:bg-white/10"
      />

      <div className="group/rail-item relative">
        <AnimatedThemeToggler
          aria-label="Switch color theme"
          variant="circle"
          className="flex size-11 items-center justify-center rounded-xl text-[#52635c] transition-[background-color,color,transform] duration-150 hover:bg-[#e9efec] hover:text-[#17211d] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6821f] dark:text-white/65 dark:hover:bg-white/[0.07] dark:hover:text-white [&_svg]:size-[18px]"
        />
        <RailLabel>Appearance</RailLabel>
      </div>
    </nav>
  )
}

function RailLink({
  href,
  label,
  active = false,
  children,
}: {
  href: string
  label: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="group/rail-item relative">
      <Link
        href={href}
        prefetch
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`relative flex size-11 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6821f] ${
          active
            ? "bg-[#dceae5] text-[#17211d] shadow-sm dark:bg-[#CAE0DA]/15 dark:text-[#CAE0DA]"
            : "text-[#65716b] hover:bg-[#e9efec] hover:text-[#17211d] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white"
        }`}
      >
        {children}
        {active && (
          <span
            aria-hidden="true"
            className="absolute -right-[7px] h-5 w-[3px] rounded-full bg-[#f6821f]"
          />
        )}
      </Link>
      <RailLabel>{label}</RailLabel>
    </div>
  )
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#c8d6d1] bg-[#f7f9f6] px-2.5 py-1.5 text-xs font-semibold text-[#17211d] opacity-0 shadow-md transition-[opacity,transform] duration-150 group-hover/rail-item:translate-x-0 group-hover/rail-item:opacity-100 group-focus-within/rail-item:translate-x-0 group-focus-within/rail-item:opacity-100 dark:border-white/10 dark:bg-[#22251f] dark:text-white">
      {children}
    </span>
  )
}
