"use client";

import type { ComponentProps, ReactNode } from "react";
import { Clock3, ExternalLink, Network, ShieldCheck, ShieldQuestion } from "lucide-react";
import { SiteFavicon } from "@/components/chat/SiteFavicon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type {
  SourceCrossVerification,
  SourceEvidenceRole,
  SourceFreshness,
  SourceVerification,
} from "@/lib/types";

export function InlineCitation({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex align-baseline", className)} {...props} />;
}

export function InlineCitationCard({ children }: { children: ReactNode }) {
  return <HoverCard>{children}</HoverCard>;
}

export function InlineCitationCardTrigger({
  index,
  label,
  url,
  domain,
  faviconUrl,
  trustScore,
  verification,
}: {
  index: number;
  label?: string;
  url?: string;
  domain?: string;
  faviconUrl?: string | null;
  trustScore?: number | null;
  verification?: SourceVerification;
}) {
  const verificationLabel = verification?.label || "source";
  const scoreLabel = trustScore == null ? "" : ` with trust score ${Math.round(trustScore)} out of 100`;
  const visibleLabel = (label || verificationLabel).replace(/^www\./, "");
  return (
    <HoverCardTrigger
      render={
        <button
          type="button"
          aria-label={`Inspect citation ${index} from ${label || verificationLabel}${scoreLabel}`}
          className="relative mx-0.5 inline-flex min-h-8 max-w-60 items-center gap-1.5 rounded-full bg-[var(--chat-surface-muted)] px-2 text-xs font-medium text-[var(--chat-foreground)] shadow-[inset_0_0_0_1px_var(--chat-border-strong)] transition-[background-color,box-shadow,color,transform] duration-100 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] hover:bg-[var(--chat-highlight)] hover:shadow-[inset_0_0_0_1px_var(--chat-accent)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
        >
          <SiteFavicon
            url={url || ""}
            domain={domain || visibleLabel}
            faviconUrl={faviconUrl}
            className="size-4 shrink-0 rounded-[4px]"
          />
          <span className="max-w-36 truncate">{visibleLabel}</span>
          <span className="rounded-full bg-[var(--chat-background)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[var(--chat-muted-foreground)]">
            {index}
          </span>
        </button>
      }
    />
  );
}

export function InlineCitationCardBody({ className, ...props }: ComponentProps<typeof HoverCardContent>) {
  return <HoverCardContent className={cn("w-[min(24rem,calc(100vw-2rem))] rounded-2xl border-[var(--chat-border)] bg-[var(--chat-surface)] p-4 text-[var(--chat-foreground)] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]", className)} {...props} />;
}

export function InlineCitationSource({
  title,
  url,
  description,
  quote,
  verification,
  trustScore,
  confidenceScore,
  evidenceRole,
  reasonUsed,
  freshness,
  crossVerification,
}: {
  title: string;
  url?: string;
  description?: string;
  quote?: string | null;
  verification?: SourceVerification;
  trustScore?: number | null;
  confidenceScore?: number | null;
  evidenceRole?: SourceEvidenceRole | null;
  reasonUsed?: string | null;
  freshness?: SourceFreshness;
  crossVerification?: SourceCrossVerification;
}) {
  let domain = "Reference";
  if (url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "") || domain;
    } catch {
      domain = "Uploaded document";
    }
  }

  const independent = crossVerification?.independent_sources ?? 0;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold leading-5">{title}</p>
        <p className="mt-1 truncate font-mono text-[9px] text-[var(--chat-subtle-foreground)]">{domain}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--chat-surface-muted)] px-2 py-1 text-[10px] text-[var(--chat-muted-foreground)]">
          {verification?.status === "verified" ? <ShieldCheck className="size-3 text-[var(--source-verified)]" aria-hidden="true" /> : <ShieldQuestion className="size-3 text-[var(--chat-accent)]" aria-hidden="true" />}
          {verification?.label ?? "Unverified source"}
        </span>
        <span className="rounded-md bg-[var(--chat-surface-muted)] px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--chat-muted-foreground)]">
          Trust {trustScore == null ? "—" : Math.round(trustScore)}
        </span>
        <span className="rounded-md bg-[var(--chat-surface-muted)] px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--chat-muted-foreground)]">
          Support {confidenceScore == null ? "—" : `${Math.round(confidenceScore * 100)}%`}
        </span>
      </div>

      {quote ? (
        <blockquote className="border-l-2 border-[var(--chat-accent)]/55 pl-3 text-xs leading-5 text-[var(--chat-muted-foreground)]">
          “{quote}”
        </blockquote>
      ) : description ? (
        <p className="line-clamp-3 text-xs leading-5 text-[var(--chat-muted-foreground)]">{description}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[var(--chat-background)] px-2.5 py-2">
          <dt className="text-[9px] text-[var(--chat-subtle-foreground)]">Evidence role</dt>
          <dd className="mt-0.5 text-[10px] font-semibold capitalize text-[var(--chat-foreground)]">{evidenceRole || "Unknown"}</dd>
        </div>
        <div className="rounded-lg bg-[var(--chat-background)] px-2.5 py-2">
          <dt className="flex items-center gap-1 text-[9px] text-[var(--chat-subtle-foreground)]"><Clock3 className="size-3" aria-hidden="true" /> Freshness</dt>
          <dd className="mt-0.5 text-[10px] font-semibold text-[var(--chat-foreground)]">{freshness?.label || "Update date unknown"}</dd>
        </div>
      </dl>

      {reasonUsed ? <p className="text-[10px] leading-4 text-[var(--chat-subtle-foreground)]">{reasonUsed}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--chat-border)] pt-3">
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--chat-subtle-foreground)]">
          <Network className="size-3" aria-hidden="true" />
          {independent ? `${independent} independent sources available` : "Not cross-verified"}
        </span>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--chat-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]">
            Open evidence
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
