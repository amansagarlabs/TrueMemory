"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Check,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Download,
  Ellipsis,
  FileText,
  Flag,
  MessageCircleQuestion,
  RefreshCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Globe2,
  CloudSun,
  Goal,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  Radio,
  ListTodo,
  TrafficCone,
  TrendingUp,
  Trophy,
  Vote,
} from "lucide-react";
import { IconCopy, IconPencil } from "@tabler/icons-react";
import { type ChatActivity, Message, type MessageArtifactAttachment, type MessageImageAttachment, type MessageResource } from "@/components/chat/types";
import type { QueryConfirmationRequest, QueryExecutionPlan, QueryRouteDecision, QuerySource } from "@/lib/types";
import { Confirmation, ConfirmationAction, ConfirmationActions, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation";
import { InlineCitation, InlineCitationCard, InlineCitationCardBody, InlineCitationCardTrigger, InlineCitationSource } from "@/components/ai-elements/inline-citation";
import { PaperDither } from "@/components/ui/paper-dither";
import { ThinkingState } from "@/components/ui/ThinkingState";
import { ThinkingReasoning } from "@/components/ui/ThinkingReasoning";
import { WebSearchState } from "@/components/ui/WebSearchState";
import { TextResponse } from "@/components/ui/TextResponse";
import { TodoList } from "@/components/ui/TodoList";
import { SiteFavicon } from "@/components/chat/SiteFavicon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchArtifactContent } from "@/services/api";

interface Props {
  messages: Message[];
  isTyping: boolean;
  activity?: ChatActivity | null;
  route?: QueryRouteDecision | null;
  plan?: QueryExecutionPlan | null;
  liveSources?: QuerySource[];
  showReasoningSummary?: boolean;
  fastMode?: boolean;
  confirmation?: QueryConfirmationRequest | null;
  onApproveTool?: () => void;
  onRejectTool?: () => void;
  onEditTool?: () => void;
  onStop?: () => void;
  copiedMessageId?: number | null;
  sharedMessageId?: number | null;
  onCopy?: (message: Message) => void;
  onDownload?: (message: Message) => void;
  onFeedback?: (message: Message, rating: "up" | "down") => void;
  onShare?: (message: Message) => void;
  onReport?: (message: Message) => void;
  editingMessageId?: number | null;
  editingDraft?: string;
  onEditStart?: (message: Message) => void;
  onEditDraftChange?: (content: string) => void;
  onEditCancel?: () => void;
  onEditSubmit?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onRegenerate?: (message: Message) => void;
  onSources?: (message: Message) => void;
  onFollowUp?: (question: string) => void;
}

export default function MessageList({
  messages,
  isTyping,
  activity,
  route,
  plan,
  liveSources = [],
  showReasoningSummary = false,
  fastMode = false,
  confirmation,
  onApproveTool,
  onRejectTool,
  onEditTool,
  onStop,
  copiedMessageId,
  sharedMessageId,
  onCopy,
  onDownload,
  onFeedback,
  onShare,
  onReport,
  editingMessageId,
  editingDraft = "",
  onEditStart,
  onEditDraftChange,
  onEditCancel,
  onEditSubmit,
  onReply,
  onRegenerate,
  onSources,
  onFollowUp,
}: Props) {
  const hasStreamingAssistant = messages.some((message) => message.role === "assistant" && message.streaming);
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 py-2">
      {messages.map((msg, messageIndex) => (
        (() => {
          const isHighlightedAnswer =
            msg.role === "assistant" && msg.emphasis === "highlight";
          const isEditing = msg.role === "user" && editingMessageId === msg.id;
          const messageClasses =
            msg.role === "user"
              ? "border-[var(--chat-border-strong)] bg-[var(--chat-user-surface)] text-[var(--chat-user-foreground)] shadow-[0_10px_22px_-20px_rgba(64,43,24,0.28)]"
              : isHighlightedAnswer
                ? "border-[var(--chat-border-strong)] bg-[var(--chat-highlight)] text-[var(--chat-foreground)] shadow-[0_12px_26px_-24px_rgba(121,65,24,0.2)]"
                : "border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-foreground)] shadow-[0_10px_24px_-24px_rgba(64,43,24,0.18)]";
          const previousUserMessage = msg.role === "assistant"
            ? [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === "user")
            : undefined;
          const followUps = previousUserMessage
            ? msg.followUps?.length
              ? msg.followUps
              : buildFollowUpSuggestions(
                  previousUserMessage.content,
                  msg.content,
                  msg.route?.live_data_kind,
                )
            : [];
          const effectiveRoute = msg.streaming ? route ?? msg.route : msg.route;
          const showFollowUps =
            msg.role === "assistant" &&
            !msg.streaming &&
            messageIndex === messages.length - 1 &&
            followUps.length > 0;

        return (
        <div
          key={msg.serverId ?? `${msg.id}-${messageIndex}`}
          id={`chat-message-${msg.serverId ?? `${msg.id}-${messageIndex}`}`}
          className={`scroll-mt-28 group/message flex w-full gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div className={`flex flex-col ${msg.role === "user" ? isEditing ? "w-full max-w-[88%] items-end sm:max-w-[72%]" : "max-w-[88%] items-end sm:max-w-[72%]" : "w-full items-start"}`}>
            <div
              className={`relative ${
                msg.role === "user"
                  ? `rounded-[18px] border text-[14px] sm:rounded-[20px] ${isEditing ? "w-full p-3" : msg.imageAttachments?.length || msg.artifactAttachment ? "w-fit max-w-full p-2.5" : "px-4 py-2.5 sm:px-5 sm:py-3"}`
                  : "w-full rounded-[20px] border px-5 pb-6 pt-14 text-[15px] sm:rounded-[24px] sm:px-6 sm:pb-6 sm:pt-14"
              } ${msg.role === "assistant" ? "leading-7" : "leading-6"} ${messageClasses}`}
            >
              {msg.role === "assistant" ? (
                <div className="absolute inset-x-5 top-4 flex items-center justify-between sm:inset-x-6">
                  <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
                    <span className="size-2 rounded-full bg-[var(--chat-accent)]" aria-hidden="true" />
                    Kontext
                  </span>
                  {!msg.streaming ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => onReply?.(msg)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                          />
                        }
                      >
                        <MessageCircleQuestion className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        Ask
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>Ask a follow-up about this answer</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              ) : null}
              {msg.badge ? (
                <div className="mb-4 inline-flex rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] px-2 py-0.5 text-[11px] font-medium uppercase text-[var(--chat-muted-foreground)]">
                  {msg.badge}
                </div>
              ) : null}
              {msg.replyTo ? (
                <div className="mb-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-3 py-2 text-left">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-accent)]">
                    Asked about {msg.replyTo.role === "assistant" ? "Kontext's response" : "your message"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--chat-muted-foreground)]">
                    {msg.replyTo.content}
                  </p>
                </div>
              ) : null}
              {msg.role === "user" && msg.imageAttachments?.length ? (
                <MessageImageGrid
                  images={msg.imageAttachments}
                  onOpen={(url, filename) => setPreviewImage({ url, filename })}
                />
              ) : null}
              {msg.role === "user" && msg.artifactAttachment ? (
                <MessageArtifactCard
                  artifact={msg.artifactAttachment}
                  onOpen={(url, filename) => setPreviewImage({ url, filename })}
                />
              ) : null}
              {msg.role === "user" && msg.contextMentions?.length ? (
                <div className="mb-2 flex flex-wrap justify-end gap-1.5">
                  {msg.contextMentions.map((mention) => (
                    <span
                      key={`${mention.kind}:${mention.id}`}
                      title={mention.kind}
                      className="inline-flex h-7 max-w-full items-center gap-1 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-background)] px-2 text-[11px]"
                    >
                      <span className="font-mono font-semibold text-[var(--chat-accent)]">
                        @
                      </span>
                      <span className="max-w-40 truncate font-medium">
                        {mention.label}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
              {isEditing ? (
                <InlineMessageEditor
                  value={editingDraft}
                  disabled={isTyping || !editingDraft.trim()}
                  onChange={(value) => onEditDraftChange?.(value)}
                  onCancel={() => onEditCancel?.()}
                  onSubmit={() => onEditSubmit?.(msg)}
                />
              ) : (
                <>
                  {msg.role === "assistant" && msg.streaming ? (
                    <InlineRetrievalProgress
                      activity={activity}
                      route={effectiveRoute}
                      plan={plan}
                      sources={liveSources}
                      question={previousUserMessage?.content}
                      showReasoningSummary={showReasoningSummary}
                      fastMode={fastMode || Boolean(msg.fastMode)}
                      onStop={onStop}
                    />
                  ) : null}
                  {msg.role === "assistant" && !msg.streaming && (msg.showReasoningSummary || effectiveRoute?.mode === "agent") ? (
                    <CompletedReasoningDisclosure
                      route={effectiveRoute}
                      plan={msg.plan}
                      sourceCount={msg.resources?.length ?? 0}
                      durationMs={msg.durationMs}
                    />
                  ) : null}
                  {msg.role === "assistant" && !msg.streaming && effectiveRoute?.live_data_kind ? (
                    <LiveResultCard
                      kind={effectiveRoute.live_data_kind}
                      label={effectiveRoute.live_data_label ?? "Live update"}
                      sourceCount={msg.resources?.length ?? 0}
                    />
                  ) : null}
                  {msg.role === "assistant" && !msg.streaming && msg.resources?.some((resource) => resource.imageUrl) ? (
                    <SourceImagePreview
                      resources={msg.resources}
                      onOpen={(url, title) => setPreviewImage({ url, filename: title })}
                    />
                  ) : null}
                  {msg.imageUrl ? (
                    <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)]">
                      <Image
                        src={msg.imageUrl}
                        alt={msg.content || "Generated image"}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 88vw, 720px"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : msg.badge === "IMAGE" && msg.streaming ? (
                    <div
                      role="status"
                      aria-label="Generating image"
                      className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-background)]"
                    >
                      <PaperDither
                        className="inset-0 opacity-90"
                        dark={{ colorBack: "#10110f", colorFront: "#e85d18" }}
                        light={{ colorBack: "#f7f1e9", colorFront: "#e85d18" }}
                        shape="wave"
                        type="4x4"
                        size={2.2}
                        speed={0.22}
                        scale={0.72}
                        eager
                        maxPixelCount={900 * 675}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--chat-background)]/55 px-4 text-center backdrop-blur-[1px]">
                        <span className="rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)]/90 px-3 py-1.5 text-xs font-medium text-[var(--chat-foreground)] shadow-[0_10px_20px_-16px_rgba(64,43,24,0.25)] backdrop-blur-sm">
                          Creating your image…
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div className={msg.role === "assistant" ? "" : `whitespace-pre-wrap ${msg.imageAttachments?.length || msg.artifactAttachment ? "px-1.5 pb-0.5" : ""}`}>
                  {msg.role === "assistant" ? (
                    msg.streaming ? null : <TextResponse>{renderAgentMarkdown(msg)}</TextResponse>
                  ) : msg.content}
                  </div>
                </>
              )}
            </div>

            {msg.role === "user" ? (
              !isEditing ? (
                <div className="mt-1.5 flex items-center gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-focus-within/message:opacity-100 sm:group-hover/message:opacity-100">
                  <MessageActionButton
                    label={copiedMessageId === msg.id ? "Copied" : "Copy question"}
                    onClick={() => onCopy?.(msg)}
                  >
                    {copiedMessageId === msg.id ? (
                      <Check className="size-4 text-[var(--chat-accent)]" strokeWidth={1.8} />
                    ) : (
                      <IconCopy className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                  </MessageActionButton>
                  <MessageActionButton
                    label="Edit question"
                    onClick={() => onEditStart?.(msg)}
                  >
                    <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
                  </MessageActionButton>
                </div>
              ) : null
            ) : !msg.streaming ? (
              <div className="mt-4 flex w-full flex-wrap items-center gap-2 px-1 py-1 text-[var(--chat-muted-foreground)] opacity-100">
                <MessageActionButton
                  label={sharedMessageId === msg.id ? "Shared" : "Share answer"}
                  onClick={() => onShare?.(msg)}
                >
                  {sharedMessageId === msg.id ? (
                    <Check className="size-4 text-[var(--chat-accent)]" strokeWidth={1.8} />
                  ) : (
                    <Share2 className="size-4" strokeWidth={1.8} />
                  )}
                </MessageActionButton>
                <MessageActionButton
                  label="Download answer"
                  onClick={() => onDownload?.(msg)}
                >
                  <Download className="size-4" strokeWidth={1.8} />
                </MessageActionButton>
                <MessageActionButton
                  label={copiedMessageId === msg.id ? "Copied" : "Copy answer"}
                  onClick={() => onCopy?.(msg)}
                >
                  {copiedMessageId === msg.id ? (
                    <Check className="size-4 text-[var(--chat-accent)]" strokeWidth={1.8} />
                  ) : (
                    <IconCopy className="size-4" stroke={1.8} aria-hidden="true" />
                  )}
                </MessageActionButton>
                <MessageActionButton
                  label="Regenerate answer"
                  onClick={() => onRegenerate?.(msg)}
                >
                  <RefreshCcw className="size-4" strokeWidth={1.8} />
                </MessageActionButton>
                <AnswerSourcesButton resources={msg.resources ?? []} onClick={() => onSources?.(msg)} />
                <span className="min-w-2 flex-1" />
                <MessageActionButton
                  label={msg.feedback === "up" ? "Remove positive feedback" : "Good response"}
                  pressed={msg.feedback === "up"}
                  onClick={() => onFeedback?.(msg, "up")}
                >
                  <ThumbsUp className="size-4" strokeWidth={1.8} />
                </MessageActionButton>
                <MessageActionButton
                  label={msg.feedback === "down" ? "Remove negative feedback" : "Bad response"}
                  pressed={msg.feedback === "down"}
                  onClick={() => onFeedback?.(msg, "down")}
                >
                  <ThumbsDown className="size-4" strokeWidth={1.8} />
                </MessageActionButton>
                <MessageOverflowMenu message={msg} onReport={() => onReport?.(msg)} />
              </div>
            ) : null}
            {showFollowUps ? (
              <FollowUpList suggestions={followUps} onSelect={(question) => onFollowUp?.(question)} />
            ) : null}
          </div>
        </div>
          );
        })()
      ))}

      {isTyping && !hasStreamingAssistant && !confirmation ? (
        <StreamingAnswerShell activity={activity} route={route} plan={plan} sources={liveSources} showReasoningSummary={showReasoningSummary} onStop={onStop} />
      ) : null}

      {confirmation ? (
        <Confirmation role="status" aria-live="polite">
          <ConfirmationTitle>{confirmation.title}</ConfirmationTitle>
          <ConfirmationRequest>{confirmation.description}</ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction onClick={onEditTool}>Edit request</ConfirmationAction>
            <ConfirmationAction onClick={onRejectTool}>Not now</ConfirmationAction>
            <ConfirmationAction onClick={onApproveTool} className="border-transparent bg-[var(--chat-accent)] text-[var(--chat-accent-foreground)] hover:bg-[var(--chat-accent-hover)]">Allow</ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      ) : null}

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="flex h-[min(88vh,820px)] w-[calc(100vw-1.5rem)] max-w-[1040px] flex-col overflow-hidden rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] sm:max-w-[1040px]">
          <DialogHeader className="shrink-0 border-b border-[var(--chat-border)] px-5 py-4 pr-14">
            <DialogTitle className="truncate text-base font-semibold tracking-[-0.02em]">
              {previewImage?.filename ?? "Attached image"}
            </DialogTitle>
          </DialogHeader>
          <div className="relative min-h-0 flex-1 bg-[var(--chat-background)] p-3 sm:p-5">
            {previewImage ? (
              <Image
                src={previewImage.url}
                alt={`Full preview of ${previewImage.filename}`}
                fill
                unoptimized
                sizes="(max-width: 1040px) 96vw, 1000px"
                className="rounded-xl object-contain p-3 sm:p-5"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageImageGrid({
  images,
  onOpen,
}: {
  images: MessageImageAttachment[];
  onOpen: (url: string, filename: string) => void;
}) {
  return (
    <div
      className={`mb-3 grid overflow-hidden rounded-xl ${images.length > 1 ? "w-[min(22rem,76vw)] grid-cols-2 gap-1.5" : "w-52 grid-cols-1 sm:w-60"}`}
      aria-label={`${images.length} attached image${images.length === 1 ? "" : "s"}`}
    >
      {images.map((image) => (
        <AuthenticatedMessageImage key={image.artifactId} image={image} onOpen={onOpen} />
      ))}
    </div>
  );
}

function MessageArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: MessageArtifactAttachment;
  onOpen: (url: string, filename: string) => void;
}) {
  const extension = artifact.filename.split(".").pop()?.toLowerCase() || "file";
  const isImage = artifact.mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(extension);

  return (
    <div className="mb-3 w-52 overflow-hidden rounded-[14px] border border-[var(--chat-user-foreground)]/12 bg-transparent sm:w-60">
      {isImage ? (
        <div className="p-1.5 pb-0">
          <AuthenticatedMessageImage
            image={{
              artifactId: artifact.artifactId,
              filename: artifact.filename,
              mimeType: artifact.mimeType,
            }}
            onOpen={onOpen}
          />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center bg-[var(--chat-user-surface)]">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--chat-surface-muted)] text-[var(--chat-user-foreground)]/70">
            <FileText className="size-5" strokeWidth={1.6} aria-hidden="true" />
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 text-left">
        <FileText className="size-3.5 shrink-0 text-[var(--chat-user-foreground)]/70" strokeWidth={1.7} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-[var(--chat-user-foreground)]">{artifact.title}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.08em] text-[var(--chat-user-foreground)]/55">{extension}</p>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedMessageImage({
  image,
  onOpen,
}: {
  image: MessageImageAttachment;
  onOpen: (url: string, filename: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchArtifactContent(image.artifactId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.artifactId]);

  return (
    <button
      type="button"
      onClick={() => { if (url) onOpen(url, image.filename); }}
      disabled={!url}
      aria-label={url ? `Open attached image ${image.filename}` : `Loading attached image ${image.filename}`}
      className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[10px] bg-[var(--chat-user-surface)] text-[var(--chat-user-foreground)]/70 transition-[filter,transform] duration-150 enabled:hover:brightness-[0.97] enabled:active:scale-[0.99] enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-inset enabled:focus-visible:ring-[var(--chat-focus)] disabled:cursor-default"
    >
      {url ? (
        <Image
          src={url}
          alt={`Attached image ${image.filename}`}
          fill
          unoptimized
          sizes={"(max-width: 640px) 44vw, 260px"}
          className="object-contain"
        />
      ) : failed ? (
        <span className="flex flex-col items-center gap-2 px-3 text-center text-xs leading-5">
          <ImageIcon className="size-5" strokeWidth={1.6} aria-hidden="true" />
          Preview unavailable
        </span>
      ) : (
        <span role="status" className="flex items-center gap-2 text-xs">
          <Loader2 className="size-4 animate-spin text-[var(--chat-accent)]" aria-hidden="true" />
          Loading image…
        </span>
      )}
    </button>
  );
}

function StreamingAnswerShell({ activity, route, plan, sources, showReasoningSummary, onStop }: {
  activity?: ChatActivity | null;
  route?: QueryRouteDecision | null;
  plan?: QueryExecutionPlan | null;
  sources: QuerySource[];
  showReasoningSummary: boolean;
  onStop?: () => void;
}) {
  return (
    <div className="group/message flex w-full justify-start">
      <div className="w-full">
        <div className="relative w-full rounded-[20px] border border-[var(--chat-border)] bg-[var(--chat-surface)] px-5 pb-6 pt-14 text-[15px] leading-7 text-[var(--chat-foreground)] shadow-[0_16px_38px_-30px_rgba(64,43,24,0.34)] sm:rounded-[24px] sm:px-6 sm:pt-14">
          <div className="absolute inset-x-5 top-4 flex items-center justify-between sm:inset-x-6">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
              <span className="size-2 rounded-full bg-[var(--chat-accent)]" aria-hidden="true" />
              Kontext
            </span>
          </div>
        <InlineRetrievalProgress activity={activity} route={route} plan={plan} sources={sources} showReasoningSummary={showReasoningSummary} fastMode={false} onStop={onStop} />
        </div>
      </div>
    </div>
  );
}

function InlineRetrievalProgress({ activity, route, plan, sources, question, showReasoningSummary = false, fastMode = false, onStop }: {
  activity?: ChatActivity | null;
  route?: QueryRouteDecision | null;
  plan?: QueryExecutionPlan | null;
  sources: Array<{ url: string }>;
  question?: string;
  showReasoningSummary?: boolean;
  fastMode?: boolean;
  onStop?: () => void;
}) {
  const activeStep = plan?.steps.find((step) => step.status === "active");
  const uniqueSites = uniqueExternalQuerySources(sources);
  const heading = progressHeading(route, activity, activeStep?.label);
  const detail = publicRetrievalSummary(route, activity, question);
  const showTodoPlan = Boolean(
    fastMode &&
    route?.mode === "agent" &&
    plan?.steps.length &&
    plan.steps.length >= 4
  );

  return (
    <section role="status" aria-live="polite" aria-label={`${heading}. ${detail}`} className="mb-4 border-b border-[var(--chat-border)] pb-3">
      {route?.needs_web ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <ThinkingState
              label="Searching the web"
              compact
              icon={<DitherActivityMark kind="web" />}
              className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0"
            />
            {onStop ? (
              <button type="button" onClick={onStop} className="web-search-stop">Stop</button>
            ) : null}
          </div>
          <WebSearchState
            query={route.search_queries?.[0] ?? heading}
            sources={sources as QuerySource[]}
            active
            defaultOpen
          />
        </div>
      ) : (
        <ThinkingState
          label={heading}
          detail={detail}
          compact
          icon={<DitherActivityMark kind={activity?.kind ?? "routing"} />}
          className="rounded-none border-0 bg-transparent px-0 py-0"
        />
      )}
      {!route?.needs_web ? <div className="mt-1 flex items-center justify-between gap-2">
        {uniqueSites.length ? (
          <span className="font-mono text-[10px] tabular-nums text-[var(--chat-subtle-foreground)]">
            {uniqueSites.length} site{uniqueSites.length === 1 ? "" : "s"} checked
          </span>
        ) : <span />}
      </div> : null}
      {!route?.needs_web && (showReasoningSummary || route?.mode === "agent" || plan?.steps.length) ? (
        showTodoPlan ? (
          <TodoList plan={plan} active className="mt-1" />
        ) : (
        <ThinkingReasoning
          label={heading}
          active
          defaultExpanded={false}
          orb="v2"
          sentences={[detail, ...(plan?.steps.map((step) => step.label) ?? [])]}
          className="mt-1"
        >
          <div className="mt-2 text-xs leading-5 text-[var(--chat-muted-foreground)]">
            <p>{detail}</p>
            {plan?.steps.length ? <ol className="mt-3 space-y-0.5" aria-label="Retrieval progress">
          {plan.steps.map((step) => {
            const isActive = step.status === "active";
            const isComplete = step.status === "complete";
            const isTerminal = step.status === "failed" || step.status === "denied";

            return (
              <li
                key={step.id}
                className={`grid grid-cols-[14px_minmax(0,1fr)] items-start gap-2 border-l-2 px-2.5 py-2 text-xs leading-5 transition-[background-color,border-color] duration-150 ${
                  isActive ? "border-[var(--chat-accent)] bg-[var(--chat-accent)]/[0.055]" : "border-transparent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 size-1.5 rounded-full border transition-[background-color,border-color,box-shadow] duration-150 ${
                    isComplete
                      ? "border-[var(--chat-accent)] bg-[var(--chat-accent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--chat-accent)_16%,transparent)]"
                      : isActive
                        ? "border-[var(--chat-accent)] bg-[var(--chat-surface)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--chat-accent)_12%,transparent)]"
                        : isTerminal
                          ? "border-[var(--destructive)] bg-[var(--chat-surface)]"
                          : "border-[var(--chat-border-strong)] bg-[var(--chat-surface)]"
                  }`}
                />
                <div className="min-w-0">
                  <span
                    className={`block truncate ${isActive ? "font-semibold text-[var(--chat-foreground)]" : "font-medium text-[var(--chat-muted-foreground)]"}`}
                  >
                    {step.label}
                  </span>
                  {isActive ? (
                    <span className="mt-0.5 block text-[11px] text-[var(--chat-subtle-foreground)]">
                      {stepProgressDetail(step.id, route)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
            </ol> : null}
          </div>
        </ThinkingReasoning>
        )
      ) : null}
    </section>
  );
}

function CompletedReasoningDisclosure({ route, plan, sourceCount = 0, durationMs }: {
  route?: QueryRouteDecision;
  plan?: QueryExecutionPlan;
  sourceCount?: number;
  durationMs?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const completedSteps = plan?.steps.filter((step) => step.status === "complete") ?? [];
  const summary = route?.reason?.trim() || (
    route?.needs_web
      ? "I checked current sources, compared the available evidence, and kept the supported findings for the answer."
      : "I checked the request, relevant context, and assumptions before composing the answer."
  );
  const workingLabel = durationMs
    ? `Worked for ${formatWorkingDuration(durationMs)}`
    : "Working";

  return (
    <div className="completed-agent-trace mb-5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="todo-panel todo-panel--compact completed-agent-trace__summary w-full text-left"
      >
        <span className="completed-agent-trace__summary-left">
          <span className="todo-panel-head-icon" aria-hidden="true">
            <ListTodo className="size-3.5" />
          </span>
            <span className="todo-panel-title">Chain of Thought</span>
        </span>
        <span className="completed-agent-trace__summary-right">
          <span className="todo-panel-status">{workingLabel}</span>
          <ChevronRight
            className={`completed-agent-trace__chevron ${expanded ? "is-open" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      <div className={`thinking-trace completed-agent-trace__body ${expanded ? "is-open" : ""}`}>
          <div className="thinking-trace-section">
            <span className="thinking-trace-kicker">Summary</span>
            <p>{summary}</p>
          </div>
          {completedSteps.length ? (
            <div className="thinking-trace-section">
              <span className="thinking-trace-kicker">Completed steps</span>
              <ol className="thinking-trace-list" aria-label="Completed answer-building steps">
                {completedSteps.map((step) => (
                  <li key={step.id}><Check aria-hidden="true" />{step.label}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {route?.search_queries?.length ? (
            <div className="thinking-trace-section">
              <span className="thinking-trace-kicker">Searches</span>
              <ul className="thinking-trace-searches">
                {route.search_queries.map((query) => <li key={query}>{query}</li>)}
              </ul>
            </div>
          ) : null}
          {sourceCount > 0 ? <p className="thinking-trace-evidence">Evidence reviewed: {sourceCount} source{sourceCount === 1 ? "" : "s"}</p> : null}
      </div>
    </div>
  );
}

function formatWorkingDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function progressHeading(route?: QueryRouteDecision | null, activity?: ChatActivity | null, activeLabel?: string): string {
  if (route?.live_data_kind === "cricket" || route?.live_data_kind === "football" || route?.live_data_kind === "sports") {
    return "Fetching sports data";
  }
  if (route?.live_data_kind === "weather") return "Checking current weather";
  if (route?.live_data_kind === "market") return "Checking live market data";
  if (route?.live_data_kind) return route.live_data_label ?? "Checking the live update";
  return activity?.label ?? activeLabel ?? "Preparing your answer";
}

function publicRetrievalSummary(route?: QueryRouteDecision | null, activity?: ChatActivity | null, question?: string): string {
  if (route?.live_data_kind === "football") {
    return "I checked current football results, fixtures, and match status.";
  }
  if (route?.live_data_kind === "cricket") return "I checked current cricket matches, scorecards, and fixtures.";
  if (route?.live_data_kind === "sports") return "I checked current scores, fixtures, and results.";
  if (route?.live_data_kind) return `I checked a current ${route.live_data_label?.toLowerCase() ?? "live update"}.`;
  if (question && route?.needs_web) return "I checked the most relevant current evidence before answering.";
  return activity?.detail ?? "I reviewed the relevant context before writing the answer.";
}

function stepProgressDetail(stepId: string, route?: QueryRouteDecision | null): string {
  if (stepId === "route") return "Understanding what information is needed.";
  if (stepId === "knowledge") return "Checking relevant background context.";
  if (stepId.startsWith("tool-")) {
    if (route?.live_data_kind === "football") return "Looking for live matches and upcoming fixtures.";
    if (route?.live_data_kind === "cricket") return "Looking for live matches and scorecards.";
    return "Reviewing the most relevant evidence.";
  }
  if (stepId === "answer") return "Turning verified findings into a clear response.";
  return "Working on this step.";
}

function uniqueExternalQuerySources<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!/^https?:\/\//i.test(source.url)) return false;
    let key = source.url.replace(/\/$/, "").toLowerCase();
    try {
      const url = new URL(source.url);
      key = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
    } catch {
      // Keep the normalized raw URL when parsing fails.
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type LiveDataKind = NonNullable<QueryRouteDecision["live_data_kind"]>;

function DitherActivityMark({ kind }: { kind: ChatActivity["kind"] }) {
  const phaseOffset = {
    routing: 0,
    memory: 1,
    document: 2,
    image: 3,
    web: 4,
    sources: 5,
    answer: 6,
  }[kind];
  const samples = Array.from({ length: 9 }, (_, index) => index / 8);
  const offsets = [-1, 0, 1];

  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="currentColor" aria-hidden="true" focusable="false">
      {Array.from({ length: 6 }, (_, arm) => {
        const baseAngle = (arm * Math.PI) / 3;
        return samples.flatMap((progress, sampleIndex) => {
          const radius = 3 + progress * 15;
          const angle = baseAngle + (progress - 0.5) * 0.42;
          const tangentX = -Math.sin(angle);
          const tangentY = Math.cos(angle);
          const petalWidth = Math.sin(progress * Math.PI) * 2.2;

          return offsets.map((offset, offsetIndex) => {
            const drift = Math.sin(phaseOffset + arm * 1.7 + sampleIndex) * 0.3;
            const x = 20 + Math.cos(angle) * (radius + drift) + tangentX * petalWidth * offset;
            const y = 20 + Math.sin(angle) * (radius + drift) + tangentY * petalWidth * offset;
            return (
              <circle
                key={`${arm}-${sampleIndex}-${offsetIndex}`}
                cx={x}
                cy={y}
                r={offset === 0 ? 1.45 : 1.05}
                opacity={Math.max(0.5, 0.98 - Math.abs(offset) * 0.18 - progress * 0.16)}
                className="chat-dither-dot"
                style={{ animationDelay: `${-((arm + sampleIndex + offsetIndex + phaseOffset) % 10) * 100}ms` }}
              />
            );
          });
        });
      })}
      <circle cx="20" cy="20" r="2.6" className="chat-dither-dot" />
    </svg>
  );
}

function LiveResultCard({ kind, label, sourceCount }: { kind: LiveDataKind; label: string; sourceCount: number }) {
  const icon = liveDataIcon(kind);

  return (
    <section
      aria-label={`${label}. Checked live for this response.`}
      className="mb-5 flex items-center gap-4 rounded-2xl border border-[var(--chat-accent)]/30 bg-[var(--chat-highlight)] px-4 py-4"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-accent)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chat-accent)] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-accent-foreground)]">
            <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
            Live
          </span>
          <strong className="text-sm font-semibold text-[var(--chat-foreground)]">{label}</strong>
        </span>
        <span className="mt-1 block text-xs leading-5 text-[var(--chat-muted-foreground)]">
          {sourceCount
            ? `Checked for this response across ${sourceCount} source${sourceCount === 1 ? "" : "s"}.`
            : "A fresh-data check was requested for this response."} Values do not auto-refresh.
        </span>
      </span>
    </section>
  );
}

function liveDataIcon(kind: LiveDataKind): ReactNode {
  const props = { className: "size-5", strokeWidth: 1.8, "aria-hidden": true as const };
  switch (kind) {
    case "cricket":
    case "sports":
      return <Trophy {...props} />;
    case "football":
      return <Goal {...props} />;
    case "weather":
      return <CloudSun {...props} />;
    case "market":
      return <TrendingUp {...props} />;
    case "election":
      return <Vote {...props} />;
    case "traffic":
      return <TrafficCone {...props} />;
    case "news":
      return <Newspaper {...props} />;
    default:
      return <Radio {...props} />;
  }
}

function SourceImagePreview({
  resources,
  onOpen,
}: {
  resources: MessageResource[];
  onOpen: (url: string, title: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const seen = new Set<string>();
  const visibleResources = resources.filter((resource) => {
    const imageUrl = resource.imageUrl?.trim();
    const key = imageUrl || `${resource.domain}:${resource.title}`;
    if (!imageUrl || failedImageUrls.has(imageUrl) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateOverflow = () => setHasOverflow(rail.scrollWidth > rail.clientWidth + 4);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [visibleResources.length]);

  function showNextSource() {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector<HTMLElement>("[data-source-card]");
    const step = (firstCard?.offsetWidth ?? rail.clientWidth * 0.75) + 8;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
    rail.scrollTo({ left: atEnd ? 0 : rail.scrollLeft + step, behavior: "smooth" });
  }

  if (!visibleResources.length) return null;

  return (
    <section aria-label="Relevant source images" className="relative mb-6">
      <div
        ref={railRef}
        role="list"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleResources.map((source, index) => (
          <article
            key={source.imageUrl}
            data-source-card
            role="listitem"
                className="group relative flex w-[82vw] min-w-[15rem] max-w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-[0_10px_24px_-22px_rgba(64,43,24,0.18)] transition-[background-color,border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-highlight)] hover:shadow-[0_14px_30px_-24px_rgba(64,43,24,0.24)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:w-[calc((100%_-_1rem)/3)] sm:min-w-[14.5rem] sm:max-w-none"
          >
            <button
              type="button"
              onClick={() => onOpen(source.imageUrl!, source.title || source.domain || `Source image ${index + 1}`)}
              aria-label={`Preview image ${index + 1}: ${source.title || source.domain}`}
              className="relative block aspect-[16/10] w-full shrink-0 cursor-zoom-in overflow-hidden bg-[var(--chat-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
            >
              <Image
                src={source.imageUrl!}
                alt={source.title || "Source image"}
                fill
                unoptimized
                sizes="(max-width: 640px) 82vw, 245px"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  const aspectRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
                  image.style.objectPosition = aspectRatio < 1.45 ? "50% 18%" : "50% 50%";
                }}
                onError={() => {
                  const failedUrl = source.imageUrl;
                  if (!failedUrl) return;
                  setFailedImageUrls((current) => {
                    if (current.has(failedUrl)) return current;
                    const next = new Set(current);
                    next.add(failedUrl);
                    return next;
                  });
                }}
                className="object-cover object-[center_18%] transition-transform duration-200 group-hover:scale-[1.025]"
              />
              <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_var(--chat-border)]" aria-hidden="true" />
              <span className="pointer-events-none absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-[var(--chat-surface-raised)] text-[var(--chat-foreground)] opacity-0 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.8)] transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true">
                <ImageIcon className="size-3.5" strokeWidth={1.8} />
              </span>
            </button>
            <a
              href={source.imageLandingUrl || source.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open source for image ${index + 1}: ${source.title || source.domain}`}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-4 text-[var(--chat-foreground)]">{source.title || source.domain}</span>
                <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--chat-subtle-foreground)]">
                  {source.imageProvider && source.imageProvider !== "opengraph"
                    ? source.imageProvider
                    : source.domain}
                </span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
      {hasOverflow ? (
        <button
          type="button"
          aria-label="Show more sources"
          onClick={showNextSource}
          className="absolute right-2 top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] text-[var(--chat-foreground)] shadow-[0_8px_20px_-14px_rgba(0,0,0,0.22)] transition-[background-color,transform] duration-150 hover:bg-[var(--chat-highlight)] active:-translate-y-1/2 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
        >
          <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function FollowUpList({ suggestions, onSelect }: { suggestions: string[]; onSelect: (question: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section aria-labelledby="follow-up-heading" className="mt-8 w-full border-t border-[var(--chat-border)] pt-6">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="follow-up-list"
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex min-h-9 w-auto items-center gap-1.5 px-0 text-left text-sm font-semibold tracking-[-0.01em] text-[var(--chat-foreground)] transition-colors duration-150 hover:text-[var(--chat-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] focus-visible:ring-offset-2"
      >
        <ChevronRight className={`size-3.5 shrink-0 text-[var(--chat-subtle-foreground)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
        <span id="follow-up-heading">Follow-ups</span>
      </button>
      <div
        id="follow-up-list"
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 pt-3">
          <div className="divide-y divide-[var(--chat-border)] border-y border-[var(--chat-border)]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSelect(suggestion)}
                className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm leading-6 text-[var(--chat-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
              >
                <ArrowRight className="size-3.5 shrink-0 text-[var(--chat-subtle-foreground)] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildFollowUpSuggestions(
  question: string,
  answer: string,
  liveKind?: QueryRouteDecision["live_data_kind"],
): string[] {
  if (liveKind === "cricket") {
    return [
      "Show the full live cricket scorecard",
      "Which cricket matches are live right now?",
      "What are the latest wickets and key moments?",
      "What cricket fixtures are coming up next?",
    ];
  }
  if (liveKind === "football") {
    return [
      "Show all live football scores",
      "What are the live match statistics?",
      "How do these results affect the standings?",
      "What football fixtures are coming up next?",
    ];
  }
  if (liveKind === "sports") {
    return [
      "Show all live scores right now",
      "What are the key moments so far?",
      "How do these results affect the standings?",
      "Which matches are scheduled next?",
    ];
  }
  if (liveKind === "weather") {
    return [
      "Show the hourly weather forecast",
      "Are there any active weather warnings?",
      "What will the weather be tomorrow?",
      "How does it feel outside right now?",
    ];
  }
  if (liveKind) {
    return [
      "What changed in the latest update?",
      "Show the most important live details",
      "Which sources are reporting this update?",
      "What should I watch for next?",
    ];
  }

  if (/\b(?:this|the|attached|uploaded)?\s*(?:image|photo|picture|screenshot)\b/i.test(question)) {
    return [
      "Can you explain this image in simple terms?",
      "What are the most important details in this image?",
      "What do the labels or visible elements mean?",
      "Is there anything in this image I might have missed?",
    ];
  }

  if (/^(?:h+i+|hello|hey|thanks|thank you)[!. ]*$/i.test(question.trim())) {
    return [];
  }

  const cleaned = question
    .replace(/[?!.,]+$/g, "")
    .replace(/^(what is|what are|who is|who are|how does|how do|how can|why is|why are|explain|tell me about|define)\s+/i, "")
    .trim();
  const plainAnswer = answer
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#{1,3}\s+/gm, "");
  const introductionPattern =
    /(?:^|\n)\s*(?:The\s+)?([A-Z][\p{L}.'’()-]+(?:\s+[A-Z][\p{L}.'’()-]+){1,6})\s+(?:is|was)\b/gmu;
  const answerLead = Array.from(plainAnswer.matchAll(introductionPattern))
    .map((match) => match[1].trim())
    .find(
      (subject) =>
        !/^(?:how|what|why|when|where|who)\b/i.test(subject),
    );
  const headingTopic = plainAnswer.match(
    /(?:^|\n)\s*(?:assessment|overview|summary|profile)\s+(?:of\s+)?(?:the\s+)?([^.\n]{3,80})/i,
  )?.[1]?.trim();
  const personIntroduction = plainAnswer.match(
    /(?:^|\n)\s*(?:The\s+)?([A-Z][\p{L}.'’()-]+(?:\s+[A-Z][\p{L}.'’()-]+){1,5})\s+(?:is|was)\s+(?:an?\s+)?(?:[\p{L}-]+\s+){0,4}(?:cricketer|player|athlete|politician|scientist|actor|actress|author|writer|minister|jurist|economist|artist|musician|entrepreneur|engineer|designer)\b/imu,
  )?.[1]?.trim();
  const topic =
    personIntroduction ||
    headingTopic ||
    answerLead ||
    (cleaned && cleaned.length <= 72 ? cleaned : "this topic");
  const normalizedAnswer = plainAnswer.toLowerCase();
  const suggestions: string[] = [];
  const describesOrganization =
    /\b(?:party|movement|organization|company|protest|demonstration)\b/.test(
      normalizedAnswer.slice(0, 500),
    );
  const looksLikePerson =
    Boolean(personIntroduction) ||
    (/^\s*who\s+(?:is|was)\b/i.test(question) && !describesOrganization);

  if (looksLikePerson) {
    if (/\b(?:record|centur|award|achievement|title)\w*\b/.test(normalizedAnswer)) {
      suggestions.push(`Which of ${topic}'s achievements are the most significant?`);
    }
    if (/\b(?:captain|leader|leadership|minister|served)\w*\b/.test(normalizedAnswer)) {
      suggestions.push(`How did ${topic}'s leadership role change over time?`);
    }
    if (/\b(?:club|team|ipl|league|franchise)\w*\b|\bplayed for\b/.test(normalizedAnswer)) {
      suggestions.push(`How did ${topic} perform for the teams mentioned here?`);
    }
    if (/\b(?:born|early life|childhood|education)\b/.test(normalizedAnswer)) {
      suggestions.push(`What shaped ${topic}'s early career?`);
    }
    suggestions.push(
      `What were the major turning points in ${topic}'s career?`,
      `What recent developments about ${topic} are missing from this overview?`,
    );
  } else if (/\b(?:protest|demonstration|movement)\b/.test(normalizedAnswer)) {
    const displayTopic = /^the\s+/i.test(topic) ? topic : `the ${topic}`;
    suggestions.push(
      `What concrete outcome would show that ${displayTopic} succeeded?`,
      `How have officials responded to ${displayTopic}?`,
      `Which claims about ${displayTopic} are independently verified?`,
      `What happened after ${displayTopic}?`,
    );
  } else if (/\b(?:vs\.?|versus|compare|difference)\b/i.test(question)) {
    suggestions.push(
      "Can you compare the main differences in a compact table?",
      "Which difference matters most in real-world use?",
      "What trade-offs are easy to overlook?",
      "Which option fits different types of users?",
    );
  } else {
    if (/\b(?:because|therefore|means|causes?|results? in)\b/.test(normalizedAnswer)) {
      suggestions.push("What evidence best supports the main conclusion?");
    }
    if (/\b(?:step|process|first|then|finally)\b/.test(normalizedAnswer)) {
      suggestions.push("Can you turn the process into a short checklist?");
    }
    suggestions.push(
      "Which point in this answer deserves a deeper explanation?",
      "Can you give a concrete example based on this answer?",
      "What assumptions or limitations should I know about?",
      "How would this change in a different situation?",
    );
  }

  return Array.from(new Set(suggestions)).slice(0, 4);
}

export function renderAgentMarkdown(
  message: Message,
  compact = false,
): ReactNode {
  const lines = message.content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const citationState: CitationRenderState = {
    maxVisible: 2,
    visibleCount: 0,
    renderedSourceKeys: new Set(),
  };
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const fence = trimmed.slice(0, 3);
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} className={`w-full max-w-full overflow-x-auto rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-3 py-2.5 text-xs leading-5 ${compact ? "whitespace-pre" : ""}`}><code>{codeLines.join("\n")}</code></pre>);
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1])) {
      const header = parseTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="w-full max-w-full overflow-x-auto rounded-xl border border-[var(--chat-border)]">
          <table className="w-full min-w-0 table-fixed border-collapse text-left text-xs leading-5">
            <thead className="bg-[var(--chat-surface-muted)]"><tr>{header.map((cell, cellIndex) => <th key={`th-${cellIndex}`} className={`max-w-0 break-words border-b border-[var(--chat-border)] px-3 py-2 font-semibold [overflow-wrap:anywhere] ${tableCellAlignment(cell)}`}>{renderInlineMarkdown(cell, message, citationState)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={`tr-${rowIndex}`} className="odd:bg-[var(--chat-background)] even:bg-[var(--chat-surface-muted)]/35">{header.map((_, cellIndex) => { const cell = row[cellIndex] ?? ""; return <td key={`td-${rowIndex}-${cellIndex}`} className={`max-w-0 break-words border-t border-[var(--chat-border)] px-3 py-2 align-top [overflow-wrap:anywhere] ${tableCellAlignment(cell)}`}>{renderInlineMarkdown(cell, message, citationState)}</td>; })}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const Heading = heading[1].length === 1 ? "h3" : "h4";
      blocks.push(<Heading key={`heading-${index}`} className={`font-semibold tracking-[-0.015em] ${compact ? "text-[12px] leading-5" : ""}`}>{renderInlineMarkdown(heading[2], message, citationState)}</Heading>);
      index += 1;
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const item = (ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/).exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`${orderedList ? "list-decimal" : "list-disc"} space-y-2 pl-5 marker:text-[var(--chat-accent)] ${compact ? "text-[12px]" : ""}`}>{items.map((item, itemIndex) => <li key={`item-${itemIndex}`} className={`pl-1 ${compact ? "leading-5" : "leading-7"}`}>{renderInlineMarkdown(item, message, citationState)}</li>)}</List>);
      continue;
    }

    if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} className="border-[var(--chat-border)]" />);
      index += 1;
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isStructuredMarkdownStart(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className={`w-full min-w-0 ${compact ? "max-w-full text-[12px] leading-5" : "max-w-[65ch] text-[15px] leading-7"} break-words whitespace-pre-wrap [overflow-wrap:anywhere]`}>{paragraph.map((part, partIndex) => <Fragment key={`line-${partIndex}`}>{partIndex ? <br /> : null}{renderInlineMarkdown(part, message, citationState)}</Fragment>)}</p>);
  }

  return <div className={`w-full min-w-0 max-w-full ${compact ? "space-y-3 text-[12px]" : "space-y-4 text-[15px]"}`}>{blocks}</div>;
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function tableCellAlignment(value: string): string {
  return /^[-+]?[$€£₹]?\s*\d[\d,]*(\.\d+)?\s*%?$/.test(value.trim()) ? "text-right tabular-nums" : "text-left";
}

function isStructuredMarkdownStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return /^(#{1,3})\s+/.test(line.trim()) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line) || (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1]));
}

function normalizeCitationUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function normalizeCitationMarkup(value: string): string {
  return value
    .replace(
      /[\[【]\s*Source\s+(\d+)(?:†L\d+(?:-L?\d+)?)?\s*(?:[\]】]|(?=\s|[.,;:!?]|$))/gi,
      "[$1]",
    )
    .replace(/【\s*([^】\]]+?)\s*\]\(\s*(https?:\/\/[^)\s]+)\s*\)】/gi, "[$1]($2)")
    .replace(/【\s*([^】]+?)\s*】\(\s*(https?:\/\/[^)\s]+)\s*\)/gi, "[$1]($2)")
    .replace(/\[\s*([^\]]+?)\s*\]\(\s*(https?:\/\/[^)\s]+)\s*\)】/gi, "[$1]($2)")
    .replace(/【\s*([^】]+?)\s*】/g, "[$1]");
}

function linkBareUrls(
  value: string,
  resources: MessageResource[] | undefined,
): string {
  return value.replace(/https?:\/\/[^\s<>)]+/gi, (rawUrl, offset: number, fullText: string) => {
    const before = fullText.slice(0, offset);
    // Markdown destinations are already links. Rewriting their URL would
    // create nested markup and break citation matching.
    if (before.endsWith("](")) return rawUrl;

    const punctuation = rawUrl.match(/[.,;:!?]+$/)?.[0] ?? "";
    const url = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
    const source = resources?.find(
      (item) => normalizeCitationUrl(item.url) === normalizeCitationUrl(url),
    );
    let label = source?.domain || source?.title;
    if (!label) {
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        label = "Open source";
      }
    }
    return "[" + label + "](" + (source?.url || url) + ")" + punctuation;
  });
}

