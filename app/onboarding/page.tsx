"use client";

import { Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Braces, Check, FileText, GitBranch, Library, Search, Sparkles } from "lucide-react";

import { ChoiceGroup, Onboarding } from "@/components/ui/onboarding";
import { PaperDither } from "@/components/ui/paper-dither";
import { useInputValidation, sanitizeWorkspaceName, validateWorkspaceName, WORKSPACE_NAME_HELPER } from "@/hooks/use-input-validation";
import { isAuthenticated, loadAuthUser, saveAuthUser } from "@/lib/auth";
import { completeOnboarding } from "@/lib/onboarding";
import type { AuthUser, AuthWorkspace } from "@/lib/types";
import { loadWorkspaces, saveWorkspaces } from "@/lib/workspaces";
import { fetchMe, updateProfile } from "@/services/auth";
import { fetchWorkspaces, persistWorkspace } from "@/services/workspaces";

const heardAboutChoices = [
  ["agent", "AI agent", "Give an agent durable memory across sessions", Bot],
  ["application", "Application", "Add memory to a product or workflow", Braces],
  ["personal", "Personal AI", "Keep useful context available to you", Sparkles],
  ["developer", "Developer tool", "Build with the Memory API, MCP, or SDKs", GitBranch],
] as const;

const sourceChoices = [
  ["files", "Files and docs", "Bring the sources your agent already relies on", FileText],
  ["github", "GitHub context", "Keep repositories, issues, and project decisions close", GitBranch],
  ["web", "Web research", "Add links and research as searchable memory", Search],
] as const;

const toolChoices = [
  ["mcp", "MCP", "Connect an MCP-compatible agent to the universal memory endpoint", PlugIcon],
  ["rest", "REST API", "Use the canonical HTTP contract from any application", Braces],
  ["sdk", "TypeScript / Python", "Start with the SDK-friendly examples and raw HTTP", Library],
] as const;

function PlugIcon({ className }: { className?: string }) { return <span className={className}>↕</span>; }

function stepToIndex(step: string | null) {
  if (step === "persona") return 2;
  if (step === "use_case") return 3;
  if (step === "workspace") return 4;
  return 1;
}

