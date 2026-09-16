"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Circle, ListChecks } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function ChainOfThought({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible className={cn("w-full", className)} {...props} />;
}

export function ChainOfThoughtHeader({ className, children, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger className={cn("group flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]", className)} {...props}>
      <ListChecks className="size-4 text-[var(--chat-accent)]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{children ?? "Activity"}</span>
      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
    </CollapsibleTrigger>
  );
}

export function ChainOfThoughtContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent className={cn("space-y-1 px-3 pb-3", className)} {...props} />;
}

export function ChainOfThoughtStep({ icon: Icon = Circle, label, description, status = "pending", className }: {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending" | "failed" | "denied";
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[20px_1fr] gap-2 py-1.5 text-sm", status === "pending" && "opacity-50", className)}>
      <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full", status === "active" && "bg-[var(--chat-accent)]/15 text-[var(--chat-accent)]", status === "complete" && "text-emerald-600 dark:text-emerald-400", (status === "failed" || status === "denied") && "text-red-600 dark:text-red-400")}>
        <Icon className={cn("size-3.5", status === "active" && "animate-pulse")} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[var(--chat-foreground)]">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-[var(--chat-muted-foreground)]">{description}</span> : null}
      </span>
    </div>
  );
}
