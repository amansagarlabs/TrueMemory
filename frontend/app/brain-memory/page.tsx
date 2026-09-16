"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  BrainCircuit,
  Check,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Loader2,
  Network,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { BrainMemoryVisual } from "@/components/brain-memory-visual";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchRecentMemories, type MemoryItem } from "@/services/dashboard";
import {
  approveIngestionItem,
  createIngestionJob,
  getIngestionJob,
  type IngestionItem,
  type IngestionJob,
} from "@/services/ingestion";
import { uploadPdf } from "@/services/api";

type MemorySource = "note" | "link" | "file" | "connector";
type MemoryFlowStage = "capture" | "encode" | "save" | "retrieve" | "adapt";
type MemoryFlowStatus = "idle" | "running" | "complete" | "error";

type MemoryFlow = {
  stage: MemoryFlowStage | null;
  status: MemoryFlowStatus;
  completed: MemoryFlowStage[];
  detail: string;
};

const SOURCE_OPTIONS = [
  { id: "note" as const, label: "Write a note", description: "Save thoughts, decisions, and summaries.", icon: FileText },
  { id: "link" as const, label: "Save a link", description: "Add a page to searchable knowledge.", icon: Globe2 },
  { id: "file" as const, label: "Upload files", description: "Bring in PDFs, text, or Markdown.", icon: Upload },
  { id: "connector" as const, label: "Connect sources", description: "Bring in a knowledge base later.", icon: Network },
];

const MEMORY_RESEARCH = [
  { label: "Cleveland Clinic", href: "https://my.clevelandclinic.org/health/articles/memory" },
  { label: "Johns Hopkins", href: "https://www.hopkinsmedicine.org/health/wellness-and-prevention/inside-the-science-of-memory" },
  { label: "Max Planck", href: "https://www.mpg.de/16085702/neuronal-networks-for-memory-and-learning" },
];

const FLOW_STEPS = [
  { id: "capture" as const, label: "Capture", detail: "Read the selected source.", icon: Plus },
  { id: "encode" as const, label: "Encode", detail: "Attach a stable key and source.", icon: Sparkles },
  { id: "save" as const, label: "Save", detail: "Write through the Memory API.", icon: BrainCircuit },
  { id: "retrieve" as const, label: "Retrieve", detail: "Read the saved record back.", icon: ArrowUpRight },
  { id: "adapt" as const, label: "Adapt", detail: "Refresh the connected memory view.", icon: Network },
];

const READY_FLOW: MemoryFlow = {
  stage: null,
  status: "idle",
  completed: [],
  detail: "Ready for new context.",
};

function createMemoryKey(content: string) {
  const key = content
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return key || `brain-memory-${Date.now()}`;
}

