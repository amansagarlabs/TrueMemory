"use client";

import { cn } from "@/lib/utils";

interface DitherSkeletonProps {
  className?: string;
  shimmer?: boolean;
}

export function DitherSkeleton({ className, shimmer = true }: DitherSkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0b08]",
        className
      )}
    >
      {/* Dither noise pattern */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />
      {/* Shimmer overlay */}
      {shimmer && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_2s_infinite]" />
      )}
    </div>
  );
}
