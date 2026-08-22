"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BrainCircuit,
  Check,
  Database,
  FileText,
  FileUp,
  Code2,
  CircleCheck,
  Layers3,
  Link2,
  Network,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react"

import { FumadocsNav } from "@/components/ui/fumadocs-nav"
import { DocsCard, DocsSection, DitherShowcase } from "@/components/ui/fumadocs-surface"
import { MetalLink } from "@/components/ui/metal-link"
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid"
import { Globe } from "@/components/ui/globe"
import { AnimatedList } from "@/components/ui/animated-list"
import { SectionHeading } from "@/components/ui/section-heading"
import { DitherSurface, DitherTexture } from "@/components/ui/dither-surface"
import { PaperDither } from "@/components/ui/paper-dither"
import { AgentEcosystem } from "@/components/ui/agent-ecosystem"
import { FrameworkAgnosticCard } from "@/components/ui/framework-agnostic-card"
import { PricingCards } from "@/components/ui/pricing-cards"
import { AUTH_USER_CHANGED_EVENT, isAuthenticated } from "@/lib/auth"


const capabilities = [
  {
    number: "01",
    title: "Bring your work in",
    description:
      "Drop in the documents, notes, and project artifacts your team already relies on. kontext extracts structure, preserves the source, and makes the useful parts retrievable.",
    icon: FileText,
    detail: "PDF · Markdown · Web",
  },
  {
    number: "02",
    title: "Recall the right context",
    description:
      "Each question starts with the current task, then checks the decisions and source material around it before reaching for generic answers or the live web.",
    icon: Search,
    detail: "Memory · RAG · Retrieval",
  },
  {
    number: "03",
    title: "Move work forward",
    description:
      "Turn grounded context into drafts, decisions, and repeatable workflows while keeping approvals, tool calls, and recovery paths visible to the people responsible.",
    icon: Workflow,
    detail: "Actions · Logs · Approval",
  },
]

const memoryLayers = [
  {
    label: "Recent context",
    text: "The active conversation, files, and immediate goal—kept close so the next answer starts in the right place.",
    status: "Now",
  },
  {
    label: "Project memory",
    text: "Decisions, source files, owners, and project history that explain how the current work got here.",
    status: "Indexed",
  },
  {
    label: "Durable memory",
    text: "Verified knowledge worth carrying forward across sessions, teammates, and model changes.",
    status: "Persistent",
  },
  {
    label: "Live intelligence",
    text: "Current web evidence fetched only when workspace memory cannot answer the question with enough confidence.",
    status: "On demand",
  },
]

const roadmap = [
  ["01", "Memory", "Ground every answer in the work your team has already done."],
  ["02", "Context", "Link people, artifacts, and decisions into one working view."],
  ["03", "Actions", "Give tools clear permission, visible inputs, and recoverable outputs."],
  ["04", "Workflows", "Turn reliable steps into repeatable processes with checkpoints."],
  ["05", "Agents", "Delegate bounded goals while keeping humans in the loop when it matters."],
]

const principles = [
  {
    title: "Local-first by design",
    text: "Run the workspace on your machine or infrastructure, with the option to keep sensitive project context close to home.",
    icon: Database,
  },
  {
    title: "Sources stay visible",
    text: "Every useful answer can point back to the memory, artifact, or page that supported it—before anyone acts on it.",
    icon: Layers3,
  },
  {
    title: "You approve the action",
    text: "Tools and workflows remain traceable, reviewable, and reversible instead of disappearing behind a black-box agent run.",
    icon: ShieldCheck,
  },
]

