"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  FolderGit2,
  GitBranch,
  ListChecks,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

import {
  ChoiceGroup,
  FeatureCarousel,
  Onboarding,
  TipsList,
} from "@/components/ui/onboarding";
import type {
  CodingEffortProfile,
  CodingInteractionMode,
} from "@/services/coding";
import type { GithubRepositoryOption } from "@/services/github";

type CodingOnboardingProps = {
  repositories: GithubRepositoryOption[];
  activeRepository: string;
  localRepositoryName: string;
  busy?: boolean;
  onSelectRepository: (fullName: string) => void;
  onOpenLocalRepository: () => void;
  onComplete: (defaults: {
    interactionMode: CodingInteractionMode;
    effortProfile: CodingEffortProfile;
  }) => void;
};

const FEATURES = [
  {
    icon: Bot,
    eyebrow: "Delegate",
    title: "Start with the outcome",
    description:
      "Give Kontext a goal. It retrieves the right code, keeps the work durable, and reports progress without forcing you into an editor.",
  },
  {
    icon: Network,
    eyebrow: "Understand",
    title: "Repository-aware planning",
    description:
      "The orchestrator maps architecture and dependencies before one isolated writer is allowed to propose changes.",
  },
  {
    icon: ListChecks,
    eyebrow: "Validate",
    title: "Evidence before completion",
    description:
      "Tests, diagnostics, diffs, and specialist failures remain visible. A failed check never becomes a false success.",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Control",
    title: "You approve side effects",
    description:
      "Local writes, commands, network access, commits, pull requests, and previews stay behind explicit approvals.",
  },
];

