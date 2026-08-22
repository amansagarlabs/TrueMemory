"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

type ThinkingStateTone = "chat" | "agent";

export function ThinkingState({
  label,
  detail,
  tone = "chat",
  icon,
  compact = false,
  className = "",
}: {
  label: string;
  detail?: string;
  tone?: ThinkingStateTone;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const isAgent = tone === "agent";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={[
        "relative overflow-hidden rounded-[18px] border",
        isAgent
          ? "border-white/[0.065] bg-white/[0.018] px-4 py-3.5 text-white"
          : "border-[var(--chat-border)] bg-[var(--chat-background)] px-3 py-2.5 text-[var(--chat-foreground)]",
        className,
      ].join(" ")}
    >
      <div className={compact ? "flex min-h-8 items-center gap-2" : "flex items-start gap-3"}>
        <span
          className={[
            "relative grid shrink-0 place-items-center rounded-lg",
            isAgent
              ? "mt-0.5 size-7 border border-[#2f98ff]/20 bg-[#2f98ff]/[0.08] text-[#70b7ff]"
              : "size-7 text-[#e45f18] dark:text-[var(--chat-accent)]",
          ].join(" ")}
          aria-hidden="true"
        >
          {icon ?? <Sparkles className={isAgent ? "size-3.5" : "size-4"} />}
          {isAgent ? (
            <span className="absolute inset-0 rounded-lg ring-1 ring-[#2f98ff]/20 motion-safe:animate-ping" aria-hidden="true" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={[
              "w-fit text-[12px] font-medium tracking-[-0.01em]",
              isAgent ? "agent-thinking-shimmer" : "thinking-state-shimmer",
            ].join(" ")}
          >
            {label}
          </p>
          {detail ? (
            <p
              className={[
                "mt-1 text-[10px] leading-5",
                isAgent ? "text-white/32" : "text-[var(--chat-subtle-foreground)]",
              ].join(" ")}
            >
              {detail}
            </p>
          ) : null}
          {isAgent ? (
            <div className="mt-2.5 h-px overflow-hidden rounded-full bg-white/[0.055]" aria-hidden="true">
              <span className="agent-thinking-track block h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#57a9ff]/75 to-transparent" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
