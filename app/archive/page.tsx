"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Clock3,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaperDither } from "@/components/ui/paper-dither";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecentConversation } from "@/lib/types";
import {
  fetchArchivedConversations,
  updateConversation,
} from "@/services/api";

export default function ArchivePage() {
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecentConversation | null>(null);

  const loadArchive = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      setConversations(await fetchArchivedConversations());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Archived conversations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArchive(), 0);
    return () => window.clearTimeout(timer);
  }, [loadArchive]);

  async function restoreConversation(conversation: RecentConversation) {
    setPendingId(conversation.id);
    setError(null);
    try {
      await updateConversation(conversation.id, "unarchive");
      setConversations((current) =>
        current.filter((item) => item.id !== conversation.id),
      );
      toast("Conversation restored", {
        description: `“${conversation.title}” is back in your recent chats.`,
      });
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Conversation could not be restored.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    setError(null);
    try {
      await updateConversation(deleteTarget.id, "delete");
      setConversations((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      toast("Conversation deleted", {
        description: `“${deleteTarget.title}” was permanently removed.`,
      });
      setDeleteTarget(null);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Conversation could not be deleted.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AuthenticatedAppShell variant="chat">
      <main className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10">
          <Link
            href="/chat"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 text-sm font-medium text-white/55 shadow-[0_8px_22px_-18px_rgba(0,0,0,0.9)] transition-[background-color,border-color,color,transform] duration-150 hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d18]/45"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to chat
          </Link>

          <section className="relative mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0b08] p-7 lg:p-10">
            <PaperDither
              className="inset-y-0 right-0 w-[55%] opacity-80"
              dark={{ colorBack: "#0d0b0800", colorFront: "#e85d18" }}
              light={{ colorBack: "#fffaf6", colorFront: "#d86516" }}
              eager
              maxPixelCount={800 * 360}
              scale={0.7}
              shape="warp"
              size={2.2}
              speed={0.15}
              type="4x4"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#0d0b08_0%,rgba(13,11,8,.95)_52%,transparent)]" />
            <div className="relative z-10 max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#f6e879]">
                Context layer / Archive
              </p>
              <h1 className="mt-3 font-heading text-4xl tracking-[-.055em]">
                Conversations worth keeping.
              </h1>
              <p className="mt-4 max-w-[62ch] text-sm leading-7 text-white/45">
                Archived chats are stored with your account in PostgreSQL. Restore one to recent chats,
                reopen its messages, or permanently delete it.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ArchiveStatus label="API-backed" />
                <ArchiveStatus label="Account scoped" />
                {!loading ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] tabular-nums text-white/45">
                    {conversations.length} archived
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section
            className="mt-5 rounded-[20px] border border-white/10 bg-[#10100f] p-5 sm:p-6"
            aria-labelledby="archive-list-title"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ee7132]">
                  Saved conversations
                </p>
                <h2
                  id="archive-list-title"
                  className="mt-1 text-lg font-semibold tracking-[-0.025em]"
                >
                  Your archive
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/40">
                  Only conversations archived from your signed-in account appear here.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void loadArchive()}
                disabled={loading}
                className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.07] hover:text-white"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Refresh
              </Button>
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-sm leading-6 text-red-200"
              >
                {error}
              </p>
            ) : null}

            {loading ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading archive">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-52 rounded-2xl" />
                ))}
              </div>
            ) : conversations.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {conversations.map((conversation) => (
                  <article
                    key={conversation.id}
                    className="group flex min-h-52 flex-col rounded-2xl border border-white/10 bg-black/20 p-4 transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[#e85d18]/45 hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[#e85d18]/10 text-[#ee7132]">
                        <MessageSquare aria-hidden="true" className="size-4" />
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">
                        Archived
                      </span>
                    </div>

                    <h3 className="mt-4 line-clamp-2 text-sm font-semibold leading-5 text-white/85">
                      {conversation.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/35">
                      {conversation.last_message || "No message preview is available for this conversation."}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                      <span className="mr-auto inline-flex items-center gap-1.5 text-[10px] text-white/30">
                        <Clock3 aria-hidden="true" className="size-3" />
                        {formatArchiveDate(conversation.last_message_at || conversation.updated_at)}
                      </span>
                      <Link
                        href={`/chat?id=${encodeURIComponent(conversation.id)}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/55 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d18]"
                      >
                        Open
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                      </Link>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => void restoreConversation(conversation)}
                        disabled={pendingId === conversation.id}
                        className="bg-[#e85d18] text-white hover:bg-[#f06f2d]"
                      >
                        <RotateCcw aria-hidden="true" className="size-3.5" />
                        Restore
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Delete ${conversation.title}`}
                        title="Delete permanently"
                        onClick={() => setDeleteTarget(conversation)}
                        disabled={pendingId === conversation.id}
                        className="text-white/35 hover:bg-red-400/10 hover:text-red-300"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-6 text-center">
                <div>
                  <Archive className="mx-auto size-6 text-white/20" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-white/65">Your archive is empty</p>
                  <p className="mt-1 text-xs text-white/35">
                    Archive a chat from its options menu and it will appear here.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pendingId) setDeleteTarget(null);
        }}
      >
        <DialogContent
          showCloseButton={!pendingId}
            className="max-w-[calc(100%-2rem)] gap-5 rounded-[20px] border border-white/10 bg-[#10100f] p-5 text-white shadow-[0_28px_90px_-34px_rgba(0,0,0,0.9)] sm:max-w-[440px] sm:p-6"
        >
          <DialogHeader className="gap-2 pr-8">
            <DialogTitle className="text-lg font-semibold tracking-[-0.025em]">
              Delete archived conversation?
            </DialogTitle>
            <DialogDescription className="leading-6 text-white/45">
              {deleteTarget
                ? `“${deleteTarget.title}” will be permanently removed. This action cannot be undone.`
                : "This conversation will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-white/10 bg-white/[0.025]">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={Boolean(pendingId)}
              onClick={() => setDeleteTarget(null)}
              className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={Boolean(pendingId)}
              onClick={() => void deleteConversation()}
            >
              {pendingId ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthenticatedAppShell>
  );
}

function ArchiveStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] text-white/45">
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      {label}
    </span>
  );
}

function formatArchiveDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
