"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { GlassBrandPanel } from "@/components/ui/glass-brand-panel";
import { PaperDither } from "@/components/ui/paper-dither";
import { ContextMark } from "@/components/brand/ContextMark";

export default function AuthPageShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 sm:py-6 lg:h-dvh lg:min-h-0 lg:px-8 lg:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1500px] overflow-hidden rounded-[32px] border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(39,23,13,0.04),0_24px_80px_-40px_rgba(74,39,17,0.2)] lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1.12fr)_minmax(440px,0.88fr)] dark:shadow-[0_30px_120px_-60px_rgba(0,0,0,0.7)]">
        <aside className="relative hidden min-h-0 overflow-hidden bg-[#f5ede3] lg:block lg:h-full dark:bg-[#110906]">
          <PaperDither
            className="inset-0"
            dark={{ colorBack: "#080706", colorFront: "#f15a16" }}
            light={{ colorBack: "#f6efe4", colorFront: "#e86a19" }}
            eager
            maxPixelCount={1100 * 1200}
            scale={0.72}
            shape="warp"
            size={2.4}
            speed={0.18}
            type="4x4"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,252,247,0.12)_0%,rgba(255,252,247,0.34)_45%,rgba(255,252,247,0.92)_100%)] dark:bg-[linear-gradient(180deg,rgba(5,5,5,0.08)_0%,rgba(5,5,5,0.18)_45%,rgba(5,5,5,0.92)_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(24,18,12,0.18)_0.55px,transparent_0.65px)] [background-size:5px_5px] dark:opacity-25 dark:[background-image:radial-gradient(rgba(255,255,255,0.18)_0.55px,transparent_0.65px)]" />

          <GlassBrandPanel
            eyebrow="Your work, remembered."
            title="Start every session with Kontext."
            description="Sign in once. Keep documents, decisions, and agent actions connected across every workspace."
            chips={["Source linked", "Permission aware", "Always retrievable"]}
          />
        </aside>

        <section className="relative flex min-h-0 flex-col overflow-hidden border-t border-border bg-background px-5 py-5 sm:px-8 sm:py-7 lg:h-full lg:border-l lg:border-t-0 lg:px-12 lg:py-6 xl:px-16 dark:border-white/10 dark:bg-[#080808]">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-[#f6e879]/50"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Link>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-[-0.03em] text-foreground dark:text-white"
            >
              <ContextMark aria-hidden="true" className="size-8 text-[#e45f18]" />
              kontext
            </Link>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center py-8 lg:py-5">
            {children}
          </div>

          <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground lg:text-left">
            Persistent memory · trusted context
          </p>
        </section>
      </div>
    </main>
  );
}
