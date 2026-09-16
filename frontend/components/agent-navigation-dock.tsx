"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LineNav } from "@/components/line-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CHAT_PROMPT_NAV_UPDATE_EVENT,
  type ChatPromptNavItem,
} from "@/components/chat/chat-prompt-nav";

const PROMPT_BATCH_SIZE = 200;

export function AgentNavigationDock() {
  const pathname = usePathname();
  const [prompts, setPrompts] = useState<ChatPromptNavItem[]>([]);
  const [visiblePromptCount, setVisiblePromptCount] = useState(PROMPT_BATCH_SIZE);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ChatPromptNavItem[]>).detail;
      setPrompts(Array.isArray(detail) ? detail : []);
    };

    window.addEventListener(CHAT_PROMPT_NAV_UPDATE_EVENT, listener);
    return () => window.removeEventListener(CHAT_PROMPT_NAV_UPDATE_EVENT, listener);
  }, []);

  const activeHref = useMemo(() => {
    const activePrompt = prompts[0];
    return activePrompt?.href ?? undefined;
  }, [prompts]);
  const visiblePrompts = prompts.slice(0, visiblePromptCount);
  const hiddenPromptCount = Math.max(0, prompts.length - visiblePromptCount);

  if (!pathname.startsWith("/chat")) {
    return null;
  }

  if (prompts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Recent chat prompts"
      className="pointer-events-none fixed right-2 top-1/2 z-40 hidden w-[280px] -translate-y-1/2 md:block"
    >
      <span className="absolute bottom-full right-0 mb-2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--chat-subtle-foreground)]">
        Prompts
      </span>
      <ScrollArea
        aria-label={`${prompts.length} chat prompts`}
        className="w-full"
        maxHeight="calc(100svh - 112px)"
        orientation="vertical"
        scrollbar={false}
      >
        <LineNav
          activeHref={activeHref}
          className="pointer-events-auto ml-auto w-12"
          density="dense"
          floatingLabelSide="left"
          lineWidths={{ normal: 8, active: 24, hover: 24 }}
          markerPosition="right"
          revealLabelOnHover
          items={visiblePrompts.map((item) => ({
            title: item.title,
            href: item.href,
          }))}
          orientation="vertical"
          scrollActiveIntoView={false}
          onItemClick={(item, event) => {
            event.preventDefault();
            const target = document.getElementById(item.href.replace("#", ""));
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
        {hiddenPromptCount > 0 ? (
          <button
            type="button"
            className="pointer-events-auto ml-auto flex min-h-11 w-24 items-center justify-end pr-1 text-[10px] font-medium text-[var(--chat-subtle-foreground)] transition-colors duration-100 hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent)]"
            onClick={() =>
              setVisiblePromptCount((count) =>
                Math.min(prompts.length, count + PROMPT_BATCH_SIZE),
              )
            }
          >
            Show {Math.min(PROMPT_BATCH_SIZE, hiddenPromptCount)} more
          </button>
        ) : null}
      </ScrollArea>
    </aside>
  );
}