interface CitationRenderState {
  maxVisible: number;
  visibleCount: number;
  renderedSourceKeys: Set<string>;
}

function appendCitation(
  parts: ReactNode[],
  citation: ReactNode,
  nextCharacter: string,
) {
  if (citation !== null) {
    parts.push(citation);
    return;
  }

  if (/^[.,;:!?]/.test(nextCharacter)) {
    const lastPartIndex = parts.length - 1;
    const lastPart = parts[lastPartIndex];
    if (typeof lastPart === "string") {
      parts[lastPartIndex] = lastPart.replace(/\s+$/, "");
    }
  }
}

function renderInlineMarkdown(
  text: string,
  message: Message,
  citationState: CitationRenderState,
): ReactNode[] {
  const normalizedText = linkBareUrls(
    normalizeCitationMarkup(text),
    message.resources,
  );
  const parts: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\[([^\]\s]+)\s+(\d+)\]|\[(\d+)\]|\[([^\]\n]{2,60})\]|\*[^*]+\*|_[^_]+_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(normalizedText)) !== null) {
    if (match.index > cursor) parts.push(normalizedText.slice(cursor, match.index));
    const token = match[0];
    if (match[2] && match[3]) {
      const sourceIndex = message.resources?.findIndex(
        (item) => normalizeCitationUrl(item.url) === normalizeCitationUrl(match![3]),
      ) ?? -1;
      const source = sourceIndex >= 0 ? message.resources?.[sourceIndex] : undefined;
      if (source) {
        const citationIndex = source.citationIndex ?? sourceIndex + 1;
        appendCitation(
          parts,
          renderCitation(
            source,
            citationIndex,
            `citation-link-${match.index}`,
            match[2] || source.domain,
            citationState,
          ),
          normalizedText[tokenPattern.lastIndex] || "",
        );
      } else {
        parts.push(<a key={`link-${match.index}`} href={match[3]} target="_blank" rel="noreferrer noopener" className="font-medium text-[var(--chat-accent)] underline decoration-[var(--chat-accent)]/40 underline-offset-2 hover:decoration-[var(--chat-accent)]">{match[2]}</a>);
      }
    } else if (match[4] && match[5]) {
      const citationIndex = Number(match[5]);
      const source = findCitationSource(message.resources, citationIndex, match[4]);
      if (!source) parts.push(token);
      else appendCitation(
        parts,
        renderCitation(source, citationIndex, `citation-domain-${match.index}`, undefined, citationState),
        normalizedText[tokenPattern.lastIndex] || "",
      );
    } else if (match[6]) {
      const citationIndex = Number(match[6]);
      const source = findCitationSource(message.resources, citationIndex);
      if (!source) parts.push(token);
      else appendCitation(
        parts,
        renderCitation(source, citationIndex, `citation-${match.index}`, undefined, citationState),
        normalizedText[tokenPattern.lastIndex] || "",
      );
    } else if (match[7]) {
      const source = findCitationSourceByLabel(message.resources, match[7]);
      if (!source) {
        parts.push(token);
      } else {
        const sourceIndex = message.resources?.indexOf(source) ?? -1;
        const citationIndex = source.citationIndex ?? sourceIndex + 1;
        appendCitation(
          parts,
          renderCitation(source, citationIndex, `citation-label-${match.index}`, match[7], citationState),
          normalizedText[tokenPattern.lastIndex] || "",
        );
      }
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={`inline-code-${match.index}`} className="rounded bg-[var(--chat-surface-muted)] px-1.5 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={`em-${match.index}`}>{token.slice(1, -1)}</em>);
    }
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < normalizedText.length) parts.push(normalizedText.slice(cursor));
  return parts;
}

function citationLabelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\b(source|official site)\b/g, "")
    .replace(/\d+$/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function findCitationSourceByLabel(
  resources: MessageResource[] | undefined,
  label: string,
): MessageResource | undefined {
  if (!resources?.length) return undefined;
  const labelKey = citationLabelKey(label);
  if (labelKey.length < 3) return undefined;

  return resources.find((item) => {
    const candidates = [
      item.domain,
      item.title,
      item.providerLabel,
      item.verification?.label,
    ].filter((value): value is string => Boolean(value));

    return candidates.some((candidate) => {
      const candidateKey = citationLabelKey(candidate);
      return candidateKey === labelKey
        || candidateKey.includes(labelKey)
        || (candidateKey.length >= 5 && labelKey.includes(candidateKey));
    });
  });
}

function findCitationSource(resources: MessageResource[] | undefined, citationIndex: number, domain?: string): MessageResource | undefined {
  if (!resources?.length) return undefined;
  const byIndex = resources.find((item) => item.citationIndex === citationIndex);
  if (byIndex) return byIndex;
  if (domain) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
    const byDomain = resources.find((item) => {
      const itemDomain = item.domain.toLowerCase().replace(/^www\./, "");
      if (itemDomain === normalizedDomain) return true;
      try {
        return new URL(item.url).hostname.replace(/^www\./, "").toLowerCase() === normalizedDomain;
      } catch {
        return false;
      }
    });
    if (byDomain) return byDomain;
  }
  return resources[citationIndex - 1];
}