function PrinciplePreview({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div aria-hidden="true" className="relative flex h-44 items-center justify-center overflow-hidden border-b border-[#d9d5ca] bg-[radial-gradient(circle_at_center,rgba(132,152,79,0.2),transparent_54%)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_center,rgba(223,234,108,0.1),transparent_56%)]">
        <div className="absolute left-[14%] right-[14%] top-1/2 border-t border-dashed border-[#9ca68a] dark:border-[#626a55]" />
        <div className="relative w-[74%] rounded-[14px] border border-[#c8c4b8] bg-[#fbf9f2]/90 p-3 shadow-[0_18px_38px_-26px_rgba(47,48,35,0.48)] backdrop-blur dark:border-white/10 dark:bg-[#10120e]/90">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[9px] bg-[#e9eddc] text-[#536343] dark:bg-[#dfea6c]/10 dark:text-[#dfea6c]">
                <Database aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-[#30342d] dark:text-[#f0f2e9]">Kontext.local</p>
                <p className="mt-0.5 font-mono text-[9px] text-[#777d70] dark:text-[#8e9589]">127.0.0.1 · private</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7efe1] px-2 py-1 text-[9px] font-semibold text-[#42704a] dark:bg-[#74a86b]/10 dark:text-[#a9d39f]">
              <span className="size-1.5 rounded-full bg-[#68a05f]" /> Running
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
            <span className="rounded-md border border-[#dedbd1] bg-white/70 px-2 py-1.5 text-[#656b61] dark:border-white/10 dark:bg-white/[0.03] dark:text-[#aab1a5]">Storage · local</span>
            <span className="rounded-md border border-[#dedbd1] bg-white/70 px-2 py-1.5 text-[#656b61] dark:border-white/10 dark:bg-white/[0.03] dark:text-[#aab1a5]">Network · optional</span>
          </div>
        </div>
      </div>
    )
  }

  if (index === 1) {
    return (
      <div aria-hidden="true" className="relative flex h-44 items-center justify-center overflow-hidden border-b border-[#d9d5ca] bg-[radial-gradient(circle_at_64%_34%,rgba(230,111,34,0.16),transparent_45%)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_64%_34%,rgba(246,130,31,0.12),transparent_48%)]">
        <div className="w-[82%] rounded-[14px] border border-[#c8c4b8] bg-[#fbf9f2]/90 p-3 shadow-[0_18px_38px_-26px_rgba(47,48,35,0.48)] backdrop-blur dark:border-white/10 dark:bg-[#10120e]/90">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-[#33372f] dark:text-[#eff1e9]">
            <Layers3 aria-hidden="true" className="size-3.5 text-[#d86824] dark:text-[#f69a50]" /> Grounded answer
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#555b51] dark:text-[#c0c6bb]">The authentication decision uses passkeys with recovery codes.</p>
          <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[8px]">
            <span className="rounded-full border border-[#d5d1c7] bg-white px-2 py-1 text-[#6a7066] dark:border-white/10 dark:bg-white/5 dark:text-[#aeb5aa]">decision-12</span>
            <span className="rounded-full border border-[#d5d1c7] bg-white px-2 py-1 text-[#6a7066] dark:border-white/10 dark:bg-white/5 dark:text-[#aeb5aa]">docs/auth.md</span>
            <span className="rounded-full bg-[#f7e4d5] px-2 py-1 text-[#a84e17] dark:bg-[#f6821f]/10 dark:text-[#f69a50]">2 sources</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div aria-hidden="true" className="relative flex h-44 items-center justify-center overflow-hidden border-b border-[#d9d5ca] bg-[radial-gradient(circle_at_center,rgba(111,105,224,0.14),transparent_50%)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_center,rgba(129,122,255,0.11),transparent_52%)]">
      <div className="w-[78%] rounded-[14px] border border-[#c8c4b8] bg-[#fbf9f2]/92 p-3 shadow-[0_18px_38px_-26px_rgba(47,48,35,0.48)] backdrop-blur dark:border-white/10 dark:bg-[#10120e]/92">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <span className="grid size-8 place-items-center rounded-[9px] bg-[#eceaf8] text-[#655fb0] dark:bg-[#817aff]/10 dark:text-[#9d97ff]">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-[#30342d] dark:text-[#f0f2e9]">Publish workflow</p>
              <p className="mt-0.5 text-[9px] text-[#777d70] dark:text-[#8e9589]">3 changes · external action</p>
            </div>
          </div>
          <span className="rounded-full bg-[#f3ead2] px-2 py-1 text-[8px] font-semibold text-[#8a6517] dark:bg-[#f6e879]/10 dark:text-[#f6e879]">Approval needed</span>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex min-h-8 flex-1 items-center justify-center rounded-[8px] border border-[#d5d1c7] bg-white text-[9px] font-semibold text-[#5e645a] dark:border-white/10 dark:bg-white/5 dark:text-[#adb4a9]">Review</span>
          <span className="flex min-h-8 flex-1 items-center justify-center rounded-[8px] bg-[#34382f] text-[9px] font-semibold text-white dark:bg-[#f6e879] dark:text-[#171814]">Approve action</span>
        </div>
      </div>
    </div>
  )
}

const faqs = [
  [
    "Is kontext another chatbot?",
    "No. Chat is one interface to a persistent memory and workspace layer built around your projects, artifacts, and decisions.",
  ],
  [
    "Can I use my own documents?",
    "Yes. Upload PDFs and project artifacts, run retrieval, and keep the source context attached to the answer.",
  ],
  [
    "Does it search the web?",
    "Yes, after it checks the conversation, your artifacts, and saved memory. Live search is a deliberate fallback, not the default.",
  ],
  [
    "Can I self-host it?",
    "Yes. kontext is designed as an open-source stack with a Next.js interface, FastAPI services, and pluggable storage.",
  ],
]

const knowledgeSources = [
  {
    source: "knowledge.pdf",
    kind: "Document",
    tokens: "45K",
    vectors: "1.2K",
  },
  {
    source: "help-center",
    kind: "Website",
    tokens: "12K",
    vectors: "0.8K",
  },
]

const liveFeed: Array<{ title: string; description: string }> = [
  {
    title: "Memory search",
    description: "Scans conversation context and saved memory for relevant prior decisions.",
  },
  {
    title: "Artifact retrieval",
    description: "Finds matching documents, code, and project files from your workspace.",
  },
  {
    title: "Web fallback",
    description: "Triggers live search only when local context is insufficient.",
  },
]

const pipelineNodes = [
  { id: "upload", label: "Upload", detail: "PDF + notes", icon: FileText },
  { id: "index", label: "Index", detail: "Chunk + embed", icon: Layers3 },
  { id: "recall", label: "Recall", detail: "Memory first", icon: BrainCircuit },
  { id: "answer", label: "Answer", detail: "Sources attached", icon: Workflow },
]

function PipelineFlow() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative grid h-full w-full grid-cols-2 grid-rows-2 place-content-center gap-3 p-5 sm:p-7">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <path
          className="stroke-[#b9c5bf] dark:stroke-white/15"
          d="M25 25H75V75H25"
          fill="none"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        <motion.path
          animate={reduceMotion ? undefined : { strokeDashoffset: -36 }}
          d="M25 25H75V75H25"
          fill="none"
          initial={{ strokeDashoffset: 36 }}
          stroke="#f6821f"
          strokeDasharray="7 6"
          strokeWidth="1.5"
          transition={{ duration: 1.2, ease: "linear", repeat: reduceMotion ? 0 : Infinity }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {pipelineNodes.map((node, index) => (
        <div
          className={`flex min-w-0 items-center ${index === 2 ? "col-start-2 row-start-2" : ""} ${index === 3 ? "col-start-1 row-start-2" : ""}`}
          key={node.id}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 flex min-w-0 flex-1 flex-col items-center rounded-[16px] border border-[#c9d3ce] bg-[#f8faf7]/95 p-2.5 shadow-[0_1px_2px_rgba(17,20,15,0.06),0_14px_30px_-24px_rgba(17,20,15,0.42)] backdrop-blur dark:border-white/10 dark:bg-[#171b17]/95 sm:p-3"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.12,
              duration: reduceMotion ? 0 : 0.42,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <span className="grid size-8 place-items-center rounded-[10px] bg-[#CAE0DA] text-[#315a50] dark:bg-[#f6821f]/15 dark:text-[#f6821f] sm:size-9">
              <node.icon aria-hidden="true" className="size-4 sm:size-[18px]" strokeWidth={1.7} />
            </span>
            <p className="mt-2 text-center text-xs font-semibold text-[#171a15] dark:text-[#f2f5ef]">
              {node.label}
            </p>
            <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[#6f776c] dark:text-[#9ca59a]">
              {node.detail}
            </p>
            <span className="relative mt-2 flex size-1.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f6821f] opacity-50 motion-reduce:animate-none" />
              <span className="relative inline-flex size-full rounded-full bg-[#f6821f]" />
            </span>
          </motion.div>
        </div>
      ))}
    </div>
  )
}

const bentoItems = [
  {
    name: "Everything you need, already wired",
    description: "Memory, agents, web intelligence, and context retrieval — all connected in one platform loop.",
    href: "/chat",
    cta: "Open workspace",
    className: "col-span-1 aspect-square lg:col-span-2 lg:row-span-4",
    ditherTone: "orange" as const,
    eyebrow: "Platform capabilities",
    featured: true,
    headingLevel: 2 as const,
    background: (
      <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_82%_8%,rgba(246,130,31,0.16),transparent_30%),linear-gradient(180deg,#eef4f0_0%,#fafbf6_100%)] dark:bg-[radial-gradient(circle_at_82%_8%,rgba(246,130,31,0.15),transparent_34%),linear-gradient(180deg,#11140f_0%,#0b0e0b_100%)]">
        <div className="absolute inset-x-0 top-0 bottom-[11rem]">
          <PipelineFlow />
        </div>
      </div>
    ),
  },
  {
    name: "Retrieval you can inspect",
    description: "See whether an answer came from memory, an artifact, or a deliberate web fallback.",
    href: "#agent-flow",
    cta: "See the flow",
    className: "col-span-1 aspect-square lg:col-span-2 lg:row-span-2 lg:aspect-auto",
    ditherTone: "citrus" as const,
    layout: "wide" as const,
    background: (
      <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(202,224,218,0.9),transparent_52%),linear-gradient(180deg,#f8faf7_0%,#fafbf6_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(202,224,218,0.12),transparent_52%),linear-gradient(180deg,#11140f_0%,#0b0e0b_100%)]">
        <div className="career-dot-field absolute inset-x-0 top-0 bottom-[11rem] opacity-[0.08] lg:inset-y-0 lg:left-[44%]" />
        <div className="absolute inset-x-0 top-0 bottom-[11rem] lg:inset-y-0 lg:left-[44%]">
          <AnimatedList className="absolute inset-x-5 top-1/2 -translate-y-1/2 items-stretch gap-2 sm:inset-x-8 lg:inset-x-6" delay={850}>
            {liveFeed.slice().reverse().map((item) => (
              <div className="rounded-[14px] border border-[#c9d3ce] bg-white/82 p-3 shadow-[0_1px_2px_rgba(17,20,15,0.04)] backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88" key={item.title}>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#171a15] dark:text-[#f2f5ef]">
                  <span className="size-1.5 rounded-full bg-[#f6821f]" />
                  {item.title}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-[#697168] dark:text-[#aeb6ad]">
                  {item.description}
                </p>
              </div>
            ))}
          </AnimatedList>
        </div>
      </div>
    ),
  },
  {
    name: "Live web, only when needed",
    description: "Bring current information into the workspace without losing the local context trail.",
    href: "/AmanCrawl",
    cta: "Explore web intelligence",
    className: "hidden",
    ditherTone: "sage" as const,
    background: (
      <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,#eef4f0_0%,#fafbf6_100%)] dark:bg-[linear-gradient(180deg,#11140f_0%,#0b0e0b_100%)]">
        <div className="absolute inset-x-0 top-0 bottom-[11rem] overflow-hidden">
          <div className="absolute left-1/2 top-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#CAE0DA]/70 blur-3xl dark:bg-[#f6821f]/12" />
          <Globe className="!inset-auto left-1/2 top-1/2 !w-[80%] -translate-x-1/2 -translate-y-1/2" />
          <span className="absolute bottom-4 left-1/2 inline-flex min-h-8 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[#c9d3ce] bg-white/82 px-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#53645f] backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88 dark:text-[#CAE0DA]">
            <span className="size-1.5 rounded-full bg-[#f6821f]" />
            Web fallback · source linked
          </span>
        </div>
      </div>
    ),
  },
  {
    name: "One connected agent stack",
    description: "Memory, projects, tools, and approvals stay connected around a shared workspace.",
    href: "#developers",
    cta: "View the architecture",
    className: "col-span-1 aspect-square lg:col-span-2 lg:row-span-2 lg:aspect-auto",
    ditherTone: "midnight" as const,
    layout: "reverse" as const,
    background: (
      <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_75%_45%,rgba(246,130,31,0.14),transparent_34%),linear-gradient(180deg,#eef4f0_0%,#fafbf6_100%)] dark:bg-[radial-gradient(circle_at_75%_45%,rgba(246,130,31,0.14),transparent_36%),linear-gradient(180deg,#11140f_0%,#0b0e0b_100%)]">
        <div className="career-dot-field absolute inset-x-0 top-0 bottom-[11rem] opacity-[0.08]" />
        <div className="absolute inset-x-0 top-0 bottom-[11rem] flex items-center justify-start pl-4 sm:pl-6 lg:left-0 lg:right-auto lg:w-[44%] lg:pl-8">
          <div className="relative size-[15rem] sm:size-[16rem]">
            <div className="absolute inset-5 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(73,107,99,0.16),transparent_58%)] blur-2xl dark:bg-[radial-gradient(circle_at_50%_50%,rgba(246,130,31,0.18),transparent_58%)]" />
            <div className="absolute inset-0 rounded-[2rem] border border-[#d0d9d4] bg-white/35 backdrop-blur-xl dark:border-white/10 dark:bg-white/5" />
            <div className="absolute inset-3 rounded-[1.5rem] border border-dashed border-[#c7d1cc] dark:border-white/10" />
            <div className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[18px] bg-[#11140f] text-[#CAE0DA] shadow-[0_12px_30px_-16px_rgba(17,20,15,0.55)] dark:bg-[#CAE0DA] dark:text-[#11140f]">
              <BrainCircuit aria-hidden="true" className="size-7" />
            </div>
            <span className="absolute left-1/2 top-5 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#c9d3ce] bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#496b63] shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88 dark:text-[#CAE0DA]">
              <Database aria-hidden="true" className="size-3.5" />
              Memory
            </span>
            <span className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-[#c9d3ce] bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#496b63] shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88 dark:text-[#CAE0DA]">
              <Layers3 aria-hidden="true" className="size-3.5" />
              Projects
            </span>
            <span className="absolute left-1/2 bottom-5 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#c9d3ce] bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#496b63] shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88 dark:text-[#CAE0DA]">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Approvals
            </span>
            <span className="absolute left-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-[#c9d3ce] bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#496b63] shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#171b17]/88 dark:text-[#CAE0DA]">
              <Search aria-hidden="true" className="size-3.5" />
              Tools
            </span>
          </div>
        </div>
      </div>
    ),
  },
]

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 grid-cols-2 gap-[3px] rounded-[9px] bg-[#f6821f] p-[7px] shadow-[0_1px_2px_rgba(35,20,8,0.18)]"
    >
      <span className="rounded-[2px] bg-white" />
      <span className="rounded-[2px] bg-white/45" />
      <span className="rounded-[2px] bg-white/45" />
      <span className="rounded-[2px] bg-white" />
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a3d09] dark:text-[#f6821f]">
      {children}
    </p>
  )
}

function HeroCanvas({
  workspaceHref,
  workspaceLabel,
}: {
  workspaceHref: string
  workspaceLabel: string
}) {
  return (
    <div className="hero-canvas relative isolate min-h-[600px] h-[70vh] max-h-[900px] overflow-hidden rounded-[18px] border border-white/10 bg-[#090a08] shadow-[0_20px_60px_-36px_rgba(0,0,0,0.7)]">
      <div className="absolute inset-0 bg-[linear-gradient(115deg,#090a08_0%,#0c1109_37%,#23150d_71%,#180e09_100%)]" />
      <PaperDither
        className="inset-0 opacity-[0.82]"
        dark={{ colorBack: "#00000000", colorFront: "#4d6519" }}
        eager
        light={{ colorBack: "#00000000", colorFront: "#7f7420" }}
        maxPixelCount={1800 * 1000}
        scale={0.74}
        shape="wave"
        size={2}
        speed={0.22}
        type="4x4"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(233,101,28,0.34),transparent_16%),radial-gradient(circle_at_30%_48%,rgba(123,150,34,0.34),transparent_26%),linear-gradient(90deg,rgba(6,7,5,0.56)_0%,rgba(8,10,5,0.24)_40%,rgba(79,31,12,0.18)_84%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(rgba(5,6,4,0.92)_0.7px,transparent_0.84px)] [background-size:4px_4px] [mask-image:linear-gradient(90deg,black_0%,rgba(0,0,0,0.94)_68%,transparent_90%)]" />
      <PaperDither
        className="left-auto right-[5%] top-[10%] h-[60%] w-[31%] min-w-[250px] max-w-[440px]"
        dark={{ colorBack: "#00000000", colorFront: "#ff6f00" }}
        eager
        light={{ colorBack: "#00000000", colorFront: "#ff6f00" }}
        maxPixelCount={960 * 960}
        scale={0.6}
        shape="sphere"
        size={2}
        speed={1}
        type="4x4"
      />
      <div className="relative z-10 flex size-full flex-col px-4 max-md:items-center max-md:text-center md:p-12">
        <div className="mt-12 w-fit max-w-[640px]">
          <p className="w-fit rounded-full border border-[#f6e879]/50 p-2 text-xs font-medium text-[#f6e879] max-md:mx-auto">
            the memory layer your agents can trust.
          </p>
          <h1 className="mt-8 text-balance text-[clamp(3rem,5vw,5.2rem)] font-medium leading-[0.92] tracking-[-0.05em] text-[#f0ede8] xl:mb-12">
            Your      
            <br className="md:hidden" /> work ,
            <br />
            <span className="text-[#f6e879]">remembered</span>.
          </h1>
          <div className="flex w-fit flex-row items-center justify-center gap-4 max-md:mx-auto max-sm:flex-wrap">
            <MetalLink href={workspaceHref} className="min-h-12 rounded-full bg-[#f6e879] px-5 text-sm font-medium tracking-tight text-[#171814] hover:bg-[#fff5a5]">
              {workspaceLabel}
            </MetalLink>
            <a href="#product" className="inline-flex min-h-12 justify-center rounded-full border border-white/10 bg-[#232321] px-5 py-3 text-sm font-medium tracking-tight text-[#f5f3e9] transition-colors hover:bg-[#2d2d2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6e879]">
              See how it works
            </a>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 right-[2%] z-20 hidden h-[48%] min-h-[240px] w-[60%] max-w-[900px] overflow-hidden rounded-t-[16px] border border-white/10 bg-[#11120f] shadow-[0_-20px_48px_-22px_rgba(0,0,0,0.88)] lg:block xl:w-[62%]">
        <div className="flex h-full">
          <aside className="w-[186px] shrink-0 border-r border-white/10 bg-[#171812] p-4 text-[11px] text-[#9ca19a]">
            <div className="flex items-center gap-2 font-semibold text-[#f4f4ef]"><span className="size-3 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f27a28)]" /> kontext</div>
            <div className="mt-5 rounded-md border border-white/10 px-2 py-1.5 text-[#777a72]">⌕ Search</div>
            <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-[#6d7068]">Workspace</p>
            <p className="mt-2 rounded-md bg-[#31321f] px-2 py-1.5 text-[#f6e879]">Quick start</p>
            <p className="mt-1 px-2 py-1.5">Memory</p>
            <p className="mt-1 px-2 py-1.5">Projects</p>
          </aside>
          <div className="flex-1 bg-[#10110d] p-5 text-[#f4f4ef] sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-[-0.04em]">Grounded workspace</h2><p className="mt-1 text-xs text-[#9fa19a]">Your context, ready when agents need it.</p></div><span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-[#b4b6ae]">Open</span></div>
            <div className="mt-5 h-px bg-white/10" />
            <p className="mt-4 text-sm font-semibold">Recent context</p>
            <p className="mt-2 max-w-xl text-xs leading-5 text-[#9fa19a]">Search memory, inspect sources, and keep every agent action tied to the work it came from.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false)
  const [showPromoBanner, setShowPromoBanner] = useState(true)

  useEffect(() => {
    const syncAuthState = () => setAuthenticated(isAuthenticated())

    syncAuthState()
    window.addEventListener("pageshow", syncAuthState)
    window.addEventListener("storage", syncAuthState)
    window.addEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState)

    return () => {
      window.removeEventListener("pageshow", syncAuthState)
      window.removeEventListener("storage", syncAuthState)
      window.removeEventListener(AUTH_USER_CHANGED_EVENT, syncAuthState)
    }
  }, [])

  const workspaceHref = authenticated ? "/chat" : "/signup"
  const workspaceLabel = authenticated ? "Open workspace" : "Get started"

  return (
    <main
      id="main-content"
      className="context-home min-h-screen bg-[#f8f7f3] text-[#171a15] selection:bg-[#f6821f] selection:text-[#11140f] dark:bg-[#10130f] dark:text-[#f2f5ef]"
    >
      {showPromoBanner && (
        <div className="relative bg-[#fa5a19] px-4 py-2.5 text-center text-sm font-medium text-white">
          <span>Kontext Web is live. Search, scrape, map, crawl, and extract with one API.</span>
          <Link href="#pricing" className="ml-2 underline underline-offset-2 hover:text-white/80">
            Try it now →
          </Link>
          <button
            type="button"
            onClick={() => setShowPromoBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
            aria-label="Dismiss promo banner"
          >
            ×
          </button>
        </div>
      )}

      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-[#11140f] px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <FumadocsNav />

      <div id="content">
        <section className="border-b border-[#e6e0d6] bg-[#faf9f6] px-5 py-4 dark:border-white/10 dark:bg-[#0b0b0b] sm:px-8 lg:px-10 lg:py-5">
          <div className="site-container">
            <HeroCanvas workspaceHref={workspaceHref} workspaceLabel={workspaceLabel} />
          </div>
          <p className="site-container px-2 pb-3 pt-16 text-pretty text-[clamp(1.6rem,3.1vw,3rem)] leading-[1.18] tracking-[-0.045em] text-[#595c50] dark:text-[#d4d4c9] sm:px-6 lg:pt-20">
            kontext is a <span className="text-[#e76f22]">memory and context layer</span> for builders, designed to keep files, decisions, and agent actions connected in one grounded workspace.
          </p>
        </section>

        <section className="border-b border-[#e6e0d6] bg-[#faf9f6] text-[#595c50] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-[#f5f3e9]">
          <div className="site-container px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
              <h2 className="max-w-4xl text-balance font-heading text-3xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-5xl">
                One system for your files, memory, and agents.
              </h2>
              <p className="max-w-md text-pretty text-sm leading-7 text-[#62685e] lg:justify-self-end dark:text-[#afb6aa]">
                Build grounded agent workflows without stitching together a document store,
                retrieval layer, and opaque automation stack.
              </p>
            </div>
            <div className="mt-10 grid border-y border-[#e6e0d6] sm:grid-cols-3 dark:border-[#343a31]">
              {[
                ["04", "context layers", "from recent task to live intelligence"],
                ["01", "grounded loop", "memory first, web only when needed"],
                ["00", "black-box actions", "every tool call stays visible"],
              ].map(([value, label, detail], index) => (
                <div
                    className={`py-6 sm:px-6 ${index > 0 ? "border-t border-[#e6e0d6] sm:border-l sm:border-t-0 dark:border-[#343a31]" : "sm:pl-0"}`}
                  key={label}
                >
                  <p className="font-heading text-4xl font-medium tracking-[-0.05em] text-[#f6821f] tabular-nums">
                    {value}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#171a15] dark:text-white">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#899184] dark:text-[#899184]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="border-b border-[#e6e0d6] bg-[#faf9f6] dark:border-white/10 dark:bg-[#0b0b0b]">
          <div className="site-container px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
            <div className="grid gap-5 lg:grid-cols-2">
              <DitherShowcase className="min-h-[370px] lg:col-span-2 lg:min-h-[430px]">
                <div className="flex h-full min-h-[370px] items-center justify-center p-6 sm:p-12">
                  <div className="w-full max-w-[760px] overflow-hidden rounded-[14px] border border-[#d9d8d3] bg-[#f4f3ef] text-[#242824] shadow-[0_18px_34px_-16px_rgba(20,26,19,0.5)]">
                    <div className="flex items-center justify-between border-b border-[#d9d8d3] px-4 py-3"><span className="rounded-md border border-[#f27a28] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f27a28]">Try it out</span><span className="font-mono text-[11px] text-[#5e655d]">aman create workspace</span><span className="text-xs text-[#777c73]">□</span></div>
                    <div className="p-5 sm:p-8"><p className="font-mono text-[11px] text-[#7b8077]">› Terminal</p><p className="mt-4 font-mono text-sm text-[#2e3530]">aman create workspace</p><div className="mt-6 grid gap-2 text-xs text-[#61675e] sm:grid-cols-2"><span>◇ Project name</span><span>my-workspace</span><span>◆ Choose a memory source</span><span>● Local files</span></div></div>
                  </div>
                </div>
              </DitherShowcase>

              <DocsCard className="min-h-[280px]">
                <h3 className="text-2xl font-medium tracking-[-0.045em] text-[#595c50] dark:text-[#f1f1e8]">A workspace people trust.</h3>
                <p className="mt-6 max-w-lg text-sm leading-6 text-[#676c62] dark:text-[#aeb2a7]">Loved by builders who want memory, sources, and agent actions to stay in one place.</p>
                <MetalLink href={workspaceHref} className="mt-8 rounded-full bg-[#f27a28] px-5 text-white hover:bg-[#dd651a]">{workspaceLabel} <ArrowRight aria-hidden="true" className="ml-2 size-4" /></MetalLink>
              </DocsCard>

              <article className="min-h-[280px] overflow-hidden rounded-[16px] border border-[#dedbd1] bg-[#d6d45d] p-4 shadow-[0_14px_28px_-24px_rgba(32,25,15,0.55)] dark:border-white/10 dark:bg-[#3c3b1b] sm:p-6">
                <div className="grid h-full gap-4 sm:grid-cols-2"><div className="rounded-[12px] bg-[#f8f7f3] p-5"><p className="text-sm leading-6 text-[#595c50]">“The context trail makes every agent handoff feel grounded.”</p><p className="mt-8 text-xs font-semibold text-[#77796f]">Builder note</p></div><div className="rounded-[12px] bg-[#f8f7f3] p-5"><p className="text-sm leading-6 text-[#595c50]">“I can see why an answer exists before I trust it.”</p><p className="mt-8 text-xs font-semibold text-[#77796f]">Workspace member</p></div></div>
              </article>

              <DitherShowcase tone="midnight" className="min-h-[340px]">
                <div className="flex min-h-[340px] items-center justify-center p-6"><div className="w-full max-w-[530px] overflow-hidden rounded-[12px] border border-[#20231f] bg-[#11130f] text-[#f5f4e9] shadow-[0_16px_30px_-16px_rgba(0,0,0,0.72)]"><div className="border-b border-white/10 px-4 py-3 text-xs text-[#a8aba2]">kontext · quick start</div><div className="grid gap-3 p-5 sm:grid-cols-2"><div className="rounded-md border border-white/10 p-3"><p className="text-xs font-semibold">Memory core</p><p className="mt-2 text-[11px] leading-5 text-[#a8aba2]">Recent context, project memory, durable memory.</p></div><div className="rounded-md border border-white/10 p-3"><p className="text-xs font-semibold">Agent tools</p><p className="mt-2 text-[11px] leading-5 text-[#a8aba2]">Search, inspect, approve, and recover.</p></div></div></div></div>
              </DitherShowcase>

              <DocsCard className="min-h-[340px]">
                <h3 className="text-2xl font-medium tracking-[-0.045em] text-[#595c50] dark:text-[#f1f1e8]">Minimal surface. Maximum control.</h3>
                <p className="mt-6 text-sm leading-6 text-[#676c62] dark:text-[#aeb2a7]">Keep the interface calm while every source, permission, and model choice stays inspectable.</p>
                <div className="mt-8 rounded-[10px] border border-[#dedbd1] bg-[#f8f7f3] p-4 font-mono text-xs leading-6 text-[#596057] dark:border-white/10 dark:bg-[#1a1c18] dark:text-[#d3d5cc]">aman memory search <span className="text-[#e76f22]">&quot;launch checklist&quot;</span><br /><span className="text-[#7a8076]">→ 12 sources attached</span></div>
              </DocsCard>

              <FrameworkAgnosticCard />

              <DocsCard className="min-h-[390px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e76f22] dark:text-[#f6e879]">Composable by default</p>
                <h3 className="mt-4 text-2xl font-medium tracking-[-0.045em] text-[#595c50] dark:text-[#f1f1e8]">One context layer. Any agent stack.</h3>
                <p className="mt-5 max-w-lg text-sm leading-7 text-[#676c62] dark:text-[#aeb2a7]">Keep memory, retrieval, tools, and approvals portable while the framework around your product changes.</p>
                <div className="mt-8 space-y-2">
                  {["Memory and retrieval", "Tools and permissions", "Sources and audit trail"].map((item) => (
                    <div className="flex items-center justify-between rounded-[10px] border border-[#dedbd1] bg-[#f8f7f3] px-4 py-3 text-xs text-[#595c50] dark:border-white/10 dark:bg-[#1a1c18] dark:text-[#d3d5cc]" key={item}>
                      <span>{item}</span><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#e76f22] dark:text-[#f6e879]">Portable</span>
                    </div>
                  ))}
                </div>
              </DocsCard>
            </div>
            <div className="mx-auto max-w-2xl pb-3 pt-24 text-center"><h2 className="text-4xl font-medium tracking-[-0.055em] text-[#e76f22] sm:text-5xl">Agents that can write.</h2><p className="mt-5 text-sm leading-7 text-[#676c62] dark:text-[#aeb2a7]">From a grounded prompt to a clear next step, every action keeps its context attached.</p></div>
          </div>
        </section>

        <section id="grounded-loop" className="border-b border-[#e6e0d6] dark:border-white/10">
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <Eyebrow>One grounded loop</Eyebrow>
              <h2 className="max-w-4xl text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] sm:text-6xl">
                Context that gets more useful every time you work.
              </h2>
            </div>

            <DitherSurface className="mt-16 rounded-[24px] border border-[#272821] bg-[#090a08] shadow-[0_24px_72px_-46px_rgba(10,9,5,0.78)]" contentClassName="grid lg:grid-cols-3" tone="midnight" textureOpacity={0.3}>
              {capabilities.map((item, index) => (
                <article
                  className={`group relative min-h-[300px] bg-[linear-gradient(180deg,rgba(7,8,9,0.08)_0%,rgba(7,8,9,0.34)_100%)] p-6 [text-shadow:0_1px_1px_rgba(0,0,0,0.45)] sm:p-8 lg:p-10 ${
                    index > 0 ? "border-t border-white/10 lg:border-l lg:border-t-0" : ""
                  }`}
                  key={item.title}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[11px] text-[#fff6a8]">{item.number}</span>
                    <span className="grid size-10 place-items-center rounded-[12px] border border-white/10 bg-white/5 text-[#f6e879] transition-transform duration-200 group-hover:-translate-y-1">
                      <item.icon aria-hidden="true" className="size-5" strokeWidth={1.7} />
                    </span>
                  </div>
                  <div className="mt-14">
                    <h3 className="text-2xl font-semibold tracking-[-0.035em] text-[#fcfbf5]">{item.title}</h3>
                    <p className="mt-4 max-w-sm text-pretty text-[15px] leading-7 text-[#dde1d6]">{item.description}</p>
                  </div>
                  <p className="absolute bottom-8 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3efae]">{item.detail}</p>
                </article>
              ))}
            </DitherSurface>
          </div>
        </section>

        <section id="memory" className="border-b border-[#e6e0d6] bg-[#faf9f6] text-[#595c50] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-[#f2f5ef]">
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <DitherSurface
              className="overflow-hidden rounded-[28px] border border-[#272821] bg-[#090a08] shadow-[0_28px_88px_-54px_rgba(10,9,5,0.8)]"
              contentClassName="relative grid min-h-[580px] lg:grid-cols-[0.92fr_1.08fr]"
              tone="citrus"
              textureOpacity={0.08}
            >
              <div className="relative flex flex-col justify-between gap-10 p-6 sm:p-8 lg:border-r lg:border-white/10 lg:p-10">
                <div className="max-w-xl">
                  <Eyebrow>Memory architecture</Eyebrow>
                  <h2 className="mt-6 text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] text-[#fcfbf5] sm:text-6xl">
                    The right context, at the right depth.
                  </h2>
                  <p className="mt-6 max-w-lg text-pretty text-base leading-8 text-[#d9ddd4]">
                    kontext assembles a working view of your task without dumping your entire history into every prompt. Useful memory stays close. Noise stays out.
                  </p>
                </div>
                <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#f6e879]">
                  <BrainCircuit aria-hidden="true" className="size-4" />
                  Token-aware retrieval
                </div>
              </div>

              <div className="relative p-6 sm:p-8 lg:p-10">
                <div className="rounded-[24px] border border-white/10 bg-[#10120f]/90 p-4 shadow-[0_18px_50px_-36px_rgba(0,0,0,0.65)] backdrop-blur sm:p-6">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <p className="text-sm font-semibold text-[#f4f4ef]">Working memory stack</p>
                      <p className="mt-1 text-xs text-[#9ca29a]">Recent context, project memory, and live intelligence</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f6e879]">
                      Indexed
                    </span>
                  </div>
                  <div className="mt-4 divide-y divide-white/10">
                    {memoryLayers.map((layer, index) => (
                      <div
                        className="grid gap-4 py-5 sm:grid-cols-[38px_1fr_auto] sm:items-start"
                        key={layer.label}
                      >
                        <span className="font-mono text-[10px] text-[#8d9387]">
                          0{index + 1}
                        </span>
                        <div>
                          <h3 className="text-[15px] font-semibold text-[#fcfbf5]">
                            {layer.label}
                          </h3>
                          <p className="mt-1.5 max-w-md text-sm leading-6 text-[#c9cec5]">
                            {layer.text}
                          </p>
                        </div>
                        <span className="w-fit rounded-full border border-[#9fb4ae]/30 bg-[#eef4f2]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d8efe9]">
                          {layer.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DitherSurface>
          </div>
        </section>

        <section id="roadmap" className="border-b border-[#e6e0d6] bg-[#faf9f6] dark:border-white/10 dark:bg-[#0b0b0b]">
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div>
                <Eyebrow>Designed to compound</Eyebrow>
                <h2 className="mt-6 max-w-2xl text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] sm:text-6xl">
                  A clear path from memory to agency.
                </h2>
              </div>
              <p className="max-w-sm text-pretty text-sm leading-7 text-[#62685e] dark:text-[#aeb6ad]">
                Autonomy arrives only after memory, context, permissions, and recovery are dependable.
              </p>
            </div>

            <DitherSurface className="mt-16 overflow-hidden rounded-[24px] border border-[#272821] bg-[#090a08] shadow-[0_24px_72px_-46px_rgba(10,9,5,0.78)]" tone="sage" textureOpacity={0.44}>
              <ol className="relative z-10 grid lg:grid-cols-5">
                {roadmap.map(([number, title, text], index) => (
                  <li className={`relative min-h-[260px] p-6 sm:p-8 ${index > 0 ? "border-t border-white/10 lg:border-l lg:border-t-0" : ""}`} key={title}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-[#f6e879]">{number}</span>
                      <span className={`size-2 rounded-full ${index === 0 ? "bg-[#f6e879] shadow-[0_0_16px_rgba(246,232,121,0.9)]" : "border border-[#a6ab9d]"}`} />
                    </div>
                    <div className="mt-20">
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#f2f1e8]">{title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#adb2a9]">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </DitherSurface>
          </div>
        </section>

        <section id="developers" className="border-b border-[#e6e0d6] bg-[#faf9f6] text-[#595c50] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-[#eff1e8]">
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
              <div className="rounded-[24px] border border-[#e1ded5] bg-white p-6 shadow-[0_18px_50px_-36px_rgba(29,25,16,0.22)] dark:border-white/10 dark:bg-[#0d100c] sm:p-8 lg:p-10">
                <Eyebrow>Developer surface</Eyebrow>
                <h2 className="mt-6 max-w-xl text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] sm:text-5xl">
                  Built to live where you work.
                </h2>
                <p className="mt-6 max-w-lg text-pretty text-base leading-8 text-[#676c62] dark:text-[#aeb5a7]">
                  Start in the web workspace, then carry the same sources, retrieval rules, and approval trail into your CLI, API, or MCP integration as the product grows.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href="#"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e76f22] px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#d9631d] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] dark:bg-[#f6e879] dark:text-[#171814] dark:hover:bg-[#fff5a5]"
                  >
                    Read the architecture
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                  <span className="inline-flex min-h-11 items-center rounded-full border border-[#d4d0c7] bg-white px-4 text-sm font-medium text-[#76756f] dark:border-white/15 dark:bg-white/5 dark:text-[#d8d8d2]">
                    Kontext / terminal
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-[#353b32] bg-[#0d100c] shadow-[0_30px_90px_-50px_rgba(0,0,0,0.9)]">
                <div className="flex h-12 items-center justify-between border-b border-[#2d322b] px-4">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2 rounded-full bg-[#596054]" />
                    <span className="size-2 rounded-full bg-[#596054]" />
                    <span className="size-2 rounded-full bg-[#CAE0DA]" />
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#737b6e]">
                    Kontext / terminal
                  </span>
                </div>
                <div className="space-y-6 p-5 font-mono text-[12px] leading-7 sm:p-7 sm:text-[13px]">
                  <div className="rounded-[16px] border border-[#2d322b] bg-[#11140f] p-4">
                    <p className="text-[#737b6e]"># index a project</p>
                    <p className="mt-2 text-[#e7eadf]">
                      <span className="text-[#CAE0DA]">$</span> aman scan ./project
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[#98a194]">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">148 artifacts</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">2,436 memories</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[#CAE0DA]">Ready</span>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#2d322b] bg-[#11140f] p-4">
                    <p className="text-[#737b6e]"># recall a decision</p>
                    <p className="mt-2 text-[#e7eadf]">
                      <span className="text-[#CAE0DA]">$</span> aman memory search
                      &quot;authentication&quot;
                    </p>
                    <p className="mt-4 text-[#929a8c]">retrieving project memory</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <DocsSection>
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="overflow-hidden rounded-[24px] border border-[#d9d5ca] bg-[#efede6] shadow-[0_24px_70px_-48px_rgba(45,40,28,0.5)] dark:border-white/10 dark:bg-[#0d0f0b] dark:shadow-[0_24px_70px_-48px_rgba(0,0,0,0.9)]">
              <div className="relative grid gap-8 border-b border-[#d9d5ca] px-6 py-10 dark:border-white/10 sm:px-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end lg:px-12 lg:py-12">
                <DitherTexture className="opacity-[0.07] mix-blend-multiply dark:opacity-[0.16] dark:mix-blend-screen" tone="citrus" />
                <div className="relative z-10">
                  <Eyebrow>Trust is infrastructure</Eyebrow>
                  <h2 className="mt-6 max-w-md text-balance font-heading text-4xl font-medium leading-[1.04] tracking-[-0.055em] sm:text-5xl">
                    Clear enough to rely on.
                  </h2>
                </div>
                <p className="relative z-10 max-w-2xl text-pretty text-base leading-8 text-[#666c61] dark:text-[#abb2a7] lg:justify-self-end">
                  Useful context is only valuable when your team can see where it came from, decide where it runs, and stay in control of what happens next.
                </p>
              </div>
              <div className="grid gap-px bg-[#d9d5ca] dark:bg-white/10 md:grid-cols-3">
                {principles.map((principle, index) => (
                  <article className="group bg-[#f8f6ef] dark:bg-[#141512]" key={principle.title}>
                    <PrinciplePreview index={index} />
                    <div className="p-6 sm:p-7">
                      <div className="flex items-center justify-between gap-4">
                        <principle.icon aria-hidden="true" className="size-5 text-[#496b63] dark:text-[#dfea6c]" strokeWidth={1.7} />
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#979b91] dark:text-[#70766c]">0{index + 1}</span>
                      </div>
                      <h3 className="mt-8 text-base font-semibold tracking-[-0.02em]">{principle.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#686e64] dark:text-[#aeb6ad]">{principle.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </DocsSection>

        <DocsSection>
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div>
              <BentoGrid className="grid-cols-1 auto-rows-auto gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-fr lg:gap-6">
                {bentoItems.map((item) => (
                  <BentoCard
                    key={item.name}
                    {...item}
                    {...(item.cta === "Open workspace"
                      ? { href: workspaceHref, cta: workspaceLabel }
                      : {})}
                  />
                ))}
              </BentoGrid>
            </div>
          </div>
        </DocsSection>

        <DocsSection>
          <div id="knowledge-base" className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <Eyebrow>Knowledge base</Eyebrow>
                <h2 className="mt-6 max-w-3xl text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] text-[#595c50] dark:text-[#f2f5ef] sm:text-6xl">
                  Bring every source into one grounded workspace.
                </h2>
                <p className="mt-6 max-w-2xl text-pretty text-base leading-8 text-[#676c62] dark:text-[#aeb5a7]">
                  Upload documents, connect live URLs, or sync an entire sitemap. kontext tracks tokens, vectors, and indexing status before an agent uses the source.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:max-w-[360px] lg:justify-end">
                 <Link href="/AmanCrawl?mode=url" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4d0c7] bg-white px-5 text-sm font-semibold text-[#595c50] transition-[background-color,transform] duration-150 hover:bg-[#f4f1e9] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] dark:border-white/15 dark:bg-white/5 dark:text-[#f2f5ef] dark:hover:bg-white/10">
                  <FileUp aria-hidden="true" className="size-4" /> Upload docs
                </Link>
                <Link href="/AmanCrawl?mode=url" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4d0c7] bg-white px-5 text-sm font-semibold text-[#595c50] transition-[background-color,transform] duration-150 hover:bg-[#f4f1e9] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] dark:border-white/15 dark:bg-white/5 dark:text-[#f2f5ef] dark:hover:bg-white/10">
                  <Link2 aria-hidden="true" className="size-4" /> Connect URLs
                </Link>
                <Link href="/AmanCrawl?mode=sitemap" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4d0c7] bg-white px-5 text-sm font-semibold text-[#595c50] transition-[background-color,transform] duration-150 hover:bg-[#f4f1e9] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f22] dark:border-white/15 dark:bg-white/5 dark:text-[#f2f5ef] dark:hover:bg-white/10">
                  <Network aria-hidden="true" className="size-4" /> Sync sitemap
                </Link>
              </div>
            </div>

            <div className="relative mt-14 overflow-hidden rounded-[24px] border border-[#dedbd1] bg-white shadow-[0_18px_48px_-34px_rgba(30,24,14,0.5)] dark:border-white/10 dark:bg-[#12130f]">
              <DitherTexture className="opacity-[0.08] mix-blend-multiply dark:opacity-20 dark:mix-blend-screen" tone="citrus" />
              <div className="relative z-10 flex items-center justify-between border-b border-[#dedbd1] px-5 py-4 dark:border-white/10 sm:px-7">
                <div>
                  <p className="text-sm font-semibold text-[#31352f] dark:text-[#f2f5ef]">Indexed sources</p>
                  <p className="mt-1 text-xs text-[#747a70] dark:text-[#9fa69c]">2 sources · 57K tokens · ready for retrieval</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#edf4e6] px-3 py-1.5 text-xs font-semibold text-[#3c6a42] dark:bg-[#b8c96b]/10 dark:text-[#dce99b]">
                  <CircleCheck aria-hidden="true" className="size-3.5" /> All synced
                </span>
              </div>
              <div className="relative z-10 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#ece8df] text-[10px] uppercase tracking-[0.16em] text-[#858a80] dark:border-white/10 dark:text-[#8f968c]">
                      <th className="px-5 py-4 font-medium sm:px-7">Source</th>
                      <th className="px-5 py-4 font-medium">Tokens</th>
                      <th className="px-5 py-4 font-medium">Status</th>
                      <th className="px-5 py-4 font-medium sm:px-7">Vectors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knowledgeSources.map((source) => (
                      <tr className="border-b border-[#ece8df] last:border-b-0 dark:border-white/10" key={source.source}>
                        <td className="px-5 py-5 sm:px-7">
                          <div className="flex items-center gap-3">
                            <span className="grid size-10 place-items-center rounded-[12px] bg-[#fff0e5] text-[#d8621e] dark:bg-[#f6821f]/10 dark:text-[#f69a50]">
                              {source.kind === "Document" ? <FileText aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}
                            </span>
                            <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#31352f] dark:text-[#f2f5ef]">{source.source}</p><p className="mt-1 text-xs text-[#7a8076] dark:text-[#929990]">{source.kind}</p></div>
                          </div>
                        </td>
                        <td className="px-5 py-5 font-mono text-sm tabular-nums text-[#535a51] dark:text-[#c4cac1]">{source.tokens}</td>
                        <td className="px-5 py-5"><span className="inline-flex items-center gap-2 text-sm font-medium text-[#3d6843] dark:text-[#dce99b]"><span className="size-1.5 rounded-full bg-[#70a765]" />Ready</span></td>
                        <td className="px-5 py-5 font-mono text-sm tabular-nums text-[#535a51] dark:text-[#c4cac1] sm:px-7">{source.vectors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DocsSection>

        <DocsSection>
          <div id="integrations" className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <SectionHeading eyebrow="Ecosystem integrations" title="One agent loop. Every system connected." text="Connect the workspace chat, crawler, scraper, documents, vector store, and agent tools through one observable context layer." />
            <div className="mt-16 rounded-[24px] border border-[#d7d0c3] bg-[#e9e4d9] p-3 shadow-[0_24px_72px_-42px_rgba(65,55,38,0.32)] dark:border-[#272821] dark:bg-[#090a08] dark:shadow-[0_24px_72px_-42px_rgba(10,9,5,0.9)] sm:p-5">
              <AgentEcosystem />
            </div>
          </div>
        </DocsSection>

        <DocsSection>
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <SectionHeading
              eyebrow="Docs for builders"
              title="Built like a product system, not a toy demo."
              text="Use the same visual language across your homepage, workspace, and docs surfaces: dense, legible, and grounded in the work itself."
            />
            <div className="mt-16 grid gap-6 lg:grid-cols-12">
              <article className="relative col-span-12 overflow-hidden rounded-[28px] border border-[#ded8cb] bg-[#f6f2ea] shadow-[0_24px_70px_-46px_rgba(46,38,24,0.48)] dark:border-white/10 dark:bg-[#0a0a0a]">
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,242,235,0.12)_0%,rgba(247,242,235,0.38)_58%,rgba(247,242,235,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(7,7,7,0.18)_0%,rgba(7,7,7,0.36)_58%,rgba(7,7,7,0.92)_100%)]" />
                <div className="absolute inset-0 [background-image:radial-gradient(rgba(246,130,31,0.18)_0.7px,transparent_0.82px)] [background-size:4px_4px] opacity-45 dark:opacity-75" />
                <div className="relative z-10 flex min-h-[540px] flex-col justify-between p-4 sm:p-5 lg:p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#e2d8c8] bg-white/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a4b18] backdrop-blur dark:border-white/10 dark:bg-black/35 dark:text-[#f6e879]">
                      Docs starter
                    </span>
                    <span className="rounded-full border border-[#e2d8c8] bg-white/75 px-3 py-1 font-mono text-[10px] text-[#59544c] backdrop-blur dark:border-white/10 dark:bg-black/35 dark:text-white/60">
                      pnpm create Kontext
                    </span>
                  </div>
                  <div className="relative mt-5 h-[240px] overflow-hidden rounded-[22px] border border-[#eadcc9] bg-[#0e0d0c] dark:border-white/10 sm:h-[280px] lg:h-[320px]">
                    <PaperDither
                      className="absolute inset-0 opacity-[0.72] mix-blend-screen dark:opacity-[0.92]"
                      dark={{ colorBack: "#301c2a", colorFront: "#e0640b" }}
                      light={{ colorBack: "#301c2a", colorFront: "#e0640b" }}
                      maxPixelCount={1100 * 520}
                      scale={1}
                      shape="warp"
                      size={2.5}
                      speed={1}
                      type="4x4"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.08)_0%,rgba(5,5,5,0.18)_42%,rgba(5,5,5,0.68)_100%)]" />
                  </div>
                  <div className="mt-6 grid gap-6 lg:grid-cols-[0.45fr_0.55fr]">
                    <div className="rounded-[22px] border border-black/10 bg-[#1a1a1a] p-4 text-white shadow-[0_18px_50px_-36px_rgba(0,0,0,0.85)] backdrop-blur">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-[11px] font-medium text-white/70">
                        <span className="size-2 rounded-full bg-[#f6821f]" />
                        Kontext CLI
                      </div>
                      <div className="mt-4 space-y-3 font-mono text-[12px] leading-6 text-white/85">
                        <p>$ pnpm create Kontext</p>
                        <p>• docs
                          <br />• memory
                          <br />• workspace
                        </p>
                        <p className="text-white/55">source-linked setup, ready in minutes</p>
                      </div>
                    </div>
                    <div className="relative overflow-hidden rounded-[22px] border border-[#d9d0c1] bg-[#f8f3ea]/85 p-4 shadow-[0_18px_50px_-36px_rgba(46,38,24,0.45)] backdrop-blur dark:border-white/10 dark:bg-[#151311]/80">
                      <div className="rounded-[18px] border border-[#ded7ca] bg-white/76 p-3 backdrop-blur dark:border-white/10 dark:bg-black/45">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#262626] dark:text-white">Kontext Story</p>
                          <span className="rounded-full border border-[#e5d9cb] bg-[#fff7ef] px-2.5 py-1 text-[10px] font-semibold text-[#a14f16] dark:border-white/10 dark:bg-white/5 dark:text-[#f6e879]">
                            Explore
                          </span>
                        </div>
                        <p className="mt-3 max-w-sm text-sm leading-6 text-[#595959] dark:text-white/70">
                          Built for Kontext surfaces. Bring docs, stories, and agent explanations into one interactive block.
                        </p>
                        <div className="mt-4 rounded-[14px] border border-[#ded7ca] bg-white/90 p-3 dark:border-white/10 dark:bg-black/55">
                          <div className="flex items-center gap-2 text-xs font-medium text-[#262626] dark:text-white">
                            <span className="size-2 rounded-full bg-[#4f7cff]" />
                            Agent note
                          </div>
                          <p className="mt-2 text-sm text-[#5f5f5f] dark:text-white/70">
                            This is the same kind of component-driven surface Kontext can expose for agents and docs.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="relative col-span-12 overflow-hidden rounded-[28px] border border-[#ded8cb] bg-[#f6f2ea] shadow-[0_24px_70px_-46px_rgba(46,38,24,0.48)] dark:border-white/10 dark:bg-[#0a0a0a] lg:col-span-5">
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,244,238,0.1)_0%,rgba(248,244,238,0.28)_55%,rgba(248,244,238,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(7,7,7,0.16)_0%,rgba(7,7,7,0.3)_55%,rgba(7,7,7,0.9)_100%)]" />
                <div className="relative z-10 flex min-h-[420px] flex-col p-6">
                  <div className="text-center">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d96c28] dark:text-[#f6e879]">
                      kontext
                    </p>
                    <h3 className="mt-4 font-mono text-3xl font-extrabold uppercase tracking-[-0.05em] text-[#282b24] dark:text-[#f2f1e8] lg:text-[2.2rem]">
                      Build your Context
                    </h3>
                    <p className="mt-3 font-mono text-xs text-[#777c72] dark:text-[#8f958b]">
                      grounded, luminous, and made for the product.
                    </p>
                  </div>
                  <div className="relative mt-10 h-[380px] overflow-hidden rounded-[22px] bg-gradient-to-b from-[#efc4a5]/10 via-[#d88953]/10 to-[#a94d22]/25 dark:from-[#e65c20]/5 dark:via-[#9a3d18]/10 dark:to-[#52200f]/35">
                    <PaperDither
                      className="-bottom-[86%] left-1/2 h-[200%] w-[72%] min-w-[620px] -translate-x-1/2"
                      dark={{ colorBack: "#00000000", colorFront: "#d95d27" }}
                      light={{ colorBack: "#00000000", colorFront: "#ef7a31" }}
                      maxPixelCount={900 * 700}
                      scale={0.58}
                      shape="sphere"
                      size={2}
                      speed={0.22}
                      type="4x4"
                    />
                    <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(58,35,20,0.72)_0.7px,transparent_0.8px)] [background-size:4px_4px] dark:opacity-45 dark:[background-image:radial-gradient(rgba(8,6,4,0.9)_0.65px,transparent_0.8px)]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#2a1711]/55 to-transparent dark:from-black/55" />
                  </div>
                </div>
              </article>

              <article className="relative col-span-12 overflow-hidden rounded-[28px] border border-[#ded8cb] bg-[#f6f2ea] p-6 shadow-[0_24px_70px_-46px_rgba(46,38,24,0.48)] dark:border-white/10 dark:bg-[#0a0a0a] lg:col-span-7">
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,242,235,0.12)_0%,rgba(247,242,235,0.42)_58%,rgba(247,242,235,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(7,7,7,0.12)_0%,rgba(7,7,7,0.34)_58%,rgba(7,7,7,0.9)_100%)]" />
                <div className="pointer-events-none absolute inset-x-8 top-8 h-[44%] overflow-hidden rounded-[24px] border border-[#2b201f]/60 bg-[#120c0d]/92 dark:border-white/10">
                  <PaperDither
                    className="absolute inset-0 opacity-[0.82] mix-blend-screen dark:opacity-[0.96]"
                    dark={{ colorBack: "#301c2a", colorFront: "#e0640b" }}
                    light={{ colorBack: "#301c2a", colorFront: "#e0640b" }}
                    maxPixelCount={1000 * 420}
                    scale={1}
                    shape="swirl"
                    size={2.5}
                    speed={1}
                    type="4x4"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,8,0.08)_0%,rgba(10,8,8,0.58)_100%)]" />
                </div>
                  <div className="relative z-10 flex min-h-[420px] flex-col justify-end pt-[48%]">
                  <div className="w-full rounded-[22px] border border-[#ded7ca] bg-white/78 p-4 shadow-[0_18px_50px_-36px_rgba(46,38,24,0.45)] backdrop-blur dark:border-white/10 dark:bg-black/45">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a3d09] dark:text-[#f6e879]">
                      Kontext Story
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#262626] dark:text-white">
                      A reusable story surface for agent-driven docs.
                    </h3>
                    <p className="mt-3 w-full text-sm leading-7 text-[#666666] dark:text-white/70">
                      This replaces the old developer-ready block with a richer, more product-like area that can hold docs, UI stories, and a live explanation of the system.
                    </p>
                    <div className="mt-4 flex w-full flex-wrap gap-2 text-xs font-medium text-[#6a6a63] dark:text-white/65">
                      <span className="rounded-full border border-[#e4d9cb] bg-white/80 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Docs</span>
                      <span className="rounded-full border border-[#e4d9cb] bg-white/80 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Stories</span>
                      <span className="rounded-full border border-[#e4d9cb] bg-white/80 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Agent notes</span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </DocsSection>

        <DocsSection className="text-[#595c50] dark:text-[#f2f5ef]">
          <div className="mx-auto max-w-[920px] px-5 py-24 sm:px-8 lg:py-32">
            <div className="text-center">
              <Eyebrow>Questions, answered</Eyebrow>
              <h2 className="mt-6 text-balance font-heading text-4xl font-medium tracking-[-0.055em] sm:text-6xl">
                The useful details.
              </h2>
            </div>
              <div className="mt-14 border-t border-[#e6e0d6] dark:border-white/10">
              {faqs.map(([question, answer]) => (
                <details className="group border-b border-[#e6e0d6] dark:border-white/10" key={question}>
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#496b63] [&::-webkit-details-marker]:hidden">
                    {question}
                    <span className="relative size-5 shrink-0" aria-hidden="true">
                      <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-[#555c51] dark:bg-[#727a6d]" />
                      <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-[#555c51] dark:bg-[#727a6d] transition-transform duration-150 group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="max-w-3xl pb-6 pr-10 text-pretty text-[15px] leading-7 text-[#62685e] dark:text-[#aeb6ad]">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </DocsSection>

        <DocsSection className="dark:text-[#f2f5ef]">
          <div className="site-container px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
            <div className="relative text-center">
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <PaperDither
                  className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 opacity-[0.08]"
                  dark={{ colorBack: "#00000000", colorFront: "#f6e879" }}
                  light={{ colorBack: "#00000000", colorFront: "#f6821f" }}
                  maxPixelCount={600 * 300}
                  scale={0.8}
                  shape="simplex"
                  size={2}
                  speed={0.12}
                  type="4x4"
                />
              </div>
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="mt-6 text-balance font-heading text-4xl font-medium leading-[1.02] tracking-[-0.055em] sm:text-6xl">
                Simple plans, <span className="text-[#f6e879]">serious power</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#62685e] dark:text-[#aeb6ad]">
                Start free. Scale as your memory and agent needs grow. No hidden fees.
              </p>
            </div>
            <div className="mt-14">
              <PricingCards plans={[
                {
                  id: "free",
                  name: "Free",
                  description: "For individuals exploring kontext.",
                  monthlyPrice: 0,
                  yearlyPrice: 0,
                  currency: "$",
                  features: ["5 artifacts", "20 crawl jobs / day", "100 memory entries", "1 workspace", "Web search & scraping"],
                  buttonText: "Get started free",
                  href: "/signup",
                },
                {
                  id: "pro",
                  name: "Pro",
                  description: "For builders who need more power.",
                  monthlyPrice: 29,
                  yearlyPrice: 278,
                  currency: "$",
                  features: ["100 artifacts", "500 crawl jobs / day", "5,000 memory entries", "10 workspaces", "Deep crawl & extraction", "MCP tools"],
                  buttonText: "Start Pro trial",
                  href: "/signup?plan=pro",
                  isPopular: true,
                  badge: "Most popular",
                },
                {
                  id: "team",
                  name: "Team",
                  description: "For teams building with kontext.",
                  monthlyPrice: 79,
                  yearlyPrice: 758,
                  currency: "$",
                  features: ["Unlimited everything", "Browser automation", "Custom webhooks", "Team collaboration", "Dedicated support"],
                  buttonText: "Start Team trial",
                  href: "/signup?plan=team",
                },
              ]} />
            </div>
            <div className="mt-10 text-center">
              <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-medium text-[#f6821f] transition hover:text-[#f6e879] dark:text-[#f6e879] dark:hover:text-[#fff5a5]">
                View full pricing comparison
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </DocsSection>

        <DocsSection className="border-b-0 px-5 py-8 sm:px-8 lg:px-10">
          <div className="site-container relative isolate overflow-hidden rounded-[18px] border border-white/10 bg-[#130d09] text-[#f2f1e8]">
            <div className="absolute inset-0 bg-[linear-gradient(110deg,#17110c_0%,#21130b_46%,#3c1b0c_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,10,7,0.96)_0%,rgba(19,12,8,0.72)_48%,rgba(33,14,7,0.12)_100%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(10,8,5,0.9)_0.65px,transparent_0.8px)] [background-size:4px_4px]" />
            <PaperDither
              className="inset-x-0 bottom-0 h-full opacity-90 [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_38%,black_82%)]"
              dark={{ colorBack: "#000000", colorFront: "#ff5900" }}
              light={{ colorBack: "#000000", colorFront: "#ff5900" }}
              maxPixelCount={1400 * 720}
              offsetX={0}
              offsetY={0}
              rotation={0}
              scale={0.6}
              shape="wave"
              size={2}
              speed={1}
              type="4x4"
            />
            <div className="relative z-10 grid min-h-[440px] items-center gap-10 px-5 py-20 sm:px-8 lg:min-h-[500px] lg:grid-cols-[1fr_auto] lg:px-10 lg:py-24">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#f6e879]">
                  Your memory starts now
                </p>
                <h2 className="mt-6 max-w-4xl text-balance font-heading text-5xl font-medium leading-[0.95] tracking-[-0.065em] sm:text-7xl">
                  Stop rebuilding context.
                </h2>
                <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-[#c8c4b8] sm:text-lg sm:leading-8">
                  Bring your documents, decisions, and tools into one persistent workspace—so every conversation starts informed and ready to move forward.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  href={workspaceHref}
                  className="inline-flex min-h-12 w-fit items-center justify-center rounded-[10px] bg-[#f6e879] px-5 text-sm font-semibold text-[#171814] transition-[background-color,transform] duration-150 hover:bg-[#ffef9c] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6e879] focus-visible:ring-offset-2 focus-visible:ring-offset-[#130d09] dark:bg-[#f6e879] dark:text-[#171814] dark:hover:bg-[#ffef9c]"
                >
                  {workspaceLabel}
                  <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-white/20 bg-[#21170f] px-5 text-sm font-semibold text-[#f2f5ef] transition-[background-color,transform] duration-150 hover:bg-[#2d1e13] active:scale-[0.98] dark:bg-[#21170f] dark:text-[#f2f5ef] dark:hover:bg-[#2d1e13]"
                >
                  Create free account
                </Link>
              </div>
            </div>
          </div>
        </DocsSection>
      </div>

      <footer className="relative overflow-hidden border-t border-[#dedbd1] bg-[#faf9f6] text-[#62685e] dark:border-white/10 dark:bg-[#0b0b0b] dark:text-[#aeb5a7]">
        <PaperDither
          className="inset-0 opacity-[0.06] mix-blend-multiply dark:opacity-[0.12] dark:mix-blend-screen"
          dark={{ colorBack: "#00000000", colorFront: "#ddc658" }}
          light={{ colorBack: "#00000000", colorFront: "#535c97" }}
          maxPixelCount={1400 * 520}
          scale={0.78}
          shape="simplex"
          size={2}
          speed={0.18}
          type="4x4"
        />
        <div className="site-container relative z-10 px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-12 border-b border-[#dedbd1] pb-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.6fr_0.6fr_0.9fr] dark:border-white/10">
            <div>
              <div className="flex items-center gap-3 text-[#11140f] dark:text-white">
                <BrandMark />
                <span className="text-[15px] font-semibold">kontext</span>
              </div>
              <p className="mt-5 max-w-md text-pretty text-base font-medium leading-7 text-[#353a32] dark:text-[#e4e7df]">
                The context layer for agents that need to remember, retrieve, and act with confidence.
              </p>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#72786e] dark:text-[#92988f]">
                Connect documents, conversations, tools, and live web data in one permission-aware workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.12em]">
                {["Persistent memory", "Grounded retrieval", "Observable actions"].map((label) => (
                  <span className="rounded-full border border-[#d9d5ca] bg-white/55 px-3 py-1.5 text-[#62685e] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#aeb5a7]" key={label}>
                    {label}
                  </span>
                ))}
              </div>
              <Link className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#171814] px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#2b2e28] active:scale-[0.98] dark:bg-[#f2f1e8] dark:text-[#171814] dark:hover:bg-[#e4e3da]" href={workspaceHref}>
                {workspaceLabel}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
                Product
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#product">Overview</a></li>
                <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#knowledge-base">Knowledge base</a></li>
                <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#integrations">Integrations</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
                Build
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link className="hover:text-[#e76f22] dark:hover:text-white" href="/chat">Workspace</Link></li>
                <li><Link className="hover:text-[#e76f22] dark:hover:text-white" href="/AmanCrawl">Web crawl</Link></li>
                <li><a className="hover:text-[#e76f22] dark:hover:text-white" href="#developers">Developers</a></li>
                <li>
                  <a className="inline-flex items-center gap-2 hover:text-[#e76f22] dark:hover:text-white" href="#">
                    <Code2 aria-hidden="true" className="size-4" /> GitHub
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#727a6d]">
                Agent layer
              </p>
              <ul className="mt-4 space-y-4 text-sm">
                <li>
                  <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Memory online</span>
                  <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Context persists across every session.</span>
                </li>
                <li>
                  <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Tools permissioned</span>
                  <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Actions stay inside granted access.</span>
                </li>
                <li>
                  <span className="block font-medium text-[#353a32] dark:text-[#e4e7df]">Sources traceable</span>
                  <span className="mt-1 block text-xs leading-5 text-[#7c8278] dark:text-[#898f87]">Answers retain their origin.</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-[#687064] sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Aman Agent Lab</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Systems operational
              </span>
              <span className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="size-3 text-[#496b63] dark:text-[#CAE0DA]" />
                Open source · built in India
              </span>
            </div>
          </div>
          <div className="footer-dither-wordmark select-none overflow-hidden pt-14 text-center text-[clamp(4.5rem,14vw,12rem)] font-medium leading-[0.76] tracking-[0.04em]" aria-label="Kontext">
            KONTEXT
          </div>
        </div>
      </footer>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-50 inline-flex size-12 items-center justify-center rounded-full bg-[#11140f] text-white shadow-lg transition-all duration-200 hover:bg-[#252a21] hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6821f] focus-visible:ring-offset-2 dark:bg-white/10 dark:hover:bg-white/20"
        aria-label="Scroll to top"
      >
        <ArrowUp className="size-5" />
      </button>
    </main>
  )
}
