import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type HeroColorPanelsProps = {
  className?: string
  children: ReactNode
}

/**
 * A compact, CSS-native take on Cult UI's colour-panel treatment. It keeps the
 * visual structure in the DOM, so the hero remains fast and legible on mobile.
 */
export function HeroColorPanels({ className, children }: HeroColorPanelsProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[20px] border border-[#a7bdb6] bg-[#CAE0DA]",
        "before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(90deg,transparent_0%,transparent_49.7%,rgba(33,66,59,0.16)_49.8%,rgba(33,66,59,0.16)_50.2%,transparent_50.3%),linear-gradient(180deg,transparent_0%,transparent_24.7%,rgba(33,66,59,0.12)_24.8%,rgba(33,66,59,0.12)_25.2%,transparent_25.3%,transparent_49.7%,rgba(33,66,59,0.12)_49.8%,rgba(33,66,59,0.12)_50.2%,transparent_50.3%,transparent_74.7%,rgba(33,66,59,0.12)_74.8%,rgba(33,66,59,0.12)_75.2%,transparent_75.3%)]",
        "after:absolute after:inset-x-0 after:bottom-0 after:-z-10 after:h-1/2 after:bg-[radial-gradient(circle_at_70%_25%,rgba(246,130,31,0.26),transparent_36%)]",
        className,
      )}
    >
      {children}
    </div>
  )
}
