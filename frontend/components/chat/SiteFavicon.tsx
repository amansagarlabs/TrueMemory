"use client";

import Image from "next/image";
import { useState } from "react";
import { Globe2 } from "lucide-react";

export function SiteFavicon({
  url,
  domain,
  faviconUrl: preferredFaviconUrl,
  className = "size-10 rounded-lg",
}: {
  url: string;
  domain: string;
  faviconUrl?: string | null;
  className?: string;
}) {
  const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const direct = getSiteOrigin(url);
  const candidates = Array.from(new Set([
    preferredFaviconUrl,
    direct ? `${direct}/favicon.ico` : null,
    fallback,
  ].filter((value): value is string => Boolean(value))));
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
        <Globe2 className="size-1/2 text-[var(--chat-accent)]/55" strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden bg-[var(--chat-surface-muted)] ${className}`}
    >
      {!loaded ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-[var(--chat-border)]/55 motion-reduce:animate-none"
        />
      ) : null}
      <Image
        src={candidates[candidateIndex] || fallback}
        alt=""
        fill
        unoptimized
        loading="lazy"
        referrerPolicy="no-referrer"
        sizes="128px"
        className={`object-contain transition-opacity duration-150 motion-reduce:transition-none ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          if (candidateIndex < candidates.length - 1) {
            setCandidateIndex((current) => current + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    </span>
  );
}

function getSiteOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
