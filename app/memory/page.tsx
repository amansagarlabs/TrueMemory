"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, Database, Download, Pencil, Pin, PinOff,
  Search, Trash2, Upload, UserRound, X,
} from "lucide-react";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { PaperDither } from "@/components/ui/paper-dither";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchRecentMemories, importMemories, updateMemory, type MemoryItem,
} from "@/services/dashboard";

type MemoryStatus = "all" | "pending" | "approved" | "rejected" | "superseded" | "archived";

export default function MemoryPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MemoryStatus>("all");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (search = query, lifecycle = status) => {
    setLoading(true);
    try {
      const memories = await fetchRecentMemories(500, {
        query: search,
        status: lifecycle === "all" ? undefined : lifecycle,
      });
      setItems(memories);
      setMessage("");
    } catch {
      setMessage("Memory service is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 200);
    return () => window.clearTimeout(timer);
  }, [reload]);

  async function act(
    item: MemoryItem,
    action: "pin" | "unpin" | "approve" | "reject" | "archive",
  ) {
    setMessage("");
    try {
      await updateMemory(item.id, action);
      await reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Memory could not be updated.");
    }
  }

  async function saveEdit() {
    if (!editing || !editContent.trim()) return;
    setSaving(true);
    try {
      await updateMemory(editing.id, "edit", editContent.trim());
      setEditing(null);
      await reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Memory could not be edited.");
    } finally {
      setSaving(false);
    }
  }

  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), items }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "truememory-memory.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(incoming)) throw new Error();
      await importMemories(incoming.map((item) => ({
        key: String(item.key || item.memory_key || "imported"),
        content: String(item.content || ""),
        source: String(item.source || "import"),
      })));
      await reload();
      setMessage(`${incoming.length} memories imported into profile memory.`);
    } catch {
      setMessage("Choose a valid Kontext memory JSON file.");
    }
    event.target.value = "";
  }

  return (
    <AuthenticatedAppShell>
    <div className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/45 hover:text-white">
            <ArrowLeft className="size-4" aria-hidden="true" />Dashboard
          </Link>

          <section className="relative mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0b08] p-7 lg:p-10">
            <PaperDither className="inset-y-0 right-0 w-1/2 opacity-75" dark={{ colorBack: "#0d0b0800", colorFront: "#e85d18" }} light={{ colorBack: "#fffaf6", colorFront: "#d86516" }} eager maxPixelCount={800 * 360} scale={.72} shape="warp" size={2.2} speed={.15} type="4x4" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#0d0b08_0%,rgba(13,11,8,.94)_55%,transparent)]" />
            <div className="relative z-10 max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">Context layer / Memory</p>
              <h1 className="mt-3 font-heading text-4xl tracking-[-.055em]">Memory you can inspect and control.</h1>
              <p className="mt-4 max-w-[65ch] text-sm leading-7 text-white/45">
                Review the durable facts, decisions, preferences, and task state used to ground future answers. Changes preserve provenance and history.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={exportData} disabled={!items.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f6e879] px-4 text-sm font-semibold text-[#171814] disabled:opacity-40">
                  <Download className="size-4" aria-hidden="true" />Export JSON
                </button>
                <button onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 text-sm">
                  <Upload className="size-4" aria-hidden="true" />Import profile memory
                </button>
                <input ref={fileInput} type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
              </div>
            </div>
          </section>

          {message ? <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-white/55">{message}</p> : null}

          <section className="mt-5 overflow-hidden rounded-[20px] border border-white/10 bg-[#10100f]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center">
              <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3">
                <Search className="size-4 text-white/30" aria-hidden="true" />
                <span className="sr-only">Search memory</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" />
              </label>
              <select value={status} onChange={(event) => setStatus(event.target.value as MemoryStatus)} aria-label="Filter memory status" className="min-h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white/65 outline-none">
                <option value="all">All statuses</option>
                <option value="pending">Needs review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="superseded">Superseded</option>
                <option value="archived">Archived</option>
              </select>
              <span className="px-2 font-mono text-[11px] tabular-nums text-white/35">{loading ? "…" : `${items.length} records`}</span>
            </div>

            {loading ? (
              <div className="space-y-4 p-5">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>
            ) : items.length ? (
              <div className="divide-y divide-white/[.06]">
                {items.map((item) => <MemoryCard key={item.id} item={item} onAction={act} onEdit={() => { setEditing(item); setEditContent(item.content); }} />)}
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-white/35">No memories match this workspace, project, and filter.</div>
            )}
          </section>
        </div>

        <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="max-w-[560px] gap-0 rounded-[24px] border border-white/10 bg-[#141412] p-0 text-white">
            <DialogHeader className="border-b border-white/10 px-6 py-5">
              <DialogTitle>Edit memory</DialogTitle>
              <DialogDescription className="text-white/40">The previous value remains in history as superseded.</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5">
              <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={6} maxLength={4000} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 outline-none focus:border-[#f6e879]/50" />
            </div>
            <DialogFooter className="flex-row justify-end gap-2 border-t border-white/10 px-6 pb-6 pt-4">
              <button onClick={() => setEditing(null)} disabled={saving} className="min-h-11 rounded-xl px-4 text-sm text-white/45">Cancel</button>
              <button onClick={() => void saveEdit()} disabled={saving || !editContent.trim()} className="min-h-11 rounded-xl bg-[#f6e879] px-4 text-sm font-semibold text-[#171814] disabled:opacity-40">Save new version</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthenticatedAppShell>
  );
}

function MemoryCard({ item, onAction, onEdit }: {
  item: MemoryItem;
  onAction: (item: MemoryItem, action: "pin" | "unpin" | "approve" | "reject" | "archive") => void;
  onEdit: () => void;
}) {
  const profileManaged = item.managed_by === "profile";
  const Icon = profileManaged ? UserRound : Database;
  const label = item.memory_key || item.key || "memory";
  return (
    <article className="flex gap-4 p-5">
      <Icon className="mt-1 size-4 shrink-0 text-[#f6e879]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-white/35">{label.replace(/^account_/, "").replaceAll("_", " ")}</p>
          <span className="rounded-md bg-white/[.05] px-2 py-0.5 text-[10px] capitalize text-white/40">{profileManaged ? "profile managed" : item.status}</span>
          {item.project_name ? <span className="rounded-md bg-[#e85d18]/10 px-2 py-0.5 text-[10px] text-[#ee7132]">{item.project_name}</span> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-white/70">{item.content}</p>
        <p className="mt-2 text-xs text-white/30">
          {item.conversation_title ? `Conversation: ${item.conversation_title}` : item.source}
          {item.artifact_title ? ` · Artifact: ${item.artifact_title}` : ""}
          {typeof item.confidence_score === "number" ? ` · Confidence ${Math.round(item.confidence_score * 100)}%` : ""}
          {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString()}` : ""}
        </p>
      </div>
      {profileManaged ? (
        <Link href="/profile" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-white/35 hover:bg-white/[.05] hover:text-white">Edit profile</Link>
      ) : (
        <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
          {item.status === "pending" ? <>
            <button title="Approve" aria-label={`Approve ${label}`} onClick={() => void onAction(item, "approve")} className="grid size-11 place-items-center rounded-xl text-emerald-300 hover:bg-emerald-400/10"><Check className="size-4" /></button>
            <button title="Reject" aria-label={`Reject ${label}`} onClick={() => void onAction(item, "reject")} className="grid size-11 place-items-center rounded-xl text-red-300 hover:bg-red-400/10"><X className="size-4" /></button>
          </> : null}
          <button title={item.is_pinned ? "Unpin" : "Pin"} aria-label={`${item.is_pinned ? "Unpin" : "Pin"} ${label}`} onClick={() => void onAction(item, item.is_pinned ? "unpin" : "pin")} className="grid size-11 place-items-center rounded-xl text-white/35 hover:bg-white/[.05] hover:text-white">{item.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</button>
          <button title="Edit" aria-label={`Edit ${label}`} onClick={onEdit} className="grid size-11 place-items-center rounded-xl text-white/35 hover:bg-white/[.05] hover:text-white"><Pencil className="size-4" /></button>
          <button title="Archive" aria-label={`Archive ${label}`} onClick={() => void onAction(item, "archive")} className="grid size-11 place-items-center rounded-xl text-white/25 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="size-4" /></button>
        </div>
      )}
    </article>
  );
}
