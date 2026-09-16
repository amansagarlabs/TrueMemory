import type { ReactNode } from "react"

import { DitherTexture } from "@/components/ui/dither-surface"

type SurfaceTone = "orange" | "olive" | "midnight"

const toneClasses: Record<SurfaceTone, string> = {
  orange: "bg-[#f47c2c] dark:bg-[#7a2d13]",
  olive: "bg-[#d6d45d] dark:bg-[#3c3b1b]",
  midnight: "bg-[#20233e] dark:bg-[#10111d]",
}

const toneGradients: Record<SurfaceTone, string> = {
  orange:
    "bg-[radial-gradient(circle_at_70%_18%,rgba(255,241,159,0.88),transparent_35%),linear-gradient(135deg,#f88b34_0%,#f7c789_54%,#355f44_100%)] dark:bg-[radial-gradient(circle_at_70%_18%,rgba(242,122,40,0.35),transparent_35%),linear-gradient(135deg,#9d3d17_0%,#7a2d13_54%,#1f281f_100%)]",
  olive:
    "bg-[radial-gradient(circle_at_70%_18%,rgba(255,241,159,0.88),transparent_35%),linear-gradient(135deg,#eef0c1_0%,#d6d45d_54%,#49694c_100%)] dark:bg-[radial-gradient(circle_at_70%_18%,rgba(246,230,108,0.35),transparent_35%),linear-gradient(135deg,#3c3b1b_0%,#525326_54%,#1d3526_100%)]",
  midnight:
    "bg-[radial-gradient(circle_at_70%_18%,rgba(246,230,108,0.5),transparent_35%),linear-gradient(135deg,#2b2d4e_0%,#20233e_54%,#11131f_100%)] dark:bg-[radial-gradient(circle_at_70%_18%,rgba(246,230,108,0.35),transparent_35%),linear-gradient(135deg,#1d1f38_0%,#10111d_54%,#08090f_100%)]",
}

export function DocsSection({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`border-b border-[#dedbd1] bg-[#faf9f6] dark:border-white/10 dark:bg-[#0b0b0b] ${className}`}>{children}</section>
}

export function DocsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`rounded-[16px] border border-[#dedbd1] bg-white p-7 shadow-[0_14px_28px_-24px_rgba(32,25,15,0.55)] dark:border-white/10 dark:bg-[#141512] sm:p-8 ${className}`}>{children}</article>
}

export function DitherShowcase({ children, className = "", tone = "orange" }: { children: ReactNode; className?: string; tone?: SurfaceTone }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[16px] border border-[#dedbd1] ${toneClasses[tone]} shadow-[0_14px_28px_-24px_rgba(32,25,15,0.55)] dark:border-white/10 ${className}`}>
      <div className={`absolute inset-0 ${toneGradients[tone]}`} />
      <DitherTexture
        className="opacity-35 mix-blend-multiply dark:opacity-55 dark:mix-blend-screen"
        opacity={0.72}
        tone={tone === "olive" ? "citrus" : tone}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
