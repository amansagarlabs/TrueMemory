"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Loader2,
  Play,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  CodingAgentPlan,
  CodingAgentStreamEvent,
  CodingApproval,
  CodingCommandResult,
  CodingIndexStatus,
  CodingRuntime,
  CodingTaskRecord,
} from "@/services/coding";

type WorkerSummary = {
  connected: boolean;
  active: boolean;
  phase?: string;
  currentRunId?: string;
  currentTaskId?: string;
  currentTaskGoal?: string;
  currentTaskRepository?: string;
  leaseSecondsRemaining?: number | null;
};

type ExecutionStatus = "running" | "completed" | "failed" | "waiting";

type ExecutionItem = {
  id: string;
  label: string;
  message: string;
  timestamp: string;
  durationMs?: number;
  status: ExecutionStatus;
  details: string[];
};

type AgentExecutionDashboardProps = {
  events: CodingAgentStreamEvent[];
  plan: CodingAgentPlan | null;
  task: CodingTaskRecord | null;
  running: boolean;
  worker: WorkerSummary;
  runtime: CodingRuntime | null;
  index: CodingIndexStatus | null;
  contextCount: number;
  filesRead: number;
  filesModified: number;
  diagnosticsCount: number;
  commands: CodingCommandResult[];
  approval: CodingApproval | null;
  gitStatus: string;
  changes?: {
    files: string[];
    diff: string;
    status: string;
  };
};

type ChangedFileSummary = {
  path: string;
  additions: number;
  deletions: number;
};

const EVENT_LABELS: Record<string, string> = {
  "agent.run.queued": "Run queued",
  "agent.run.started": "Run started",
  "agent.context.started": "Indexing repository",
  "agent.context.completed": "Repository indexed",
  "agent.plan.created": "Plan created",
  "agent.step.started": "Tool started",
  "agent.step.retrying": "Tool retrying",
  "agent.step.completed": "Tool completed",
  "agent.step.failed": "Tool failed",
  "agent.context.compiled": "Execution context built",
  "agent.synthesis.started": "Generating implementation",
  "agent.synthesis.completed": "Implementation generated",
  "agent.patch.proposed": "Patch generated",
  "agent.approval.required": "Approval required",
  "agent.run.completed": "Run completed",
  "agent.run.error": "Run failed",
  "agent.run.cancelled": "Run cancelled",
  "runtime.approval_requested": "Approval requested",
  "runtime.approval_approved": "Approval granted",
  "runtime.approval_rejected": "Approval rejected",
  "runtime.patch_rebased": "Patch rebased",
  "runtime.patch_applied": "Patch applied",
  "runtime.patch_failed": "Patch rejected by workspace",
  "runtime.tests_started": "Running validation",
  "runtime.tests_completed": "Validation completed",
  "runtime.agent.recovery.requested": "Recovery requested",
  "runtime.command_started": "Command started",
  "runtime.command_completed": "Command completed",
  "runtime.commit_created": "Commit created",
  "runtime.pull_request_created": "Pull request created",
  "runtime.preview_started": "Preview started",
  "runtime.runtime_started": "Runtime started",
  "runtime.runtime_stopped": "Runtime stopped",
  "runtime.validation_unavailable": "Validation unavailable",
};

function eventStatus(event: CodingAgentStreamEvent): ExecutionStatus {
  if (
    event.type.endsWith(".error") ||
    event.type.endsWith(".failed") ||
    event.phase === "failed" ||
    event.phase === "cancelled"
  ) {
    return "failed";
  }
  if (
    event.type.endsWith(".started") ||
    event.type.endsWith(".retrying") ||
    event.type === "agent.run.queued" ||
    event.type === "runtime.agent.recovery.requested"
  ) {
    return "running";
  }
  if (
    event.type === "agent.approval.required" ||
    event.phase === "waiting_approval"
  ) {
    return "waiting";
  }
  return "completed";
}

function stepFrom(event: CodingAgentStreamEvent) {
  const step = event.metadata?.step;
  return step && typeof step === "object"
    ? (step as {
        id?: unknown;
        title?: unknown;
        tool?: unknown;
        attempt?: unknown;
        max_attempts?: unknown;
      })
    : null;
}

function eventKey(event: CodingAgentStreamEvent) {
  const runScope = event.run_id || "run";
  const step = stepFrom(event);
  if (step?.id) return `${runScope}:step:${String(step.id)}`;
  if (event.type.startsWith("agent.context.")) return `${runScope}:context`;
  if (event.type.startsWith("agent.synthesis.")) return `${runScope}:synthesis`;
  if (event.type.startsWith("agent.run.")) return `${runScope}:run`;
  return event.id || `${event.type}:${event.sequence}`;
}

