"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Code2 } from "lucide-react";
import { PaperDither } from "@/components/ui/paper-dither";
import { AUTH_USER_CHANGED_EVENT, isAuthenticated } from "@/lib/auth";
import { ContextMark } from "@/components/brand/ContextMark";

function BrandMark() {
  return <ContextMark aria-hidden="true" className="size-8 text-[#e45f18]" />;
}

export function SiteFooter() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const syncAuthState = () => setAuthenticated(isAuthenticated());
    syncAuthState();
    window.addEventListener("pageshow", syncAuthState);
    window.addEventListener("storage", syncAuthState);
    window.addEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState);
    return () => {
      window.removeEventListener("pageshow", syncAuthState);
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState);
    };
  }, []);

  return (
    <footer className="relative overflow-hidden border-t border-[#dedbd1] bg-[#faf9f6] text-[#62685e] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-[#aeb5a7]">
      <PaperDither
        className="inset-0 opacity-[0.06] mix-blend-multiply dark:opacity-[0.12] dark:mix-blend-screen"
        dark={{ colorBack: "#00000000", colorFront: "#ddc658" }}
        light={{ colorBack: "#00000000", colorFront: "#535c97" }}
        maxPixelCount={1400 * 520}
        scale={0.78}
        shape="simplex"
        size={2}
        speed={0.18}
        type="4x4"
      />
      <div className="site-container relative z-10 px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="grid gap-12 border-b border-[#dedbd1] pb-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.6fr_0.6fr_0.9fr] dark:border-white/10">
          <div>
            <div className="flex items-center gap-3 text-[#11140f] dark:text-white">
              <BrandMark />
              <span className="text-[15px] font-semibold">TrueMemory</span>
            </div>
            <p className="mt-5 max-w-md text-pretty text-base font-medium leading-7 text-[#353a32] dark:text-[#e4e7df]">
              The context layer for agents that need to remember, retrieve, and act with confidence.
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#72786e] dark:text-[#92988f]">
              Connect documents, conversations, tools, and live web data in one permission-aware workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.12em]">
              {["Persistent memory", "Grounded retrieval", "Observable actions"].map((label) => (
                <span className="rounded-full border border-[#d9d5ca] bg-white/55 px-3 py-1.5 text-[#62685e] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#aeb5a7]" key={label}>
                  {label}
                </span>
              ))}
            </div>
            <Link className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#171814] px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#2b2e28] active:scale-[0.98] dark:bg-[#f2f1e8] dark:text-[#171814] dark:hover:bg-[#e4e3da]" href={authenticated ? "/chat" : "/signup"}>
              {authenticated ? "Open workspace" : "Get started"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
              Product
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#product">Overview</a></li>
              <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#knowledge-base">Knowledge base</a></li>
              <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#integrations">Integrations</a></li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
              Build
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li><Link className="hover:text-[#e76f22] dark:hover:text-white" href="/chat">Workspace</Link></li>
              <li><Link className="hover:text-[#e76f22] dark:hover:text-white" href="/AmanCrawl">Web crawl</Link></li>
              <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#developers">Developers</a></li>
              <li>
                <a className="inline-flex items-center gap-2 hover:text-[#e76f22] dark:hover:text-white" href="#">
                  <Code2 aria-hidden="true" className="size-4" /> GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
              Agent layer
            </p>
            <ul className="mt-4 space-y-4 text-sm">
              <li>
                <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Memory online</span>
                <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Context persists across every session.</span>
              </li>
              <li>
                <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Tools permissioned</span>
                <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Actions stay inside granted access.</span>
              </li>
              <li>
                <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Sources traceable</span>
                <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Answers retain their origin.</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-[#687064] sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; 2026 TrueMemory</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Systems operational
            </span>
            <span className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="size-3 text-[#496b63] dark:text-[#CAE0DA]" />
              Open source &middot; built in India
            </span>
          </div>
        </div>
        <div className="footer-dither-wordmark select-none overflow-hidden pt-14 text-center text-[clamp(4.5rem,14vw,12rem)] font-medium leading-[0.76] tracking-[0.04em]" aria-label="TrueMemory">
          TRUEMEMORY
        </div>
      </div>
    </footer>
  );
}