function renderCitation(
  source: MessageResource,
  citationIndex: number,
  key: string,
  label?: string,
  citationState?: CitationRenderState,
): ReactNode {
  const sourceKey = source.canonicalUrl || normalizeCitationUrl(source.url) || `${source.domain}:${citationIndex}`;
  if (citationState) {
    if (
      citationState.renderedSourceKeys.has(sourceKey)
      || citationState.visibleCount >= citationState.maxVisible
    ) {
      return null;
    }
    citationState.renderedSourceKeys.add(sourceKey);
    citationState.visibleCount += 1;
  }

  return (
    <InlineCitation key={key}>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          index={citationIndex}
          label={label || source.domain}
          url={source.url}
          domain={source.domain}
          faviconUrl={source.faviconUrl}
          trustScore={source.trustScore}
          verification={source.verification}
        />
        <InlineCitationCardBody>
          <InlineCitationSource
            title={source.title}
            url={source.url}
            description={source.description}
            quote={source.quote}
            verification={source.verification}
            trustScore={source.trustScore}
            confidenceScore={source.confidenceScore}
            evidenceRole={source.evidenceRole}
            reasonUsed={source.reasonUsed}
            freshness={source.freshness}
            crossVerification={source.crossVerification}
          />
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}

function InlineMessageEditor({
  value,
  disabled,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 64), 240)}px`;
  }, []);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 64), 240)}px`;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor="inline-message-editor" className="sr-only">
        Edit your question
      </label>
      <textarea
        ref={textareaRef}
        id="inline-message-editor"
        value={value}
        rows={2}
        onChange={(event) => {
          onChange(event.target.value);
          resizeTextarea();
        }}
        onKeyDown={handleKeyDown}
        className="min-h-16 w-full resize-none overflow-y-auto bg-transparent px-1 text-[16px] leading-6 text-[var(--chat-user-foreground)] outline-none placeholder:text-[var(--chat-user-foreground)]/55 sm:text-[15px]"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--chat-user-foreground)]/75 transition-colors duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-user-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:min-h-9"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--chat-accent)] px-5 text-sm font-semibold text-[var(--chat-accent-foreground)] transition-[background-color,filter,transform] duration-150 hover:bg-[var(--chat-accent-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:min-h-9"
        >
          Send
        </button>
      </div>
    </form>
  );
}