function durationBetween(
  started: CodingAgentStreamEvent | undefined,
  ended: CodingAgentStreamEvent,
) {
  if (!started?.timestamp || !ended.timestamp) return undefined;
  const duration = Date.parse(ended.timestamp) - Date.parse(started.timestamp);
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

function conciseMetadata(event: CodingAgentStreamEvent) {
  const metadata = event.metadata || {};
  const details: string[] = [];
  const index =
    metadata.index && typeof metadata.index === "object"
      ? (metadata.index as Record<string, unknown>)
      : null;
  const result =
    metadata.result && typeof metadata.result === "object"
      ? (metadata.result as Record<string, unknown>)
      : null;
  const approval =
    metadata.approval && typeof metadata.approval === "object"
      ? (metadata.approval as Record<string, unknown>)
      : null;

  if (index) {
    for (const [label, key] of [
      ["Files", "files"],
      ["Symbols", "symbols"],
      ["Chunks", "chunks"],
      ["Import edges", "import_edges"],
      ["Reused files", "reused_files"],
    ] as const) {
      if (typeof index[key] === "number") details.push(`${label}: ${index[key]}`);
    }
  }
  if (Array.isArray(metadata.results)) {
    const paths = metadata.results
      .map((item) =>
        item && typeof item === "object" && "path" in item
          ? String(item.path || "")
          : "",
      )
      .filter(Boolean);
    if (paths.length) details.push(`Selected: ${paths.slice(0, 6).join(", ")}`);
  }
  if (result) {
    if (typeof result.matches === "number") {
      details.push(`Matches: ${result.matches}`);
    }
    const paths = Array.isArray(result.files)
      ? result.files
      : Array.isArray(result.paths)
        ? result.paths
        : [];
    if (paths.length) details.push(`Files: ${paths.slice(0, 6).join(", ")}`);
    if (typeof result.command === "string") {
      details.push(`Command: ${result.command}`);
    }
    if (typeof result.status === "string") {
      details.push(`Status: ${result.status.replaceAll("_", " ")}`);
    }
  }
  if (approval) {
    if (typeof approval.title === "string") details.push(approval.title);
    if (typeof approval.action === "string") {
      details.push(`Action: ${approval.action.replaceAll("_", " ")}`);
    }
  }
  if (typeof metadata.characters === "number") {
    details.push(`Context: ${metadata.characters.toLocaleString()} characters`);
  }
  if (typeof metadata.patch_characters === "number") {
    details.push(
      `Patch: ${metadata.patch_characters.toLocaleString()} characters`,
    );
  }
  if (typeof metadata.exit_code === "number") {
    details.push(`Exit code: ${metadata.exit_code}`);
  }
  if (typeof metadata.applied_mode === "string") {
    details.push(
      `Mode: ${metadata.applied_mode.replaceAll("_", " ")}`,
    );
  }
  if (typeof metadata.diagnostics_count === "number") {
    details.push(`Diagnostics: ${metadata.diagnostics_count}`);
  }
  if (Array.isArray(metadata.files) && metadata.files.length) {
    details.push(`Files: ${metadata.files.slice(0, 6).join(", ")}`);
  }
  if (typeof metadata.reason === "string" && metadata.reason) {
    details.push(metadata.reason);
  }
  const step = stepFrom(event);
  if (step && typeof step.tool === "string") {
    details.push(`Tool: ${step.tool.replaceAll("_", " ")}`);
  }
  if (
    step &&
    typeof step.attempt === "number" &&
    typeof step.max_attempts === "number"
  ) {
    details.push(`Attempt ${step.attempt} of ${step.max_attempts}`);
  }
  return details.slice(0, 8);
}

function buildExecutionItems(events: CodingAgentStreamEvent[]) {
  const visible = events
    .filter((event) => event.type !== "agent.message.delta")
    .sort((left, right) => {
      const byTime = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      return byTime || left.sequence - right.sequence;
    });
  const starts = new Map<string, CodingAgentStreamEvent>();
  const items: ExecutionItem[] = [];

  for (const event of visible) {
    const key = eventKey(event);
    const status = eventStatus(event);
    if (status === "running" && !starts.has(key)) starts.set(key, event);
    const step = stepFrom(event);
    const label =
      (typeof step?.title === "string" && step.title) ||
      EVENT_LABELS[event.type] ||
      event.type.replace(/^agent\./, "").replaceAll(".", " ");
    const previousIndex = items.findIndex((item) => item.id === key);
    const item: ExecutionItem = {
      id: key,
      label,
      message: event.message || "",
      timestamp: event.timestamp,
      status,
      durationMs:
        status === "completed" || status === "failed" || status === "waiting"
          ? durationBetween(starts.get(key), event)
          : undefined,
      details: conciseMetadata(event),
    };
    if (previousIndex >= 0) items[previousIndex] = item;
    else items.push(item);
  }
  return items;
}

function latestTokenUsage(events: CodingAgentStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const usage = events[index]?.metadata?.usage;
    if (!usage || typeof usage !== "object") continue;
    const values = usage as Record<string, unknown>;
    const total = values.total_tokens;
    const prompt = values.prompt_tokens;
    const completion = values.completion_tokens;
    if (
      typeof total === "number" ||
      typeof prompt === "number" ||
      typeof completion === "number"
    ) {
      return {
        total: typeof total === "number" ? total : null,
        prompt: typeof prompt === "number" ? prompt : null,
        completion: typeof completion === "number" ? completion : null,
      };
    }
  }
  return null;
}

