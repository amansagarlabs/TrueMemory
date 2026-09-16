"use client"

import {
  Bot,
  Braces,
  Database,
  Eye,
  FileText,
  Globe2,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import { PaperDither } from "@/components/ui/paper-dither"

type IntegrationNode = {
  title: string
  detail: string
  icon: LucideIcon
  color: string
  glow: string
  position: string
}

const nodes: IntegrationNode[] = [
  {
    title: "Documents",
    detail: "PDF, notes, and project artifacts",
    icon: FileText,
    color: "#ff8a32",
    glow: "rgba(255,138,50,0.18)",
    position: "lg:left-[3%] lg:top-[5%]",
  },
  {
    title: "Web crawl",
    detail: "URLs, sitemaps, and fresh pages",
    icon: Globe2,
    color: "#f6e879",
    glow: "rgba(246,232,121,0.16)",
    position: "lg:left-[3%] lg:top-[38%]",
  },
  {
    title: "Vector memory",
    detail: "Milvus and semantic retrieval",
    icon: Database,
    color: "#6f91ff",
    glow: "rgba(111,145,255,0.18)",
    position: "lg:left-[3%] lg:top-[71%]",
  },
  {
    title: "Agent tools",
    detail: "Search, inspect, and act",
    icon: Bot,
    color: "#29d8ae",
    glow: "rgba(41,216,174,0.17)",
    position: "lg:right-[3%] lg:top-[5%]",
  },
  {
    title: "Workspace chat",
    detail: "Grounded answers with sources",
    icon: MessageSquareText,
    color: "#f15ba7",
    glow: "rgba(241,91,167,0.17)",
    position: "lg:right-[3%] lg:top-[38%]",
  },
  {
    title: "API + MCP",
    detail: "Connect the systems you already use",
    icon: Braces,
    color: "#c676ff",
    glow: "rgba(198,118,255,0.17)",
    position: "lg:right-[3%] lg:top-[71%]",
  },
]

const paths = [
  "M500 260 H390 Q350 260 350 220 V96 Q350 72 318 72 H145",
  "M500 260 H145",
  "M500 260 H390 Q350 260 350 300 V424 Q350 448 318 448 H145",
  "M500 260 H610 Q650 260 650 220 V96 Q650 72 682 72 H855",
  "M500 260 H684 V260 H855",
  "M500 260 H610 Q650 260 650 300 V424 Q650 448 682 448 H855",
]

const nodeActivity = [
  { eyebrow: "Ingestion", value: "knowledge.pdf → 45K tokens indexed" },
  { eyebrow: "Fresh context", value: "help center → 128 pages crawled" },
  { eyebrow: "Retrieval", value: "embedding query → 12 relevant memories" },
  { eyebrow: "Tool call", value: "search.sources → 6 grounded results" },
  { eyebrow: "Grounded answer", value: "Response ready · 3 sources attached" },
  { eyebrow: "Connected", value: "MCP tool registry → 8 tools available" },
]

const features = [
  {
    icon: Eye,
    title: "Sources stay visible",
    detail: "Every response keeps its origin attached.",
  },
  {
    icon: ShieldCheck,
    title: "Permission-aware",
    detail: "Tools act only inside the access you grant.",
  },
  {
    icon: Network,
    title: "One retrieval layer",
    detail: "Every surface recalls the same working context.",
  },
]

export function AgentEcosystem() {
  const reduceMotion = useReducedMotion()
  const [activeNode, setActiveNode] = useState<number | null>(null)

  return (
    <div className="relative isolate overflow-hidden rounded-[18px] border border-[#c9c3b6] bg-[#eee9df] dark:border-white/[0.06] dark:bg-[#080908]">
      <div className="absolute inset-0 bg-[linear-gradient(125deg,#e8e4d8_0%,#dce2ce_46%,#ead0bb_100%)] dark:bg-[linear-gradient(125deg,#090b07_0%,#111609_46%,#261309_100%)]" />
      <PaperDither
        className="inset-0 opacity-[0.58]"
        dark={{ colorBack: "#00000000", colorFront: "#66731f" }}
        light={{ colorBack: "#00000000", colorFront: "#7f7b25" }}
        maxPixelCount={1280 * 720}
        rotation={10}
        scale={0.72}
        shape="warp"
        size={2}
        speed={0.16}
        type="4x4"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(95,87,255,0.18),transparent_22%),radial-gradient(circle_at_84%_15%,rgba(231,84,24,0.14),transparent_24%),linear-gradient(90deg,rgba(245,242,234,0.68),rgba(245,242,234,0.12)_50%,rgba(245,242,234,0.68))] dark:bg-[radial-gradient(circle_at_center,rgba(95,87,255,0.24),transparent_22%),radial-gradient(circle_at_84%_15%,rgba(231,84,24,0.2),transparent_24%),linear-gradient(90deg,rgba(5,6,5,0.88),rgba(8,9,8,0.32)_50%,rgba(5,6,5,0.88))]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(76,74,66,0.75)_0.65px,transparent_0.8px)] [background-size:4px_4px] dark:opacity-50 dark:[background-image:radial-gradient(rgba(4,5,3,0.9)_0.65px,transparent_0.8px)]" />

      <div className="relative min-h-[720px] px-4 py-8 sm:min-h-[660px] sm:px-8 lg:h-[560px] lg:min-h-0 lg:p-0">
        <div className="relative z-20 mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#46493f] backdrop-blur-md dark:border-white/10 dark:bg-black/30 dark:text-[#d9ddcf] lg:absolute lg:left-1/2 lg:top-5 lg:-translate-x-1/2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#dfea6c] opacity-70 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-[#dfea6c]" />
          </span>
          Six systems · one live graph
        </div>

        <svg
          aria-hidden="true"
          className="absolute inset-0 hidden size-full lg:block"
          preserveAspectRatio="none"
          viewBox="0 0 1000 520"
        >
          <defs>
            <linearGradient id="ecosystem-wire" x1="0" x2="1">
              <stop offset="0" stopColor="#555cae" />
              <stop offset="0.5" stopColor="#c3c4ff" />
              <stop offset="1" stopColor="#696fe0" />
            </linearGradient>
          </defs>
          {paths.map((path, index) => (
            <g key={path}>
              <path d={path} fill="none" opacity={activeNode === null || activeNode === index ? 1 : 0.16} stroke="#555875" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              <path
                d={path}
                fill="none"
                opacity={activeNode === null || activeNode === index ? 1 : 0.12}
                stroke={activeNode === index ? nodes[index].color : "url(#ecosystem-wire)"}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={activeNode === index ? 3 : 2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>

        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
          className="relative z-10 mx-auto mb-10 flex w-fit flex-col items-center lg:absolute lg:left-1/2 lg:top-1/2 lg:mb-0 lg:-translate-x-1/2 lg:-translate-y-1/2"
          transition={{ duration: 4.2, ease: "easeInOut", repeat: Infinity }}
        >
          <div className="absolute top-0 size-32 rounded-full border border-[#7470ff]/25 motion-safe:animate-[spin_14s_linear_infinite] [border-left-color:#7771ff]" />
          <div className="absolute top-2 size-28 rounded-full border border-[#7771ff]/20 motion-safe:animate-[spin_9s_linear_infinite_reverse] [border-right-color:#7771ff]" />
          <div className="absolute top-5 size-24 rounded-full bg-[#756eff]/15 blur-2xl" />
          <div className="relative grid size-32 place-items-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_45%_38%,#2b2744,#111119_70%)] shadow-[0_0_65px_rgba(95,87,255,0.3)]">
            <Zap aria-hidden="true" className="size-12 text-[#8b84ff]" strokeWidth={1.7} />
            <Sparkles aria-hidden="true" className="absolute right-5 top-5 size-3 text-[#f6e879]" />
          </div>
          <div className="mt-4 text-center lg:absolute lg:top-[138px] lg:w-52">
            <p className="text-sm font-semibold text-[#24261f] dark:text-[#f2f1e8]">TrueMemory</p>
            <p className="mt-1 text-xs text-[#666b61] dark:text-[#93978f]">One observable agent loop</p>
            <AnimatePresence mode="wait">
              {activeNode !== null && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 w-64 -translate-x-6 rounded-xl border border-black/10 bg-white/75 p-3 text-left shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#11120f]/90"
                  exit={{ opacity: 0, y: 4 }}
                  initial={{ opacity: 0, y: 4 }}
                  key={activeNode}
                >
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: nodes[activeNode].color }}>{nodeActivity[activeNode].eyebrow}</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#3f433b] dark:text-[#c5c9c0]">{nodeActivity[activeNode].value}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="relative z-10 grid grid-cols-2 gap-3 sm:gap-5 lg:absolute lg:inset-0 lg:block">
          {nodes.map((node, index) => (
            <motion.button
              aria-pressed={activeNode === index}
              animate={reduceMotion ? undefined : { y: [0, index % 2 === 0 ? -4 : 4, 0] }}
              className={`group flex min-h-32 flex-col items-center justify-center rounded-[16px] border bg-[#f8f5ee]/88 p-4 text-center backdrop-blur-md transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#756eff] dark:bg-[#11120f]/82 lg:absolute lg:w-[220px] ${activeNode === index ? "border-[#756eff]/70 dark:border-white/30" : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"} ${node.position}`}
              key={node.title}
              onBlur={() => setActiveNode(null)}
              onClick={() => setActiveNode((current) => current === index ? null : index)}
              onFocus={() => setActiveNode(index)}
              onMouseEnter={() => setActiveNode(index)}
              onMouseLeave={() => setActiveNode(null)}
              style={{ boxShadow: `0 20px 55px -36px ${node.glow}` }}
              transition={{ delay: index * 0.16, duration: 4.5 + index * 0.18, ease: "easeInOut", repeat: Infinity }}
              whileHover={reduceMotion ? undefined : { scale: 1.025, y: -3 }}
            >
              <motion.span
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], rotate: [0, index % 2 === 0 ? 4 : -4, 0] }}
                className="grid size-12 place-items-center rounded-full border border-black/10 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_24px_-14px_currentColor] dark:border-white/10 dark:bg-[#171817]"
                style={{ color: node.color }}
                transition={{ delay: index * 0.14, duration: 3.2, ease: "easeInOut", repeat: Infinity }}
              >
                <node.icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </motion.span>
              <h3 className="mt-3 text-sm font-semibold text-[#292c25] dark:text-[#f2f1e8]">{node.title}</h3>
              <p className="mt-1 max-w-[180px] text-[11px] leading-5 text-[#686d63] dark:text-[#9a9e96]">{node.detail}</p>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="relative z-20 grid border-t border-black/[0.09] bg-[#f5f1e8]/88 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0d0f0b]/88 sm:grid-cols-3">
        {features.map((feature) => (
          <div className="flex gap-3 border-b border-black/[0.08] p-5 last:border-b-0 dark:border-white/[0.08] sm:border-b-0 sm:border-r sm:last:border-r-0 lg:px-7 lg:py-6" key={feature.title}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#dfea6c]/20 bg-[#dfea6c]/[0.07] text-[#e6ee82]">
              <feature.icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#292c25] dark:text-[#f2f1e8]">{feature.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#686d63] dark:text-[#92968e]">{feature.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
