"use client"

import Link from "next/link"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  BrainCircuit,
  Globe,
  Layers,
  Search,
  Terminal,
  ArrowUpRight,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export function Navigation2() {
  return (
    <div className="sticky top-0 z-50 w-full bg-[#f5f7f4]/90 backdrop-blur-xl dark:bg-[#10130f]/90">
      <div className="mx-auto grid h-16 max-w-[1240px] grid-cols-[auto_1fr_auto] items-center px-5 sm:px-8">
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-8 grid-cols-2 gap-[3px] rounded-[9px] bg-[#f6821f] p-[7px] shadow-[0_1px_2px_rgba(35,20,8,0.18)]"
            >
              <span className="h-full rounded-[2px] !bg-white" />
              <span className="h-full rounded-[2px] !bg-white/45" />
              <span className="h-full rounded-[2px] !bg-white/45" />
              <span className="h-full rounded-[2px] !bg-white" />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-[-0.02em] text-[#171a15] dark:text-white min-[420px]:inline">
              ContextOS
            </span>
          </Link>
        </div>

          <div className="hidden lg:flex lg:justify-center">
            <NavigationMenu
              className={cn(
                "static",
                "[&>.absolute]:inset-x-0 [&>.absolute]:top-full [&>.absolute]:w-full",
                "[&_[data-slot=navigation-menu-viewport]]:mt-1 [&_[data-slot=navigation-menu-viewport]]:!w-full",
                "[&_[data-slot=navigation-menu-viewport]]:rounded-none [&_[data-slot=navigation-menu-viewport]]:shadow-none [&_[data-slot=navigation-menu-viewport]]:ring-0",
                "[&_[data-slot=navigation-menu-viewport]]:border-0 [&_[data-slot=navigation-menu-viewport]]:border-b",
                "[&_[data-slot=navigation-menu-viewport]]:border-[#ced8d4] dark:[&_[data-slot=navigation-menu-viewport]]:border-white/10",
                "[&_[data-slot=navigation-menu-viewport]]:bg-[#f5f7f4] dark:[&_[data-slot=navigation-menu-viewport]]:bg-[#10130f]",
                "[&_[data-slot=navigation-menu-viewport]]:transition-all [&_[data-slot=navigation-menu-viewport]]:duration-300 [&_[data-slot=navigation-menu-viewport]]:ease-in-out",
              )}
            >
              <NavigationMenuList className="gap-1">
                <NavigationMenuItem className="gap-1">
                  <NavigationMenuTrigger className="h-auto rounded-md bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#5d6259] transition-all hover:bg-[#ede3d8] hover:text-[#171a15] focus:bg-[#ede3d8] focus:text-[#171a15] data-[active]:bg-[#ede3d8] data-[state=open]:bg-[#ede3d8] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white dark:focus:bg-white/5 dark:focus:text-white dark:data-[active]:bg-white/5 dark:data-[state=open]:bg-white/5">
                    ContextCrawl
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="!w-full">
                    <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-6 py-8">
                      <div className="flex flex-col gap-3">
                        <h4 className="mb-1 text-xs uppercase text-[#71766d] dark:text-[#555555]">
                          Tools
                        </h4>
                        <Link href="/search" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#ede3d8] dark:hover:bg-white/5">
                          <Search className="size-4 text-[#496b63] dark:text-[#CAE0DA]" />
                          <div>
                            <p className="text-sm font-medium text-[#171a15] dark:text-white">Search</p>
                            <p className="text-xs text-[#71766d] dark:text-[#555555]">Web search with evidence</p>
                          </div>
                        </Link>
                        <Link href="/scrape" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#ede3d8] dark:hover:bg-white/5">
                          <Globe className="size-4 text-[#496b63] dark:text-[#CAE0DA]" />
                          <div>
                            <p className="text-sm font-medium text-[#171a15] dark:text-white">Scrape</p>
                            <p className="text-xs text-[#71766d] dark:text-[#555555]">Structured extraction</p>
                          </div>
                        </Link>
                        <Link href="/crawl" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#ede3d8] dark:hover:bg-white/5">
                          <Layers className="size-4 text-[#496b63] dark:text-[#CAE0DA]" />
                          <div>
                            <p className="text-sm font-medium text-[#171a15] dark:text-white">Crawl</p>
                            <p className="text-xs text-[#71766d] dark:text-[#555555]">Deep crawl at scale</p>
                          </div>
                        </Link>
                      </div>
                      <div className="flex flex-col gap-3">
                        <h4 className="mb-1 text-xs uppercase text-[#71766d] dark:text-[#555555]">
                          More Tools
                        </h4>
                        <a href="#" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#ede3d8] dark:hover:bg-white/5">
                          <Terminal className="size-4 text-[#496b63] dark:text-[#CAE0DA]" />
                          <div>
                            <p className="text-sm font-medium text-[#171a15] dark:text-white">Map</p>
                            <p className="text-xs text-[#71766d] dark:text-[#555555]">Discover every URL</p>
                          </div>
                        </a>
                        <a href="#" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#ede3d8] dark:hover:bg-white/5">
                          <BrainCircuit className="size-4 text-[#496b63] dark:text-[#CAE0DA]" />
                          <div>
                            <p className="text-sm font-medium text-[#171a15] dark:text-white">Extract</p>
                            <p className="text-xs text-[#71766d] dark:text-[#555555]">Schema-based extraction</p>
                          </div>
                        </a>
                      </div>
                      <div className="flex flex-col">
                        <h4 className="mb-4 text-xs uppercase text-[#71766d] dark:text-[#555555]">
                          Getting Started
                        </h4>
                        <div className="rounded-2xl border border-[#ced8d4] bg-[#fafbf6] p-5 dark:border-white/10 dark:bg-white/[0.02]">
                          <Badge
                            variant="secondary"
                            className="mb-2 border border-[#f6821f]/20 bg-[#f6821f]/10 text-[10px] text-[#f6821f] dark:border-[#f6821f]/30 dark:bg-[#f6821f]/15 dark:text-[#f6821f]"
                          >
                            API
                          </Badge>
                          <p className="text-sm font-semibold text-[#171a15] dark:text-white">
                            Start building free
                          </p>
                          <p className="mt-1 text-xs text-[#71766d] dark:text-[#555555]">
                            1,000 searches/month, no credit card
                          </p>
                          <Link
                            href="/signup"
                            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#f6821f] transition-colors hover:text-[#d95e0b]"
                          >
                            Get started <ArrowUpRight className="size-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="rounded-md bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#5d6259] transition-colors hover:bg-[#ede3d8] hover:text-[#171a15] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white"
                    href="#product"
                  >
                    Product
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="flex items-center gap-2 rounded-md bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#5d6259] transition-colors hover:bg-[#ede3d8] hover:text-[#171a15] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white"
                    href="#memory"
                  >
                    Memory
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="rounded-md bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#5d6259] transition-colors hover:bg-[#ede3d8] hover:text-[#171a15] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white"
                    href="#roadmap"
                  >
                    Roadmap
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="rounded-md bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#5d6259] transition-colors hover:bg-[#ede3d8] hover:text-[#171a15] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white"
                    href="#developers"
                  >
                    Developers
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

        <div className="flex items-center justify-end gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <AnimatedThemeToggler
              aria-label="Switch color theme"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#aebfba] bg-[#CAE0DA]/65 text-[#20342e] transition-[background-color,border-color,transform] duration-150 hover:border-[#f6821f] hover:bg-[#f6d2b4] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a480d] focus-visible:ring-offset-2 dark:border-white/15 dark:bg-white/5 dark:text-[#CAE0DA] dark:hover:border-[#f6821f] dark:hover:bg-[#f6821f]/15 [&_svg]:size-4"
              duration={260}
              variant="circle"
            />
            <Link
              href="/login"
              className="inline-flex items-center rounded-md px-3 py-2 text-[13px] font-medium text-[#5d6259] transition-colors hover:bg-[#ede3d8] hover:text-[#171a15] dark:text-[#c8cec7] dark:hover:bg-white/5 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Button className="rounded-md bg-[#f6821f] px-4 py-2 text-[13px] font-semibold text-[#17120e] shadow-[0_1px_2px_rgba(35,20,8,0.16)] transition-[background-color,transform] duration-150 hover:bg-[#ff9a3d] active:scale-[0.98]">
              <Link href="/signup" className="flex items-center gap-2">
                Start building
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-0.5 lg:hidden">
          <AnimatedThemeToggler
            aria-label="Switch color theme"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#aebfba] bg-[#CAE0DA]/65 text-[#20342e] dark:border-white/15 dark:bg-white/5 dark:text-[#CAE0DA] [&_svg]:size-4"
            duration={260}
            variant="circle"
          />
          <Sheet>
            <SheetTrigger className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[#5d6259] hover:bg-[#ede3d8] dark:text-[#c8cec7] dark:hover:bg-white/5">
              <Menu className="size-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[300px] flex-col gap-6 border-l border-[#ced8d4] bg-[#f5f7f4] p-6 text-[#171a15] sm:w-[400px] dark:border-white/10 dark:bg-[#10130f] dark:text-white"
            >
              <div className="mb-4 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid size-8 grid-cols-2 gap-[3px] rounded-[9px] bg-[#f6821f] p-[7px]"
                >
                  <span className="h-full rounded-[2px] !bg-white" />
                  <span className="h-full rounded-[2px] !bg-white/45" />
                  <span className="h-full rounded-[2px] !bg-white/45" />
                  <span className="h-full rounded-[2px] !bg-white" />
                </span>
                <span className="text-lg font-bold tracking-tight text-[#171a15] dark:text-white">
                  ContextOS
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <a
                  href="#product"
                  className="block py-2 text-base font-medium text-[#171a15] transition-colors hover:text-[#f6821f] dark:text-white dark:hover:text-[#f6821f]"
                >
                  Product
                </a>
                <a
                  href="#memory"
                  className="block py-2 text-base font-medium text-[#171a15] transition-colors hover:text-[#f6821f] dark:text-white dark:hover:text-[#f6821f]"
                >
                  Memory
                </a>

                <Accordion className="w-full">
                  <AccordionItem value="contextcrawl" className="border-none">
                    <AccordionTrigger className="justify-between py-2 text-base font-medium text-[#171a15] no-underline transition-colors hover:text-[#f6821f] hover:no-underline dark:text-white dark:hover:text-[#f6821f]">
                      ContextCrawl
                    </AccordionTrigger>
                    <AccordionContent className="mt-1 ml-2 flex !h-auto flex-col gap-3 border-l border-[#ced8d4] pb-0 pl-4 dark:border-white/10 [&_a]:no-underline">
                      <div className="flex flex-col gap-2">
                        <a href="/search" className="text-sm font-medium text-[#5d6259] hover:text-[#f6821f] dark:text-[#c8cec7] dark:hover:text-[#f6821f]">Search</a>
                        <a href="/scrape" className="text-sm font-medium text-[#5d6259] hover:text-[#f6821f] dark:text-[#c8cec7] dark:hover:text-[#f6821f]">Scrape</a>
                        <a href="/crawl" className="text-sm font-medium text-[#5d6259] hover:text-[#f6821f] dark:text-[#c8cec7] dark:hover:text-[#f6821f]">Crawl</a>
                        <a href="#" className="text-sm font-medium text-[#5d6259] hover:text-[#f6821f] dark:text-[#c8cec7] dark:hover:text-[#f6821f]">Map</a>
                        <a href="#" className="text-sm font-medium text-[#5d6259] hover:text-[#f6821f] dark:text-[#c8cec7] dark:hover:text-[#f6821f]">Extract</a>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <a
                  href="#roadmap"
                  className="block py-2 text-base font-medium text-[#171a15] transition-colors hover:text-[#f6821f] dark:text-white dark:hover:text-[#f6821f]"
                >
                  Roadmap
                </a>
                <a
                  href="#developers"
                  className="block py-2 text-base font-medium text-[#171a15] transition-colors hover:text-[#f6821f] dark:text-white dark:hover:text-[#f6821f]"
                >
                  Developers
                </a>
              </div>

              <div className="mt-auto flex flex-col gap-3 border-t border-[#ced8d4] pt-6 dark:border-white/10">
                <Link
                  href="/login"
                  className="flex items-center justify-center rounded-xl border border-[#ced8d4] bg-transparent py-2.5 text-sm font-medium text-[#171a15] transition-colors hover:bg-[#ede3d8] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                >
                  Sign in
                </Link>
                <Button className="w-full justify-center rounded-xl bg-[#f6821f] text-[#17120e] hover:bg-[#ff9a3d]">
                  <Link href="/signup" className="flex items-center gap-2">
                    Start building
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        </div>
      </div>
    </div>
  )
}
