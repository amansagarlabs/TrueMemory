"use client";

import { useCallback, useState } from "react";
import type { ChatMessage, RetrievedChunk, UploadResponse } from "@/lib/types";
import {
  getOrCreateConversationId,
  loadChatViewMode,
  saveChatViewMode,
  type ChatViewMode,
} from "@/lib/storage";
import { streamChat } from "@/services/api";
import CompactChatInterface from "./chat/CompactChatInterface";
import { Message as ChatMessageUI } from "./chat/types";

type Props = {
  document: UploadResponse;
  pipelineReady: boolean;
  openrouterConfigured?: boolean;
};

export function ChatPanel({
  document,
  pipelineReady,
  openrouterConfigured = true,
}: Props) {
  const [viewMode, setViewMode] = useState<ChatViewMode>(() =>
    loadChatViewMode(),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveRetrieval, setLiveRetrieval] = useState<{
    retrieval_ms: number;
    chunks: RetrievedChunk[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setMode = (mode: ChatViewMode) => {
    setViewMode(mode);
    saveChatViewMode(mode);
  };

  const isLearning = viewMode === "learning";

  const send = useCallback(
    async (question: string) => {
      if (!question || loading) return;

      if (!pipelineReady) {
        setError(
          'Run "Visualize full pipeline" first (re-run if you refreshed the page).',
        );
        return;
      }
      if (!openrouterConfigured) {
        setError("Add OPENROUTER_API_KEY to my-ai-app/.env");
        return;
      }

      setError(null);
      setLoading(true);
      setLiveRetrieval(null);

      const userMsg: ChatMessageUI = {
        id: Date.now(),
        role: "user",
        content: question,
      };
      setChatMessages((messages) => [...messages, userMsg]);

      let retrievalMeta: ChatMessage["retrieval"];
      let answer = "";

      try {
        const conversationId = getOrCreateConversationId();
        await streamChat(document.doc_id, question, conversationId, (event) => {
          if (event.type === "error") {
            throw new Error(event.message ?? "Chat error");
          }
          if (event.type === "retrieval" && event.chunks) {
            retrievalMeta = {
              retrieval_ms: event.retrieval_ms ?? 0,
              chunks: sortChunks(event.chunks),
            };
            if (isLearning) setLiveRetrieval(retrievalMeta);
          }
          if (event.type === "token" && event.content) {
            answer += event.content;
          }
        });

        const aiMsg: ChatMessageUI = {
          id: Date.now() + 1,
          role: "assistant",
          content: answer || "(No answer text returned - check OpenRouter key/model.)",
        };
        setChatMessages((messages) => [...messages, aiMsg]);
        setLiveRetrieval(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chat failed");
        setLiveRetrieval(null);
      } finally {
        setLoading(false);
      }
    },
    [document.doc_id, isLearning, loading, openrouterConfigured, pipelineReady],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {isLearning ? "AI chat - learning mode" : "Chat with your PDF"}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isLearning
              ? "See retrieval, chunks, and timings (how RAG works inside)"
              : "Simple answers like ChatPDF - toggle Learning to see the pipeline"}
          </p>
        </div>
        <ViewModeToggle mode={viewMode} onChange={setMode} />
      </div>

      <div className="h-[460px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <CompactChatInterface
          messages={chatMessages}
          onSendMessage={send}
          isTyping={loading}
          disabled={!pipelineReady}
        />
      </div>

      {isLearning && liveRetrieval && (
        <RetrievalPanel
          retrieval={liveRetrieval}
          title="Retrieved context (used for this answer)"
          defaultOpen
        />
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ChatViewMode;
  onChange: (m: ChatViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-lg border border-zinc-300 bg-white p-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => onChange("simple")}
        className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
          mode === "simple"
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        }`}
      >
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChange("learning")}
        className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
          mode === "learning"
            ? "bg-violet-600 text-white"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        }`}
      >
        Learning
      </button>
    </div>
  );
}

function sortChunks(chunks: RetrievedChunk[]) {
  return [...chunks].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
}

function RetrievalPanel({
  retrieval,
  title,
  defaultOpen = false,
}: {
  retrieval: { retrieval_ms: number; chunks: RetrievedChunk[] };
  title: string;
  defaultOpen?: boolean;
}) {
  const sorted = sortChunks(retrieval.chunks);

  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20"
    >
      <summary className="cursor-pointer text-xs font-semibold text-amber-900 dark:text-amber-200">
        {title} - {sorted.length} chunks · {retrieval.retrieval_ms} ms
      </summary>
      <p className="mt-1 text-xs text-zinc-500">
        Higher similarity = closer match. The LLM only sees these snippets.
      </p>
      <ul className="mt-3 space-y-2">
        {sorted.map((c, rank) => (
          <li
            key={`${c.chunk_index}-${rank}`}
            className={`rounded-lg border p-2 text-xs ${
              rank === 0
                ? "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/50"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-mono text-violet-700 dark:text-violet-300">
              {rank === 0 && (
                <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] text-white">
                  best match
                </span>
              )}
              <span>#{c.chunk_index}</span>
              <span>sim {(c.similarity ?? 0).toFixed(3)}</span>
              <span>page {c.page || "—"}</span>
            </div>
            <p className="mt-1.5 leading-relaxed text-zinc-700 dark:text-zinc-300">
              {c.preview}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