function readParam(
  searchParams: ReturnType<typeof useSearchParams>,
  key: string,
  fallback: string,
) {
  const value = searchParams.get(key);
  return value && value.trim() ? value : fallback;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070707]" aria-label="Loading onboarding" />}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useState<AuthUser | null>(() => (isAuthenticated() ? loadAuthUser() : null));
  const [step, setStep] = useState(() => {
    return stepToIndex(searchParams.get("step"));
  });
  const [role, setRole] = useState(() => readParam(searchParams, "persona", "builder"));
  const [goal, setGoal] = useState(() => readParam(searchParams, "onboardingUseCase", "memory"));
  const [source, setSource] = useState(() => readParam(searchParams, "source", "files"));
  const [tool, setTool] = useState(() => readParam(searchParams, "tool", "mcp"));
  const {
    value: workspaceName,
    onChange: onWorkspaceNameChange,
    onBlur: onWorkspaceNameBlur,
    reset: resetWorkspaceName,
    error: workspaceNameError,
    isValid: isWorkspaceNameValid,
  } = useInputValidation({
    initialValue: readParam(searchParams, "workspaceName", "my-workspace"),
    sanitize: sanitizeWorkspaceName,
    validate: validateWorkspaceName,
  });
  const [heardAbout, setHeardAbout] = useState(() => readParam(searchParams, "heardAbout", "agent"));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login?redirect=/onboarding");
  }, [router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchMe()
      .then(({ user: backendUser }) => {
        if (cancelled) return;
        saveAuthUser({ ...user, ...backendUser });
        const onboarding = backendUser.preferences?.onboarding as
          | {
              persona?: string;
              heardAbout?: string;
              onboardingUseCase?: string;
              workspaceName?: string;
              step?: string;
            }
          | undefined;
        if (onboarding?.persona) setRole(onboarding.persona);
        if (onboarding?.heardAbout) setHeardAbout(onboarding.heardAbout);
        if (onboarding?.onboardingUseCase) setGoal(onboarding.onboardingUseCase);
        if (onboarding?.workspaceName) resetWorkspaceName(onboarding.workspaceName);
        if (onboarding?.step) {
          setStep(stepToIndex(onboarding.step));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resetWorkspaceName, user]);

  useEffect(() => {
    if (!user || !hydrated) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("persona", role);
    params.set("heardAbout", heardAbout);
    params.set("onboardingUseCase", goal);
    params.set("source", source);
    params.set("tool", tool);
    params.set(
      "step",
      step === 1 ? "heard_about" : step === 2 ? "persona" : step === 3 ? "use_case" : "workspace",
    );
    const nextUrl = `/onboarding?${params.toString()}`;
    const currentUrl = `/onboarding?${searchParams.toString()}`;
    if (nextUrl !== currentUrl) router.replace(nextUrl);

    void updateProfile({
      onboarding_persona: role,
      onboarding_heard_about: heardAbout,
      onboarding_use_case: goal,
      onboarding_workspace_name: workspaceName,
      onboarding_step:
        step === 1 ? "heard_about" : step === 2 ? "persona" : step === 3 ? "use_case" : "workspace",
    })
      .then((updatedUser) => {
        saveAuthUser(updatedUser);
      })
      .catch(() => undefined);
  }, [goal, heardAbout, hydrated, role, router, searchParams, source, step, tool, user, workspaceName]);

  if (!user) return null;
  const currentUser = user;

  async function finish() {
    const existing = loadWorkspaces(currentUser);
    let workspace = existing[0];
    if (!workspace) {
      const remote = await fetchWorkspaces().catch(() => []);
      workspace = remote[0];
    }
    if (!workspace) {
      workspace = {
        id: crypto.randomUUID(),
        name: workspaceName.trim() || "my-workspace",
        platform: "Kontext Memory",
        last_active: new Date().toISOString(),
      } satisfies AuthWorkspace;
      workspace = await persistWorkspace(workspace);
      saveWorkspaces(currentUser.id, [workspace]);
    }
    await updateProfile({
      onboarding_persona: role,
      onboarding_heard_about: heardAbout,
      onboarding_use_case: goal,
      onboarding_workspace_name: workspaceName,
      onboarding_step: "workspace",
    }).then((updatedUser) => saveAuthUser(updatedUser)).catch(() => undefined);
    completeOnboarding(currentUser.id);
    window.location.assign(`/chat?workspace=${encodeURIComponent(workspace.id)}`);
  }

  return (
    <main className="dark grid min-h-screen bg-[#070707] text-white lg:grid-cols-[0.92fr_1.08fr]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 bg-[#070707] lg:block">
        <PaperDither className="absolute inset-0 opacity-85" dark={{ colorBack: "#070707", colorFront: "#ed5d13" }} light={{ colorBack: "#070707", colorFront: "#ed5d13" }} eager maxPixelCount={1000 * 1000} scale={0.72} shape="warp" size={2.4} speed={0.18} type="4x4" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(246,232,121,.03),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(237,93,19,.08),transparent_22%),linear-gradient(180deg,rgba(10,9,8,.08),rgba(7,7,7,.24)_46%,rgba(7,7,7,.8))]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.028),transparent_28%,rgba(255,255,255,.012)_64%,transparent)] opacity-45" />
        <div className="absolute inset-x-16 top-10 h-36 rounded-[2.5rem] bg-white/[0.015] blur-3xl" />
        <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-8 xl:p-12">
          <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-white/8 bg-white/[0.02] px-4 py-2.5 text-sm font-semibold text-white/72 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
            <span className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)] shadow-[0_0_24px_rgba(246,110,44,.22)]" />
            TrueMemory
          </div>
          <div className="max-w-lg rounded-[2rem] border border-white/8 bg-white/[0.018] p-8 backdrop-blur-2xl shadow-[0_24px_90px_rgba(0,0,0,0.18)]">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#f6e879]">Universal memory infrastructure</p>
            <h1 className="mt-4 font-heading text-5xl leading-[.95] tracking-[-.06em] xl:text-6xl">One memory layer for everything you build.</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/45">Set up a Space, choose how you connect, and make your first memory available wherever you need it.</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
        <Onboarding value={step} onValueChange={setStep} totalSteps={4} onComplete={finish} canGoNext={(current) => current !== 4 || isWorkspaceNameValid} className="w-full max-w-[650px] border-white/10 bg-[#0d0d0c] p-6 text-white shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">Welcome to TrueMemory</p><Onboarding.StepIndicator variant="pills" className="w-28" dotClassName="data-[state=active]:bg-[#f6e879] data-[state=completed]:bg-[#f6e879]/60 data-[state=inactive]:bg-white/10" /></div>
          <Onboarding.Step step={1}>
            <Onboarding.Header className="text-left"><h2 className="font-heading text-3xl tracking-[-.05em]">What are you building?</h2><p className="mt-2 text-sm text-white/45">TrueMemory gives any agent or application a durable memory layer.</p></Onboarding.Header>
            <ChoiceCards
              name="heardAbout"
              items={heardAboutChoices}
              value={heardAbout}
              onChange={setHeardAbout}
            />
          </Onboarding.Step>
          <Onboarding.Step step={2}>
            <Onboarding.Header className="text-left"><h2 className="font-heading text-3xl tracking-[-.05em]">How do you want to connect?</h2><p className="mt-2 text-sm text-white/45">Choose the path that gets your first memory into your product fastest.</p></Onboarding.Header>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.16em] text-white/30">Bring your context together</p>
            <SourceCards value={source} onChange={setSource} />
          </Onboarding.Step>
          <Onboarding.Step step={3}>
            <Onboarding.Header className="text-left"><h2 className="font-heading text-3xl tracking-[-.05em]">Use your memory where you work.</h2><p className="mt-2 text-sm text-white/45">Pick the interface you open every day. You can add the others later.</p></Onboarding.Header>
            <ChoiceCards name="tool" items={toolChoices} value={tool} onChange={setTool} />
            <div className="mt-5 rounded-xl border border-white/8 bg-black/25 p-4 text-xs leading-6 text-white/40"><span className="font-semibold text-white/65">Your path:</span> {tool === "mcp" ? "MCP endpoint at /mcp" : tool === "rest" ? "REST memory API under /v1" : "SDK-friendly HTTP examples"}. No credentials are exposed during onboarding.</div>
          </Onboarding.Step>
          <Onboarding.Step step={4}>
            <div className="mt-8 border-t border-white/10 pt-8">
              <Onboarding.Header className="text-left">
                <h2 className="font-heading text-3xl tracking-[-.05em]">Create your first Space.</h2>
                <p className="mt-2 text-sm text-white/45">A Space is the boundary around memory, agents, applications, connections, and activity.</p>
              </Onboarding.Header>
                <label className="mt-8 block text-sm font-medium text-white/70">
                  Space name
                  <input
                    autoFocus
                    value={workspaceName}
                    onChange={onWorkspaceNameChange}
                    onBlur={onWorkspaceNameBlur}
                    maxLength={80}
                    pattern="[A-Za-z0-9_-]*"
                    aria-invalid={Boolean(workspaceNameError)}
                    aria-describedby="workspace-name-help workspace-name-error"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3.5 text-white outline-none focus:border-[#f6e879]/55 focus:ring-2 focus:ring-[#f6e879]/10"
                  />
                </label>
                <p id="workspace-name-help" className="mt-2 text-xs leading-5 text-white/40">
                  {WORKSPACE_NAME_HELPER}
                </p>
                {workspaceNameError ? (
                  <p id="workspace-name-error" className="mt-2 text-xs leading-5 text-[#ff8f70]">
                    {workspaceNameError}
                  </p>
                ) : null}
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {["Private by default", "Sources attached", "MCP-ready context"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[.025] px-3 py-3 text-xs text-white/50">
                    <Check className="size-3.5 text-[#f6e879]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Onboarding.Step>
          <Onboarding.Navigation className="mt-9 border-0 p-0 [&_button]:border-white/10 [&_button]:bg-white/[.04] [&_button]:text-white [&_[data-slot=onboarding-next]]:bg-[#f6e879] [&_[data-slot=onboarding-next]]:text-[#171814] [&_[data-slot=onboarding-complete]]:bg-[#f6e879] [&_[data-slot=onboarding-complete]]:text-[#171814]" completeLabel="Get started" />
        </Onboarding>
      </section>
    </main>
  );
}

function ChoiceCards({ name, items, value, onChange }: { name: string; items: ReadonlyArray<readonly [string, string, string, ComponentType<{ className?: string }>]>; value: string; onChange: (value: string) => void }) {
  return <ChoiceGroup name={name} value={value} onValueChange={onChange} className="mt-7 grid gap-3">{items.map(([id, title, description, Icon]) => <ChoiceGroup.Item key={id} value={id} className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-4 transition hover:bg-white/[.05] data-[state=selected]:border-[#f6e879]/55 data-[state=selected]:bg-[#f6e879]/[.06]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[.05] text-white/45 group-data-[state=selected]:text-[#f6e879]"><Icon className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-white/85">{title}</span><span className="mt-1 block text-xs text-white/35">{description}</span></span><span className="size-4 rounded-full border border-white/20 group-data-[state=selected]:border-[5px] group-data-[state=selected]:border-[#f6e879]" /></ChoiceGroup.Item>)}</ChoiceGroup>;
}

function SourceCards({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="mt-4 grid gap-3">{sourceChoices.map(([id, title, description, Icon]) => <button key={id} type="button" onClick={() => onChange(id)} className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition ${value === id ? "border-[#f6e879]/55 bg-[#f6e879]/[.06]" : "border-white/10 bg-white/[.025] hover:bg-white/[.05]"}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-white/[.05] ${value === id ? "text-[#f6e879]" : "text-white/45"}`}><Icon className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-white/85">{title}</span><span className="mt-1 block text-xs text-white/35">{description}</span><span className="mt-2 block text-[10px] uppercase tracking-[.12em] text-white/25">Choose now · connect later</span></span><span className={`grid size-5 place-items-center rounded-full border ${value === id ? "border-[#f6e879] bg-[#f6e879] text-[#171814]" : "border-white/20"}`}>{value === id ? <Check className="size-3" /> : null}</span></button>)}</div>;
}
