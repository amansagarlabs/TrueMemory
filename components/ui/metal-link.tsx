import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type MetalLinkProps = {
  href: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}

export function MetalLink({ href, children, className, ariaLabel }: MetalLinkProps) {
  return (
    <span className={cn("metal-button", className)}>
      <Link
        aria-label={ariaLabel}
        className="metal-button__surface"
        href={href}
      >
        {children}
      </Link>
    </span>
  )
}
