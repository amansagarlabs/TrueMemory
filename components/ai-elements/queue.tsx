"use client";

import type { ComponentProps } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function Queue({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)]", className)} {...props} />;
}

export function QueueList({ className, ...props }: ComponentProps<typeof ScrollArea>) {
  return <ScrollArea className={cn("max-h-52 p-2", className)} {...props} />;
}

export function QueueItem({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-start gap-2 rounded-xl px-2 py-2", className)} {...props} />;
}

export function QueueItemIndicator({ status = "pending" }: { status?: "pending" | "active" | "complete" | "failed" | "denied" }) {
  const Icon = status === "complete" ? Check : status === "active" ? Loader2 : status === "failed" || status === "denied" ? X : Circle;
  return <Icon className={cn("mt-0.5 size-4 shrink-0", status === "active" && "animate-spin text-[var(--chat-accent)]", status === "complete" && "text-emerald-600 dark:text-emerald-400", (status === "failed" || status === "denied") && "text-red-600 dark:text-red-400", status === "pending" && "text-[var(--chat-subtle-foreground)]")} aria-hidden="true" />;
}

export function QueueItemContent({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("text-sm leading-5 text-[var(--chat-muted-foreground)]", className)} {...props} />;
}
