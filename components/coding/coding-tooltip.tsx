"use client";

import type { ReactElement, ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CodingTooltipProps = {
  children: ReactElement;
  label: string;
  description?: ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
};

export function CodingTooltip({
  children,
  label,
  description,
  shortcut,
  side = "bottom",
  align = "center",
  className,
}: CodingTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent
        side={side}
        align={align}
        sideOffset={8}
        arrowClassName="bg-[#202225] fill-[#202225]"
        className={cn(
          "max-w-72 gap-3 rounded-lg border border-white/[0.1] bg-[#202225] px-2.5 py-2 text-[11px] text-white shadow-[0_14px_38px_-16px_rgba(0,0,0,0.95)]",
          className,
        )}
      >
        <span className="min-w-0">
          <span className="block font-medium leading-4 text-white/90">
            {label}
          </span>
          {description ? (
            <span className="mt-0.5 block text-pretty leading-4 text-white/48">
              {description}
            </span>
          ) : null}
        </span>
        {shortcut ? (
          <kbd className="shrink-0 rounded border border-white/[0.1] bg-black/30 px-1.5 py-0.5 font-mono text-[9px] font-normal text-white/48">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
