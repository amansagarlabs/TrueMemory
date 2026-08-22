"use client";

import type { ComponentProps } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function Confirmation({ className, ...props }: ComponentProps<typeof Alert>) {
  return <Alert className={cn("rounded-2xl border-[var(--chat-border-strong)] bg-[var(--chat-surface)] text-[var(--chat-foreground)]", className)} {...props} />;
}

export function ConfirmationTitle({ className, ...props }: ComponentProps<typeof AlertTitle>) {
  return <AlertTitle className={cn("flex items-center gap-2 text-sm font-semibold", className)} {...props}><ShieldCheck className="size-4 text-[var(--chat-accent)]" aria-hidden="true" />{props.children}</AlertTitle>;
}

export function ConfirmationRequest({ className, ...props }: ComponentProps<typeof AlertDescription>) {
  return <AlertDescription className={cn("mt-2 text-sm leading-6 text-[var(--chat-muted-foreground)]", className)} {...props} />;
}

export function ConfirmationActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />;
}

export function ConfirmationAction({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cn("min-h-10 rounded-full border border-[var(--chat-border)] px-4 text-sm font-semibold transition-colors hover:border-[var(--chat-accent)] hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]", className)} {...props} />;
}
