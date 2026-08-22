"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BrainCircuit,
  ChevronRight,
  Check,
  Folder,
  Globe,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Search,
  Sparkles,
  FileText,
  X,
  Plus,
} from "lucide-react";
import MessageList from "@/components/chat/MessageList";
import ModelPicker from "@/components/chat/ModelPicker";
import { Message, Model } from "@/components/chat/types";

const SUGGESTIONS = [
  "What are the advantages of using Next.js?",
  "Write code to demonstrate Dijkstra's algorithm",
  "Help me write an essay about Silicon Valley",
  "What is the weather in San Francisco?",
];

type Props = {
  messages?: Message[];
  onSendMessage?: (text: string, model?: Model) => void | Promise<void>;
  isTyping?: boolean;
  disabled?: boolean;
};

type Attachment = {
  id: string;
  name: string;
  status: "uploading" | "uploaded";
};

export default function CompactChatInterface({
  messages: externalMessages,
  onSendMessage,
  isTyping = false,
  disabled = false,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [demoTyping, setDemoTyping] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTimersRef = useRef<number[]>([]);
  const typing = onSendMessage ? isTyping : demoTyping;
  const displayedMessages = externalMessages ?? messages;
  const hasMessages = displayedMessages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages, typing]);

  useEffect(() => {
    return () => {
      uploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      uploadTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setQuickMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function addAssistantMessage(content: string) {
    const aiMsg: Message = {
      id: Date.now() + 1,
      role: "assistant",
      content,
    };
    setMessages((prev) => [...prev, aiMsg]);
  }

  function sendMessage(text = input) {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || typing || disabled) return;

    setInput("");
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    if (onSendMessage) {
      void onSendMessage(trimmed, selectedModel ?? undefined);
      return;
    }

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);

    setDemoTyping(true);
    window.setTimeout(() => {
      addAssistantMessage(
        `Demo reply from ${selectedModel?.name ?? "the selected model"}: ${trimmed}`,
      );
      setDemoTyping(false);
    }, 900);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function openQuickAction(action: QuickAction) {
    setQuickMenuOpen(false);

    if (action.id === "attach") {
      fileInputRef.current?.click();
      return;
    }

    if (action.id === "more" || action.id === "projects") {
      return;
    }

    if (action.id === "create-image") {
      setInput((prev) => prev || "Create an image of ");
      textareaRef.current?.focus();
      return;
    }

    setInput((prev) => prev || `${action.label} `);
    textareaRef.current?.focus();
  }

  function handleAttachmentSelection(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;

    const nextAttachments = selected.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      status: "uploading" as const,
    }));

    setAttachments((prev) => [...prev, ...nextAttachments]);

    nextAttachments.forEach((attachment, index) => {
      const timer = window.setTimeout(() => {
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === attachment.id ? { ...item, status: "uploaded" } : item,
          ),
        );
      }, 650 + index * 180);
      uploadTimersRef.current.push(timer);
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 text-white">
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 overflow-y-auto px-4 py-6">
          <div
            className={`mx-auto flex w-full max-w-3xl flex-1 flex-col ${
              hasMessages ? "justify-start" : "items-center justify-center"
            }`}
          >
            {!hasMessages ? (
              <Welcome onSuggestion={sendMessage} disabled={disabled} />
            ) : (
              <>
                <MessageList messages={displayedMessages} isTyping={typing} />
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        <div className="px-4 pb-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900/95 px-3 py-2.5 shadow-lg shadow-black/20 transition-colors focus-within:border-zinc-500">
            {attachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <AttachmentChip
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={() =>
                      setAttachments((prev) =>
                        prev.filter((item) => item.id !== attachment.id),
                      )
                    }
                  />
                ))}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              id="compact-chat-input"
              name="compact-chat-input"
              rows={1}
              value={input}
              placeholder="Ask anything..."
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              className="w-full resize-none bg-transparent text-[15px] leading-6 text-white outline-none placeholder:text-zinc-500 disabled:opacity-50"
              style={{ minHeight: "28px", maxHeight: "140px" }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <div ref={quickMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label="Open quick actions"
                    aria-expanded={quickMenuOpen}
                    onClick={() => setQuickMenuOpen((v) => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/30 text-lg leading-none text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <QuickActionMenu
                    open={quickMenuOpen}
                    onSelect={openQuickAction}
                  />
                </div>
                <ModelPicker
                  selected={selectedModel}
                  onSelect={setSelectedModel}
                />
              </div>
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || typing || disabled}
                aria-label="Send message"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              id="compact-file-upload"
              name="compact-file-upload"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                handleAttachmentSelection(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Welcome({
  onSuggestion,
  disabled,
}: {
  onSuggestion: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-white">
          What can I help with?
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ask a question, write code, or explore ideas.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggestion(s)}
            disabled={disabled}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-left text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type QuickAction = {
  id:
    | "attach"
    | "recent"
    | "create-image"
    | "thinking"
    | "deep-research"
    | "web-search"
    | "more"
    | "projects";
  label: string;
  icon: string;
  chevron?: boolean;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "attach", label: "Add files, images, or links", icon: "paperclip" },
  // { id: "recent", label: "Recent files", icon: "file", chevron: true },
  // { id: "create-image", label: "Create image", icon: "image" },
  { id: "thinking", label: "Thinking", icon: "spark" },
  { id: "deep-research", label: "Deep research", icon: "search" },
  { id: "web-search", label: "Web search", icon: "globe" },
  // { id: "more", label: "More", icon: "more", chevron: true },
  // { id: "projects", label: "Projects", icon: "folder", chevron: true },
];

function QuickActionMenu({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (action: QuickAction) => void;
}) {
  return (
    <div
      className={`absolute bottom-10 left-0 z-50 w-64 origin-bottom-left overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-800 shadow-2xl shadow-black/45 transition duration-200 ease-out ${
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0"
      }`}
    >
      <div className="max-h-[70vh] py-2">
        {QUICK_ACTIONS.map((action, index) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onSelect(action)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-100 transition hover:bg-zinc-700/80 ${
              index === 0 ? "pt-3" : ""
            }`}
          >
            <QuickActionIcon kind={action.icon} />
            <span className="flex-1">{action.label}</span>
            {action.chevron ? (
              <ChevronRight className="h-4 w-4 text-zinc-500" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickActionIcon({ kind }: { kind: QuickAction["icon"] }) {
  switch (kind) {
    case "paperclip":
      return <Paperclip className="h-4 w-4 text-zinc-300" />;
    case "file":
      return <FileText className="h-4 w-4 text-zinc-300" />;
    case "image":
      return <ImagePlus className="h-4 w-4 text-zinc-300" />;
    case "spark":
      return <Sparkles className="h-4 w-4 text-zinc-300" />;
    case "search":
      return <Search className="h-4 w-4 text-zinc-300" />;
    case "globe":
      return <Globe className="h-4 w-4 text-zinc-300" />;
    case "more":
      return <MoreHorizontal className="h-4 w-4 text-zinc-300" />;
    case "folder":
      return <Folder className="h-4 w-4 text-zinc-300" />;
    default:
      return <BrainCircuit className="h-4 w-4 text-zinc-300" />;
  }
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
        {attachment.status === "uploading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </div>
      <span className="max-w-44 truncate">{attachment.name}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
          attachment.status === "uploading"
            ? "bg-zinc-800 text-zinc-400"
            : "bg-emerald-500/15 text-emerald-300"
        }`}
      >
        {attachment.status}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="ml-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

