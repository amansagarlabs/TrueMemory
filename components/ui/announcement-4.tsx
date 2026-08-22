"use client"

import Link from "next/link"
import { X, ArrowUpRight } from "lucide-react"
import { useState } from "react"

export function AnnouncementBar() {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div className="border-b border-white/5 bg-[#0d0d0d]">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-2.5 sm:px-8">
        <div className="flex flex-1 items-center justify-center gap-3 text-[13px]">
          <span className="text-[var(--text-2)]">
            kontext for the agent era: memory, retrieval, and trusted action in one workspace.
          </span>
          <Link
            href="/chat"
            className="hidden items-center gap-1.5 font-semibold text-[var(--brand)] transition-colors hover:text-[#ff7a4d] sm:inline-flex"
          >
            Try it live
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="ml-4 shrink-0 rounded-md p-1 text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