function summarizeChangedFiles(diff: string, fallbackFiles: string[]) {
  const summaries = new Map<string, ChangedFileSummary>();
  let currentPath = "";

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4).trim();
      currentPath = rawPath === "/dev/null" ? "" : rawPath.replace(/^b\//, "");
      if (currentPath && !summaries.has(currentPath)) {
        summaries.set(currentPath, { path: currentPath, additions: 0, deletions: 0 });
      }
      continue;
    }
    if (!currentPath) continue;
    const summary = summaries.get(currentPath);
    if (!summary) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) summary.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) summary.deletions += 1;
  }

  for (const path of fallbackFiles) {
    if (!summaries.has(path)) summaries.set(path, { path, additions: 0, deletions: 0 });
  }
  return [...summaries.values()];
}

function formatDuration(durationMs: number | undefined) {
  if (durationMs === undefined) return "";
  if (durationMs < 1_000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function formatTime(timestamp: string) {
  if (!timestamp) return "";
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime())
    ? ""
    : value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusGlyph({ status }: { status: ExecutionStatus }) {
  if (status === "running") {
    return (
      <Loader2 className="size-3.5 animate-spin text-[#f6b15b] motion-reduce:animate-none" />
    );
  }
  if (status === "failed") {
    return <AlertCircle className="size-3.5 text-red-300" />;
  }
  if (status === "waiting") {
    return <Clock3 className="size-3.5 text-amber-200" />;
  }
  return <Check className="size-3.5 text-emerald-300" />;
}

function Metric({
  icon: Icon,
  label,
  value,
  state,
  detail,
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  state?: "ok" | "warn" | "muted";
  detail?: string;
}) {
  return (
    <div className="min-w-0 border-b border-white/[0.055] px-3 py-2.5 odd:border-r odd:border-white/[0.055]">
      <div className="flex items-center gap-1.5 font-mono text-[8px] font-medium uppercase tracking-[0.1em] text-white/28">
        <Icon className="size-3" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1.5 truncate font-mono text-[10px] font-medium ${
          state === "ok"
            ? "text-emerald-200/75"
            : state === "warn"
              ? "text-amber-200/75"
              : "text-white/62"
        }`}
        title={String(value)}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 truncate font-mono text-[8px] text-white/22" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function AgentExecutionDashboard({
  events,
  plan,
  task,
  running,
  worker,
  runtime,
  index,
  contextCount,
  filesRead,
  filesModified,
  diagnosticsCount,
  commands,
  approval,
  gitStatus,
  changes,
}: AgentExecutionDashboardProps) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => buildExecutionItems(events), [events]);
  const latestEvent = events
    .filter((event) => event.type !== "agent.message.delta")
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  const currentStep = plan?.steps.find((step) => step.status === "running");
  const currentLabel =
    currentStep?.title ||
    latestEvent?.message ||
    (running ? "Waiting for the next worker event" : "");
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const tokenUsage = latestTokenUsage(events);
  const changedFiles = useMemo(
    () => summarizeChangedFiles(changes?.diff || "", changes?.files || []),
    [changes?.diff, changes?.files],
  );
  const additions = changedFiles.reduce((total, file) => total + file.additions, 0);
  const deletions = changedFiles.reduce((total, file) => total + file.deletions, 0);
  const phase =
    latestEvent?.phase ||
    (task?.status === "waiting_approval"
      ? "waiting_approval"
      : task?.status || "idle");

  if (!items.length && !running && !task?.result && !task?.error) return null;

  return (
    <section
      aria-label="Agent execution"
      className="mt-3 overflow-hidden rounded-[10px] border border-white/[0.075] bg-[#0f1215] shadow-[0_16px_40px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.02)]"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 px-3 text-left transition-colors duration-100 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#278cff]">
          <span className="grid size-6 shrink-0 place-items-center rounded-[6px] border border-white/[0.06] bg-white/[0.035]">
            {running ? (
              <Loader2 className="size-3.5 animate-spin text-[#f6b15b] motion-reduce:animate-none" />
            ) : failed ? (
              <AlertCircle className="size-3.5 text-red-300" />
            ) : (
              <Check className="size-3.5 text-emerald-300" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[10px] font-medium capitalize text-white/74">
              {phase.replaceAll("_", " ")}
            </span>
            <span className="mt-0.5 block truncate text-[9px] text-white/28">
              {currentLabel ||
                `${completed} execution ${completed === 1 ? "event" : "events"} completed`}
            </span>
          </span>
          <ChevronDown
            className={`size-3.5 text-white/28 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="border-t border-white/[0.07]">
          {running ? (
            <div className="h-px overflow-hidden bg-white/[0.04]">
              <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] bg-gradient-to-r from-[#278cff] via-[#ff7433] to-[#ffb44d] motion-reduce:animate-none" />
            </div>
          ) : null}

          {plan?.steps.length ? (
            <section className="mx-2.5 mt-2.5 overflow-hidden rounded-[8px] border border-white/[0.065] bg-[#121518]">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-white/34">Plan</p>
                  <p className="mt-1 truncate text-[10px] text-white/54" title={plan.summary}>{plan.summary || plan.goal}</p>
                </div>
                <span className="shrink-0 font-mono text-[9px] tabular-nums text-white/30">
                  {plan.steps.filter((step) => step.status === "completed").length}/{plan.steps.length}
                </span>
              </div>
              <ol className="px-2 py-1.5">
                {plan.steps.map((step) => (
                  <li key={step.id} className="group flex min-w-0 items-start gap-2 rounded-[6px] px-1.5 py-1.5 transition-colors duration-100 hover:bg-white/[0.025]">
                    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border ${step.status === "completed" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : step.status === "running" ? "border-[#278cff]/35 bg-[#278cff]/10 text-[#67aaff]" : step.status === "failed" ? "border-red-400/25 bg-red-400/10 text-red-300" : "border-white/[0.09] bg-white/[0.025] text-white/24"}`}>
                      {step.status === "completed" ? <Check className="size-2.5" /> : step.status === "running" ? <Loader2 className="size-2.5 animate-spin motion-reduce:animate-none" /> : step.status === "failed" ? <AlertCircle className="size-2.5" /> : <Circle className="size-2" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px] text-white/62">{step.title}</span>
                      <span className="mt-0.5 block truncate text-[8px] text-white/25" title={step.reason}>{step.reason}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {changedFiles.length ? (
            <section className="mx-2.5 mt-2.5 overflow-hidden rounded-[8px] border border-white/[0.065] bg-[#121518]">
              <div className="flex items-center gap-2 border-b border-white/[0.055] px-3 py-2.5">
                <FileCode2 className="size-3.5 text-[#8dbaff]" />
                <p className="min-w-0 flex-1 truncate font-mono text-[10px] font-medium text-white/68">Edited {changedFiles.length} {changedFiles.length === 1 ? "file" : "files"}</p>
                <span className="hidden font-mono text-[8px] capitalize text-white/24 sm:inline">{changes?.status.replaceAll("_", " ")}</span>
                <span className="font-mono text-[9px] tabular-nums text-emerald-300/75">+{additions}</span>
                <span className="font-mono text-[9px] tabular-nums text-red-300/70">-{deletions}</span>
              </div>
              <ul className="px-3 py-2">
                {changedFiles.slice(0, 6).map((file) => (
                  <li key={file.path} className="flex min-w-0 items-center gap-2 py-1 font-mono text-[9px]">
                    <span className="size-1 shrink-0 rounded-full bg-[#278cff] shadow-[0_0_6px_rgba(39,140,255,0.5)]" />
                    <span className="min-w-0 flex-1 truncate text-white/48" title={file.path}>{file.path}</span>
                    {file.additions ? <span className="tabular-nums text-emerald-300/65">+{file.additions}</span> : null}
                    {file.deletions ? <span className="tabular-nums text-red-300/60">-{file.deletions}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mx-2.5 mt-2.5 grid grid-cols-2 overflow-hidden rounded-[8px] border border-white/[0.06] bg-black/10">
            <Metric
              icon={Cpu}
              label="Worker"
              value={
                worker.connected
                  ? worker.active
                    ? worker.phase?.replaceAll("_", " ") || "active"
                    : "ready"
                  : "offline"
              }
              state={worker.connected ? "ok" : "warn"}
              detail={
                worker.currentRunId
                  ? `${worker.currentRunId.slice(0, 8)}${worker.leaseSecondsRemaining != null ? ` · lease ${worker.leaseSecondsRemaining}s` : ""}`
                  : worker.currentTaskRepository || ""
              }
            />
            <Metric
              icon={Play}
              label="Runtime"
              value={runtime?.status || "not started"}
              state={runtime?.status === "running" ? "ok" : "muted"}
            />
            <Metric
              icon={Database}
              label="Index"
              value={
                index?.status === "ready"
                  ? `${index.files || 0} files / ${index.symbols || 0} symbols`
                  : index?.status || "pending"
              }
              state={index?.status === "ready" ? "ok" : "muted"}
            />
            <Metric
              icon={ShieldCheck}
              label="Approval"
              value={approval?.status || "none pending"}
              state={approval?.status === "pending" ? "warn" : "muted"}
            />
            <Metric
              icon={FileCode2}
              label="Files"
              value={`${filesRead} read / ${filesModified} modified`}
            />
            <Metric
              icon={TerminalSquare}
              label="Validation"
              value={`${commands.length} commands / ${diagnosticsCount} diagnostics`}
              state={diagnosticsCount ? "warn" : "muted"}
            />
            <Metric
              icon={Cpu}
              label="Tokens"
              value={
                tokenUsage?.total != null
                  ? `${tokenUsage.total.toLocaleString()} total`
                  : "not reported"
              }
            />
            <Metric
              icon={GitBranch}
              label="Git"
              value={gitStatus || "not loaded"}
              state={gitStatus === "clean" ? "ok" : "muted"}
              detail={worker.currentTaskGoal || worker.currentTaskRepository || ""}
            />
          </div>

          <div className="mt-2.5 border-t border-white/[0.06] px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-white/30">
                Live timeline
              </p>
              <span className="text-[9px] tabular-nums text-white/24">
                {contextCount} context
              </span>
            </div>
            <ol className="space-y-0.5" aria-live="polite">
              {items.map((item, indexValue) => (
                <li key={item.id} className="relative flex gap-2.5 pb-2.5">
                  {indexValue < items.length - 1 ? (
                    <span className="absolute bottom-0 left-[6px] top-4 w-px bg-white/[0.07]" />
                  ) : null}
                  <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center">
                    <StatusGlyph status={item.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-[10px] font-medium text-white/66">
                        {item.label}
                      </p>
                      <span className="shrink-0 text-[9px] tabular-nums text-white/24">
                        {formatDuration(item.durationMs) ||
                          formatTime(item.timestamp)}
                      </span>
                    </div>
                    {item.message && item.message !== item.label ? (
                      <p className="mt-0.5 break-words text-[10px] leading-4 text-white/34">
                        {item.message}
                      </p>
                    ) : null}
                    {item.details.length ? (
                      <details className="group/details mt-1">
                        <summary className="cursor-pointer list-none font-mono text-[8px] text-white/25 hover:text-white/48">
                          Details
                        </summary>
                        <ul className="mt-1 space-y-0.5 rounded-[6px] border border-white/[0.04] bg-black/20 px-2 py-1.5">
                          {item.details.map((detail) => (
                            <li
                              key={detail}
                              className="break-words text-[9px] leading-4 text-white/32"
                            >
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </li>
              ))}
              {!items.length && running ? (
                <li className="flex items-center gap-2 py-1 text-[10px] text-white/32">
                  <Circle className="size-3 text-white/22" />
                  Waiting for the worker to publish its first event.
                </li>
              ) : null}
            </ol>
          </div>

          {task?.error ? (
            <div className="min-w-0 break-words border-t border-red-300/10 bg-red-400/[0.04] px-3 py-2.5 text-[10px] leading-4 text-red-200/75 [overflow-wrap:anywhere]">
              {task.error}
            </div>
          ) : null}

          <div className="flex items-center gap-3 border-t border-white/[0.07] px-3 py-2 text-[9px] text-white/25">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3" />
              {task?.branch || "workspace"}
            </span>
            <span>{completed} complete</span>
            {failed ? <span className="text-red-200/60">{failed} failed</span> : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