function MessageActionButton({
  label,
  children,
  onClick,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            aria-pressed={pressed}
            className={`flex size-11 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:size-8 ${
              pressed
                ? "bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]"
                : "text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)]"
            }`}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

function AnswerSourcesButton({ resources, onClick }: { resources: MessageResource[]; onClick: () => void }) {
  const visibleResources = resources.filter((resource) => /^https?:\/\//i.test(resource.url));
  const sourceCount = visibleResources.length || resources.length;
  const label = visibleResources.length
    ? `View ${visibleResources.length} source${visibleResources.length === 1 ? "" : "s"} used in this answer`
    : "View source information";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:min-h-8"
          />
        }
      >
        {visibleResources.length ? (
          <span className="flex -space-x-1" aria-hidden="true">
            {visibleResources.slice(0, 3).map((source) => (
              <span key={source.url} className="flex size-4 items-center justify-center overflow-hidden rounded-full border border-[var(--chat-surface)] bg-[var(--chat-background)]">
                <SiteFavicon url={source.url} domain={source.domain} className="size-3.5 rounded-full" />
              </span>
            ))}
          </span>
        ) : (
          <Globe2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
        )}
        {sourceCount ? `${sourceCount} source${sourceCount === 1 ? "" : "s"}` : "Sources"}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

function MessageOverflowMenu({ message, onReport }: { message: Message; onReport: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="More actions"
            className="group/more relative flex size-11 items-center justify-center rounded-full text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:size-8"
          />
        }
      >
        <Ellipsis className="size-4" strokeWidth={1.8} aria-hidden="true" />
        <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md bg-[var(--chat-foreground)] px-3 py-1.5 text-xs text-[var(--chat-background)] opacity-0 transition-opacity duration-150 group-hover/more:opacity-100 group-focus-visible/more:opacity-100">
          More actions
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-36 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 text-[var(--chat-foreground)]">
        <DropdownMenuItem onClick={onReport} className="min-h-10 gap-2 rounded-lg px-2.5">
          <Flag className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {message.reported ? "Reported" : "Report"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
