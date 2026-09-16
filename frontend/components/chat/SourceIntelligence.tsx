"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ShieldCheck,
  ShieldQuestion,
  Star,
} from "lucide-react";

import { SiteFavicon } from "@/components/chat/SiteFavicon";
import type {
  SourceConfidenceLabel,
  SourceCrossVerification,
  SourceEvidenceRole,
  SourceFreshness,
  SourceVerification,
} from "@/lib/types";

export interface SourceIntelligenceSource {
  id: string;
  title: string;
  domain: string;
  description?: string;
  quote?: string | null;
  url?: string;
  sourceType: string;
  providerLabel?: string;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  verification?: SourceVerification;
  trustScore?: number | null;
  trustLabel?: SourceConfidenceLabel | null;
  trustComponents?: Record<string, number>;
  trustExplanation?: string | null;
  confidenceScore?: number | null;
  confidenceLabel?: SourceConfidenceLabel | null;
  confidenceComponents?: Record<string, number>;
  confidenceExplanation?: string | null;
  evidenceRole?: SourceEvidenceRole | null;
  reasonUsed?: string | null;
  influenceScore?: number | null;
  freshness?: SourceFreshness;
  crossVerification?: SourceCrossVerification;
  scoreVersion?: string | null;
}

function compactDescription(value?: string, maxLength = 150): string {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function fivePointScore(score?: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

function qualityLabel(rating: number | null): string {
  if (rating == null) return "Not rated";
  return ["", "Weak", "Limited", "Fair", "Strong", "Excellent"][rating];
}

function friendlyEvidenceRole(role?: SourceEvidenceRole | null): string {
  if (role === "primary") return "Main source";
  if (role === "supporting") return "Supporting source";
  if (role === "background") return "Background";
  if (role === "ignored") return "Not used";
  return "Source";
}

function friendlyReason(role?: SourceEvidenceRole | null): string {
  if (role === "primary") return "Used as a main source for this answer.";
  if (role === "supporting") return "Used to support a claim in this answer.";
  if (role === "background") return "Reviewed for context but not cited in the answer.";
  if (role === "ignored") return "Retrieved but not used in the answer.";
  return "This source was available while the answer was prepared.";
}

function verificationPresentation(verification?: SourceVerification): {
  label: string;
  verified: boolean;
} {
  if (verification?.status === "verified") {
    return { label: verification.label || "Verified source", verified: true };
  }
  if (verification?.status === "probable") {
    return { label: verification.label || "Recognized source", verified: false };
  }
  return { label: "Needs review", verified: false };
}

function QualityStars({
  score,
  compact = false,
}: {
  score?: number | null;
  compact?: boolean;
}) {
  const rating = fivePointScore(score);
  const label = qualityLabel(rating);

  if (rating == null) {
    return (
      <span className="text-xs font-medium text-[var(--chat-subtle-foreground)]">
        Not rated
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2"
      aria-label={`Evidence quality ${rating} out of 5, ${label}`}
    >
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {Array.from({ length: compact ? 1 : 5 }, (_, index) => (
          <Star
            key={index}
            className={`${compact ? "size-3" : "size-4"} ${
              compact || index < rating
                ? "fill-[var(--chat-accent)] text-[var(--chat-accent)]"
                : "fill-transparent text-[var(--chat-border-strong)]"
            }`}
            strokeWidth={1.8}
          />
        ))}
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums text-[var(--chat-foreground)]">
        {rating}/5
      </span>
      {!compact ? (
        <span className="text-xs text-[var(--chat-muted-foreground)]">{label}</span>
      ) : null}
    </span>
  );
}

export function SourceExplorerOverview({ sources }: { sources: SourceIntelligenceSource[] }) {
  const scored = sources.filter((source) => source.trustScore != null);
  const cited = sources.filter(
    (source) => source.evidenceRole === "primary" || source.evidenceRole === "supporting",
  );
  const citedAndScored = cited.filter((source) => source.trustScore != null);
  const qualitySources = citedAndScored.length ? citedAndScored : scored;
  const averageTrust = qualitySources.length
    ? qualitySources.reduce(
        (total, source) => total + (source.trustScore ?? 0),
        0,
      ) / qualitySources.length
    : null;
  const recognized = sources.filter(
    (source) =>
      source.verification?.status === "verified" ||
      source.verification?.status === "probable",
  );

  return (
    <section
      aria-labelledby="source-overview-title"
      className="rounded-2xl bg-[var(--chat-background)] p-4 shadow-[inset_0_0_0_1px_var(--chat-border)]"
    >
      <p
        id="source-overview-title"
        className="text-xs font-semibold text-[var(--chat-foreground)]"
      >
        Evidence quality
      </p>
      <div className="mt-3">
        <QualityStars score={averageTrust} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--chat-muted-foreground)]">
        {cited.length
          ? `${cited.length} of ${sources.length} sources are linked directly in the answer.`
          : "These sources were reviewed, but none are linked directly in the answer."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[var(--chat-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--chat-muted-foreground)]">
          {sources.length} checked
        </span>
        <span className="rounded-full bg-[var(--chat-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--chat-muted-foreground)]">
          {cited.length} used
        </span>
        {recognized.length ? (
          <span className="rounded-full bg-[var(--chat-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--chat-muted-foreground)]">
            {recognized.length} recognized
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function SourceIntelligenceCard({
  source,
  rank,
}: {
  source: SourceIntelligenceSource;
  rank: number;
}) {
  const verification = verificationPresentation(source.verification);
  const preview = compactDescription(source.quote || source.description);
  const signals = source.verification?.signals?.slice(0, 2) ?? [];

  return (
    <article className="rounded-2xl bg-[var(--chat-background)] p-4 shadow-[inset_0_0_0_1px_var(--chat-border),0_12px_32px_-30px_rgba(0,0,0,0.8)]">
      {source.imageUrl ? (
        <SourcePreviewImage src={source.imageUrl} alt="" />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--chat-surface-muted)] shadow-[inset_0_0_0_1px_var(--chat-border)]">
          <SiteFavicon
            url={source.url ?? ""}
            domain={source.domain}
            faviconUrl={source.faviconUrl}
            className="size-6 rounded-md"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-sm font-semibold leading-5 text-[var(--chat-foreground)]">
                {source.title}
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-[var(--chat-subtle-foreground)]">
                {rank}. {source.domain}
              </p>
            </div>
            <QualityStars score={source.trustScore} compact />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                verification.verified
                  ? "text-[var(--source-verified)]"
                  : "text-[var(--chat-muted-foreground)]"
              }`}
            >
              {verification.verified ? (
                <ShieldCheck className="size-3.5" aria-hidden="true" />
              ) : (
                <ShieldQuestion className="size-3.5" aria-hidden="true" />
              )}
              {verification.label}
            </span>
            <span className="text-[var(--chat-muted-foreground)]">
              {friendlyEvidenceRole(source.evidenceRole)}
            </span>
            {source.freshness?.status && source.freshness.status !== "unknown" ? (
              <span className="inline-flex items-center gap-1 text-[var(--chat-subtle-foreground)]">
                <Clock3 className="size-3" aria-hidden="true" />
                {source.freshness.label}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {preview ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--chat-muted-foreground)]">
          {preview}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <details className="group min-w-0 flex-1">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--chat-muted-foreground)] transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]">
            Details
            <ChevronDown
              className="size-3.5 transition-transform duration-150 group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-2 space-y-2 rounded-xl bg-[var(--chat-surface-muted)] p-3 text-[11px] leading-4 text-[var(--chat-muted-foreground)]">
            <p>{friendlyReason(source.evidenceRole)}</p>
            {signals.length ? (
              <ul className="space-y-1.5">
                {signals.map((signal) => (
                  <li key={signal} className="flex gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-3 shrink-0 text-[var(--chat-accent)]"
                      aria-hidden="true"
                    />
                    {signal}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[var(--chat-subtle-foreground)]">
              Quality combines source type, ownership signals, freshness, and usable text.
            </p>
          </div>
        </details>

        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--chat-accent)] transition-[background-color,transform] duration-100 hover:bg-[var(--chat-surface-muted)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
          >
            Open
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function SourcePreviewImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="relative mb-4 aspect-[16/7] overflow-hidden rounded-xl bg-[var(--chat-surface-muted)] shadow-[inset_0_0_0_1px_var(--chat-border)]">
      {!loaded ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-[var(--chat-surface-muted)] motion-reduce:animate-none"
        >
          <div className="absolute inset-x-4 bottom-4 h-2 rounded-full bg-[var(--chat-border)]/70" />
          <div className="absolute bottom-8 left-4 h-2 w-2/5 rounded-full bg-[var(--chat-border)]/55" />
        </div>
      ) : null}
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        loading="lazy"
        referrerPolicy="no-referrer"
        sizes="(max-width: 640px) 100vw, 520px"
        className={`object-cover transition-opacity duration-150 motion-reduce:transition-none ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
