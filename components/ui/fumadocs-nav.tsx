"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Database,
  FileSearch,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { GitHubLogoIcon } from "@radix-ui/react-icons"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"
import { Badge } from "@/components/ui/badge"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { AUTH_USER_CHANGED_EVENT, isAuthenticated } from "@/lib/auth"
import { ContextMark } from "@/components/brand/ContextMark"

const links = [
  ["Product", "#product"],
  ["Memory", "#memory"],
  ["Roadmap", "#roadmap"],
  ["Developers", "#developers"],
  ["Pricing", "/pricing"],
] as const

const productLinks = [
  {
    title: "Memory layer",
    description: "Keep decisions and working context available across every session.",
    href: "#memory",
    icon: BrainCircuit,
  },
  {
    title: "Knowledge base",
    description: "Turn documents, notes, and URLs into source-linked context.",
    href: "#knowledge-base",
    icon: Database,
  },
  {
    title: "Retrieval",
    description: "Search the right project evidence before an agent responds.",
    href: "#product",
    icon: FileSearch,
  },
] as const

export function FumadocsNav() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const syncAuthState = () => setAuthenticated(isAuthenticated())
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === "Escape") setSearchOpen(false)
    }

    syncAuthState()
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pageshow", syncAuthState)
    window.addEventListener("storage", syncAuthState)
    window.addEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pageshow", syncAuthState)
      window.removeEventListener("storage", syncAuthState)
      window.removeEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState)
    }
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#e7e5df] bg-[#faf9f6]/92 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0b0b0b]/92">
      <div className="site-container flex h-16 items-center justify-between gap-8 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-[17px] font-semibold tracking-[-0.04em] text-[#171814] dark:text-[#f4f4ef]">
          <ContextMark aria-hidden="true" className="size-8 text-[#e45f18]" />
          kontext
        </Link>

        <NavigationMenu aria-label="Primary navigation" className="hidden lg:flex">
          <NavigationMenuList className="gap-1">
            <NavigationMenuItem>
              <NavigationMenuTrigger className="h-9 rounded-xl bg-transparent px-3 text-[13px] font-medium text-[#696c64] hover:bg-[#efede7] hover:text-[#171814] focus:bg-[#efede7] data-popup-open:bg-[#efede7] dark:text-[#aaa9a2] dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus:bg-white/[0.07] dark:data-popup-open:bg-white/[0.07]">
                Product
              </NavigationMenuTrigger>
              <NavigationMenuContent className="w-[690px] p-0">
                <div className="grid grid-cols-[1.35fr_0.65fr] overflow-hidden rounded-xl bg-[#faf9f6] dark:bg-[#10110f]">
                  <div className="grid gap-2 p-4">
                    {productLinks.map(({ title, description, href, icon: Icon }) => (
                      <NavigationMenuLink
                        key={title}
                        href={href}
                        className="group grid grid-cols-[40px_1fr] gap-3 rounded-xl p-3 hover:bg-[#efede7] focus:bg-[#efede7] dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
                      >
                        <span className="flex size-10 items-center justify-center rounded-xl border border-[#dedbd1] bg-white text-[#d96522] shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-[#e67d2b]">
                          <Icon aria-hidden="true" className="size-[18px]" />
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold text-[#252720] dark:text-[#f2f1e8]">{title}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#7b7d75] dark:text-[#979990]">{description}</span>
                        </span>
                      </NavigationMenuLink>
                    ))}
                  </div>
                  <div className="relative flex flex-col justify-between overflow-hidden border-l border-[#e4e1d9] bg-[#f1eee6] p-5 dark:border-white/10 dark:bg-[#171814]">
                    <div aria-hidden="true" className="absolute -right-12 -top-12 size-40 rounded-full bg-[#f27a28]/20 blur-3xl dark:bg-[#e67d2b]/10" />
                    <div className="relative">
                      <Badge className="border border-[#e6c7ad] bg-[#fff4e9] text-[10px] uppercase tracking-[0.12em] text-[#bd561a] dark:border-[#e67d2b]/20 dark:bg-[#e67d2b]/10 dark:text-[#e67d2b]">
                        Kontext OS
                      </Badge>
                      <h3 className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#24261f] dark:text-[#f2f1e8]">One context layer for every agent.</h3>
                      <p className="mt-2 text-xs leading-5 text-[#777a71] dark:text-[#999b92]">Portable memory, retrieval, sources, and permissions.</p>
                    </div>
                    <NavigationMenuLink href={authenticated ? "/chat" : "/signup"} className="relative mt-6 justify-between rounded-lg border border-[#d8d4c9] bg-white/70 px-3 py-2 text-xs font-semibold text-[#34372f] hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:text-[#f2f1e8] dark:hover:bg-white/10">
                      {authenticated ? "Open workspace" : "Get started"}
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </NavigationMenuLink>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {links.slice(1, 3).map(([label, href]) => (
              <NavigationMenuItem key={href}>
                <NavigationMenuLink href={href} className="h-9 rounded-xl px-3 text-[13px] font-medium text-[#696c64] hover:bg-[#efede7] hover:text-[#171814] focus:bg-[#efede7] dark:text-[#aaa9a2] dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus:bg-white/[0.07]">
                  {label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}

            <NavigationMenuItem>
              <NavigationMenuLink href="#developers" className="h-9 rounded-xl px-3 text-[13px] font-medium text-[#696c64] hover:bg-[#efede7] hover:text-[#171814] focus:bg-[#efede7] dark:text-[#aaa9a2] dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus:bg-white/[0.07]">
                Developers
                <Badge className="h-4 border-0 bg-[#f9dcc7] px-1.5 text-[9px] font-bold uppercase tracking-wider text-[#bd561a] dark:bg-[#e67d2b]/15 dark:text-[#e67d2b]">API</Badge>
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink href="/pricing" className="h-9 rounded-xl px-3 text-[13px] font-medium text-[#696c64] hover:bg-[#efede7] hover:text-[#171814] focus:bg-[#efede7] dark:text-[#aaa9a2] dark:hover:bg-white/[0.07] dark:hover:text-white dark:focus:bg-white/[0.07]">
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-3">
          <button type="button" aria-label="Search documentation" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} className="hidden h-9 w-44 items-center justify-between rounded-full border border-[#dfddd7] bg-white/70 px-3 text-[12px] text-[#898a83] shadow-[0_1px_2px_rgba(17,20,15,0.04)] transition-colors hover:border-[#c9c6bd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] sm:flex dark:border-white/10 dark:bg-white/[0.04] dark:text-[#a3a39d] dark:hover:border-white/20">
            <span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />Search</span>
            <kbd className="rounded border border-[#e0ded8] px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10">Ctrl K</kbd>
          </button>
          <Link
            href={authenticated ? "/chat" : "/signup"}
            className="group relative hidden h-11 isolate items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] focus-visible:ring-offset-2 sm:inline-flex dark:focus-visible:ring-offset-[#0b0b0b]"
          >
            <span aria-hidden="true" className="absolute inset-x-0 inset-y-1 -z-10 rounded-full bg-[#e67d2b] shadow-[0_1px_2px_rgba(17,20,15,0.12)] transition-colors duration-150 group-hover:bg-[#f19045]" />
            <span className="relative z-10 whitespace-nowrap text-[#171814]">
              {authenticated ? "Open workspace" : "Get started"}
            </span>
            <ArrowRight aria-hidden="true" className="relative z-10 size-3.5 text-[#171814]" strokeWidth={1.8} />
          </Link>
          <AnimatedThemeToggler aria-label="Switch color theme" className="inline-flex size-9 items-center justify-center rounded-full border border-[#dfddd7] bg-white/70 text-[#555850] transition-colors hover:border-[#c9c6bd] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#d8d8d2]" duration={220} variant="circle" />
          <Link href="https://github.com" aria-label="GitHub" className="hidden size-9 items-center justify-center rounded-full text-[#555850] transition-colors hover:bg-black/5 hover:text-[#171814] sm:flex dark:text-[#d8d8d2] dark:hover:bg-white/10 dark:hover:text-white">
            <GitHubLogoIcon aria-hidden="true" className="size-4" />
          </Link>
          <Sheet>
            <SheetTrigger aria-label="Open navigation" className="inline-flex size-9 items-center justify-center rounded-full text-[#555850] hover:bg-black/5 sm:hidden dark:text-[#d8d8d2] dark:hover:bg-white/10">
              <Menu aria-hidden="true" className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] border-l border-[#e7e5df] bg-[#faf9f6] text-[#171814] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-white">
              <div className="mt-8 flex items-center gap-1.5 border-b border-[#e7e5df] pb-5 dark:border-white/10">
                <ContextMark aria-hidden="true" className="size-9 text-[#e45f18]" />
                <span className="text-[17px] font-semibold tracking-[-0.03em]">kontext</span>
              </div>
              <div className="mt-5 flex flex-col gap-1">
                {links.map(([label, href]) => (
                  <Link key={href} href={href} className="flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium hover:bg-black/5 dark:hover:bg-white/10">
                    {label}
                    {label === "Developers" ? <Badge className="bg-[#f9dcc7] text-[9px] uppercase tracking-wider text-[#bd561a] dark:bg-[#e67d2b]/15 dark:text-[#e67d2b]">API</Badge> : null}
                  </Link>
                ))}
                <div className="mt-4 rounded-xl border border-[#e1ded5] bg-[#f2efe8] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <ShieldCheck aria-hidden="true" className="size-5 text-[#d96522] dark:text-[#e67d2b]" />
                  <p className="mt-3 text-sm font-semibold">Context you can trust</p>
                  <p className="mt-1 text-xs leading-5 text-[#74776f] dark:text-[#9b9d95]">Memory, sources, and agent permissions stay connected.</p>
                </div>
                <Link href={authenticated ? "/profile" : "/login"} className="mt-6 rounded-lg border border-[#dfddd7] px-3 py-3 text-center text-sm font-semibold dark:border-white/10">
                  {authenticated ? "Profile" : "Sign in"}
                </Link>
                <Link href={authenticated ? "/chat" : "/signup"} className="mt-2 rounded-lg bg-[#f27a28] px-3 py-3 text-center text-sm font-semibold text-white">
                  {authenticated ? "Open workspace" : "Get started"}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      </header>
      {searchOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/35 px-4 pt-[16vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="search-title" className="w-full max-w-xl overflow-hidden rounded-[16px] border border-[#dedbd1] bg-[#faf9f6] shadow-[0_24px_80px_-28px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-[#141512]">
            <div className="flex items-center gap-3 border-b border-[#dedbd1] px-4 dark:border-white/10">
              <Search aria-hidden="true" className="size-4 text-[#888b83]" />
              <input autoFocus type="search" placeholder="Search kontext" aria-label="Search kontext" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-[#595c50] outline-none placeholder:text-[#999b93] dark:text-[#f1f1e8]" />
              <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} className="inline-flex size-9 items-center justify-center rounded-full text-[#777972] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] dark:hover:bg-white/10"><X aria-hidden="true" className="size-4" /></button>
            </div>
            <div className="p-2" id="search-title">
              {links.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setSearchOpen(false)} className="flex items-center justify-between rounded-[10px] px-3 py-3 text-sm text-[#595c50] hover:bg-[#f0ede5] dark:text-[#f1f1e8] dark:hover:bg-white/10"><span>{label}</span><span className="font-mono text-[10px] text-[#a0a29a]">Go to section</span></Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