export function CodingOnboarding({
  repositories,
  activeRepository,
  localRepositoryName,
  busy = false,
  onSelectRepository,
  onOpenLocalRepository,
  onComplete,
}: CodingOnboardingProps) {
  const [step, setStep] = useState(1);
  const [feature, setFeature] = useState(0);
  const [mode, setMode] = useState<CodingInteractionMode>("plan");
  const [effort, setEffort] = useState<CodingEffortProfile>("balanced");
  const sourceReady = Boolean(activeRepository || localRepositoryName);
  const activeFeature = FEATURES[feature];
  const FeatureIcon = activeFeature.icon;

  return (
    <main className="dark relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#080a0c] px-4 py-8 text-white sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(255,112,54,0.12),transparent_27%),radial-gradient(circle_at_85%_22%,rgba(48,139,255,0.1),transparent_30%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.014)_1px,transparent_1px)] bg-[size:auto,auto,48px_48px,48px_48px]" />
      <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-[#ff7433]/70 to-transparent" />

      <Onboarding
        value={step}
        onValueChange={setStep}
        stepValue={feature}
        onStepValueChange={setFeature}
        totalSteps={3}
        maxStepValue={FEATURES.length - 1}
        canGoNext={(currentStep) => currentStep !== 3 || sourceReady}
        onComplete={() => onComplete({ interactionMode: mode, effortProfile: effort })}
        className="relative w-full max-w-[860px] overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0d1013]/95 p-0 shadow-[0_40px_140px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-[9px] bg-[#ff7138] text-black shadow-[0_8px_24px_rgba(255,113,56,0.25)]">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-[-0.01em] text-white/88">Kontext Coding</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">Agent-native workspace</p>
            </div>
          </div>
          <Onboarding.StepIndicator
            variant="pills"
            className="w-28"
            dotClassName="data-[state=active]:bg-[#ff7138] data-[state=completed]:bg-emerald-400/70"
          />
        </div>

        <div className="min-h-[520px] p-6 sm:p-8">
          <Onboarding.Step step={1} className="h-full">
            <div className="grid min-h-[430px] gap-8 lg:grid-cols-[1.08fr_0.92fr]">
              <section className="flex flex-col justify-between rounded-[22px] border border-white/[0.07] bg-[#12161a] p-7">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff966b]">{activeFeature.eyebrow}</p>
                  <h1 className="mt-5 max-w-md text-balance text-[38px] font-semibold leading-[1.03] tracking-[-0.045em] text-white sm:text-[48px]">
                    {activeFeature.title}
                  </h1>
                  <p className="mt-5 max-w-[52ch] text-pretty text-[14px] leading-7 text-white/48">
                    {activeFeature.description}
                  </p>
                </div>
                <div className="mt-10 flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-2xl border border-[#ff7433]/20 bg-[#ff7433]/10 text-[#ff966b]">
                    <FeatureIcon className="size-5" />
                  </div>
                  <p className="font-mono text-[10px] leading-5 text-white/30">{feature + 1} / {FEATURES.length}<br />Built for durable work</p>
                </div>
              </section>
              <section className="flex flex-col justify-between py-2">
                <FeatureCarousel value={feature} onValueChange={setFeature} className="space-y-2">
                  {FEATURES.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <FeatureCarousel.Item
                        key={item.title}
                        index={index}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-transparent px-4 py-4 text-left transition-colors data-[state=active]:border-white/[0.09] data-[state=active]:bg-white/[0.055] hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-white/35 group-data-[state=active]:bg-[#ff7433]/12 group-data-[state=active]:text-[#ff966b]">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-white/72">{item.title}</span>
                          <span className="mt-1 block truncate text-[11px] text-white/28">{item.eyebrow}</span>
                        </span>
                        <ArrowRight className="ml-auto size-4 text-white/15 group-data-[state=active]:text-white/50" />
                      </FeatureCarousel.Item>
                    );
                  })}
                </FeatureCarousel>
                <button type="button" onClick={() => setStep(2)} className="mt-6 self-start text-[11px] text-white/32 underline decoration-white/15 underline-offset-4 hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]">
                  Skip feature tour
                </button>
              </section>
            </div>
          </Onboarding.Step>

          <Onboarding.Step step={2}>
            <Onboarding.Header className="mb-8 text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff966b]">Your default</p>
              <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.04em] text-white">How should the agent begin?</h1>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-6 text-white/42">Intent controls permissions. Effort controls how much repository analysis runs before the result.</p>
            </Onboarding.Header>
            <ChoiceGroup name="Default coding intent" value={mode} onValueChange={(value) => setMode(value as CodingInteractionMode)} className="grid gap-3 md:grid-cols-3">
              {([
                ["plan", "Plan first", "Recommended", "Build context and an editable plan before any write."],
                ["build", "Build in sandbox", "Isolated", "Allow one writer inside a task-scoped runtime."],
                ["ask", "Ask", "Read only", "Explore architecture, behavior, and dependencies."],
              ] as const).map(([value, title, badge, description]) => (
                <ChoiceGroup.Item key={value} value={value} className="relative cursor-pointer rounded-[18px] border border-white/[0.08] bg-[#111418] p-5 transition-colors data-[state=selected]:border-[#ff7433]/45 data-[state=selected]:bg-[#ff7433]/[0.07] hover:border-white/[0.15] focus-within:ring-2 focus-within:ring-[#ff7433]">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-[14px] font-semibold text-white/82">{title}</span>
                    <span className="rounded-full border border-white/[0.08] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/35">{badge}</span>
                  </span>
                  <span className="mt-5 block text-[12px] leading-5 text-white/38">{description}</span>
                  {mode === value ? <Check className="absolute bottom-4 right-4 size-4 text-[#ff966b]" /> : null}
                </ChoiceGroup.Item>
              ))}
            </ChoiceGroup>
            <div className="mt-8">
              <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">Default effort</p>
              <ChoiceGroup name="Default coding effort" value={effort} onValueChange={(value) => setEffort(value as CodingEffortProfile)} className="flex flex-wrap gap-2">
                {(["fast", "balanced", "deep"] as const).map((value) => (
                  <ChoiceGroup.Item key={value} value={value} className="cursor-pointer rounded-full border border-white/[0.08] px-4 py-2 text-[11px] capitalize text-white/45 transition-colors data-[state=selected]:border-[#2f98ff]/45 data-[state=selected]:bg-[#2f98ff]/10 data-[state=selected]:text-[#79baff] hover:text-white/75 focus-within:ring-2 focus-within:ring-[#2f98ff]">
                    {value}
                  </ChoiceGroup.Item>
                ))}
              </ChoiceGroup>
            </div>
          </Onboarding.Step>

          <Onboarding.Step step={3}>
            <Onboarding.Header className="mb-7 text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff966b]">Required source</p>
              <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.04em] text-white">Connect a Git repository</h1>
              <p className="mt-3 text-[14px] leading-6 text-white/42">Kontext fingerprints and indexes versioned source before it accepts a task. Unversioned folders stay blocked.</p>
            </Onboarding.Header>
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <section className="min-h-64 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#111418]">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <span className="flex items-center gap-2 text-[12px] font-medium text-white/68"><GitHubLogoIcon className="size-4" />GitHub repositories</span>
                  <a href="https://github.com/new" target="_blank" rel="noreferrer" className="text-[10px] text-[#79baff] hover:text-[#a7d2ff]">Create new</a>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {repositories.length ? repositories.map((item) => (
                    <button key={item.id} type="button" onClick={() => onSelectRepository(item.full_name)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433] ${activeRepository === item.full_name ? "bg-white/[0.07]" : ""}`}>
                      <FolderGit2 className={`size-4 ${activeRepository === item.full_name ? "text-[#ff966b]" : "text-white/28"}`} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-white/72">{item.full_name}</span><span className="mt-1 flex items-center gap-1 font-mono text-[9px] text-white/25"><GitBranch className="size-2.5" />{item.default_branch}</span></span>
                      {activeRepository === item.full_name ? <Check className="size-4 text-emerald-300" /> : null}
                    </button>
                  )) : <div className="px-4 py-10 text-center text-[12px] leading-6 text-white/32">No GitHub repositories are available yet.<br /><a href="/connectors" className="text-[#79baff]">Connect GitHub</a></div>}
                </div>
              </section>
              <aside className="space-y-3">
                <button type="button" onClick={onOpenLocalRepository} className="w-full rounded-[18px] border border-white/[0.08] bg-[#111418] p-5 text-left transition-colors hover:border-white/[0.16] hover:bg-[#15191d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7433]">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/[0.05] text-white/55"><FolderGit2 className="size-4" /></span>
                  <span className="mt-4 block text-[13px] font-semibold text-white/78">Open local Git repo</span>
                  <span className="mt-2 block text-[11px] leading-5 text-white/34">The selected folder must contain a root <code className="text-white/55">.git</code> directory.</span>
                  {localRepositoryName ? <span className="mt-4 flex items-center gap-2 text-[10px] text-emerald-300"><Check className="size-3.5" />{localRepositoryName}</span> : null}
                </button>
                <TipsList title="Repository safety" className="rounded-[18px] border border-white/[0.06] bg-white/[0.025] p-4">
                  <TipsList.Item className="flex gap-2 text-[10px] leading-5 text-white/32"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-300/65" />Private files and <code>.git</code> data are excluded from snapshots.</TipsList.Item>
                </TipsList>
              </aside>
            </div>
          </Onboarding.Step>
        </div>

        <div className="border-t border-white/[0.07] bg-[#0a0c0e] px-6 py-4 sm:px-8">
          <Onboarding.Navigation
            nextLabel={step === 1 ? "Continue tour" : "Continue"}
            completeLabel={busy ? "Saving workspace..." : "Enter coding workspace"}
            canGoNext={step !== 3 || (sourceReady && !busy)}
            className="ml-auto max-w-sm"
          />
        </div>
      </Onboarding>
    </main>
  );
}
