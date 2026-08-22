"use client";

import { useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  FileCode2,
  FileDiff,
  FolderGit2,
  Goal,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { ThinkingState } from "@/components/ui/ThinkingState";

import type {
  CodingAgentPlan,
  CodingChanges,
  CodingEffortProfile,
  CodingGoal,
  CodingInteractionMode,
  CodingTaskRecord,
} from "@/services/coding";
import type { GithubRepositoryOption } from "@/services/github";

type ThreadMessage = { id: string; role: "user" | "assistant"; content: string };

const INTENTS: Array<{ id: CodingInteractionMode; label: string; description: string }> = [
  { id: "ask", label: "Ask", description: "Read-only answers" },
  { id: "plan", label: "Plan", description: "Editable plan, no writes" },
  { id: "build", label: "Build", description: "One isolated writer" },
];

const EFFORTS: Array<{ id: CodingEffortProfile; label: string; description: string }> = [
  { id: "fast", label: "Fast", description: "Direct retrieval" },
  { id: "balanced", label: "Balanced", description: "2 specialists" },
  { id: "deep", label: "Deep", description: "3 specialists + risk review" },
];

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

const INTERNAL_AGENT_ERRORS = new Set([
  "github_repository_archive_not_found",
  "github_archive_request_failed",
  "github_repository_tree_unavailable",
]);

const TRANSIENT_TRANSPORT_ERROR =
  /(?:BodyStreamBuffer was aborted|peer closed connection|incomplete chunked read|response body was aborted)/i;

function hasPatchPayload(content: string) {
  return /```diff\b|(?:^|\n)diff --git\s|(?:^|\n)---\s+(?:a\/|\/dev\/null)/m.test(content);
}

function changedLineStats(diff: string) {
  return diff.split(/\r?\n/).reduce(
    (stats, line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return stats;
      if (line.startsWith("+")) stats.added += 1;
      if (line.startsWith("-")) stats.removed += 1;
      return stats;
    },
    { added: 0, removed: 0 },
  );
}

export function cleanAssistantContent(content: string) {
  const trimmed = content.trim();
  if (INTERNAL_AGENT_ERRORS.has(trimmed) || TRANSIENT_TRANSPORT_ERROR.test(trimmed)) {
    return "";
  }

  const withoutTools = trimmed
    .replace(/<tool(?:call|_call)>[\s\S]*?(?:<\/tool(?:call|_call)>|$)/gi, "")
    .replace(/<tool[^>]*>[\s\S]*?(?:<\/tool[^>]*>|$)/gi, "")
    .replace(/```diff\b[\s\S]*?(?:```|$)/gi, "");
  const rawDiffStart = withoutTools.search(
    /(?:^|\n)(?:diff --git\s|---\s+(?:a\/|\/dev\/null))/m,
  );
  return (rawDiffStart >= 0 ? withoutTools.slice(0, rawDiffStart) : withoutTools)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visibleAgentThread(thread: ThreadMessage[], planReady: boolean) {
  const cleaned = thread
    .map((message) => ({
      ...message,
      content:
        message.role === "assistant"
          ? cleanAssistantContent(message.content)
          : message.content.trim(),
    }))
    .filter((message) => {
      if (!message.content) return false;
      if (message.role !== "assistant" || !planReady) return true;
      return !/^(?:i(?:'ll| will)|let me)\s+(?:check|inspect|search|examine|read)\b/i.test(
        message.content,
      );
    });

  const seenUserPrompts = new Set<string>();
  const deduplicated = cleaned
    .filter((message, index) => {
      if (message.role !== "user") return true;
      const key = message.content.replace(/\s+/g, " ").trim().toLowerCase();
      const appearsLater = cleaned
        .slice(index + 1)
        .some(
          (candidate) =>
            candidate.role === "user" &&
            candidate.content.replace(/\s+/g, " ").trim().toLowerCase() === key,
        );
      if (appearsLater || seenUserPrompts.has(key)) return false;
      seenUserPrompts.add(key);
      return true;
    });
  const latestUserIndex = deduplicated.findLastIndex(
    (message) => message.role === "user",
  );
  return (latestUserIndex >= 0
    ? deduplicated.slice(latestUserIndex)
    : deduplicated
  ).slice(-4);
}

function InlineAgentText({ value }: { value: string }) {
  return value
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`${part}:${index}`} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.9em] text-[#8ec8ff]">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}:${index}`} className="font-semibold text-white/88">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
}

export function AgentMessageBody({ content }: { content: string }) {
  return (
    <div className="space-y-2.5 text-[13px] leading-6 text-white/68">
      {content.split(/\n{2,}/).map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return <ul key={blockIndex} className="space-y-1.5">{lines.map((line, index) => <li key={`${line}:${index}`} className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-[#ff8955]" /><span><InlineAgentText value={line.replace(/^[-*]\s+/, "")} /></span></li>)}</ul>;
        }
        if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
          return <ol key={blockIndex} className="space-y-1.5">{lines.map((line, index) => <li key={`${line}:${index}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2"><span className="mt-1 grid size-5 place-items-center rounded-md bg-white/[0.055] font-mono text-[8px] text-white/38">{index + 1}</span><span><InlineAgentText value={line.replace(/^\d+[.)]\s+/, "")} /></span></li>)}</ol>;
        }
        const heading = lines.length === 1 ? lines[0].match(/^#{1,4}\s+(.+)$/) : null;
        if (heading) return <h4 key={blockIndex} className="pt-1 text-[13px] font-semibold text-white/86"><InlineAgentText value={heading[1]} /></h4>;
        return <p key={blockIndex} className="whitespace-pre-wrap break-words"><InlineAgentText value={block} /></p>;
      })}
    </div>
  );
}

function AgentThinkingState({
  mode,
  phase,
}: {
  mode: CodingInteractionMode;
  phase: string;
}) {
  const normalizedPhase = phase.toLowerCase();
  const state = /valid|review/.test(normalizedPhase)
    ? {
        label: "Checking the result",
        detail: "Reviewing validation signals before presenting the outcome.",
      }
    : /build|execut|writ/.test(normalizedPhase)
      ? {
          label: "Building in an isolated workspace",
          detail: "The writer is applying the approved plan without touching your local branch.",
        }
      : /plan|specialist|research/.test(normalizedPhase)
        ? {
            label: "Working through the plan",
            detail: "Mapping dependencies, constraints, and the safest implementation path.",
          }
        : /index|source|context|snapshot/.test(normalizedPhase)
          ? {
              label: "Reading repository context",
              detail: "Locating the files and project instructions relevant to this task.",
            }
          : {
              label: "Understanding your task",
              detail:
                mode === "ask"
                  ? "Finding the repository context needed for a precise answer."
                  : mode === "plan"
                    ? "Clarifying the outcome before proposing an implementation plan."
                    : "Preparing the task before work begins in isolation.",
            };

  return <ThinkingState tone="agent" label={state.label} detail={state.detail} className="max-w-[620px]" />;
}

function PlanReviewCard({
  plan,
  mode,
  phase,
  currentTaskId,
  running,
  onPlanChange,
  onRefinePlan,
  onStartBuild,
}: {
  plan: CodingAgentPlan;
  mode: CodingInteractionMode;
  phase: string;
  currentTaskId?: string;
  running: boolean;
  onPlanChange: (plan: CodingAgentPlan) => void;
  onRefinePlan: (instruction: string) => void;
  onStartBuild: () => void | Promise<void>;
}) {
  const [refinement, setRefinement] = useState("");
  const [startingBuild, setStartingBuild] = useState(false);
  const providedOptions = (plan.options || []).slice(0, 2);
  const approachOptions = [
    ...providedOptions,
    ...(
      providedOptions.length < 2
        ? [
            {
              id: "recommended",
              title: "Repository-native implementation",
              description:
                plan.approach ||
                "Follow the existing architecture and implement the complete requested outcome.",
              tradeoff: "Best balance of compatibility, completeness, and validation.",
              recommended: true,
            },
            {
              id: "minimal",
              title: "Minimal scoped change",
              description:
                "Implement only the observable acceptance criteria with the fewest compatible changes.",
              tradeoff: "Faster and lower risk, with fewer structural improvements.",
              recommended: false,
            },
          ].filter(
            (fallback) =>
              !providedOptions.some((option) => option.id === fallback.id),
          )
        : []
    ),
  ].slice(0, 2);
  const recommendedOption =
    approachOptions.find((option) => option.recommended) || approachOptions[0];
  const selectedOptionId =
    plan.selectedOptionId === "custom" ||
    approachOptions.some((option) => option.id === plan.selectedOptionId)
      ? plan.selectedOptionId
      : recommendedOption?.id;
  const reviewGroups = [
    { label: "Done looks like", values: plan.acceptanceCriteria || [] },
    { label: "Risks", values: plan.risks || [] },
    { label: "Out of scope", values: plan.outOfScope || [] },
  ].filter((group) => group.values.length);
  const selectApproach = (optionId: string) => {
    if (optionId === "custom") {
      onPlanChange({
        ...plan,
        selectedOptionId: "custom",
        approach: plan.customApproach || "",
      });
      return;
    }
    const option = approachOptions.find((item) => item.id === optionId);
    if (!option) return;
    onPlanChange({
      ...plan,
      options: approachOptions,
      selectedOptionId: option.id,
      approach: option.description,
    });
  };
  const sendRefinement = () => {
    const instruction = refinement.trim();
    if (!instruction || running) return;
    onRefinePlan(instruction);
    setRefinement("");
  };
  const approveAndBuild = async () => {
    if (startingBuild || running) return;
    setStartingBuild(true);
    try {
      await onStartBuild();
    } finally {
      setStartingBuild(false);
    }
  };
  const customApproachMissing =
    selectedOptionId === "custom" && !plan.customApproach?.trim();
  const selectedApproachLabel =
    selectedOptionId === "custom"
      ? "Custom approach"
      : approachOptions.find((option) => option.id === selectedOptionId)?.title ||
        "Choose an approach";
  const buildInterrupted = phase === "failed";
  const completedSteps = plan.steps.filter(
    (step) => step.status === "completed",
  ).length;

  if (mode !== "plan") {
    return (
      <details className="group overflow-hidden rounded-xl border border-white/[0.075] bg-white/[0.018]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f98ff]">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#ff7433]/15 bg-[#ff7433]/[0.07] text-[#ff9567]">
            <Goal className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/38">Implementation plan</span>
              <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[6px] uppercase tracking-[0.1em] ${buildInterrupted ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200/65" : "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200/55"}`}>{buildInterrupted ? "Interrupted" : "Approved"}</span>
            </span>
            <span className="mt-1 block truncate text-[10px] text-white/55">{plan.summary || plan.goal}</span>
          </span>
          <span className="shrink-0 font-mono text-[8px] text-white/24">{completedSteps}/{plan.steps.length}</span>
          <ChevronDown className="size-3.5 shrink-0 text-white/28 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-white/[0.055] px-4 py-3">
          <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-white/24">Selected approach</p>
          <p className="mt-1.5 text-[10px] leading-5 text-white/48">{selectedApproachLabel}</p>
          <ol className="mt-3 space-y-1.5">
            {plan.steps.map((step, index) => (
              <li key={step.id} className="flex min-w-0 items-center gap-2 text-[9px] text-white/42">
                <span className={`grid size-4 shrink-0 place-items-center rounded ${step.status === "completed" ? "bg-emerald-400/10 text-emerald-300" : step.status === "failed" ? "bg-red-400/10 text-red-300" : step.status === "running" ? "bg-[#2f98ff]/10 text-[#70b7ff]" : "bg-white/[0.04] text-white/28"}`}>{step.status === "completed" ? <Check className="size-2.5" /> : index + 1}</span>
                <span className="truncate">{step.title}</span>
              </li>
            ))}
          </ol>
          {buildInterrupted && currentTaskId ? (
            <button type="button" onClick={() => void approveAndBuild()} disabled={running || startingBuild} className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-lg bg-[#ff7138] px-3 text-[10px] font-semibold text-black hover:bg-[#ff8a5a] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b70]">
              {startingBuild ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Zap className="size-3.5" />}
              {startingBuild ? "Starting build" : "Retry build"}
            </button>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-white/[0.095] bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
      aria-labelledby="agent-plan-title"
    >
      <div className="flex items-start gap-3 border-b border-white/[0.065] px-4 py-3.5 sm:px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[#ff7433]/20 bg-[#ff7433]/10 text-[#ff9567]"><Goal className="size-3.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#ff966b]">Implementation plan</p>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] ${buildInterrupted ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200/65" : "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200/55"}`}>{buildInterrupted ? "Build interrupted" : mode === "plan" ? "Ready for review" : "Approved scope"}</span>
          </div>
          <h3 id="agent-plan-title" className="mt-1.5 text-[13px] font-medium leading-5 text-white/80">{plan.summary || plan.goal}</h3>
          <p className="mt-1 text-[9px] text-white/28">Choose a direction, review the sequence, then build.</p>
        </div>
      </div>

      <div className="border-b border-white/[0.065] px-3 py-3 sm:px-5 sm:py-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/34">Choose an approach</p>
          <span className="text-[8px] text-white/22">Required before Build</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Implementation approach">
          {approachOptions.map((option, index) => {
            const selected = selectedOptionId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectApproach(option.id)}
                className={`group min-w-0 scroll-mt-24 rounded-xl border p-2.5 text-left transition-[border-color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff] active:scale-[0.99] ${selected ? "border-[#2f98ff]/45 bg-[#2f98ff]/[0.075]" : "border-white/[0.075] bg-black/10 hover:border-white/[0.14] hover:bg-white/[0.025]"}`}
              >
                <span className="flex items-start gap-2">
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${selected ? "border-[#64b2ff] bg-[#2f98ff] text-[#06111d]" : "border-white/15 text-transparent"}`}><Check className="size-2.5" /></span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-white/72"><span>{option.title}</span>{option.recommended ? <span className="rounded-full bg-[#ff7433]/10 px-1.5 py-0.5 font-mono text-[6px] uppercase tracking-[0.12em] text-[#ff9567]">Recommended</span> : null}</span>
                    <span className="mt-1 block line-clamp-2 text-[9px] leading-4 text-white/35">{option.description}</span>
                  </span>
                </span>
                <span className="sr-only">Approach {index + 1}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={selectedOptionId === "custom"}
            onClick={() => selectApproach("custom")}
            className={`min-w-0 scroll-mt-24 rounded-xl border p-2.5 text-left transition-[border-color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff] active:scale-[0.99] ${selectedOptionId === "custom" ? "border-[#ff7433]/45 bg-[#ff7433]/[0.07]" : "border-dashed border-white/[0.1] bg-black/10 hover:border-white/[0.16] hover:bg-white/[0.025]"}`}
          >
            <span className="flex items-start gap-2">
              <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${selectedOptionId === "custom" ? "border-[#ff9567] bg-[#ff7433] text-[#170802]" : "border-white/15 text-transparent"}`}><Check className="size-2.5" /></span>
              <span><span className="block text-[10px] font-medium text-white/72">Custom approach</span><span className="mt-1 block text-[9px] leading-4 text-white/35">Describe another direction.</span></span>
            </span>
          </button>
        </div>
        {selectedOptionId === "custom" ? (
          <label className="mt-2.5 block rounded-xl border border-[#ff7433]/20 bg-black/15 p-2.5 text-[8px] uppercase tracking-[0.12em] text-white/28">
            Custom implementation direction
            <textarea
              autoFocus
              value={plan.customApproach || ""}
              onChange={(event) => onPlanChange({ ...plan, selectedOptionId: "custom", customApproach: event.target.value, approach: event.target.value })}
              placeholder="Describe the architecture, scope, constraints, and tradeoffs the agents should follow..."
              className="mt-2 h-24 w-full resize-y rounded-lg border border-white/[0.075] bg-[#111519] px-3 py-2.5 text-[11px] normal-case leading-5 tracking-normal text-white/72 outline-none placeholder:text-white/22 focus:border-[#ff7433]/45"
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.065] px-4 py-2.5 sm:px-5">
        <span className="min-w-0 truncate text-[9px] text-white/30">Selected: <span className="text-white/52">{selectedApproachLabel}</span></span>
        {currentTaskId ? <button type="button" onClick={() => void approveAndBuild()} disabled={customApproachMissing || running || startingBuild} title={customApproachMissing ? "Describe the custom approach before Build." : undefined} className="ml-auto inline-flex min-h-8 items-center gap-2 rounded-lg bg-[#ff7138] px-3.5 text-[10px] font-semibold text-black shadow-[0_8px_24px_rgba(255,113,56,0.18)] hover:bg-[#ff8a5a] disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/22 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b70]">{startingBuild ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Zap className="size-3.5" />}{startingBuild ? "Starting build" : "Approve and build"}</button> : null}
      </div>

      <div className="px-4 py-3 sm:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/34">Build sequence</p>
          <span className="font-mono text-[8px] text-white/22">{plan.steps.length} steps</span>
        </div>
        <ol className="grid gap-1 sm:grid-cols-2">
          {plan.steps.map((step, index) => (
            <li key={step.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.055] font-mono text-[7px] text-white/34">{index + 1}</span>
              <span className="truncate text-[10px] font-medium text-white/62">{step.title}</span>
            </li>
          ))}
        </ol>
      </div>

      <details className="group border-t border-white/[0.065]">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 text-[9px] text-white/38 transition-colors hover:bg-white/[0.025] hover:text-white/62 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f98ff] sm:px-5">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
          Plan details
          <span className="ml-auto font-mono text-[7px] text-white/20">scope, validation, risks</span>
        </summary>
        <div className="space-y-4 border-t border-white/[0.055] px-4 py-4 sm:px-5">
          <div>
            <p className="font-mono text-[7px] uppercase tracking-[0.14em] text-white/26">Selected approach</p>
            <p className="mt-1.5 text-[10px] leading-5 text-white/48">{plan.approach}</p>
            {selectedOptionId !== "custom" && approachOptions.find((option) => option.id === selectedOptionId)?.tradeoff ? <p className="mt-1 text-[8px] leading-4 text-white/26">{approachOptions.find((option) => option.id === selectedOptionId)?.tradeoff}</p> : null}
          </div>
          <ol className="space-y-2">
            {plan.steps.map((step, index) => (
              <li key={step.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 text-[9px] leading-4 text-white/38">
                <span className="font-mono text-white/22">{index + 1}.</span>
                <span><strong className="font-medium text-white/55">{step.title}</strong>{step.description || step.reason ? `: ${step.description || step.reason}` : ""}{step.validation ? <span className="mt-1 flex gap-1.5 text-emerald-200/35"><ShieldCheck className="mt-0.5 size-3 shrink-0" />{step.validation}</span> : null}{step.files?.length ? <span className="mt-1 block font-mono text-[7px] text-[#8ec8ff]/48">{step.files.slice(0, 6).join(" / ")}</span> : null}</span>
              </li>
            ))}
          </ol>
          {reviewGroups.length ? <div className="grid gap-3 sm:grid-cols-3">{reviewGroups.map((group) => <div key={group.label}><p className="font-mono text-[7px] uppercase tracking-[0.14em] text-white/26">{group.label}</p><ul className="mt-2 space-y-1.5">{group.values.slice(0, 4).map((value) => <li key={value} className="flex gap-2 text-[8px] leading-4 text-white/36"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/20" />{value}</li>)}</ul></div>)}</div> : null}
          <p className="font-mono text-[7px] text-white/20"><code className="text-[#8ec8ff]/50">plans-goals/task.md</code> is created when Build starts.</p>
        </div>
      </details>

      {mode === "plan" ? (
        <div className="border-t border-white/[0.065] px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.075] bg-black/15 p-1.5 focus-within:border-[#2f98ff]/30">
            <input
              value={refinement}
              onChange={(event) => setRefinement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                sendRefinement();
              }}
              placeholder="Request a plan change..."
              aria-label="Plan feedback"
              className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[10px] text-white/68 outline-none placeholder:text-white/22"
            />
            <button type="button" onClick={sendRefinement} disabled={!refinement.trim() || running} aria-label="Send plan feedback" className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#2f98ff] text-[#06111d] transition-[background-color,transform] hover:bg-[#64b2ff] active:scale-95 disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79bdff]"><ArrowUp className="size-3.5" /></button>
          </div>
        </div>
      ) : null}

    </section>
  );
}

export function CodingProjectSidebar({
  repositories,
  localRepositories,
  activeSource,
  userLabel,
  search,
  onSearch,
  onNewAgent,
  onSelectRepository,
  onSelectLocal,
  onOpenLocal,
  onCustomize,
  tasks,
  showRecentTasks,
  activeTaskId,
  filePaths,
  onSelectTask,
  onSelectFile,
}: {
  repositories: GithubRepositoryOption[];
  localRepositories: Array<{ slug: string; name: string }>;
  activeSource: string;
  userLabel: string;
  search: string;
  onSearch: (value: string) => void;
  onNewAgent: () => void;
  onSelectRepository: (fullName: string) => void;
  onSelectLocal: (slug: string) => void;
  onOpenLocal: () => void;
  onCustomize: () => void;
  tasks: CodingTaskRecord[];
  showRecentTasks: boolean;
  activeTaskId?: string;
  filePaths: string[];
  onSelectTask: (task: CodingTaskRecord) => void;
  onSelectFile: (path: string) => void;
}) {
  const query = search.trim().toLowerCase();
  const filtered = repositories.filter((item) => item.full_name.toLowerCase().includes(query));
  const filteredLocal = localRepositories.filter((item) => item.name.toLowerCase().includes(query));
  const filteredTasks = query ? tasks.filter((item) => `${item.goal} ${item.repository_full_name}`.toLowerCase().includes(query)).slice(0, 6) : [];
  const filteredFiles = query ? filePaths.filter((path) => path.toLowerCase().includes(query)).slice(0, 8) : [];
  return (
    <aside className="coding-command-sidebar hidden h-dvh w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-[#090b0d] lg:flex">
      <div className="flex h-12 items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="grid size-7 place-items-center rounded-lg bg-[#ff7138] text-black"><Sparkles className="size-3.5" /></span>
        <span className="text-[12px] font-semibold text-white/82">Kontext</span>
        <span className="ml-auto rounded-full border border-white/[0.08] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/25">Coding</span>
      </div>
      <div className="space-y-1 p-2">
        <button type="button" onClick={onNewAgent} className="flex min-h-9 w-full items-center gap-2 rounded-[9px] bg-white/[0.075] px-3 text-left text-[12px] font-medium text-white/86 transition-colors hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]"><Plus className="size-4 text-[#ff966b]" />New Agent<span className="ml-auto font-mono text-[9px] text-white/25">Ctrl N</span></button>
        <label className="flex min-h-9 items-center gap-2 rounded-[9px] px-3 text-white/38 focus-within:bg-white/[0.045] focus-within:ring-1 focus-within:ring-white/10"><Search className="size-3.5" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search" aria-label="Search repositories, files, and tasks" className="min-w-0 flex-1 bg-transparent text-[11px] text-white/68 outline-none placeholder:text-white/28" /></label>
        <button type="button" onClick={onCustomize} className="flex min-h-9 w-full items-center gap-2 rounded-[9px] px-3 text-[11px] text-white/48 hover:bg-white/[0.045] hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]"><Settings2 className="size-3.5" />Customize</button>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-2"><span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/28">Repositories</span><button type="button" onClick={onOpenLocal} aria-label="Connect Git repository" className="grid size-7 place-items-center rounded-md text-white/32 hover:bg-white/[0.06] hover:text-white"><FolderGit2 className="size-3.5" /></button></div>
        <div className="coding-thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {(query ? filteredLocal : localRepositories).map((item) => (
            <button key={item.slug} type="button" onClick={() => onSelectLocal(item.slug)} className={`flex min-h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[11px] transition-colors ${activeSource === `local:${item.slug}` ? "bg-[#ff7433]/10 text-[#ff9b70]" : "text-white/46 hover:bg-white/[0.045] hover:text-white/75"}`}><FolderGit2 className="size-3.5 shrink-0" /><span className="truncate">{item.name}</span></button>
          ))}
          {filtered.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelectRepository(item.full_name)} className={`flex min-h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[11px] transition-colors ${activeSource === item.full_name ? "bg-[#ff7433]/10 text-[#ff9b70]" : "text-white/46 hover:bg-white/[0.045] hover:text-white/75"}`}><GitHubLogoIcon className="size-3.5 shrink-0" /><span className="truncate">{item.full_name}</span></button>
          ))}
          {!query && showRecentTasks && tasks.length ? (
            <section className="mt-4 border-t border-white/[0.065] pt-3" aria-labelledby="sidebar-recent-coding-tasks">
              <div className="mb-1.5 flex items-center justify-between px-2.5">
                <h2 id="sidebar-recent-coding-tasks" className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/26">Recent tasks</h2>
                <span className="text-[8px] text-white/18">Idle</span>
              </div>
              <div className="space-y-0.5">
                {tasks.slice(0, 6).map((item) => (
                  <button key={item.id} type="button" onClick={() => onSelectTask(item)} className={`group flex min-h-11 w-full items-start gap-2 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff] ${activeTaskId === item.id ? "bg-white/[0.05]" : ""}`}>
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.status === "failed" ? "bg-red-400" : item.status === "completed" ? "bg-emerald-400" : "bg-amber-300"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] text-white/52 group-hover:text-white/78">{item.goal}</span>
                      <span className="mt-1 block truncate font-mono text-[7px] text-white/20">{item.repository_full_name} / {item.branch}</span>
                    </span>
                    <span className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-[7px] text-white/18"><Clock3 className="size-2.5" />{relativeTime(item.updated_at)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {filteredFiles.length ? <p className="px-2.5 pb-1 pt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-white/24">Files</p> : null}
          {filteredFiles.map((path) => <button key={path} type="button" onClick={() => onSelectFile(path)} className="flex min-h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[10px] text-white/44 hover:bg-white/[0.045] hover:text-white/75"><FileCode2 className="size-3 shrink-0" /><span className="truncate">{path}</span></button>)}
          {filteredTasks.length ? <p className="px-2.5 pb-1 pt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-white/24">Tasks</p> : null}
          {filteredTasks.map((item) => <button key={item.id} type="button" onClick={() => onSelectTask(item)} className="flex min-h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[10px] text-white/44 hover:bg-white/[0.045] hover:text-white/75"><MessageSquareText className="size-3 shrink-0" /><span className="truncate">{item.goal}</span></button>)}
        </div>
      </div>
      <div className="border-t border-white/[0.07] p-3">
        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]"><span className="grid size-8 place-items-center rounded-full bg-[linear-gradient(145deg,#407cff,#7fa8ff)] text-[11px] font-semibold text-white">{userLabel.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-[11px] text-white/68">{userLabel}</span><span className="block text-[9px] text-white/26">Personal workspace</span></span><ChevronDown className="ml-auto size-3 text-white/24" /></button>
      </div>
    </aside>
  );
}

export function AgentNativeHome({
  sourceLabel,
  branch,
  sourceReady,
  value,
  mode,
  effort,
  goal,
  running,
  loading,
  currentTaskId,
  thread,
  onChange,
  onModeChange,
  onEffortChange,
  onGoalChange,
  onSubmit,
  onStop,
  onOpenRepository,
  onStartBuild,
  plan,
  contextPaths,
  availableContextPaths,
  onToggleContextPath,
  onPlanChange,
  onRefinePlan,
  phase,
  activity,
  changes,
  onOpenChanges,
}: {
  sourceLabel: string;
  branch: string;
  sourceReady: boolean;
  value: string;
  mode: CodingInteractionMode;
  effort: CodingEffortProfile;
  goal: CodingGoal;
  running: boolean;
  loading: boolean;
  currentTaskId?: string;
  thread: ThreadMessage[];
  onChange: (value: string) => void;
  onModeChange: (mode: CodingInteractionMode) => void;
  onEffortChange: (effort: CodingEffortProfile) => void;
  onGoalChange: (goal: CodingGoal) => void;
  onSubmit: () => void;
  onStop: () => void;
  onOpenRepository: () => void;
  onStartBuild: () => void | Promise<void>;
  plan: CodingAgentPlan | null;
  contextPaths: string[];
  availableContextPaths: string[];
  onToggleContextPath: (path: string) => void;
  onPlanChange: (plan: CodingAgentPlan) => void;
  onRefinePlan: (instruction: string) => void;
  phase: string;
  activity: Array<{ id: string; type: string; phase: string; message: string }>;
  changes: CodingChanges | null;
  onOpenChanges: () => void;
}) {
  const [goalOpen, setGoalOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const activeIntent = INTENTS.find((item) => item.id === mode)!;
  const activeEffort = EFFORTS.find((item) => item.id === effort)!;
  const visibleThread = visibleAgentThread(thread, Boolean(plan));
  const latestVisibleMessage = visibleThread.at(-1);
  const showThinking = running && latestVisibleMessage?.role === "user";
  const hasConversation = visibleThread.length > 0 || Boolean(plan) || running;
  const hiddenPatch = thread.some(
    (message) => message.role === "assistant" && hasPatchPayload(message.content),
  );
  const canSubmit = sourceReady && Boolean(value.trim() || goal.objective.trim()) && !loading;
  const changeStats = changedLineStats(changes?.diff || "");

  return (
    <section className="agent-native-home relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#090b0d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_58%_24%,rgba(41,137,255,0.07),transparent_25%),linear-gradient(rgba(255,255,255,0.014)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:auto,52px_52px,52px_52px]" />
      <div className={`relative mx-auto flex h-full min-h-0 w-full max-w-[900px] flex-col px-4 sm:px-8 ${hasConversation ? "pb-4 pt-5 sm:pt-7" : "overflow-y-auto pb-12 pt-[clamp(48px,10vh,112px)]"}`}>
        {hasConversation ? (
          <div className="coding-thin-scrollbar mx-auto min-h-0 w-full max-w-[760px] flex-1 scroll-pb-8 space-y-5 overflow-y-auto pb-8 pr-1" aria-live="polite">
            {visibleThread.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[82%] rounded-[18px] border border-white/[0.045] bg-white/[0.07] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.16)]" : "max-w-full rounded-2xl border border-white/[0.065] bg-white/[0.018] px-4 py-4"}>
                <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.15em] text-white/25">{message.role === "user" ? "You" : "Kontext"}</p>
                {message.role === "assistant" ? <AgentMessageBody content={message.content} /> : <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-white/76">{message.content}</p>}
              </article>
            ))}
            {showThinking ? <AgentThinkingState mode={mode} phase={phase} /> : null}
            {plan ? <PlanReviewCard plan={plan} mode={mode} phase={phase} currentTaskId={currentTaskId} running={running} onPlanChange={onPlanChange} onRefinePlan={onRefinePlan} onStartBuild={onStartBuild} /> : null}
            {changes?.files.length ? (
              <button type="button" onClick={onOpenChanges} className="w-full rounded-xl border border-[#2f98ff]/15 bg-[#2f98ff]/[0.045] p-3.5 text-left transition-colors hover:border-[#2f98ff]/28 hover:bg-[#2f98ff]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff]">
                <span className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#2f98ff]/10 text-[#79bdff]"><FileDiff className="size-3.5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[10px] font-medium text-white/68">Changed {changes.files.length} {changes.files.length === 1 ? "file" : "files"}</span><span className="mt-0.5 block text-[9px] text-white/28">Review the isolated diff before applying it to the source repository.</span></span>
                  <span className="flex shrink-0 gap-2 font-mono text-[9px]"><span className="text-emerald-300/70">+{changeStats.added}</span><span className="text-red-300/65">-{changeStats.removed}</span></span>
                </span>
                <span className="mt-3 flex flex-wrap gap-1.5 pl-11">{changes.files.slice(0, 5).map((path) => <span key={path} className="max-w-48 truncate rounded-md border border-white/[0.07] bg-black/15 px-2 py-1 font-mono text-[8px] text-[#8ec8ff]/62">{path}</span>)}{changes.files.length > 5 ? <span className="px-1 py-1 font-mono text-[8px] text-white/25">+{changes.files.length - 5} more</span> : null}</span>
              </button>
            ) : hiddenPatch ? <div className="flex items-center gap-3 rounded-xl border border-[#2f98ff]/15 bg-[#2f98ff]/[0.045] px-3.5 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#2f98ff]/10 text-[#79bdff]"><FileDiff className="size-3.5" /></span><div><p className="text-[10px] font-medium text-white/62">Implementation draft is available in Changes</p><p className="mt-0.5 text-[9px] text-white/27">The patch is kept out of the conversation so the plan stays readable.</p></div></div> : null}
            {activity.length ? <details className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2"><summary className="cursor-pointer list-none font-mono text-[8px] uppercase tracking-[0.12em] text-white/32">{phase || "Task activity"} / {activity.length} updates</summary><div className="mt-2 space-y-1.5">{activity.slice(-6).map((item) => { const failed = item.type.includes("failed") || item.phase === "failed"; return <div key={item.id} className="flex min-w-0 items-start gap-2 text-[10px]"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${failed ? "bg-red-400" : item.type.includes("completed") || item.type.includes("ready") ? "bg-emerald-400" : "bg-amber-300"}`} /><span className={failed ? "text-red-200/72" : "text-white/42"}>{item.message || item.type.replaceAll("_", " ")}</span></div>; })}</div></details> : null}
          </div>
        ) : (
          <div className="mx-auto mb-8 w-full max-w-[760px] text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-300/70">{sourceReady ? "Context ready" : "Repository required"}</p>
            <h2 className="mt-4 text-balance text-[clamp(30px,4vw,48px)] font-semibold leading-[1.04] tracking-[-0.05em] text-white/92">What should the agent ship?</h2>
            <p className="mx-auto mt-4 max-w-[54ch] text-pretty text-[13px] leading-6 text-white/38">Describe the outcome. Kontext will inspect the repository, build a plan, coordinate bounded specialists, and keep side effects behind approval.</p>
          </div>
        )}

        <div className={`mx-auto w-full max-w-[760px] ${hasConversation ? "relative z-20 shrink-0 border-t border-white/[0.055] pt-3" : ""}`}>
          <div className="mb-2.5 flex min-w-0 items-center gap-2 px-1 font-mono text-[9px] text-white/30">
            <FolderGit2 className="size-3 text-[#ff966b]" />
            <button type="button" onClick={onOpenRepository} className="truncate text-white/62 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]">{sourceLabel || "Connect a Git repository"}</button>
            {sourceReady ? <><span className="text-white/14">/</span><span className="truncate">{branch}</span><span className="ml-auto flex items-center gap-1.5 text-emerald-300/55"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />synced</span></> : null}
          </div>
          <div className="relative rounded-[20px] border border-white/[0.11] bg-[#12161a]/95 p-2.5 shadow-[0_30px_100px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl focus-within:border-[#2f98ff]/35 focus-within:shadow-[0_30px_100px_rgba(0,0,0,0.55),0_0_0_1px_rgba(47,152,255,0.12)]">
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#2f98ff]/55 to-transparent" />
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (running) onStop();
                else if (canSubmit) onSubmit();
              }}
              placeholder={sourceReady ? "Describe a goal, ask about the code, or plan a change..." : "Connect a Git repository to begin..."}
              aria-label="Agent task"
              disabled={!sourceReady}
              className={`${hasConversation ? "h-20" : "h-32"} w-full resize-none rounded-[13px] border border-white/[0.045] bg-[#181c20] px-4 py-3.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24 disabled:cursor-not-allowed disabled:opacity-55`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1 pb-0.5">
              <div className="relative">
                <button type="button" onClick={() => setContextOpen((open) => !open)} className="grid size-8 place-items-center rounded-[9px] border border-white/[0.08] bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f98ff]" aria-label="Add files and folders"><Plus className="size-4" /></button>
                {contextOpen ? <div className="coding-thin-scrollbar absolute bottom-10 left-0 z-20 max-h-72 w-[min(320px,calc(100vw-48px))] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#181c20] p-2 shadow-2xl"><p className="px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/28">Priority context</p>{availableContextPaths.length ? availableContextPaths.slice(0, 80).map((path) => { const selected = contextPaths.includes(path); return <button key={path} type="button" aria-pressed={selected} onClick={() => onToggleContextPath(path)} className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-[10px] ${selected ? "bg-[#2f98ff]/10 text-[#70b7ff]" : "text-white/48 hover:bg-white/[0.06] hover:text-white/72"}`}><span className={`grid size-3.5 place-items-center rounded border ${selected ? "border-[#2f98ff]/55 bg-[#2f98ff]/25" : "border-white/[0.12]"}`}>{selected ? <Check className="size-2.5" /> : null}</span><FileCode2 className="size-3 shrink-0" /><span className="truncate">{path}</span></button>; }) : <p className="px-3 py-3 text-[9px] leading-4 text-white/25">The repository tree is still loading.</p>}<p className="px-3 py-2 text-[9px] leading-4 text-white/25">Selected files are loaded without opening the editor and receive retrieval priority.</p></div> : null}
              </div>
              <div className="relative">
                <button type="button" onClick={() => setGoalOpen((open) => !open)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[10px] ${goal.objective ? "border-[#ff7433]/30 bg-[#ff7433]/10 text-[#ff9b70]" : "border-white/[0.08] text-white/40 hover:text-white/70"}`}><Goal className="size-3.5" />Goal{goal.objective ? <Check className="size-3" /> : null}</button>
                {goalOpen ? <div className="absolute bottom-10 left-0 z-30 w-[min(360px,calc(100vw-48px))] rounded-2xl border border-white/[0.1] bg-[#15191d] p-4 shadow-2xl"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">Structured goal</p><label className="mt-3 block text-[10px] text-white/38">Objective<textarea value={goal.objective} onChange={(event) => onGoalChange({ ...goal, objective: event.target.value })} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 p-2.5 text-[11px] leading-5 text-white/70 outline-none focus:border-[#2f98ff]/45" /></label><label className="mt-3 block text-[10px] text-white/38">Acceptance criteria<input value={goal.acceptanceCriteria.join("; ")} onChange={(event) => onGoalChange({ ...goal, acceptanceCriteria: event.target.value.split(";").map((item) => item.trim()).filter(Boolean) })} placeholder="Separate criteria with semicolons" className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 text-[11px] text-white/70 outline-none focus:border-[#2f98ff]/45" /></label><label className="mt-3 block text-[10px] text-white/38">Constraints<input value={goal.constraints.join("; ")} onChange={(event) => onGoalChange({ ...goal, constraints: event.target.value.split(";").map((item) => item.trim()).filter(Boolean) })} placeholder="Separate constraints with semicolons" className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 text-[11px] text-white/70 outline-none focus:border-[#2f98ff]/45" /></label><button type="button" onClick={() => setGoalOpen(false)} className="mt-3 w-full rounded-lg bg-white/[0.08] py-2 text-[10px] text-white/60 hover:bg-white/[0.12]">Save goal</button></div> : null}
              </div>
              <select value={mode} onChange={(event) => onModeChange(event.target.value as CodingInteractionMode)} aria-label="Interaction mode" className="min-h-8 rounded-[9px] border border-[#ff7433]/25 bg-[#ff7433]/[0.07] px-2.5 text-[10px] text-[#ff9b70] outline-none focus:ring-2 focus:ring-[#ff7433]"><option value="ask">Ask</option><option value="plan">Plan</option><option value="build">Build</option></select>
              <select value={effort} onChange={(event) => onEffortChange(event.target.value as CodingEffortProfile)} aria-label="Effort profile" className="min-h-8 rounded-[9px] border border-white/[0.08] bg-[#15191d] px-2.5 text-[10px] text-white/48 outline-none focus:ring-2 focus:ring-[#2f98ff]"><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option></select>
              <span className="hidden text-[9px] text-white/22 sm:inline">{activeIntent.description} / {activeEffort.description}</span>
              <button type="button" onClick={running ? onStop : onSubmit} disabled={!running && !canSubmit} aria-label={running ? "Stop agent" : "Run agent"} className="ml-auto grid size-9 place-items-center rounded-[10px] bg-[#ff7138] text-black shadow-[0_8px_20px_rgba(255,113,56,0.22)] transition-transform hover:bg-[#ff8a5a] active:scale-95 disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/20 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b70]">{running ? <span className="size-3 rounded-sm bg-current" /> : loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowUp className="size-4" />}</button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 font-mono text-[8px] text-white/20"><span>Enter to run / Shift+Enter for newline</span><span>{contextPaths.length ? `${contextPaths.length} explicit context` : mode === "build" ? "Approval required for side effects" : "Read only"}</span></div>
        </div>

        {!hasConversation ? <div className="mx-auto mt-auto flex w-full max-w-[760px] items-center gap-2 pt-12 text-[9px] text-white/20"><ShieldCheck className="size-3.5 text-emerald-300/40" />One source snapshot / bounded specialists / one isolated writer</div> : null}
      </div>
    </section>
  );
}