function content_hash_for_client(content: string) {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function flowErrorMessage(cause: unknown, networkMessage: string, fallback: string) {
  const message = cause instanceof Error ? cause.message : fallback;
  return /failed to fetch|networkerror|load failed/i.test(message) ? networkMessage : message;
}

function MemoryFlowProgress({ flow, compact = false }: { flow: MemoryFlow; compact?: boolean }) {
  return (
    <div aria-live="polite" aria-label="Memory processing status" role={flow.status === "error" ? "alert" : "status"}>
      <div className={`grid gap-2 ${compact ? "grid-cols-5" : "sm:grid-cols-5"}`}>
        {FLOW_STEPS.map((step) => {
          const Icon = step.icon;
          const complete = flow.completed.includes(step.id);
          const active = flow.stage === step.id;
          const failed = active && flow.status === "error";
          return (
            <div
              key={step.id}
              className={`min-w-0 rounded-xl border px-2.5 py-2.5 transition-colors ${
                failed
                  ? "border-red-500/40 bg-red-500/10"
                  : active
                    ? "border-[var(--chat-accent)]/55 bg-[var(--chat-highlight)]"
                    : complete
                      ? "border-[var(--chat-border-strong)] bg-[var(--chat-background)]"
                      : "border-[var(--chat-border)] bg-[var(--chat-background)] opacity-60"
              }`}
            >
              <div className={`flex items-center gap-2 ${compact ? "flex-col justify-center gap-1.5 text-center" : ""}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-lg ${complete || active ? "bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]" : "bg-[var(--chat-highlight)] text-[var(--chat-muted-foreground)]"}`}>
                  {failed ? <X className="size-3.5" aria-hidden="true" /> : active && flow.status === "running" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : complete ? <Check className="size-3.5" aria-hidden="true" /> : <Icon className="size-3.5" aria-hidden="true" />}
                </span>
                <span className={`${compact ? "text-[10px] leading-3" : "truncate text-[11px]"} font-semibold`}>{step.label}</span>
              </div>
              {!compact ? <p className="mt-2 text-[10px] leading-4 text-[var(--chat-muted-foreground)]">{step.detail}</p> : null}
            </div>
          );
        })}
      </div>
      <p className={`mt-3 text-xs leading-5 ${flow.status === "error" ? "text-red-600 dark:text-red-300" : "text-[var(--chat-muted-foreground)]"}`}>
        {flow.detail}
      </p>
    </div>
  );
}

export default function BrainMemoryPage() {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const lastComposerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [source, setSource] = useState<MemorySource>("note");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [signal, setSignal] = useState(0);
  const [ingestionJob, setIngestionJob] = useState<IngestionJob | null>(null);
  const [pendingItems, setPendingItems] = useState<IngestionItem[]>([]);
  const [flow, setFlow] = useState<MemoryFlow>({
    stage: "retrieve",
    status: "running",
    completed: [],
    detail: "Retrieving your saved memories from the backend.",
  });

  useEffect(() => {
    let cancelled = false;
    void fetchRecentMemories(8, { strict: true })
      .then((items) => {
        if (cancelled) return;
        setMemories(items);
        setFlow({ ...READY_FLOW, detail: `Retrieved ${items.length} saved ${items.length === 1 ? "memory" : "memories"}.` });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFlow({
          stage: "retrieve",
          status: "error",
          completed: [],
          detail: flowErrorMessage(
            cause,
            "The memory service is unreachable. Start the backend and retry retrieval.",
            "Saved memories could not be retrieved.",
          ),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open || !window.matchMedia("(min-width: 640px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      const target = source === "note" ? noteInputRef.current : source === "link" ? linkInputRef.current : null;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, source]);

  const sourceLabel = useMemo(
    () => SOURCE_OPTIONS.find((option) => option.id === source)?.label || "Write a note",
    [source],
  );

  function chooseSource(nextSource: MemorySource) {
    setSource(nextSource);
    setFlow(READY_FLOW);
    setIngestionJob(null);
    setPendingItems([]);
    if (nextSource === "file") window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function applyIngestionProgress(job: IngestionJob) {
    setIngestionJob(job);
    const stage = job.current_stage;
    const stageMap: Record<string, MemoryFlowStage> = {
      requested: "capture",
      queued: "capture",
      authorized: "capture",
      safe: "capture",
      discovering: "capture",
      fetching: "capture",
      fetched: "encode",
      normalized: "encode",
      deduplicated: "encode",
      filtered: "encode",
      extracted: "encode",
      classified: "encode",
      resolved: "encode",
      confidence_scored: "encode",
      related: "adapt",
      routed: "save",
      embedded: "save",
      indexed: "save",
      candidate_ready: "adapt",
      completed: "retrieve",
    };
    const flowStage = stageMap[stage] || "capture";
    const stageOrder: MemoryFlowStage[] = ["capture", "encode", "save", "retrieve", "adapt"];
    const currentIndex = stageOrder.indexOf(flowStage);
    const completed = stageOrder.slice(0, Math.max(0, currentIndex));
    const latestEvent = [...(job.job.events || [])].reverse().find((event) => event.message);
    const detail = latestEvent?.message || `Memory worker is ${stage.replaceAll("_", " ") || "processing"}.`;
    setFlow({
      stage: flowStage,
      status: job.status === "failed" || job.status === "dead_letter" ? "error" : "running",
      completed,
      detail,
    });
    if (job.job.items) {
      setPendingItems(job.job.items.filter((item) => item.decision === "candidate"));
    }
  }

  async function waitForIngestion(jobId: string) {
    let current = await getIngestionJob(jobId);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      applyIngestionProgress(current);
      if (["completed", "candidate_ready", "failed", "dead_letter", "cancelled"].includes(current.status)) return current;
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      current = await getIngestionJob(jobId);
    }
    throw new Error("The memory worker is still processing. You can safely check this job again shortly.");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
    setFlow(READY_FLOW);
  }

  function openComposer(event: ReactMouseEvent<HTMLButtonElement>) {
    lastComposerTriggerRef.current = event.currentTarget;
    setFlow(READY_FLOW);
    setIngestionJob(null);
    setPendingItems([]);
    setOpen(true);
  }

  function restoreComposerFocus() {
    window.setTimeout(() => lastComposerTriggerRef.current?.focus(), 0);
  }

  function closeComposer() {
    if (submitting) return;
    setOpen(false);
    restoreComposerFocus();
  }

  async function addMemory() {
    setSuccess("");
    setSubmitting(true);
    let currentStage: MemoryFlowStage = "capture";
    setFlow({ stage: currentStage, status: "running", completed: [], detail: "Validating the selected source." });
    let content = "";
    let memorySource = "brain-memory-note";
    try {
      if (source === "note") {
        content = note.trim();
        if (!content) throw new Error("Write something first. Any text can become a memory.");
        setFlow({ stage: "capture", status: "running", completed: [], detail: `Captured ${content.length.toLocaleString()} characters from your note.` });
      }

      if (source === "link") {
        const url = link.trim();
        let parsed: URL;
        try {
          parsed = new URL(url);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error();
        } catch {
          throw new Error("Enter a valid http or https link.");
        }
        memorySource = `brain-memory-link:${parsed.hostname}`;
        setFlow({ stage: "capture", status: "running", completed: [], detail: "Queued for safe retrieval through AmanCrawl." });
        content = url;
      }

      if (source === "file") {
        if (!selectedFile) throw new Error("Choose a PDF, text, or Markdown file first.");
        memorySource = `brain-memory-file:${selectedFile.name}`;
        if (selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf")) {
          content = `Uploaded PDF: ${selectedFile.name}`;
        } else if (/\.(txt|md|markdown)$/i.test(selectedFile.name)) {
          setFlow({ stage: "capture", status: "running", completed: [], detail: `Reading ${selectedFile.name}.` });
          content = (await selectedFile.text()).trim();
          if (!content) throw new Error("That file is empty.");
        } else {
          throw new Error("For now, Brain memory accepts PDF, TXT, and Markdown files.");
        }
      }

      if (source === "connector") return;

      currentStage = "encode";
      const memoryKey = createMemoryKey(content || selectedFile?.name || source);
      setFlow({ stage: currentStage, status: "running", completed: ["capture"], detail: `Queued as ${memoryKey}; the worker will filter and classify it.` });

      currentStage = "save";
      setFlow({ stage: currentStage, status: "running", completed: ["capture", "encode"], detail: "Creating a durable ingestion job with source provenance." });
      let jobInput: Parameters<typeof createIngestionJob>[0] = {
        provider: source === "link" ? "amancrawl" : "manual",
        source_type: source === "link" ? "url" : "text",
        source_url: source === "link" ? content : undefined,
        content: source === "link" ? undefined : content,
        key: memoryKey,
        metadata: { ui_source: "brain-memory", memory_source: memorySource },
        target: "durable",
        discover: source === "link",
        max_pages: source === "link" ? 5 : 1,
        idempotency_key: `brain-memory:${source}:${memoryKey}:${content_hash_for_client(content)}`,
      };
      if (source === "file" && selectedFile && (selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf"))) {
        const uploaded = await uploadPdf(selectedFile, selectedFile.name);
        jobInput = {
          provider: "document-pipeline",
          source_type: "artifact",
          external_id: uploaded.doc_id,
          key: memoryKey,
          metadata: { ui_source: "brain-memory", filename: selectedFile.name, memory_source: memorySource, artifact_id: uploaded.doc_id },
          target: "durable",
          idempotency_key: `brain-memory:artifact:${uploaded.doc_id}`,
        };
      } else if (source === "file" && selectedFile) {
        jobInput = {
          provider: "document-pipeline",
          source_type: "text",
          content,
          key: memoryKey,
          metadata: { ui_source: "brain-memory", filename: selectedFile.name, memory_source: memorySource },
          target: "durable",
          idempotency_key: `brain-memory:file:${selectedFile.name}:${content_hash_for_client(content)}`,
        };
      }
      const created = await createIngestionJob(jobInput);
      const finished = await waitForIngestion(created.job_id);
      if (finished.status === "failed" || finished.status === "dead_letter") {
        throw new Error(finished.error || "The ingestion worker could not process this source.");
      }
      if (finished.status === "candidate_ready") {
        setFlow({ stage: "adapt", status: "complete", completed: ["capture", "encode", "save"], detail: "Candidate prepared. Review it before it becomes durable memory." });
        setSuccess("Source processed. Review the candidate below before saving it.");
        return;
      }
      const refreshed = await fetchRecentMemories(8, { strict: true });
      setMemories(refreshed);
      setFlow({ stage: "adapt", status: "complete", completed: ["capture", "encode", "save", "retrieve", "adapt"], detail: `Worker completed ${memoryKey}; the connected memory view now reflects the result.` });
      setSignal((current) => current + 1);
      setSuccess(`${sourceLabel} processed successfully.`);
      setNote("");
      setLink("");
      setSelectedFile(null);
      setOpen(false);
      restoreComposerFocus();
    } catch (cause) {
      const message = flowErrorMessage(
        cause,
        `${FLOW_STEPS.find((step) => step.id === currentStage)?.label || "Memory flow"} could not reach the backend service.`,
        "This memory could not be saved.",
      );
      const stageIndex = FLOW_STEPS.findIndex((step) => step.id === currentStage);
      setFlow({
        stage: currentStage,
        status: "error",
        completed: FLOW_STEPS.slice(0, Math.max(0, stageIndex)).map((step) => step.id),
        detail: `${FLOW_STEPS[stageIndex]?.label || "Memory flow"} stopped: ${message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function approveCandidate(item: IngestionItem) {
    setSubmitting(true);
    setFlow({ stage: "save", status: "running", completed: ["capture", "encode"], detail: "Saving the reviewed candidate through MemoryCore." });
    try {
      await approveIngestionItem(item.id);
      const refreshed = await fetchRecentMemories(8, { strict: true });
      setMemories(refreshed);
      setPendingItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setSignal((current) => current + 1);
      setFlow({ stage: "adapt", status: "complete", completed: ["capture", "encode", "save", "retrieve", "adapt"], detail: "Candidate saved through MemoryCore and retrieved from the backend." });
      setSuccess("Candidate saved as durable memory.");
      setNote("");
      setLink("");
      setSelectedFile(null);
      setOpen(false);
      restoreComposerFocus();
    } catch (cause) {
      setFlow({ stage: "save", status: "error", completed: ["capture", "encode"], detail: flowErrorMessage(cause, "The candidate could not be saved by the backend.", "The candidate could not be saved.") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedAppShell>
      <div className="theme-surface-page min-h-full overflow-y-auto bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--chat-accent)]">TrueMemory / Brain memory</p>
                <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Teach your memory brain.</h1>
                <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-[var(--chat-muted-foreground)] sm:text-lg">
                  Add anything worth keeping. TrueMemory gathers, encodes, stores, and retrieves useful context for your workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={openComposer}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--chat-accent)] px-5 text-sm font-semibold text-[var(--chat-accent-foreground)] shadow-[0_12px_26px_-16px_var(--chat-accent)] transition-[background-color,transform] duration-150 hover:bg-[var(--chat-accent-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <Plus className="size-4" aria-hidden="true" /> Add memory
              </button>
            </div>

            <AnimatePresence>
              {success ? (
                <motion.div
                  role="status"
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  className="mt-5 flex items-center gap-2 overflow-hidden rounded-xl border border-[var(--chat-accent)]/30 bg-[var(--chat-highlight)] px-4 py-3 text-sm text-[var(--chat-foreground)]"
                >
                  <Check className="size-4 text-[var(--chat-accent)]" aria-hidden="true" />
                  <span className="flex-1">{success}</span>
                  <button type="button" aria-label="Dismiss message" onClick={() => setSuccess("")} className="rounded-md p-1 text-[var(--chat-muted-foreground)] hover:text-[var(--chat-foreground)]"><X className="size-4" /></button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
              <section className="min-w-0 space-y-5">
                <div className="rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--chat-foreground)_35%,transparent)] sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--chat-muted-foreground)]">Memory loop</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">From raw input to useful context.</h2>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--chat-border)] px-3 py-1.5 text-xs text-[var(--chat-muted-foreground)]"><span className="size-1.5 rounded-full bg-[var(--chat-accent)]" /> {memories.length} captured</span>
                  </div>
                  <div className="mt-6">
                    <MemoryFlowProgress flow={flow} />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--chat-muted-foreground)]">Your context</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Recent memories</h2></div><button type="button" onClick={openComposer} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--chat-highlight)]"><Plus className="size-3.5" /> Add</button></div>
                  {memories.length ? (
                    <div className="mt-5 divide-y divide-[var(--chat-border)] rounded-2xl border border-[var(--chat-border)]">
                      {memories.map((memory) => (
                        <article key={memory.id} className="flex gap-3 p-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-[var(--chat-highlight)]">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--chat-highlight)] text-[var(--chat-accent)]"><BrainCircuit className="size-4" aria-hidden="true" /></span>
                          <div className="min-w-0"><h3 className="truncate text-sm font-medium">{memory.key || "Untitled memory"}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--chat-muted-foreground)]">{memory.content}</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">{memory.source || "workspace"}</p></div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-[var(--chat-border-strong)] bg-[var(--chat-background)] px-5 py-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--chat-highlight)] text-[var(--chat-accent)]"><BrainCircuit className="size-6" /></div><h3 className="mt-4 text-base font-semibold">{flow.status === "error" && flow.stage === "retrieve" ? "Saved memories are unavailable." : "Your brain is ready."}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--chat-muted-foreground)]">{flow.status === "error" && flow.stage === "retrieve" ? flow.detail : "Add a thought, a link, or a document and watch it become part of your workspace context."}</p>{flow.status === "error" && flow.stage === "retrieve" ? <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] px-4 text-sm font-semibold hover:bg-[var(--chat-highlight)]"><ArrowUpRight className="size-4" /> Retry retrieval</button> : <button type="button" onClick={openComposer} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] px-4 text-sm font-semibold hover:bg-[var(--chat-highlight)]"><Plus className="size-4" /> Add your first memory</button>}</div>
                  )}
                </div>
              </section>

              <aside className="min-w-0">
                <div className="sticky top-4 overflow-hidden rounded-[28px] border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-[0_22px_58px_-36px_color-mix(in_srgb,var(--chat-foreground)_42%,transparent)]">
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--chat-border)] p-5"><div><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${flow.status === "error" ? "bg-red-500" : "bg-[var(--chat-accent)] shadow-[0_0_14px_var(--chat-accent)]"}`} /><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--chat-muted-foreground)]">Live system</p></div><h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Memory brain</h2><p className="mt-1 max-w-[260px] text-sm leading-5 text-[var(--chat-muted-foreground)]">{flow.detail}</p></div><div className="grid size-10 place-items-center rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-accent)]"><BrainCircuit className="size-5" /></div></div>
                  <div className="relative h-[360px] overflow-hidden bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--chat-accent)_8%,transparent),transparent_64%)]"><BrainMemoryVisual memoryCount={memories.length} signal={signal} /><div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"><span className="rounded-full border border-[var(--chat-border)] bg-[color-mix(in_srgb,var(--chat-surface)_84%,transparent)] px-3 py-1.5 text-[10px] font-medium text-[var(--chat-muted-foreground)] backdrop-blur">A visual metaphor for connected context</span></div></div>
                  <div className="grid grid-cols-2 border-t border-[var(--chat-border)]"><div className="p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">Backend records</p><p className="mt-1 text-2xl font-semibold tabular-nums">{memories.length}</p></div><div className="border-l border-[var(--chat-border)] p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">Current stage</p><p className={`mt-1 text-sm font-semibold ${flow.status === "error" ? "text-red-500" : "text-[var(--chat-accent)]"}`}>{flow.status === "error" ? "Stopped" : flow.stage ? FLOW_STEPS.find((step) => step.id === flow.stage)?.label : "Ready"}</p></div></div>
                  <p className="border-t border-[var(--chat-border)] px-5 py-4 text-[11px] leading-5 text-[var(--chat-subtle-foreground)]">Inspired by research on memory formation and neural connections. This is an interface metaphor, not a medical model.</p>
                </div>
              </aside>
            </div>

            <section className="mt-5 rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--chat-muted-foreground)]">Explore the idea</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Why connections matter.</h2></div><p className="max-w-md text-sm leading-6 text-[var(--chat-muted-foreground)]">Repeated context can become easier to retrieve, while new connections remain flexible as your workspace learns.</p></div><div className="mt-5 flex flex-wrap gap-2">{MEMORY_RESEARCH.map((item) => <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] px-3 text-xs font-medium text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"><ExternalLink className="size-3.5 text-[var(--chat-accent)]" />{item.label}</a>)}</div></section>
          </motion.div>
        </div>

        <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else closeComposer(); }}>
          <DialogContent showCloseButton={false} className="max-h-[calc(100svh-1rem)] overflow-y-auto rounded-[24px] border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] shadow-[0_28px_90px_-36px_rgba(0,0,0,.7)] sm:max-w-[760px]">
            <button type="button" aria-label="Close" onClick={closeComposer} disabled={submitting} className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-highlight)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] disabled:pointer-events-none disabled:opacity-50"><X className="size-4" aria-hidden="true" /></button>
            <DialogHeader className="border-b border-[var(--chat-border)] px-6 py-5 pr-16"><DialogTitle className="text-lg tracking-[-0.02em]">Add to your memory brain</DialogTitle><DialogDescription className="text-[var(--chat-muted-foreground)]">Bring in anything useful. TrueMemory keeps the source attached to the context.</DialogDescription></DialogHeader>
            <div className="grid gap-5 p-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:p-6">
              <div className="grid gap-1.5 self-start">
                {SOURCE_OPTIONS.map((option) => { const Icon = option.icon; const active = source === option.id; return <button key={option.id} type="button" onClick={() => chooseSource(option.id)} className={`flex min-h-14 items-start gap-3 rounded-2xl border p-3 text-left transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${active ? "border-[var(--chat-accent)]/55 bg-[var(--chat-highlight)]" : "border-transparent hover:border-[var(--chat-border)] hover:bg-[var(--chat-background)]"}`}><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${active ? "bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)]" : "bg-[var(--chat-background)] text-[var(--chat-muted-foreground)]"}`}><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{option.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-[var(--chat-muted-foreground)]">{option.description}</span></span></button>; })}
              </div>
              <div className="min-w-0 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)] p-4 sm:p-5">
                {source === "note" ? <div><label htmlFor="brain-memory-note" className="text-sm font-semibold">Write anything</label><p className="mt-1 text-xs text-[var(--chat-muted-foreground)]">A decision, preference, summary, idea, or plain text.</p><textarea ref={noteInputRef} id="brain-memory-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write, paste, or type anything worth remembering…" className="mt-4 min-h-44 w-full resize-y rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3 text-sm leading-6 outline-none placeholder:text-[var(--chat-subtle-foreground)] focus:border-[var(--chat-border-strong)] focus:ring-2 focus:ring-[var(--chat-focus)]" /><p className="mt-2 text-right font-mono text-[10px] text-[var(--chat-subtle-foreground)]">{note.length.toLocaleString()} characters</p></div> : null}
                {source === "link" ? <div><label htmlFor="brain-memory-link" className="text-sm font-semibold">Save a link</label><p className="mt-1 text-xs text-[var(--chat-muted-foreground)]">Save a page now and keep its URL attached to the memory.</p><div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--chat-focus)]"><Link2 className="size-4 shrink-0 text-[var(--chat-accent)]" /><input ref={linkInputRef} id="brain-memory-link" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://example.com/article" className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--chat-subtle-foreground)]" /></div><p className="mt-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-highlight)] p-3 text-xs leading-5 text-[var(--chat-muted-foreground)]">Research tip: save the Cleveland Clinic, Johns Hopkins, or Max Planck memory articles below as a starting set.</p></div> : null}
                {source === "file" ? <div><p className="text-sm font-semibold">Upload a file</p><p className="mt-1 text-xs text-[var(--chat-muted-foreground)]">PDFs upload to your workspace; TXT and Markdown become searchable notes.</p><input ref={fileInputRef} type="file" accept="application/pdf,.txt,.md,.markdown" onChange={handleFileChange} className="sr-only" /><button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-4 text-center text-sm transition-colors hover:bg-[var(--chat-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"><Upload className="size-5 text-[var(--chat-accent)]" />{selectedFile ? <span className="max-w-full truncate font-medium">{selectedFile.name}</span> : <span>Choose a PDF, TXT, or Markdown file</span>}<span className="text-[11px] text-[var(--chat-muted-foreground)]">Your source stays attached</span></button></div> : null}
                {source === "connector" ? <div><p className="text-sm font-semibold">Connect a knowledge source</p><p className="mt-1 text-xs leading-5 text-[var(--chat-muted-foreground)]">Connectors let TrueMemory gather context from systems you already use.</p><div className="mt-5 grid gap-2"><a href="/connectors" className="flex min-h-12 items-center justify-between rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 text-sm font-medium hover:bg-[var(--chat-highlight)]"><span className="flex items-center gap-2"><Network className="size-4 text-[var(--chat-accent)]" />Open connectors</span><ArrowUpRight className="size-4 text-[var(--chat-muted-foreground)]" /></a><a href="/amancrawl" className="flex min-h-12 items-center justify-between rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 text-sm font-medium hover:bg-[var(--chat-highlight)]"><span className="flex items-center gap-2"><Globe2 className="size-4 text-[var(--chat-accent)]" />Research the web</span><ArrowUpRight className="size-4 text-[var(--chat-muted-foreground)]" /></a></div></div> : null}
                {source !== "connector" && (submitting || flow.status === "error" || ingestionJob) ? <div className="mt-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3"><MemoryFlowProgress flow={flow} compact /></div> : null}
                {pendingItems.length ? <div className="mt-4 rounded-xl border border-[var(--chat-accent)]/35 bg-[var(--chat-highlight)] p-3"><p className="text-xs font-semibold">Review before saving</p><p className="mt-1 text-xs leading-5 text-[var(--chat-muted-foreground)]">The worker found a candidate. External observations stay reviewable until you approve them.</p>{pendingItems.map((item) => <div key={item.id} className="mt-3 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3"><p className="text-sm font-medium">{item.memory_key || item.title || "Memory candidate"}</p><p className="mt-1 line-clamp-4 text-xs leading-5 text-[var(--chat-muted-foreground)]">{item.memory_content || item.normalized_content}</p><div className="mt-3 flex justify-end"><Button type="button" onClick={() => void approveCandidate(item)} disabled={submitting} className="min-h-10 rounded-full bg-[var(--chat-accent)] px-4 text-[var(--chat-accent-foreground)] hover:bg-[var(--chat-accent-hover)]">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve and save</Button></div></div>)}</div> : null}
                {source !== "connector" ? <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeComposer} disabled={submitting} className="min-h-11 rounded-full px-4">Cancel</Button><Button type="button" onClick={() => void addMemory()} disabled={submitting || pendingItems.length > 0} className="min-h-11 rounded-full bg-[var(--chat-accent)] px-4 text-[var(--chat-accent-foreground)] hover:bg-[var(--chat-accent-hover)]">{submitting ? <Loader2 className="size-4" /> : <Plus className="size-4" />}{submitting ? "Adding…" : "Add memory"}</Button></div> : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AuthenticatedAppShell>
  );
}
