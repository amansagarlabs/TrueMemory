import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

import { PaperDither } from "@/components/ui/paper-dither";

export default function NotFound() {
  return (
    <main className="relative isolate grid min-h-svh overflow-hidden bg-[#f7f2eb] px-5 py-6 text-[#17120f] dark:bg-[#070707] dark:text-white sm:px-8">
      <PaperDither
        className="inset-0 opacity-45 dark:opacity-55"
        dark={{ colorBack: "#07070700", colorFront: "#e85d18" }}
        light={{ colorBack: "#f7f2eb00", colorFront: "#d85813" }}
        eager
        maxPixelCount={1400 * 900}
        scale={0.72}
        shape="warp"
        size={2.1}
        speed={0.12}
        type="4x4"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(247,242,235,0.18)_0%,#f7f2eb_68%)] dark:bg-[radial-gradient(circle_at_center,rgba(7,7,7,0.04)_0%,#070707_72%)]"
      />

      <header className="relative z-10 flex h-12 items-center justify-between">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[17px] font-semibold tracking-[-0.03em] transition-[background-color,transform] duration-150 hover:bg-black/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:bg-white/[0.05]"
        >
          <span
            aria-hidden="true"
            className="size-7 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)] shadow-[0_0_0_1px_rgba(23,18,15,0.08)]"
          />
          kontext
        </Link>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40 dark:text-white/35">
          Route not found
        </span>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center justify-center py-16 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">
          Lost in context
        </p>
        <h1
          aria-label="404"
          className="not-found-dither-text mt-4 select-none text-[clamp(8rem,31vw,22rem)] font-black leading-[0.72] tracking-[-0.095em]"
        >
          404
        </h1>

        <div className="relative -mt-2 max-w-xl rounded-[20px] border border-black/[0.08] bg-[#fffaf6]/88 px-6 py-6 shadow-[0_1px_2px_rgba(20,14,10,0.04),0_24px_64px_-42px_rgba(20,14,10,0.45)] backdrop-blur-md dark:border-white/[0.08] dark:bg-[#10100f]/88 dark:shadow-none sm:px-8">
          <h2 className="text-balance font-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
            This page could not be found.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-black/55 dark:text-white/45">
            The address may have changed, or the page may no longer exist. Return
            to your workspace and continue where you left off.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-orange-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf6] dark:text-black dark:focus-visible:ring-offset-[#10100f]"
            >
              <LayoutDashboard aria-hidden="true" className="size-4" />
              Go to dashboard
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/[0.025] px-5 text-sm font-semibold transition-[background-color,transform] duration-150 hover:bg-black/[0.06] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back home
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 flex items-end justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.14em] text-black/35 dark:text-white/25">
        <span>Error / 404</span>
        <span className="text-right">Kontext navigation layer</span>
      </footer>
    </main>
  );
}
