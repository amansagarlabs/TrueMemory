"use client"

import { Boxes, Orbit } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { PaperDither } from "@/components/ui/paper-dither"

const frameworks = ["Next.js", "TanStack Start", "React Router", "Waku"]

export function FrameworkAgnosticCard() {
  const reduceMotion = useReducedMotion()

  return (
    <article className="relative isolate min-h-[390px] overflow-hidden rounded-[16px] border border-[#dedbd1] bg-[#151611] p-7 text-[#f2f1e8] shadow-[0_18px_42px_-30px_rgba(20,16,8,0.85)] dark:border-white/10 sm:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#171813_0%,#171813_44%,#2c2d13_100%)]" />
      <PaperDither
        className="inset-x-0 bottom-0 top-[38%] opacity-85"
        dark={{ colorBack: "#11120d", colorFront: "#e4dd5d" }}
        light={{ colorBack: "#151611", colorFront: "#f1e76d" }}
        maxPixelCount={900 * 600}
        rotation={-12}
        scale={0.66}
        shape="warp"
        size={2}
        speed={0.13}
        type="4x4"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(21,22,17,0.98)_0%,rgba(21,22,17,0.9)_35%,rgba(21,22,17,0.08)_100%)]" />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Portable core</p>
            <h3 className="mt-4 text-2xl font-medium tracking-[-0.04em]">Framework Agnostic</h3>
          </div>
          <motion.span
            animate={reduceMotion ? undefined : { rotate: 360 }}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-[#f6e879]/25 bg-[#f6e879]/5 text-[#f6e879]"
            transition={{ duration: 14, ease: "linear", repeat: Infinity }}
          >
            <Orbit aria-hidden="true" className="size-5" />
          </motion.span>
        </div>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[#b4b8ae]">
          Official support for Next.js, TanStack Start, React Router, and Waku—portable to any React.js framework.
        </p>
      </div>

      <div className="absolute inset-x-7 bottom-7 z-10 flex flex-wrap gap-2 sm:inset-x-8 sm:bottom-8">
        {frameworks.map((framework, index) => (
          <motion.span
            animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
            className="inline-flex items-center gap-2 rounded-full border border-[#f6e879]/35 bg-[#10110d]/88 px-3 py-2 text-[11px] font-medium text-[#f3efae] backdrop-blur"
            key={framework}
            transition={{ delay: index * 0.18, duration: 3.4, ease: "easeInOut", repeat: Infinity }}
          >
            <Boxes aria-hidden="true" className="size-3.5" />
            {framework}
          </motion.span>
        ))}
      </div>
    </article>
  )
}
