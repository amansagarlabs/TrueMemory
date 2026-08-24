"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brain, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { Dock, DockIcon } from "@/components/ui/dock";
import { cn } from "@/lib/utils";

type ProductMode = "brain" | "assistant" | "search";

const MODES: Array<{ id: ProductMode; label: string; href: string; icon: typeof Brain; description: string }> = [
  { id: "brain", label: "Brain", href: "/memory", icon: Brain, description: "Everything TrueMemory remembers" },
  { id: "assistant", label: "Assistant", href: "/chat", icon: Sparkles, description: "Your AI assistant powered by TrueMemory" },
];

export function productModeForPathname(pathname: string): ProductMode {
  if (pathname === "/search" || pathname.startsWith("/search/")) return "search";
  if (["/chat", "/research", "/coding", "/artifacts", "/skills", "/library", "/archive", "/benchmarks", "/amancrawl", "/amancrwal"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) return "assistant";
  return "brain";
}

export function TrueMemoryDock() {
  const pathname = usePathname();
  const activeMode = productModeForPathname(pathname);
  const prefersReducedMotion = useReducedMotion();
  const [tooltipMode, setTooltipMode] = useState<ProductMode | null>(null);

  return (
    <nav aria-label="TrueMemory product modes" className="flex shrink-0 items-center">
      <Dock
        aria-label="Product mode dock"
        iconSize={34}
        iconMagnification={40}
        iconDistance={76}
        disableMagnification={prefersReducedMotion ?? false}
        className="!mt-0 h-11 gap-0 rounded-2xl border-[#dfd3c5]/80 bg-[#fffaf6]/72 p-1 shadow-none supports-backdrop-blur:bg-[#fffaf6]/60 dark:border-white/10 dark:bg-[#11110f]/72 dark:supports-backdrop-blur:bg-[#11110f]/60"
      >
        {MODES.map(({ id, label, href, icon: Icon, description }) => {
          const active = activeMode === id;
          return (
            <DockIcon
              key={id}
              className="group relative rounded-2xl"
              onMouseEnter={() => setTooltipMode(id)}
              onMouseLeave={() => setTooltipMode(null)}
              onFocus={() => setTooltipMode(id)}
              onBlur={() => setTooltipMode(null)}
            >
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={`${label}: ${description}`}
                title={description}
                className={cn(
                  "flex size-8 items-center justify-center rounded-xl text-[#8d786b] transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d86516] active:scale-[0.96] dark:text-white/45 dark:focus-visible:ring-[#f6e879]",
                  active
                    ? "bg-[#201510] text-[#fffaf6] shadow-[0_8px_20px_-10px_rgba(32,21,16,0.65)] dark:bg-[#f6e879] dark:text-[#171814]"
                    : "hover:bg-[#f3e9df] hover:text-[#201510] dark:hover:bg-white/[0.08] dark:hover:text-white",
                )}
              >
                <Icon aria-hidden="true" className="size-[21px]" strokeWidth={active ? 2.2 : 1.8} />
              </Link>
              {tooltipMode === id ? (
                <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full border border-[#dfd3c5] bg-[#fffaf6] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f5d50] shadow-sm dark:border-white/10 dark:bg-[#171714] dark:text-white/70">
                  {label}
                </span>
              ) : null}
            </DockIcon>
          );
        })}
      </Dock>
    </nav>
  );
}
