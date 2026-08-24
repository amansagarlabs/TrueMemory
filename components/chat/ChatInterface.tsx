"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Plug,
  Plus,
  Presentation,
  Search,
  Share2,
  Sparkles,
  ListOrdered,
  RotateCcw,
  ScanText,
  Webhook,
  Trash2,
  X,
} from "lucide-react";
import MessageList from "@/components/chat/MessageList";
import { DocumentPreviewDialog } from "@/components/chat/DocumentPreviewDialog";
import {
  SourceExplorerOverview,
  SourceIntelligenceCard,
} from "@/components/chat/SourceIntelligence";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Message,
  Model,
  MODELS,
  type ChatActivity,
  type MessageReplyReference,
} from "@/components/chat/types";
import {
  CHAT_PROMPT_NAV_UPDATE_EVENT,
  type ChatPromptNavItem,
} from "@/components/chat/chat-prompt-nav";
import type {
  AuthProject,
  ChatMode,
  PipelineEvent,
  PipelineStepId,
  QueryConfirmationRequest,
  QueryExecutionPlan,
  QueryRouteDecision,
  QuerySource,
  UploadResponse,
} from "@/lib/types";
import {
  clearDocument,
  clearPipelineSteps,
  getOrCreateConversationId,
  loadDocument,
  loadPipelineSteps,
  resetConversationId,
  saveDocument,
  savePipelineSteps,
  setConversationId,
} from "@/lib/storage";
import {
  checkBackendHealth,
  fetchContextPreview,
  fetchConversationMessages,
  isRuntimeQuestion,
  streamChat,
  submitMessageFeedback,
  uploadPdf,
  visualizePipeline,
  type ContextPreview,
} from "@/services/api";
import { generateImage as generateImageFromPrompt } from "@/services/image-generation";
import { fetchRecentArtifacts, type ArtifactItem } from "@/services/dashboard";
import {
  fetchAgentSkills,
  loadEnabledAgentSkills,
  saveEnabledAgentSkills,
  type AgentSkill,
} from "@/services/agent-skills";
import { toast } from "sonner";
import { loadAuthUser } from "@/lib/auth";
import { loadActiveWorkspaceId, saveActiveWorkspaceId } from "@/lib/workspaces";
import {
  ACTIVE_PROJECT_CHANGED_EVENT,
  loadActiveProjectId,
  saveActiveProjectId,
} from "@/lib/active-project";
import { fetchProjects } from "@/services/projects";
import { fetchWorkspaces } from "@/services/workspaces";
import { fetchGithubRepositories } from "@/services/github";
import { ProjectSelector } from "@/components/chat/ProjectSelector";
import { ProjectCreateDialog } from "@/components/chat/ProjectCreateDialog";
import {
  CHAT_NEW_EVENT,
  CHAT_OPEN_EVENT,
  CHAT_RECENTS_CHANGED_EVENT,
} from "@/components/chat-app-sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoadingCarousel, { type Tip as LoadingTip } from "@/components/ui/loading-carousel";
import { PaperDither } from "@/components/ui/paper-dither";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useImageOcr,
  type ImageOcrAttachment,
} from "@/hooks/use-image-ocr";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SUGGESTIONS = [
  {
    label: "Summarize a PDF",
    prompt: "Summarize this file for me",
  },
  {
    label: "Explain this",
    prompt: "What is this file about?",
  },
  {
    label: "Extract key points",
    prompt: "List the key points from the document",
  },
  {
    label: "Simplify the language",
    prompt: "Give me a short explanation in simple words",
  },
];

type ContextMentionStage =
  | "root"
  | "artifacts"
  | "projects"
  | "files"
  | "documents"
  | "resources"
  | "github_repositories"
  | "skills"
  | "connectors"
  | "memory";

type ContextResourceKind =
  | "memory" | "workspace" | "project" | "agent" | "file" | "connector"
  | "web" | "skill" | "mcp_server" | "github_repository" | "document" | "api" | "database"
  | "skills" | "connectors";

type ContextMentionOption = {
  id: string;
  label: string;
  description: string;
  brandIcon?: string;
  domain?: string;
  kind?: ContextResourceKind;
};

type SelectedContextMention = ContextMentionOption & {
  kind: ContextResourceKind;
};

const CONNECTOR_MENTION_OPTIONS: ContextMentionOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "Mention the connected OpenAI provider",
    brandIcon: "openai",
    domain: "openai.com",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Mention the connected Anthropic provider",
    brandIcon: "anthropic",
    domain: "anthropic.com",
  },
  {
    id: "google",
    label: "Google AI",
    description: "Mention the connected Google AI provider",
    brandIcon: "google",
    domain: "google.com",
  },
  {
    id: "notion",
    label: "Notion",
    description: "Mention workspace documentation",
    brandIcon: "notion",
    domain: "notion.so",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Mention connected team conversations",
    brandIcon: "slack",
    domain: "slack.com",
  },
  {
    id: "pinecone",
    label: "Pinecone",
    description: "Mention connected vector index context",
    brandIcon: "pinecone",
    domain: "pinecone.io",
  },
  {
    id: "weaviate",
    label: "Weaviate",
    description: "Mention connected vector search context",
    brandIcon: "weaviate",
    domain: "weaviate.io",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Mention repository and issue context",
    brandIcon: "github",
    domain: "github.com",
  },
  {
    id: "webhook",
    label: "Custom webhook",
    description: "Mention the configured webhook connection",
  },
];

const MEMORY_MENTION_OPTIONS: ContextMentionOption[] = [
  { id: "conversation-memory", label: "Conversation memory", description: "Use relevant messages from this chat" },
  { id: "profile-memory", label: "Profile memory", description: "Use saved preferences and profile facts" },
  { id: "workspace-memory", label: "Workspace knowledge", description: "Use curated workspace knowledge" },
];

const RESOURCE_MENTION_OPTIONS: ContextMentionOption[] = [
  { id: "web", kind: "web", label: "Web", description: "Current public web sources with citations" },
  { id: "current-workspace", kind: "workspace", label: "Current workspace", description: "Workspace resources and graph nodes" },
  { id: "active-agents", kind: "agent", label: "Agents", description: "Available agent capabilities and state" },
  { id: "workspace-files", kind: "file", label: "Files", description: "Files indexed in this workspace" },
  { id: "documents", kind: "document", label: "Documents", description: "Indexed document content" },
  { id: "github-repositories", kind: "github_repository", label: "GitHub repositories", description: "Connected repositories, issues, and code" },
  { id: "mcp-servers", kind: "mcp_server", label: "MCP servers", description: "Tools and resources exposed by MCP" },
  { id: "connected-apis", kind: "api", label: "APIs", description: "Connected API schemas and responses" },
  { id: "connected-databases", kind: "database", label: "Databases", description: "Connected schemas and authorized records" },
];

const ROOT_MENTION_STAGES: Exclude<ContextMentionStage, "root">[] = [
  "artifacts",
  "projects",
  "resources",
  "skills",
  "connectors",
  "memory",
];

const DEFAULT_CHAT_GUIDANCE =
  "Ask anything, or upload a file, image, or link for hybrid document, web, and model-aware answers.";

const PROCESSING_TIPS: LoadingTip[] = [
  {
    text: "Reading the document while preserving headings and page structure.",
    visual: <FileText className="size-12" strokeWidth={1.35} aria-hidden="true" />,
  },
  {
    text: "Splitting the source into searchable, context-rich sections.",
    visual: <Search className="size-12" strokeWidth={1.35} aria-hidden="true" />,
  },
  {
    text: "Connecting this source to your workspace memory.",
    visual: <BrainCircuit className="size-12" strokeWidth={1.35} aria-hidden="true" />,
  },
  {
    text: "Preparing grounded answers with inspectable citations.",
    visual: <Check className="size-12" strokeWidth={1.35} aria-hidden="true" />,
  },
];

type AttachmentStatus = "uploading" | "processing" | "uploaded" | "error";

type Attachment = {
  id: string;
  name: string;
  status: AttachmentStatus;
  detail?: string;
  file?: File;
};

type PastedTextDocument = {
  id: string;
  name: string;
  content: string;
  file: File;
};

const LONG_PASTE_CHARACTER_THRESHOLD = 1600;
const LONG_PASTE_LINE_THRESHOLD = 12;

type BackendState = {
  backendOk: boolean | null;
  zillizOk: boolean | null;
  openrouterOk: boolean | null;
  postgresOk: boolean | null;
  postgresMode: string;
  postgresDatabase: string;
  postgresHost: string;
};

type ServiceTone = "neutral" | "success" | "warning" | "error";

type ServiceItem = {
  label: string;
  value: string;
  tone: ServiceTone;
};

type SourceItem = {
  id: string;
  title: string;
  domain: string;
  description: string;
  quote?: string | null;
  url?: string;
  sourceType: string;
  providerLabel?: string;
  citationIndex?: number | null;
  canonicalUrl?: string | null;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  verification?: QuerySource["verification"];
  trustScore?: number | null;
  trustLabel?: QuerySource["trust_label"];
  trustComponents?: Record<string, number>;
  trustExplanation?: string | null;
  confidenceScore?: number | null;
  confidenceLabel?: QuerySource["confidence_label"];
  confidenceComponents?: Record<string, number>;
  confidenceExplanation?: string | null;
  evidenceRole?: QuerySource["evidence_role"];
  reasonUsed?: string | null;
  influenceScore?: number | null;
  freshness?: QuerySource["freshness"];
  crossVerification?: QuerySource["cross_verification"];
  scoreVersion?: string | null;
};

type ResourceCandidate = {
  title: string;
  url: string;
  sourceType: string;
  domain: string;
  description?: string;
  quote?: string | null;
  imageUrl?: string | null;
  imageLandingUrl?: string | null;
  imageAttribution?: string | null;
  imageLicense?: string | null;
  imageProvider?: string | null;
  citationIndex?: number | null;
  providerLabel?: string;
  canonicalUrl?: string | null;
  faviconUrl?: string | null;
  verification?: QuerySource["verification"];
  trustScore?: number | null;
  trustLabel?: QuerySource["trust_label"];
  trustComponents?: Record<string, number>;
  trustExplanation?: string | null;
  confidenceScore?: number | null;
  confidenceLabel?: QuerySource["confidence_label"];
  confidenceComponents?: Record<string, number>;
  confidenceExplanation?: string | null;
  evidenceRole?: QuerySource["evidence_role"];
  reasonUsed?: string | null;
  influenceScore?: number | null;
  freshness?: QuerySource["freshness"];
  crossVerification?: QuerySource["cross_verification"];
  contentHash?: string | null;
  language?: string | null;
  license?: string | null;
  scoreVersion?: string | null;
};

type StreamResourceCandidate = {
  title: string;
  url: string;
  domain?: string;
  content?: string;
  snippet?: string;
  quote?: string | null;
  image_url?: string | null;
  image_landing_url?: string | null;
  image_attribution?: string | null;
  image_license?: string | null;
  image_provider?: string | null;
  source_type?: string;
  provider?: string | null;
  provider_label?: string | null;
  citation_index?: number | null;
  canonical_url?: string | null;
  favicon_url?: string | null;
  verification?: QuerySource["verification"];
  trust_score?: number | null;
  trust_label?: QuerySource["trust_label"];
  trust_components?: Record<string, number>;
  trust_explanation?: string | null;
  confidence_score?: number | null;
  confidence_label?: QuerySource["confidence_label"];
  confidence_components?: Record<string, number>;
  confidence_explanation?: string | null;
  evidence_role?: QuerySource["evidence_role"];
  reason_used?: string | null;
  influence_score?: number | null;
  freshness?: QuerySource["freshness"];
  cross_verification?: QuerySource["cross_verification"];
  content_hash?: string | null;
  language?: string | null;
  license?: string | null;
  score_version?: string | null;
};

function normalizeResourceCandidates(
  eventSources: StreamResourceCandidate[] | undefined,
): ResourceCandidate[] {
  const seen = new Set<string>();
  const resources: ResourceCandidate[] = [];

  for (const source of eventSources ?? []) {
    if (!source?.url || seen.has(source.url)) continue;
    seen.add(source.url);
    let domain = source.domain || source.url;
    try {
      domain = new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      domain = source.url;
    }
    resources.push({
      title: source.title || source.url,
      url: source.url,
      domain,
      sourceType:
        source.provider === "hybrid"
          ? "Hybrid knowledge"
          : source.source_type === "scrape"
            ? "Web page"
            : source.source_type === "crawl"
              ? "Crawled page"
              : "Web source",
      description: source.content?.trim() || source.snippet?.trim() || undefined,
      quote: source.quote?.trim() || source.snippet?.trim() || undefined,
      imageUrl: source.image_url,
      imageLandingUrl: source.image_landing_url,
      imageAttribution: source.image_attribution,
      imageLicense: source.image_license,
      imageProvider: source.image_provider,
      citationIndex: source.citation_index,
      providerLabel: source.provider_label ?? (source.provider === "hybrid" ? "Dense + BM25" : undefined),
      canonicalUrl: source.canonical_url,
      faviconUrl: source.favicon_url,
      verification: source.verification,
      trustScore: source.trust_score,
      trustLabel: source.trust_label,
      trustComponents: source.trust_components,
      trustExplanation: source.trust_explanation,
      confidenceScore: source.confidence_score,
      confidenceLabel: source.confidence_label,
      confidenceComponents: source.confidence_components,
      confidenceExplanation: source.confidence_explanation,
      evidenceRole: source.evidence_role,
      reasonUsed: source.reason_used,
      influenceScore: source.influence_score,
      freshness: source.freshness,
      crossVerification: source.cross_verification,
      contentHash: source.content_hash,
      language: source.language,
      license: source.license,
      scoreVersion: source.score_version,
    });
  }

  return resources;
}

function mergeAnswerSources(
  webSources: StreamResourceCandidate[] | undefined,
  knowledgeSources: StreamResourceCandidate[] | undefined,
): StreamResourceCandidate[] {
  const seen = new Set<string>();
  const merged: StreamResourceCandidate[] = [];
  const externalKnowledge = (knowledgeSources ?? []).filter((source) => /^https?:\/\//i.test(source.url));

  for (const source of [...(webSources ?? []), ...externalKnowledge]) {
    const key = source.url.replace(/\/$/, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...source, citation_index: merged.length + 1 });
  }

  return merged;
}

function querySourceIdentity(source: QuerySource): string {
  if (source.provider === "hybrid" || !/^https?:\/\//i.test(source.url)) {
    return `context:${source.title.trim().toLowerCase()}`;
  }

  try {
    const url = new URL(source.url);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return `${source.domain}:${source.title}`.trim().toLowerCase();
  }
}

function dedupeQuerySources(sources: QuerySource[]): QuerySource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = querySourceIdentity(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalSourceUrl(value?: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid", "ref_src", "ref_url"].includes(
          key.toLowerCase(),
        )
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

function inferAnswerSourceUsage(items: SourceItem[], answer: string): SourceItem[] {
  const byUrl = new Map<string, SourceItem>();
  const byIndex = new Map<number, SourceItem>();
  for (const item of items) {
    for (const value of [item.canonicalUrl, item.url]) {
      const canonical = canonicalSourceUrl(value);
      if (canonical) byUrl.set(canonical, item);
    }
    if (item.citationIndex != null) byIndex.set(item.citationIndex, item);
  }

  const referencedIds: string[] = [];
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  for (const match of answer.matchAll(markdownLinkPattern)) {
    const label = match[1];
    const labelIndex = label.match(/(?:^|\s)(\d+)\s*$/);
    const source =
      byUrl.get(canonicalSourceUrl(match[2])) ||
      (labelIndex ? byIndex.get(Number(labelIndex[1])) : undefined);
    if (source) referencedIds.push(source.id);
  }

  for (const match of answer.matchAll(
    /[\[【]\s*Source\s+(\d+)(?:†L\d+(?:-L?\d+)?)?\s*(?:[\]】]|(?=\s|[.,;:!?]|$))/gi,
  )) {
    const source = byIndex.get(Number(match[1]));
    if (source) referencedIds.push(source.id);
  }

  for (const match of answer.matchAll(/\[(?![^\]]*†)[^\]]*?(\d+)\](?!\()/g)) {
    const source = byIndex.get(Number(match[1]));
    if (source) referencedIds.push(source.id);
  }

  if (!referencedIds.length) return items;

  const counts = new Map<string, number>();
  for (const id of referencedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const firstId = referencedIds[0];

  return items.map((item) => {
    const count = counts.get(item.id) ?? 0;
    if (!count) {
      return {
        ...item,
        evidenceRole: "background",
        influenceScore: 0,
        reasonUsed: "Reviewed for context but not cited in the answer.",
      };
    }
    const role = item.id === firstId ? "primary" : "supporting";
    return {
      ...item,
      evidenceRole: role,
      influenceScore: count / referencedIds.length,
      reasonUsed:
        role === "primary"
          ? "Used as a main source for this answer."
          : "Used to support a claim in this answer.",
    };
  });
}

type PendingToolConfirmation = QueryConfirmationRequest & {
  question: string;
  replyTo: MessageReplyReference | null;
  mode: ChatMode | null;
  attachmentContext: string;
  imageAttachments: NonNullable<Message["imageAttachments"]>;
  fastMode: boolean;
};

type RetryRequest = {
  question: string;
  assistantMessageId: number;
  replyTo: MessageReplyReference | null;
  chatMode: ChatMode | null;
  attachmentContext: string;
  imageAttachments: NonNullable<Message["imageAttachments"]>;
  fastMode: boolean;
};

type QueuedPrompt = {
  id: string;
  question: string;
  replyTo: MessageReplyReference | null;
  chatMode: ChatMode | null;
  fastMode: boolean;
  model: Model;
};

type QuickActionIconKind = "paperclip" | "spark" | "search" | "globe" | "image" | "camera" | "plug" | "share";

type QuickAction = {
  id: "photos" | "attach" | "screenshot" | "connector" | "image" | ChatMode;
  label: string;
  icon: QuickActionIconKind;
};

type ReportReason = "incorrect" | "unhelpful" | "unsafe" | "citation" | "missing_context" | "wrong_web" | "forgot_memory" | "wrong_memory" | "other";

const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "incorrect", label: "Incorrect information" },
  { value: "unhelpful", label: "Not relevant or helpful" },
  { value: "citation", label: "Citation or source problem" },
  { value: "missing_context", label: "Missing context" },
  { value: "wrong_web", label: "Wrongly used web search" },
  { value: "forgot_memory", label: "Forgot saved memory" },
  { value: "wrong_memory", label: "Retrieved wrong memory" },
  { value: "unsafe", label: "Unsafe or inappropriate" },
  { value: "other", label: "Something else" },
];

const CHAT_MODES: Record<ChatMode, Omit<QuickAction, "id">> = {
  thinking: { label: "Thinking", icon: "spark" },
  "deep-research": { label: "Deep research", icon: "search" },
  "web-search": { label: "Web search", icon: "globe" },
};

// Temporarily hidden until a no-login image provider is available.
const IMAGE_GENERATION_ENABLED = false;

const QUICK_ACTIONS: QuickAction[] = [
  { id: "photos", label: "Add photos", icon: "image" },
  { id: "attach", label: "Attach files", icon: "paperclip" },
  { id: "screenshot", label: "Take a screenshot", icon: "camera" },
  { id: "connector", label: "Connectors", icon: "share" },
  ...(IMAGE_GENERATION_ENABLED
    ? [{ id: "image" as const, label: "Generate an image", icon: "image" as const }]
    : []),
  ...Object.entries(CHAT_MODES).map(([id, mode]) => ({
    id: id as ChatMode,
    ...mode,
  })),
];

const SUMMARY_PROMPT_PATTERN =
  /\b(summarize|summary|summarise|what is this pdf about|explain this pdf)\b/i;
const WEAK_ANSWER_PATTERN =
  /^(i don't know|i do not know|not enough information|no useful answer|i could not find a useful answer)/i;

const CHAT_ACTIVITY_COPY: Record<ChatActivity["kind"], Omit<ChatActivity, "kind">> = {
  routing: {
    label: "Understanding your request",
    detail: "Choosing the right context and tools",
  },
  memory: {
    label: "Checking conversation context",
    detail: "Looking through recent messages and saved memory",
  },
  document: {
    label: "Reading your document",
    detail: "Finding the most relevant passages",
  },
  image: {
    label: "Analyzing your image",
    detail: "Inspecting the visible objects, layout, and details",
  },
  web: {
    label: "Searching the web",
    detail: "Finding current, reliable sources",
  },
  sources: {
    label: "Reviewing sources",
    detail: "Checking relevance, recency, and support",
  },
  answer: {
    label: "Preparing your answer",
    detail: "Organizing the useful details",
  },
};

function chatActivity(kind: ChatActivity["kind"]): ChatActivity {
  return { kind, ...CHAT_ACTIVITY_COPY[kind] };
}

function activityFromStatus(
  stage: import("@/lib/types").ChatStreamEvent["stage"],
  message: string,
): ChatActivity {
  if (stage) return chatActivity(stage);

  const normalized = message.toLowerCase();
  if (normalized.includes("image") || normalized.includes("visual")) {
    return chatActivity("image");
  }
  if (normalized.includes("web")) return chatActivity("web");
  if (normalized.includes("source")) return chatActivity("sources");
  if (normalized.includes("artifact") || normalized.includes("document")) {
    return chatActivity("document");
  }
  if (normalized.includes("memory") || normalized.includes("conversation")) {
    return chatActivity("memory");
  }
  if (normalized.includes("answer") || normalized.includes("generat")) {
    return chatActivity("answer");
  }
  return chatActivity("routing");
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [projects, setProjects] = useState<AuthProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [activeWorkspaceName, setActiveWorkspaceName] = useState("");
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ChatMode | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [chatActivityState, setChatActivityState] = useState<ChatActivity | null>(null);
  const [queryRoute, setQueryRoute] = useState<QueryRouteDecision | null>(null);
  const [queryPlan, setQueryPlan] = useState<QueryExecutionPlan | null>(null);
  const [querySources, setQuerySources] = useState<QuerySource[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingToolConfirmation | null>(null);
  // Tool approvals are remembered for this page session so an approved agent
  // can continue working without interrupting every subsequent question.
  const [approvedToolCalls, setApprovedToolCalls] = useState<string[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [sharedMessageId, setSharedMessageId] = useState<number | null>(null);
  const [reportMessage, setReportMessage] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("incorrect");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportReasonOpen, setReportReasonOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [artifactMentionOpen, setArtifactMentionOpen] = useState(false);
  const [artifactMentionStage, setArtifactMentionStage] =
    useState<ContextMentionStage>("root");
  const [artifactMentionIndex, setArtifactMentionIndex] = useState(0);
  const [mentionSearch, setMentionSearch] = useState("");
  const [artifactOptions, setArtifactOptions] = useState<ArtifactItem[]>([]);
  const [artifactOptionsLoaded, setArtifactOptionsLoaded] = useState(false);
  const [artifactOptionsLoading, setArtifactOptionsLoading] = useState(false);
  const [artifactOptionsError, setArtifactOptionsError] = useState<string | null>(null);
  const [githubMentionOptions, setGithubMentionOptions] = useState<ContextMentionOption[]>([]);
  const [githubMentionLoading, setGithubMentionLoading] = useState(false);
  const [githubMentionError, setGithubMentionError] = useState<string | null>(null);
  const [skillMentionOptions, setSkillMentionOptions] = useState<AgentSkill[]>([]);
  const [skillMentionLoading, setSkillMentionLoading] = useState(false);
  const [selectedContextMentions, setSelectedContextMentions] = useState<
    SelectedContextMention[]
  >([]);
  const [previewRailOverflow, setPreviewRailOverflow] = useState(false);
  const [composerRailOverflow, setComposerRailOverflow] = useState(false);
  const [composerCanScrollLeft, setComposerCanScrollLeft] = useState(false);
  const [composerCanScrollRight, setComposerCanScrollRight] = useState(false);
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [imageModeSelected, setImageModeSelected] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [documentPreviewFile, setDocumentPreviewFile] = useState<File | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [pastedTextDocument, setPastedTextDocument] = useState<PastedTextDocument | null>(null);
  const [composerHeight, setComposerHeight] = useState(28);
  const [uploadedDocument, setUploadedDocument] = useState<UploadResponse | null>(() =>
    loadDocument(),
  );
  const [artifactCommitted, setArtifactCommitted] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStepId>>(() =>
    loadPipelineSteps(),
  );
  const [backendState, setBackendState] = useState<BackendState>({
    backendOk: null,
    zillizOk: null,
    openrouterOk: null,
    postgresOk: null,
    postgresMode: "local",
    postgresDatabase: "",
    postgresHost: "",
  });
  const [typing, setTyping] = useState(false);
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [manualStatusMessage, setManualStatusMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<Message | null>(null);
  const [messageResources, setMessageResources] = useState<Record<number, SourceItem[]>>({});
  const {
    images: ocrImages,
    addImages: addOcrImages,
    removeImage: removeOcrImage,
    clearImages: clearOcrImages,
    isReading: ocrIsReading,
    readyImages: readyOcrImages,
  } = useImageOcr(setInlineError);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerScrollRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const quickMenuButtonRef = useRef<HTMLButtonElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const previewMentionsRailRef = useRef<HTMLDivElement>(null);
  const composerMentionsRailRef = useRef<HTMLDivElement>(null);
  const composerRailDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const artifactMentionMenuRef = useRef<HTMLDivElement>(null);
  const queryAbortRef = useRef<AbortController | null>(null);
  const promptQueueRef = useRef<QueuedPrompt[]>([]);
  const dispatchNextQueuedPromptRef = useRef<() => void>(() => undefined);
  const openConversationRef = useRef<(conversationId: string) => Promise<void>>(async () => undefined);
  const serviceMenuRef = useRef<HTMLDivElement>(null);
  const serviceMenuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    const authUser = loadAuthUser();
    if (!authUser) {
      window.queueMicrotask(() => setProjectsLoading(false));
      return;
    }
    let active = true;
    void fetchWorkspaces()
      .then((workspaces) => {
        if (!active) return;
        const requestedWorkspaceId = loadActiveWorkspaceId(authUser.id);
        const workspaceId = workspaces.some((item) => item.id === requestedWorkspaceId)
          ? requestedWorkspaceId
          : workspaces[0]?.id || "";
        setActiveWorkspaceId(workspaceId);
        if (!workspaceId) return undefined;
        setActiveWorkspaceName(workspaces.find((item) => item.id === workspaceId)?.name || "");
        saveActiveWorkspaceId(authUser.id, workspaceId);
        const urlProjectId = new URLSearchParams(window.location.search).get("project");
        const requestedProjectId = urlProjectId || loadActiveProjectId(authUser.id, workspaceId);
        return fetchProjects(workspaceId).then((items) => ({ items, workspaceId, requestedProjectId }));
      })
      .then((result) => {
        if (!active || !result) return;
        const { items, workspaceId, requestedProjectId } = result;
        setActiveWorkspaceId(workspaceId);
        setProjects(items);
        const nextId = items.some((item) => item.id === requestedProjectId) ? requestedProjectId : "";
        setActiveProjectId(nextId);
        saveActiveProjectId(authUser.id, workspaceId, nextId || null);
      })
      .catch(() => {
        if (active) setProjects([]);
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrated]);

  useEffect(() => {
    void fetchAgentSkills().then(setSkillMentionOptions).catch(() => setSkillMentionOptions([]));
  }, []);

  useEffect(() => {
    function handleActiveProjectChanged(event: Event) {
      const detail = (event as CustomEvent<{
        userId?: string;
        workspaceId?: string;
        projectId?: string | null;
      }>).detail;
      const authUser = loadAuthUser();
      if (!authUser) return;
      const workspaceId = loadActiveWorkspaceId(authUser.id);
      if (!workspaceId) return;
      if (detail?.userId && detail.userId !== authUser.id) return;
      if (detail?.workspaceId && detail.workspaceId !== workspaceId) return;

      const nextId = detail?.projectId || "";
      setActiveProjectId(nextId);
      window.dispatchEvent(new CustomEvent(CHAT_RECENTS_CHANGED_EVENT));
      const url = new URL(window.location.href);
      if (nextId) url.searchParams.set("project", nextId);
      else url.searchParams.delete("project");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setMessages([]);
      clearPromptQueue();
      setCurrentConversationId(null);
      resetConversationId();
      setFastMode(false);
    }

    window.addEventListener(ACTIVE_PROJECT_CHANGED_EVENT, handleActiveProjectChanged);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGED_EVENT, handleActiveProjectChanged);
    };
  }, []);

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  function selectActiveProject(project: AuthProject | null) {
    const authUser = loadAuthUser();
    if (!authUser) return;
    const workspaceId = loadActiveWorkspaceId(authUser.id);
    if (!workspaceId) return;
    const nextId = project?.id ?? "";
    setActiveProjectId(nextId);
    saveActiveProjectId(authUser.id, workspaceId, nextId || null);
    window.dispatchEvent(new CustomEvent(CHAT_RECENTS_CHANGED_EVENT));
    const url = new URL(window.location.href);
    if (nextId) url.searchParams.set("project", nextId);
    else url.searchParams.delete("project");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setMessages([]);
    clearPromptQueue();
    setCurrentConversationId(null);
    resetConversationId();
    setFastMode(false);
  }
  const uploadJobRef = useRef(0);
  const messageSequenceRef = useRef(0);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const shareFeedbackTimerRef = useRef<number | null>(null);
  const shouldFollowThreadRef = useRef(true);
  const isScrollingToLatestRef = useRef(false);
  const isRestoringConversationRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const visibleDocument = hydrated ? uploadedDocument : null;
  const visibleCompletedSteps = hydrated ? completedSteps : new Set<PipelineStepId>();
  const pipelineReady =
    visibleCompletedSteps.has("ready") || visibleCompletedSteps.has("milvus");
  const processingOpen = Boolean(
    attachment &&
      (attachment.status === "uploading" || attachment.status === "processing") &&
      !pipelineReady,
  );
  const hasMessages = messages.length > 0;
  useEffect(() => {
    promptQueueRef.current = promptQueue;
  }, [promptQueue]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prompts: ChatPromptNavItem[] = messages
      .map((message, messageIndex) => ({ message, messageIndex }))
      .filter(({ message }) => message.role === "user")
      .reverse()
      .map(({ message, messageIndex }) => ({
        id: message.id,
        title: message.content.replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled prompt",
        href: `#chat-message-${message.serverId ?? `${message.id}-${messageIndex}`}`,
      }));

    window.dispatchEvent(
      new CustomEvent<ChatPromptNavItem[]>(CHAT_PROMPT_NAV_UPDATE_EVENT, {
        detail: prompts,
      }),
    );
  }, [messages]);

  const artifactServiceItem: ServiceItem | null = visibleDocument
    ? {
        label: "Artifact",
        value: visibleDocument.filename,
        tone: pipelineReady ? "success" : "neutral",
      }
    : null;
  const serviceItems: ServiceItem[] = [
    {
      label: "Backend",
      value:
        backendState.backendOk === null
          ? "Initializing"
          : backendState.backendOk
            ? "Connected"
            : "Offline",
      tone:
        backendState.backendOk === null
          ? "neutral"
          : backendState.backendOk
            ? "success"
            : "error",
    },
    {
      label: "Database",
      value:
        backendState.postgresOk === null
          ? "Checking"
          : backendState.postgresOk
            ? `${backendState.postgresMode} · ${backendState.postgresDatabase || "connected"}`
            : "Disconnected",
      tone:
        backendState.postgresOk === null
          ? "neutral"
          : backendState.postgresOk
            ? "success"
            : "error",
    },
    {
      label: "Milvus",
      value:
        backendState.zillizOk === null
          ? "Checking"
          : backendState.zillizOk
            ? "Configured"
            : "Missing",
      tone:
        backendState.zillizOk === null
          ? "neutral"
          : backendState.zillizOk
            ? "success"
            : "warning",
    },
    {
      label: "OpenRouter",
      value:
        backendState.openrouterOk === null
          ? "Checking"
          : backendState.openrouterOk
            ? "Configured"
            : "Missing",
      tone:
        backendState.openrouterOk === null
          ? "neutral"
          : backendState.openrouterOk
            ? "success"
            : "warning",
    },
    ...(artifactServiceItem ? [artifactServiceItem] : []),
  ];
  const connectedCount = serviceItems.filter((item) => item.tone === "success").length;
  const artifactMentionContext = getArtifactMentionContext(input);
  const artifactMentionQuery = artifactMentionContext?.query.trim().toLowerCase() ?? "";
  const filteredArtifactOptions = artifactOptions.filter((artifact) => {
    if (!artifactMentionQuery) return true;
    return `${artifact.title} ${artifact.filename}`.toLowerCase().includes(artifactMentionQuery);
  });
  const contextMentionOptions: ContextMentionOption[] =
    artifactMentionStage === "projects"
      ? projects
          .filter((project) => {
            const query = mentionSearch.trim().toLowerCase();
            if (!query) return true;
            return `${project.name} ${project.description}`.toLowerCase().includes(query);
          })
          .map((project) => ({
            id: project.id,
            kind: "project" as const,
            label: project.name,
            description: project.description || "Project artifacts, conversations, and memory",
          }))
      : artifactMentionStage === "files" || artifactMentionStage === "documents"
        ? artifactOptions
            .filter((artifact) => {
              if (
                artifactMentionStage === "documents"
                && !isDocumentArtifact(artifact)
              ) {
                return false;
              }
              const query = mentionSearch.trim().toLowerCase();
              if (!query) return true;
              return `${artifact.title} ${artifact.filename}`
                .toLowerCase()
                .includes(query);
            })
            .map((artifact) => ({
              id: artifact.id,
              kind:
                artifactMentionStage === "files"
                  ? "file" as const
                  : "document" as const,
              label: artifact.title || artifact.filename,
              description: `${artifact.filename} · ${artifact.status}`,
            }))
      : artifactMentionStage === "github_repositories"
        ? githubMentionOptions
      : artifactMentionStage === "skills"
      ? skillMentionOptions.map((skill) => ({
          id: skill.name,
          label: skill.name,
          description: skill.description,
        }))
      : artifactMentionStage === "connectors"
        ? CONNECTOR_MENTION_OPTIONS
        : artifactMentionStage === "resources"
          ? RESOURCE_MENTION_OPTIONS.filter((option) => {
              if (!artifactMentionQuery) return true;
              return `${option.label} ${option.description}`.toLowerCase().includes(artifactMentionQuery);
            })
        : artifactMentionStage === "memory"
          ? MEMORY_MENTION_OPTIONS
          : [];

  useEffect(() => {
    if (artifactMentionStage !== "github_repositories") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setGithubMentionLoading(true);
      setGithubMentionError(null);
      void fetchGithubRepositories(mentionSearch.trim(), 20, controller.signal)
        .then((repositories) => {
          setGithubMentionOptions(
            repositories.map((repository) => ({
              id: repository.full_name || repository.id,
              kind: "github_repository" as const,
              label: repository.full_name || repository.name,
              description: [
                repository.description || "Connected GitHub repository",
                repository.language,
                repository.visibility,
              ].filter(Boolean).join(" / "),
              domain: "github.com",
            })),
          );
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setGithubMentionOptions([]);
          setGithubMentionError(
            error instanceof Error && error.message
              ? error.message
              : "GitHub repositories could not be loaded.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setGithubMentionLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [artifactMentionStage, mentionSearch]);

  useEffect(() => {
    if (!selectedContextMentions.length) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const authUser = loadAuthUser();
      const workspaceId = authUser ? loadActiveWorkspaceId(authUser.id) : undefined;
      setContextPreviewLoading(true);
      void fetchContextPreview(
        "",
        selectedContextMentions.map(({ kind, id, label }) => ({ kind, id, label })),
        controller.signal,
        workspaceId,
        activeProjectId || undefined,
      )
        .then(setContextPreview)
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setContextPreview(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setContextPreviewLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeProjectId, selectedContextMentions]);

  const syncThreadScrollState = useCallback(() => {
    const container = threadScrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const hasOverflow = container.scrollHeight > container.clientHeight + 24;
    const isNearBottom = distanceFromBottom <= 80;

    if (isScrollingToLatestRef.current) {
      shouldFollowThreadRef.current = true;
      setShowScrollToBottom(false);
      if (isNearBottom) isScrollingToLatestRef.current = false;
      return;
    }

    shouldFollowThreadRef.current = isNearBottom;
    setShowScrollToBottom(hasOverflow && !isNearBottom);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = threadScrollRef.current;
    if (!container) return;

    shouldFollowThreadRef.current = true;
    isScrollingToLatestRef.current = behavior === "smooth";
    setShowScrollToBottom(false);
    container.scrollTo({ top: container.scrollHeight, behavior });
    if (behavior === "auto") isScrollingToLatestRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (loadingConversationId) return;

    if (isRestoringConversationRef.current) {
      scrollToLatest("auto");
      isRestoringConversationRef.current = false;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (shouldFollowThreadRef.current) {
        scrollToLatest(typing ? "auto" : "smooth");
      } else {
        syncThreadScrollState();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    messages,
    typing,
    chatActivityState,
    loadingConversationId,
    scrollToLatest,
    syncThreadScrollState,
  ]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!artifactMentionOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (artifactMentionMenuRef.current?.contains(target) || textareaRef.current?.contains(target)) return;
      setArtifactMentionOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [artifactMentionOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHydrated(true);
      if (window.matchMedia("(pointer: fine)").matches) {
        textareaRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    checkBackendHealth()
      .then((data) => {
        setBackendState({
          backendOk: data.status === "ok",
          zillizOk: data.zilliz_configured,
          openrouterOk: data.openrouter_configured,
          postgresOk: data.postgres_connected,
          postgresMode: data.postgres_mode,
          postgresDatabase: data.postgres_database,
          postgresHost: data.postgres_host,
        });
      })
      .catch(() => {
        setBackendState({
          backendOk: false,
          zillizOk: false,
          openrouterOk: false,
          postgresOk: false,
          postgresMode: "unknown",
          postgresDatabase: "",
          postgresHost: "",
        });
      });
  }, []);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false);
      }
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
      if (serviceMenuRef.current && !serviceMenuRef.current.contains(e.target as Node)) {
        setServiceMenuOpen(false);
        setVisualizationOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const activeElement = document.activeElement;
        const restoreQuickFocus = Boolean(
          activeElement && quickMenuRef.current?.contains(activeElement),
        );
        const restoreServiceFocus = Boolean(
          activeElement && serviceMenuRef.current?.contains(activeElement),
        );
        setQuickMenuOpen(false);
        setModeMenuOpen(false);
        setSlashMenuOpen(false);
        setServiceMenuOpen(false);
        setVisualizationOpen(false);
        setReplyingTo(null);
        window.requestAnimationFrame(() => {
          if (restoreQuickFocus) quickMenuButtonRef.current?.focus();
          if (restoreServiceFocus) serviceMenuButtonRef.current?.focus();
        });
      }
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
    const followCaret = el.selectionStart === el.value.length;
    el.style.height = "auto";
    const nextContentHeight = Math.max(28, el.scrollHeight);
    el.style.height = `${nextContentHeight}px`;
    setComposerHeight(Math.min(nextContentHeight, 160));
    if (followCaret) {
      window.requestAnimationFrame(() => {
        if (composerScrollRef.current) {
          composerScrollRef.current.scrollTop = composerScrollRef.current.scrollHeight;
        }
      });
    }
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardImages = [
      ...Array.from(event.clipboardData.files),
      ...Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file)),
    ].filter((file, index, files) =>
      files.findIndex(
        (candidate) =>
          candidate.name === file.name &&
          candidate.size === file.size &&
          candidate.type === file.type,
      ) === index,
    );
    if (clipboardImages.length) {
      event.preventDefault();
      setInlineError(null);
      void addOcrImages(clipboardImages);
      return;
    }
    if (imageModeSelected) return;
    const pastedText = event.clipboardData.getData("text/plain");
    const lineCount = pastedText.replace(/\r\n?/g, "\n").split("\n").length;
    const shouldAttach =
      pastedText.length >= LONG_PASTE_CHARACTER_THRESHOLD ||
      (pastedText.length >= 500 && lineCount >= LONG_PASTE_LINE_THRESHOLD);
    if (!shouldAttach) return;

    event.preventDefault();
    const file = new File([pastedText], "Pasted text.txt", { type: "text/plain" });
    setPastedTextDocument({
      id: `pasted-${Date.now()}`,
      name: file.name,
      content: pastedText,
      file,
    });
    setDocumentPreviewFile(file);
    setManualStatusMessage("Long pasted text attached as a document.");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function nextMessageId() {
    messageSequenceRef.current += 1;
    return messageSequenceRef.current;
  }

  function replacePromptQueue(
    updater: (current: QueuedPrompt[]) => QueuedPrompt[],
  ) {
    setPromptQueue((current) => {
      const next = updater(current);
      promptQueueRef.current = next;
      return next;
    });
  }

  function clearPromptQueue() {
    promptQueueRef.current = [];
    setPromptQueue([]);
  }

  function enqueueCurrentPrompt() {
    const question = input.trim();
    if (!question) return;
    if (pastedTextDocument || readyOcrImages.length > 0 || selectedContextMentions.length > 0) {
      setInlineError("Queued prompts currently support text only. Send this attachment or context after the active response finishes.");
      return;
    }

    const replyReference = replyingTo
      ? {
          messageId: replyingTo.id,
          role: replyingTo.role,
          content: replyingTo.content,
        }
      : null;
    const queuedPrompt: QueuedPrompt = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      question,
      replyTo: replyReference,
      chatMode: activeMode,
      fastMode,
      model: selectedModel ?? MODELS[0],
    };
    const nextQueue = [...promptQueueRef.current, queuedPrompt];
    promptQueueRef.current = nextQueue;
    setPromptQueue(nextQueue);
    setInput("");
    setReplyingTo(null);
    setComposerHeight(28);
    setInlineError(null);
    if (textareaRef.current) textareaRef.current.style.height = "28px";
    if (composerScrollRef.current) composerScrollRef.current.scrollTop = 0;
    setManualStatusMessage(`Queued ${nextQueue.length} prompt${nextQueue.length === 1 ? "" : "s"}.`);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function moveQueuedPrompt(id: string, direction: -1 | 1) {
    replacePromptQueue((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reorderQueuedPrompt(fromId: string, toId: string) {
    replacePromptQueue((current) => {
      const fromIndex = current.findIndex((item) => item.id === fromId);
      const toIndex = current.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function removeQueuedPrompt(id: string) {
    replacePromptQueue((current) => current.filter((item) => item.id !== id));
  }

  function dispatchNextQueuedPrompt() {
    if (queryAbortRef.current || imageGenerating) return;
    const next = promptQueueRef.current[0];
    if (!next) return;
    replacePromptQueue((current) => current.filter((item) => item.id !== next.id));
    void sendMessage(next.question, {
      replyTo: next.replyTo,
      chatModeOverride: next.chatMode,
      fastModeOverride: next.fastMode,
      modelOverride: next.model,
    });
  }
  dispatchNextQueuedPromptRef.current = dispatchNextQueuedPrompt;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (artifactMentionOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setArtifactMentionOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const optionCount =
          artifactMentionStage === "root"
            ? ROOT_MENTION_STAGES.length
            : artifactMentionStage === "artifacts"
              ? filteredArtifactOptions.length
              : contextMentionOptions.length;
        if (optionCount) {
          const direction = e.key === "ArrowDown" ? 1 : -1;
          setArtifactMentionIndex(
            (current) => (current + direction + optionCount) % optionCount,
          );
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (artifactMentionStage === "root") {
          setArtifactMentionStage(
            ROOT_MENTION_STAGES[artifactMentionIndex] ?? "artifacts",
          );
          setArtifactMentionIndex(0);
        } else if (artifactMentionStage === "artifacts") {
          const artifact = filteredArtifactOptions[artifactMentionIndex];
          if (artifact) selectArtifactMention(artifact);
        } else {
          const option = contextMentionOptions[artifactMentionIndex];
          if (option) selectContextMention(option);
        }
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (typing) enqueueCurrentPrompt();
      else void sendMessage();
    }
  }

  function updateArtifactMention(nextValue: string) {
    const context = getArtifactMentionContext(nextValue);
    if (!context || imageModeSelected) {
      setArtifactMentionOpen(false);
      return;
    }
    void loadArtifactOptions();
    void loadSkillMentionOptions();
    setArtifactMentionOpen(true);
    setArtifactMentionStage("root");
    setArtifactMentionIndex(0);
  }

  async function loadSkillMentionOptions() {
    if (skillMentionOptions.length || skillMentionLoading) return;
    setSkillMentionLoading(true);
    try {
      setSkillMentionOptions(await fetchAgentSkills());
    } catch {
      setSkillMentionOptions([]);
    } finally {
      setSkillMentionLoading(false);
    }
  }

  async function loadArtifactOptions() {
    if (artifactOptionsLoaded || artifactOptionsLoading) return;
    setArtifactOptionsLoading(true);
    setArtifactOptionsError(null);
    try {
      setArtifactOptions(await fetchRecentArtifacts(100));
      setArtifactOptionsLoaded(true);
    } catch (error) {
      setArtifactOptionsError(error instanceof Error ? error.message : "Could not load artifacts.");
      setArtifactOptionsLoaded(true);
    } finally {
      setArtifactOptionsLoading(false);
    }
  }

  function selectArtifactMention(artifact: ArtifactItem) {
    const context = getArtifactMentionContext(input);
    const title = artifact.title || artifact.filename;
    setInput(context ? input.slice(0, context.start).trimEnd() : input);
    setArtifactMentionOpen(false);
    setArtifactMentionStage("root");
    setArtifactMentionIndex(0);
    setInlineError(null);

    const selectedDocument = artifactToUploadResponse(artifact);
    uploadJobRef.current += 1;
    setUploadedDocument(selectedDocument);
    setArtifactCommitted(false);
    saveDocument(selectedDocument);
    updateSteps(new Set<PipelineStepId>([
      "upload",
      "extract",
      "chunk",
      "tokenize",
      "embed",
      "milvus",
      "ready",
    ]));
    setAttachment(null);
    setManualStatusMessage(`${title} is attached and ready for retrieval.`);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      autoResize();
    });
  }

  function selectContextMention(option: ContextMentionOption) {
    if (
      artifactMentionStage === "connectors"
      && option.id === "github"
    ) {
      setArtifactMentionStage("github_repositories");
      setMentionSearch("");
      setArtifactMentionIndex(0);
      return;
    }
    if (
      artifactMentionStage === "resources"
      && (option.kind === "file" || option.kind === "document")
    ) {
      setArtifactMentionStage(option.kind === "file" ? "files" : "documents");
      setMentionSearch("");
      setArtifactMentionIndex(0);
      return;
    }
    if (
      artifactMentionStage === "resources"
      && option.kind === "github_repository"
    ) {
      setArtifactMentionStage("github_repositories");
      setMentionSearch("");
      setArtifactMentionIndex(0);
      return;
    }
    const context = getArtifactMentionContext(input);
    setInput(context ? input.slice(0, context.start).trimEnd() : input);
    if (
      artifactMentionStage === "skills" ||
      artifactMentionStage === "projects" ||
      artifactMentionStage === "files" ||
      artifactMentionStage === "documents" ||
      artifactMentionStage === "connectors" ||
      artifactMentionStage === "resources" ||
      artifactMentionStage === "github_repositories" ||
      artifactMentionStage === "memory"
    ) {
      const kind: ContextResourceKind =
        option.kind ??
        (artifactMentionStage === "skills"
          ? "skills"
          : artifactMentionStage === "connectors"
            ? "connectors"
            : "memory");
      setSelectedContextMentions((current) => {
        if (
          current.some(
            (item) =>
              item.kind === kind && item.id === option.id,
          )
        ) {
          return current;
        }
        return [...current, { ...option, kind }];
      });
    }
    setArtifactMentionOpen(false);
    setArtifactMentionStage("root");
    setArtifactMentionIndex(0);
    setInlineError(null);

    if (artifactMentionStage === "skills") {
      const enabled =
        loadEnabledAgentSkills(skillMentionOptions) ??
        skillMentionOptions
          .filter((skill) => skill.default_enabled !== false)
          .map((skill) => skill.name);
      if (!enabled.includes(option.id)) {
        saveEnabledAgentSkills([...enabled, option.id]);
      }
      setManualStatusMessage(`${option.label} skill added to this request.`);
    } else if (artifactMentionStage === "connectors") {
      setManualStatusMessage(`${option.label} connector mentioned in this request.`);
    } else {
      setManualStatusMessage(`${option.label} added as context.`);
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function removeContextMention(mention: SelectedContextMention) {
    setSelectedContextMentions((current) =>
      current.filter(
        (item) => item.kind !== mention.kind || item.id !== mention.id,
      ),
    );
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function selectImageMode() {
    if (!IMAGE_GENERATION_ENABLED) return;
    setQuickMenuOpen(false);
    setSlashMenuOpen(false);
    setImageModeSelected(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function showImageGenerationError(message: string, prompt: string) {
    toast.error(message, {
      id: "kontext-image-generation-error",
      duration: 9000,
      action: {
        label: "Retry",
        onClick: () => {
          toast.dismiss("kontext-image-generation-error");
          void generateImageForPrompt(prompt);
        },
      },
    });
  }

  async function generateImageForPrompt(prompt: string) {
    setImageGenerating(true);
    setTyping(true);
    setInput("");
    setSlashMenuOpen(false);

    const userMessage: Message = {
      id: nextMessageId(),
      role: "user",
      content: prompt,
    };
    const assistantMessageId = nextMessageId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "Creating your image…",
      streaming: true,
      badge: "IMAGE",
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    shouldFollowThreadRef.current = true;
    setShowScrollToBottom(false);
    requestAnimationFrame(() => scrollToLatest("smooth"));

    try {
      const result = await generateImageFromPrompt(prompt);
      if (!result.success) {
        showImageGenerationError(result.error, prompt);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: result.error, streaming: false }
              : message,
          ),
        );
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: `Generated image for “${prompt}”.`,
                imageUrl: result.imageData,
                streaming: false,
              }
            : message,
        ),
      );
      requestAnimationFrame(() => scrollToLatest("smooth"));
    } catch {
      const errorMessage = "Image generation is unavailable right now. Please try again.";
      showImageGenerationError(errorMessage, prompt);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: errorMessage, streaming: false }
            : message,
        ),
      );
    } finally {
      setImageGenerating(false);
      setTyping(false);
    }
  }

  function updateSteps(next: Set<PipelineStepId>) {
    setCompletedSteps(next);
    savePipelineSteps([...next]);
  }

  function addStep(step: PipelineStepId) {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      savePipelineSteps([...next]);
      return next;
    });
  }

  function clearCurrentArtifact() {
    setDocumentPreviewOpen(false);
    setDocumentPreviewFile(null);
    setAttachment(null);
    setPastedTextDocument(null);
    setUploadedDocument(null);
    setArtifactCommitted(false);
    setInlineError(null);
    setManualStatusMessage(DEFAULT_CHAT_GUIDANCE);
    setCompletedSteps(new Set<PipelineStepId>());
    clearDocument();
    clearPipelineSteps();
  }

  async function openConversation(conversationId: string) {
    isRestoringConversationRef.current = true;
    setLoadingConversationId(conversationId);
    try {
      const items = await fetchConversationMessages(conversationId);
      const nextMessages: Message[] = items
        .filter(
          (item): item is typeof item & { role: "user" | "assistant" } =>
            item.role === "user" || item.role === "assistant",
        )
        .map((item, index) => ({
          id: Date.parse(item.created_at) || index + 1,
          serverId: item.id,
          role: item.role,
          content: item.content,
          imageAttachments: item.metadata?.image_attachments
            ?.filter((image) => image.artifact_id !== item.metadata?.artifact_attachment?.artifact_id)
            .map((image) => ({
              artifactId: image.artifact_id,
              filename: image.filename,
              mimeType: image.mime_type,
            })),
          artifactAttachment: item.metadata?.artifact_attachment
            ? {
                artifactId: item.metadata.artifact_attachment.artifact_id,
                title: item.metadata.artifact_attachment.title,
                filename: item.metadata.artifact_attachment.filename,
                mimeType: item.metadata.artifact_attachment.mime_type,
              }
            : undefined,
          contextMentions: item.metadata?.context_mentions,
          feedback: item.metadata?.feedback?.rating ?? null,
          reported: Boolean(item.metadata?.feedback?.report_reason),
          route: item.role === "assistant" ? item.metadata?.route : undefined,
          plan: item.role === "assistant" ? item.metadata?.plan : undefined,
          followUps: item.role === "assistant" ? item.metadata?.followups : undefined,
          durationMs: item.role === "assistant" ? item.total_ms ?? undefined : undefined,
          fastMode: item.role === "assistant" ? item.metadata?.fast_mode ?? false : undefined,
          showReasoningSummary:
            item.role === "assistant"
              ? item.metadata?.chat_mode === "thinking" ||
                item.metadata?.chat_mode === "deep-research" ||
                item.metadata?.route?.mode === "agent" ||
                item.metadata?.route?.needs_web === true
              : undefined,
          resources:
            item.role === "assistant"
              ? normalizeResourceCandidates(
                  mergeAnswerSources(item.metadata?.web_sources, item.metadata?.knowledge_sources),
                ).map((resource) => ({
                  title: resource.title,
                  url: resource.url,
                  domain: resource.domain,
                  sourceType: resource.sourceType,
                  description: resource.description,
                  providerLabel: resource.providerLabel,
                  quote: resource.quote,
                  imageUrl: resource.imageUrl,
                  imageLandingUrl: resource.imageLandingUrl,
                  imageAttribution: resource.imageAttribution,
                  imageLicense: resource.imageLicense,
                  imageProvider: resource.imageProvider,
                  citationIndex: resource.citationIndex,
                  canonicalUrl: resource.canonicalUrl,
                  faviconUrl: resource.faviconUrl,
                  verification: resource.verification,
                  trustScore: resource.trustScore,
                  trustLabel: resource.trustLabel,
                  trustComponents: resource.trustComponents,
                  trustExplanation: resource.trustExplanation,
                  confidenceScore: resource.confidenceScore,
                  confidenceLabel: resource.confidenceLabel,
                  confidenceComponents: resource.confidenceComponents,
                  confidenceExplanation: resource.confidenceExplanation,
                  evidenceRole: resource.evidenceRole,
                  reasonUsed: resource.reasonUsed,
                  influenceScore: resource.influenceScore,
                  freshness: resource.freshness,
                  crossVerification: resource.crossVerification,
                  contentHash: resource.contentHash,
                  language: resource.language,
                  license: resource.license,
                  scoreVersion: resource.scoreVersion,
                }))
              : undefined,
        }));
      setMessages(nextMessages);
      clearPromptQueue();
      setCurrentConversationId(conversationId);
      setConversationId(conversationId);
      setInlineError(null);
      setReplyingTo(null);
      setEditingMessageId(null);
      setEditingDraft("");
      setChatActivityState(null);
      setSelectedContextMentions([]);
      shouldFollowThreadRef.current = true;
      setShowScrollToBottom(false);
    } catch (error) {
      isRestoringConversationRef.current = false;
      setInlineError(
        error instanceof Error ? error.message : "Could not load conversation history.",
      );
    } finally {
      setLoadingConversationId(null);
    }
  }
  openConversationRef.current = openConversation;

  useEffect(() => {
    if (!hydrated) return;

    const openFromUrl = window.setTimeout(() => {
      const conversationId = new URLSearchParams(window.location.search).get("id");
      if (conversationId) void openConversationRef.current(conversationId);
    }, 0);

    function handleNewChat() {
      isRestoringConversationRef.current = false;
      setMessages([]);
      clearPromptQueue();
      setInlineError(null);
      resetConversationId();
      setCurrentConversationId(null);
      setActiveMode(null);
      setFastMode(false);
      setReplyingTo(null);
      setEditingMessageId(null);
      setEditingDraft("");
      setChatActivityState(null);
      setSelectedContextMentions([]);
      shouldFollowThreadRef.current = true;
      setShowScrollToBottom(false);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }

    function handleOpenChat(event: Event) {
      const conversationId = (event as CustomEvent<string>).detail;
      if (conversationId) void openConversationRef.current(conversationId);
    }

    window.addEventListener(CHAT_NEW_EVENT, handleNewChat);
    window.addEventListener(CHAT_OPEN_EVENT, handleOpenChat);
    return () => {
      window.clearTimeout(openFromUrl);
      window.removeEventListener(CHAT_NEW_EVENT, handleNewChat);
      window.removeEventListener(CHAT_OPEN_EVENT, handleOpenChat);
    };
  }, [hydrated]);

  async function runPipeline(doc: UploadResponse, jobId: number) {
    setManualStatusMessage("Please wait. We are preparing your artifact for chat...");
    setAttachment((current) =>
      current ? { ...current, status: "processing", detail: "Processing..." } : current,
    );
    updateSteps(new Set<PipelineStepId>(["upload"]));

    try {
      await visualizePipeline(doc.doc_id, (event: PipelineEvent) => {
        if (uploadJobRef.current !== jobId) return;

        if (event.type === "error") {
          throw new Error(event.message ?? "Pipeline failed");
        }

        if (event.type === "step" && event.id) {
          if (event.status === "done") {
            addStep("upload");
            addStep(event.id);
          }

          const label = event.label ?? event.id;
          const stage =
            event.status === "running"
              ? `${label} in progress. Hold on a minute...`
              : `${label} complete.`;
          setManualStatusMessage(stage);
        }

        if (event.type === "complete") {
          updateSteps(
            new Set<PipelineStepId>([
              "upload",
              "extract",
              "chunk",
              "tokenize",
              "embed",
              "milvus",
              "ready",
            ]),
          );
        }
      });

      if (uploadJobRef.current !== jobId) return;

      setAttachment((current) =>
        current ? { ...current, status: "uploaded", detail: "Ready" } : current,
      );
      setManualStatusMessage("Your result is ready. Ask anything from the uploaded file.");
    } catch (error) {
      if (uploadJobRef.current !== jobId) return;
      const message =
        error instanceof Error ? error.message : "Pipeline processing failed";
      setInlineError(message);
      setAttachment((current) =>
        current ? { ...current, status: "error", detail: "Failed" } : current,
      );
      setManualStatusMessage("Something went wrong while preparing the file.");
    }
  }

  async function handleFileSelection(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length) {
      setQuickMenuOpen(false);
      setInlineError(null);
      await addOcrImages(imageFiles);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    const file = selectedFiles[0];
    if (!file) return;

    setDocumentPreviewOpen(false);
    const jobId = uploadJobRef.current + 1;
    uploadJobRef.current = jobId;
    setInlineError(null);
    setUploadedDocument(null);
    setArtifactCommitted(false);
    setMessages([]);
    clearPromptQueue();
    resetConversationId();
    setFastMode(false);
    clearDocument();
    clearPipelineSteps();
    setManualStatusMessage("Uploading your file...");
    updateSteps(new Set<PipelineStepId>());
    setAttachment({
      id: String(jobId),
      name: file.name,
      status: "uploading",
      detail: "Uploading...",
      file,
    });

    try {
      const authUser = loadAuthUser();
      const workspaceId = authUser ? loadActiveWorkspaceId(authUser.id) : undefined;
      const projectId = activeProjectId || undefined;
      const uploadedDoc = await uploadPdf(file, undefined, { workspaceId, projectId });
      if (uploadJobRef.current !== jobId) return;

      setUploadedDocument(uploadedDoc);
      setArtifactCommitted(false);
      saveDocument(uploadedDoc);
      updateSteps(new Set<PipelineStepId>(["upload"]));
      setManualStatusMessage("Upload complete. Preparing your file...");
      await runPipeline(uploadedDoc, jobId);
    } catch (error) {
      if (uploadJobRef.current !== jobId) return;
      const message = error instanceof Error ? error.message : "Upload failed";
      setInlineError(message);
      setAttachment({
        id: String(jobId),
        name: file.name,
        status: "error",
        detail: "Failed",
      });
      setManualStatusMessage("Upload failed. Please try again.");
    }
  }

  async function sendMessage(
    questionOverride?: string,
    options: {
      appendUser?: boolean;
      replyTo?: MessageReplyReference | null;
      approvedToolCalls?: string[];
      chatModeOverride?: ChatMode | null;
      attachmentContextOverride?: string;
      imageAttachmentsOverride?: NonNullable<Message["imageAttachments"]>;
      fastModeOverride?: boolean;
      modelOverride?: Model;
    } = {},
  ) {
    const appendUser = options.appendUser ?? true;
    const attachedText = questionOverride === undefined ? pastedTextDocument?.content.trim() : "";
    const attachedOcr = questionOverride === undefined
      ? readyOcrImages.map((image) => {
          const result = image.result;
          if (!result) return "";
          const extracted = (result.markdown || result.text).slice(0, 60_000);
          if (!extracted.trim()) return "";
          return `[Untrusted OCR content from image: ${image.file.name}; ${result.model}]\n${extracted}`;
        }).filter(Boolean).join("\n\n")
      : "";
    const typedQuestion = (questionOverride ?? input).trim();
    const trimmed = typedQuestion || (attachedText
      ? "Please review the attached text document."
      : readyOcrImages.length > 0
        ? "Please describe and analyze the attached image."
        : "");
    const attachmentContext = options.attachmentContextOverride ?? [
      attachedText
        ? `[Attached text document: ${pastedTextDocument?.name ?? "Pasted text.txt"}]\n${attachedText}`
        : "",
      attachedOcr,
    ].filter(Boolean).join("\n\n").slice(0, 60_000);
    const imageAttachments = options.imageAttachmentsOverride ?? readyOcrImages.flatMap((image) => {
      const result = image.result;
      if (!result?.artifact_id) return [];
      return [{
        artifactId: result.artifact_id,
        filename: result.filename || image.file.name,
        mimeType: result.mime_type || image.file.type || "image/png",
      }];
    });
    const selectedArtifactImage =
      !options.imageAttachmentsOverride && uploadedDocument && isImageArtifact(uploadedDocument)
        ? [{
            artifactId: uploadedDocument.doc_id,
            filename: uploadedDocument.filename,
            mimeType: imageMimeTypeForArtifact(uploadedDocument),
          }]
        : [];
    const requestImageAttachments = dedupeImageAttachments([
      ...imageAttachments,
      ...selectedArtifactImage,
    ]);
    // Context mentions are structured routing instructions. Keep them out of
    // the natural-language question so retrieval does not search for labels
    // such as "Workspace knowledge" as though the user typed them.
    const requestQuestion = trimmed;
    if (!trimmed || queryAbortRef.current || imageGenerating) return;
    if (ocrIsReading) {
      setInlineError("Please wait while the image is prepared for visual analysis.");
      return;
    }
    if (IMAGE_GENERATION_ENABLED && imageModeSelected) {
      await generateImageForPrompt(trimmed);
      return;
    }
    if (uploadedDocument && !pipelineReady) {
      setInlineError("Please wait until your artifact is ready.");
      return;
    }
    if (backendState.openrouterOk === false && !isRuntimeQuestion(trimmed)) {
      setInlineError("OpenRouter is not configured on the backend. Check /status and add OPENROUTER_API_KEY to backend/.env or the project .env, then retry.");
      return;
    }

    setInlineError(null);
    setRetryRequest(null);
    setTyping(true);
    const requestMode = options.chatModeOverride === undefined ? activeMode : options.chatModeOverride;
    const requestFastMode = options.fastModeOverride ?? fastMode;
    const requestModel = options.modelOverride ?? selectedModel ?? MODELS[0];
    if (!options.approvedToolCalls?.length) {
      setQueryRoute(null);
      setQueryPlan(null);
      setQuerySources([]);
      setPendingConfirmation(null);
    }
    setChatActivityState(
      selectedArtifactImage.length
        ? chatActivity("image")
        : uploadedDocument
        ? chatActivity("document")
        : requestMode === "web-search" || requestMode === "deep-research"
          ? chatActivity("web")
          : chatActivity("routing"),
    );

    const replyReference =
      options.replyTo === undefined
        ? replyingTo
          ? {
              messageId: replyingTo.id,
              role: replyingTo.role,
              content: replyingTo.content,
            }
          : null
        : options.replyTo;

    const userMessage: Message = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      replyTo: replyReference ?? undefined,
      imageAttachments: imageAttachments.length ? imageAttachments : undefined,
      artifactAttachment:
        uploadedDocument && !artifactCommitted
          ? {
              artifactId: uploadedDocument.doc_id,
              title: uploadedDocument.title || uploadedDocument.filename,
              filename: uploadedDocument.filename,
              mimeType: uploadedDocument.mime_type || mimeTypeForArtifact(uploadedDocument.filename),
            }
          : undefined,
      contextMentions: selectedContextMentions.map(({ kind, id, label }) => ({
        kind,
        id,
        label,
      })),
      fastMode: requestFastMode,
    };
    if (appendUser) {
      setMessages((prev) => [...prev, userMessage]);
    }
    shouldFollowThreadRef.current = true;
    setShowScrollToBottom(false);
    setInput("");
    setArtifactMentionOpen(false);
    setSelectedContextMentions([]);
    if (uploadedDocument) setArtifactCommitted(true);
    setPastedTextDocument(null);
    clearOcrImages();
    setDocumentPreviewFile(null);
    setComposerHeight(28);
    setSlashMenuOpen(false);
    setReplyingTo(null);
    setEditingMessageId(null);
    setEditingDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "28px";
    if (composerScrollRef.current) composerScrollRef.current.scrollTop = 0;

    let answer = "";
    let hasStreamingMessage = false;
    let streamingRenderTimer: number | null = null;
    let serverMessageId: string | null = null;
    let approvalRequest: QueryConfirmationRequest | null = null;
    const assistantMessageId = nextMessageId();
    let answerSources: StreamResourceCandidate[] | undefined;
    let answerFollowUps: string[] = [];
    let answerRoute: QueryRouteDecision | null = null;
    let answerPlan: QueryExecutionPlan | null = null;
    let streamCompleted = false;
    let answerDurationMs: number | undefined;
    const conversationId = getOrCreateConversationId();
    let resolvedConversationId = conversationId;
    const publishStreamingAnswer = () => {
      if (!answer) return;
      if (!hasStreamingMessage) {
        hasStreamingMessage = true;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: answer,
            streaming: true,
            showReasoningSummary:
              requestMode === "thinking" || requestMode === "deep-research",
          },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: answer }
              : message,
          ),
        );
      }
    };
    const scheduleStreamingAnswer = () => {
      if (streamingRenderTimer !== null) return;
      streamingRenderTimer = window.setTimeout(() => {
        streamingRenderTimer = null;
        publishStreamingAnswer();
      }, 40);
    };
    const approvedCallsForRequest = Array.from(
      new Set([...approvedToolCalls, ...(options.approvedToolCalls ?? [])]),
    );
    try {
      const authUser = loadAuthUser();
      const activeWorkspace = authUser
        ? { id: loadActiveWorkspaceId(authUser.id), name: activeWorkspaceName }
        : undefined;
      setCurrentConversationId(conversationId);
      const controller = new AbortController();
      queryAbortRef.current = controller;
      await streamChat(uploadedDocument?.doc_id ?? null, requestQuestion, conversationId, (event) => {
        if (event.type === "error") {
          throw new Error(event.message ?? "Chat failed");
        }
        if (event.type === "status" && event.message) {
          setChatActivityState(activityFromStatus(event.stage, event.message));
        }
        if (event.type === "request.accepted" && event.conversation_id) {
          const acceptedConversationId = event.conversation_id;
          resolvedConversationId = acceptedConversationId;
          setCurrentConversationId(acceptedConversationId);
          setConversationId(acceptedConversationId);
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("id", acceptedConversationId);
          window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        }
        if (event.type === "skills.activated" && event.skills?.length) {
          setChatActivityState({
            kind: "routing",
            label: `Using ${event.skills.map((skill) => skill.name).join(", ")}`,
            detail: "Loaded task-specific instructions for this request",
          });
        }
        if (event.type === "capabilities.activated" && event.capabilities?.length) {
          setChatActivityState({
            kind: "routing",
            label: `Activated ${event.capabilities.slice(0, 3).map((capability) => capability.label).join(", ")}`,
            detail: event.capabilities.length > 3
              ? `Using ${event.capabilities.length} capabilities for this request`
              : "Selected the minimum capabilities for this request",
          });
        }
        if (event.type === "route.decision") {
          // Older chat streams flatten route fields on the event while the
          // unified query stream nests them under `route`. Accept both
          // envelopes so the progress UI remains useful during migration.
          answerRoute = event.route ?? (event as unknown as QueryRouteDecision);
          setQueryRoute(answerRoute);
        }
        if (event.type === "plan.created") {
          answerPlan = event.plan ?? (event as unknown as QueryExecutionPlan);
          setQueryPlan(answerPlan);
        }
        if ((event.type === "step.started" || event.type === "step.completed" || event.type === "step.failed") && event.step_id) {
          const nextStatus = event.type === "step.started" ? "active" : event.type === "step.completed" ? "complete" : "failed";
          const updatePlanStep = (current: QueryExecutionPlan): QueryExecutionPlan => ({
            ...current,
            steps: current.steps.map((step) => step.id === event.step_id ? { ...step, status: nextStatus, detail: event.message ?? step.detail } : step),
          });
          if (answerPlan) answerPlan = updatePlanStep(answerPlan);
          setQueryPlan((current) => current ? updatePlanStep(current) : current);
        }
        if (event.type === "source.discovered" && event.source) {
          setQuerySources((current) => dedupeQuerySources([...current, event.source!]));
        }
        if (event.type === "answer.sources" && event.sources) {
          setQuerySources((current) => dedupeQuerySources([...current, ...event.sources!]));
        }
        if (event.type === "answer.followups" && event.followups) {
          answerFollowUps = event.followups;
        }
        if (event.type === "answer.final" && typeof event.content === "string") {
          answer = event.content;
          if (streamingRenderTimer !== null) {
            window.clearTimeout(streamingRenderTimer);
            streamingRenderTimer = null;
          }
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: answer }
                : message,
            ),
          );
        }
        if (event.type === "confirmation.required" && event.approval_id && event.tool && event.title && event.description) {
          approvalRequest = {
            approval_id: event.approval_id,
            tool: event.tool,
            title: event.title,
            description: event.description,
          };
          setPendingConfirmation({
            ...approvalRequest,
            question: requestQuestion,
            replyTo: replyReference,
            mode: requestMode,
            attachmentContext,
            imageAttachments: requestImageAttachments,
            fastMode: requestFastMode,
          });
        }
        if (event.type === "token" && event.content) {
          answer += event.content;
          setChatActivityState(null);
          if (!hasStreamingMessage) {
            publishStreamingAnswer();
          } else {
            scheduleStreamingAnswer();
          }
        }
        if (event.type === "done") {
          streamCompleted = true;
          answerDurationMs = event.total_ms;
          answerSources = mergeAnswerSources(event.web_sources, event.knowledge_sources);
          if (event.followups?.length) answerFollowUps = event.followups;
        }
        if (event.type === "done" && event.route) {
          answerRoute = event.route;
        }
        if (event.type === "done" && event.plan) {
          answerPlan ??= event.plan;
        }
        if (event.type === "done" && event.message_id) {
          serverMessageId = event.message_id;
        }
      }, requestMode, replyReference?.content ?? null, {
        signal: controller.signal,
        workspaceId: activeWorkspace?.id,
        workspaceName: activeWorkspace?.name,
        projectId: activeProjectId || undefined,
        approvedToolCalls: approvedCallsForRequest,
        enabledSkills: loadEnabledAgentSkills(),
        contextMentions: selectedContextMentions.map(({ kind, id, label }) => ({
          kind,
          id,
          label,
        })),
        fastMode: requestFastMode,
        attachmentContext,
        selectedModel: requestModel.id,
        imageAttachments: requestImageAttachments.map((image) => ({
          artifact_id: image.artifactId,
          filename: image.filename,
          mime_type: image.mimeType,
        })),
      });

      if (approvalRequest) {
        setChatActivityState(null);
        return;
      }

      if (streamingRenderTimer !== null) {
        window.clearTimeout(streamingRenderTimer);
        streamingRenderTimer = null;
      }
      publishStreamingAnswer();

      if (!answer.trim()) {
        throw new Error(
          streamCompleted
            ? "The answer model returned no text. Please try again."
            : "The answer stream ended before it completed. Please try again.",
        );
      }

      const assistantMessage = buildAssistantMessage(trimmed, answer, assistantMessageId);
      const finalAnswerRoute = answerRoute as QueryRouteDecision | null;
      assistantMessage.serverId = serverMessageId ?? undefined;
      assistantMessage.route = finalAnswerRoute ?? undefined;
      assistantMessage.plan = answerPlan ?? undefined;
      assistantMessage.followUps = answerFollowUps.length ? answerFollowUps : undefined;
      assistantMessage.durationMs = answerDurationMs;
      assistantMessage.fastMode = requestFastMode;
      assistantMessage.showReasoningSummary =
        requestMode === "thinking" ||
        requestMode === "deep-research" ||
        finalAnswerRoute?.mode === "agent" ||
        finalAnswerRoute?.needs_web === true;
      const resources = normalizeResourcesFromStream(answerSources, answer);
      const messageResourceItems = resources.map(toSourceItem);
      assistantMessage.resources = resources.map((resource) => ({
        title: resource.title,
        url: resource.url,
        domain: resource.domain,
        sourceType: resource.sourceType,
        description: resource.description,
        providerLabel: resource.providerLabel,
        quote: resource.quote,
        imageUrl: resource.imageUrl,
        imageLandingUrl: resource.imageLandingUrl,
        imageAttribution: resource.imageAttribution,
        imageLicense: resource.imageLicense,
        imageProvider: resource.imageProvider,
        citationIndex: resource.citationIndex,
        canonicalUrl: resource.canonicalUrl,
        faviconUrl: resource.faviconUrl,
        verification: resource.verification,
        trustScore: resource.trustScore,
        trustLabel: resource.trustLabel,
        trustComponents: resource.trustComponents,
        trustExplanation: resource.trustExplanation,
        confidenceScore: resource.confidenceScore,
        confidenceLabel: resource.confidenceLabel,
        confidenceComponents: resource.confidenceComponents,
        confidenceExplanation: resource.confidenceExplanation,
        evidenceRole: resource.evidenceRole,
        reasonUsed: resource.reasonUsed,
        influenceScore: resource.influenceScore,
        freshness: resource.freshness,
        crossVerification: resource.crossVerification,
        contentHash: resource.contentHash,
        language: resource.language,
        license: resource.license,
        scoreVersion: resource.scoreVersion,
      }));
      setMessages((prev) =>
        hasStreamingMessage
          ? prev.map((message) =>
              message.id === assistantMessageId ? assistantMessage : message,
            )
          : [...prev, assistantMessage],
      );
      if (messageResourceItems.length) {
        setMessageResources((prev) => ({
          ...prev,
          [assistantMessage.id]: messageResourceItems,
        }));
      }
      window.dispatchEvent(
        new CustomEvent<string>(CHAT_RECENTS_CHANGED_EVENT, { detail: resolvedConversationId }),
      );
      setManualStatusMessage(
        uploadedDocument
          ? "Your result is ready. Ask anything from the uploaded file."
          : DEFAULT_CHAT_GUIDANCE,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (hasStreamingMessage) {
          setMessages((prev) => prev.map((message) => message.id === assistantMessageId ? { ...message, streaming: false } : message));
        }
        return;
      }
      const message = error instanceof Error ? error.message : "Chat failed";
      setRetryRequest({
        question: requestQuestion,
        assistantMessageId,
        replyTo: replyReference ?? null,
        chatMode: requestMode ?? null,
        attachmentContext,
        imageAttachments: requestImageAttachments,
        fastMode: requestFastMode,
      });
      const hasImageRequest = requestImageAttachments.length > 0;
      if (hasImageRequest) {
        toast.error(message, {
          id: "kontext-image-analysis-error",
          duration: 9000,
          action: {
            label: "Retry",
            onClick: () => {
              toast.dismiss("kontext-image-analysis-error");
              setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
              setRetryRequest(null);
              void sendMessage(requestQuestion, {
                appendUser: false,
                replyTo: replyReference ?? null,
                chatModeOverride: requestMode,
                attachmentContextOverride: attachmentContext,
                imageAttachmentsOverride: requestImageAttachments,
                fastModeOverride: requestFastMode,
              });
            },
          },
        });
      }
      const fallbackMessage = hasImageRequest
        ? "I couldn't analyze this image because the vision provider rejected the request. Check the provider credits or vision model, then retry."
        : buildFallbackAssistantMessage(message, Boolean(uploadedDocument));
      const shouldShowInlineBanner = !isProviderFailure(message) && !hasImageRequest;
      const shouldShowOpenRouterConfigBanner =
        message.includes("OPENROUTER_API_KEY missing") ||
        message.includes("TrueMemory query is missing OPENROUTER_API_KEY");
      setInlineError(
        shouldShowOpenRouterConfigBanner
          ? message
          : shouldShowInlineBanner
            ? fallbackMessage
            : null,
      );
      if (!hasImageRequest) {
        toast.error(
          shouldShowOpenRouterConfigBanner ? message : fallbackMessage,
          {
          id: "kontext-chat-error",
          duration: 9000,
          },
        );
      }
      if (hasStreamingMessage) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, streaming: false }
              : message,
          ),
        );
      } else {
        const fallbackAssistant = {
          id: assistantMessageId,
          role: "assistant" as const,
          content: fallbackMessage,
        };
        setMessages((prev) => [...prev, fallbackAssistant]);
      }
    } finally {
      if (streamingRenderTimer !== null) {
        window.clearTimeout(streamingRenderTimer);
      }
      queryAbortRef.current = null;
      setChatActivityState(null);
      setTyping(false);
      if (!approvalRequest) {
        window.setTimeout(() => dispatchNextQueuedPromptRef.current(), 0);
      }
    }
  }

  function buildFallbackAssistantMessage(errorMessage: string, isArtifactChat: boolean) {
    const normalized = errorMessage.toLowerCase();

    if (
      normalized.includes("no endpoints available matching your guardrail") ||
      normalized.includes("data policy")
    ) {
      return "OpenRouter blocked this request because your privacy or guardrail settings allow no eligible providers. Open OpenRouter Settings > Privacy and allow a compatible provider or disable the restrictive data-policy/ZDR rule, then retry.";
    }

    if (
      normalized.includes("provider returned error") ||
      normalized.includes("provider unavailable") ||
      normalized.includes("openrouter") ||
      normalized.includes("model") ||
      normalized.includes("gateway") ||
      normalized.includes("quota") ||
      normalized.includes("credit")
    ) {
      return "The provider returned an error while generating the answer. Try again, switch models, or check provider credits.";
    }

    if (
      normalized.includes("stream ended") ||
      normalized.includes("empty model response") ||
      normalized.includes("no text")
    ) {
      return "The answer stream ended early. Please retry the request.";
    }

    if (isArtifactChat) {
      return "I hit a backend issue while reading the artifact. Please try again.";
    }

    return "I hit a backend issue while answering. Please try again.";
  }

  function isProviderFailure(errorMessage: string) {
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes("provider returned error") ||
      normalized.includes("provider unavailable") ||
      normalized.includes("openrouter") ||
      normalized.includes("model") ||
      normalized.includes("gateway") ||
      normalized.includes("quota") ||
      normalized.includes("credit")
    );
  }

  function approvePendingTool() {
    const pending = pendingConfirmation;
    if (!pending) return;
    setApprovedToolCalls((current) =>
      current.includes(pending.approval_id)
        ? current
        : [...current, pending.approval_id],
    );
    setPendingConfirmation(null);
      void sendMessage(pending.question, {
        appendUser: false,
        replyTo: pending.replyTo,
        approvedToolCalls: [pending.approval_id],
        chatModeOverride: pending.mode,
        attachmentContextOverride: pending.attachmentContext,
        imageAttachmentsOverride: pending.imageAttachments,
        fastModeOverride: pending.fastMode,
      });
  }

  function editPendingTool() {
    const pending = pendingConfirmation;
    if (!pending) return;

    // The original user turn was already rendered while the agent waited for
    // approval. Remove that pending turn so the edited request can be sent as
    // a normal new message without duplicating it in the thread.
    setMessages((current) => {
      const last = current[current.length - 1];
      return last?.role === "user" && last.content === pending.question
        ? current.slice(0, -1)
        : current;
    });
    setPendingConfirmation(null);
    setQueryPlan(null);
    setQueryRoute(null);
    setInput(pending.question);
    setManualStatusMessage("Edit the request before the agent continues.");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function rejectPendingTool() {
    setQueryPlan((current) => current ? {
      ...current,
      steps: current.steps.map((step) => step.requires_confirmation ? { ...step, status: "denied", detail: "Not approved" } : step),
    } : current);
    setPendingConfirmation(null);
    setManualStatusMessage("The external tool was not run.");
    window.setTimeout(() => dispatchNextQueuedPromptRef.current(), 0);
  }

  function stopCurrentQuery() {
    queryAbortRef.current?.abort();
    setManualStatusMessage("Stopped. Partial answer and sources were kept.");
  }

  function retryLastRequest() {
    const failed = retryRequest;
    if (!failed || typing) return;

    setMessages((current) => current.filter((message) => message.id !== failed.assistantMessageId));
    setInlineError(null);
    setRetryRequest(null);
    setManualStatusMessage("Retrying with the same request...");
      void sendMessage(failed.question, {
        appendUser: false,
        replyTo: failed.replyTo,
        chatModeOverride: failed.chatMode,
        attachmentContextOverride: failed.attachmentContext,
        imageAttachmentsOverride: failed.imageAttachments,
        fastModeOverride: failed.fastMode,
      });
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId(null);
        copyFeedbackTimerRef.current = null;
      }, 1600);
    } catch {
      setInlineError("Could not copy this message.");
    }
  }

  function downloadMessage(message: Message) {
    const blob = new Blob([message.content], { type: "text/markdown;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `truememory-answer-${message.id}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setManualStatusMessage("Answer downloaded as Markdown.");
  }

  async function setMessageFeedback(message: Message, rating: "up" | "down") {
    const previousRating = message.feedback ?? null;
    const nextRating = previousRating === rating ? null : rating;

    setMessages((prev) =>
      prev.map((item) =>
        item.id === message.id ? { ...item, feedback: nextRating } : item,
      ),
    );

    if (!message.serverId) return;

    try {
      await submitMessageFeedback(message.serverId, {
        rating: nextRating,
      });
    } catch (error) {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id ? { ...item, feedback: previousRating } : item,
        ),
      );
      setInlineError(
        error instanceof Error ? error.message : "Feedback could not be saved.",
      );
    }
  }

  async function shareMessage(message: Message) {
    const conversationUrl = currentConversationId
      ? `${window.location.origin}/chat?id=${encodeURIComponent(currentConversationId)}`
      : window.location.href;
    const shareData = {
      title: "TrueMemory answer",
      text: message.content,
      url: conversationUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(
          `${message.content}\n\nContinue in TrueMemory: ${conversationUrl}`,
        );
      }

      setSharedMessageId(message.id);
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
      shareFeedbackTimerRef.current = window.setTimeout(() => {
        setSharedMessageId(null);
        shareFeedbackTimerRef.current = null;
      }, 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setInlineError("This answer could not be shared.");
    }
  }

  function openReportDialog(message: Message) {
    setReportMessage(message);
    setReportReason("incorrect");
    setReportDetails("");
    setReportError(null);
    setReportReasonOpen(false);
  }

  function closeReportDialog() {
    if (reportSubmitting) return;
    setReportMessage(null);
    setReportDetails("");
    setReportError(null);
    setReportReasonOpen(false);
  }

  async function submitReport() {
    if (!reportMessage || reportSubmitting) return;

    setReportSubmitting(true);
    setReportError(null);
    try {
      if (reportMessage.serverId) {
        const reportIndex = messages.findIndex((message) => message.id === reportMessage.id);
        const reportQuestion = reportIndex > 0 ? messages[reportIndex - 1]?.content : null;
        await submitMessageFeedback(reportMessage.serverId, {
          rating: reportMessage.feedback ?? null,
          report_reason: reportReason,
          report_details: reportDetails.trim() || null,
          question: reportQuestion,
          route: reportMessage.route ?? null,
        });
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === reportMessage.id ? { ...message, reported: true } : message,
        ),
      );
      setReportMessage(null);
      setReportDetails("");
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "The report could not be submitted.",
      );
    } finally {
      setReportSubmitting(false);
    }
  }

  function startEditingMessage(message: Message) {
    if (message.role !== "user" || typing) return;

    setEditingMessageId(message.id);
    setEditingDraft(message.content);
    setReplyingTo(null);
    setInlineError(null);
    setManualStatusMessage("Editing this question in place.");
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingDraft("");
    setManualStatusMessage(DEFAULT_CHAT_GUIDANCE);
  }

  function submitEditedMessage(message: Message) {
    if (message.role !== "user" || typing) return;

    const trimmed = editingDraft.trim();
    if (!trimmed) return;
    const index = messages.findIndex((item) => item.id === message.id);
    if (index === -1) return;

    setMessages((prev) => prev.slice(0, index));
    setEditingMessageId(null);
    setEditingDraft("");
    setReplyingTo(null);
    setInlineError(null);
    setManualStatusMessage("Updating the conversation from this question...");
    void sendMessage(trimmed, {
      appendUser: true,
      replyTo: message.replyTo ?? null,
    });
  }

  function replyToMessage(message: Message) {
    if (message.role !== "assistant") return;

    setReplyingTo(message);
    setInlineError(null);
    setManualStatusMessage("Ask a follow-up about this response.");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function regenerateAnswer(message: Message) {
    const assistantIndex = messages.findIndex((item) => item.id === message.id);
    if (assistantIndex <= 0) return;

    const previousUser = [...messages]
      .slice(0, assistantIndex)
      .reverse()
      .find((item) => item.role === "user");
    if (!previousUser) return;

    setMessages((prev) => prev.slice(0, assistantIndex));
    setInlineError(null);
    setManualStatusMessage("Regenerating answer...");
    void sendMessage(previousUser.content, {
      appendUser: false,
      replyTo: previousUser.replyTo ?? null,
    });
  }

  function buildSourceItems(message?: Message | null): SourceItem[] {
    if (!message || message.role !== "assistant") return [];
    const storedItems = messageResources[message.id] ?? message.resources?.map(toSourceItem) ?? [];
    const items = storedItems.length
      ? dedupeSourceItems(storedItems)
      : dedupeSourceItems(
          normalizeResourcesFromStream(undefined, message.content).map(toSourceItem),
        );
    return inferAnswerSourceUsage(items, message.content);
  }

  function extractMarkdownLinks(text: string): ResourceCandidate[] {
    const seen = new Set<string>();
    const items: ResourceCandidate[] = [];
    const markdownLinkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const autoLinkRe = /https?:\/\/[^\s<>"')\]]+/g;

    for (const re of [markdownLinkRe, autoLinkRe]) {
      re.lastIndex = 0;
      for (const match of text.matchAll(re)) {
        const title = match[1] && match[2] ? match[1].trim() : match[0].trim();
        const url = (match[2] ?? match[0]).replace(/[),.]+$/, "");
        if (!url || seen.has(url)) continue;
        seen.add(url);
        let domain = url;
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = url;
        }
        items.push({
          title: title || url,
          url,
          domain,
          sourceType: "Link in answer",
          description: title && title !== url ? title : undefined,
        });
      }
    }

    return items;
  }

  function normalizeResourcesFromStream(
    eventSources: StreamResourceCandidate[] | undefined,
    answerText: string,
  ): ResourceCandidate[] {
    const seen = new Set<string>();
    const resources: ResourceCandidate[] = [];

    for (const source of normalizeResourceCandidates(eventSources)) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      resources.push(source);
    }

    for (const link of extractMarkdownLinks(answerText)) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      resources.push(link);
    }

    if (uploadedDocument && resources.length === 0) {
      resources.push({
        title: uploadedDocument.filename,
        url: uploadedDocument.stored_path,
        domain: "local artifact",
        sourceType: "Uploaded artifact",
        description: `${uploadedDocument.page_count} pages, ${uploadedDocument.size_human}`,
      });
    }

    return resources;
  }

  function showSources(message?: Message) {
    setSourceMessage(message ?? null);
    setSourcesOpen(true);

    const resources = buildSourceItems(message ?? null);
    setManualStatusMessage(
      resources.length
        ? "Sources opened for this answer."
        : "No external sources were used for this answer.",
    );
  }

  function openQuickAction(action: QuickAction) {
    setQuickMenuOpen(false);
    setSlashMenuOpen(false);
    const actionId = action.id;
    if (input.trimStart().startsWith("/")) setInput("");

    if (actionId === "attach" || actionId === "photos") {
      fileInputRef.current?.click();
      return;
    }

    if (actionId === "screenshot") {
      void captureScreenshot();
      return;
    }

    if (actionId === "connector") {
      setArtifactMentionOpen(true);
      setArtifactMentionStage("root");
      setArtifactMentionIndex(0);
      return;
    }

    if (actionId === "image") {
      selectImageMode();
      return;
    }

    setActiveMode((current) => (current === actionId ? null : actionId));
    textareaRef.current?.focus();
  }

  async function captureScreenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setInlineError("Screenshot capture is not available in this browser.");
      return;
    }
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = capture.getVideoTracks()[0];
      const settings = track.getSettings();
      const canvas = document.createElement("canvas");
      canvas.width = settings.width ?? 1280;
      canvas.height = settings.height ?? 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Screenshot capture could not start.");
      const video = document.createElement("video");
      video.srcObject = capture;
      video.muted = true;
      await video.play();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      track.stop();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      video.srcObject = null;
      if (!blob) throw new Error("Screenshot capture returned no image.");
      await addOcrImages([new File([blob], `truememory-screenshot-${Date.now()}.png`, { type: "image/png" })]);
      setManualStatusMessage("Screenshot attached and ready for analysis.");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setInlineError(error instanceof Error ? error.message : "Screenshot capture failed.");
    }
  }

  function buildAssistantMessage(
    question: string,
    answer: string,
    messageId = nextMessageId(),
  ): Message {
    const normalizedAnswer =
      answer.trim() ||
      (uploadedDocument
        ? "I could not find a useful answer in the artifact."
        : "I could not find a useful answer.");
    const looksLikeSummaryRequest = SUMMARY_PROMPT_PATTERN.test(question);
    const isWeakAnswer = WEAK_ANSWER_PATTERN.test(normalizedAnswer);
    const shouldHighlight =
      looksLikeSummaryRequest && !isWeakAnswer && normalizedAnswer.length >= 120;

    return {
      id: messageId,
      role: "assistant",
      content: normalizedAnswer,
      emphasis: shouldHighlight ? "highlight" : "default",
      badge: shouldHighlight ? "Best summary" : undefined,
    };
  }

  function toSourceItem(resource: ResourceCandidate): SourceItem {
    return {
      id: resource.url,
      title: resource.title,
      domain: resource.domain,
      description: compactSourceDescription(resource.description || resource.url, 180),
      quote: resource.quote,
      url: resource.url,
      sourceType: resource.sourceType,
      providerLabel: resource.providerLabel,
      citationIndex: resource.citationIndex,
      canonicalUrl: resource.canonicalUrl,
      faviconUrl: resource.faviconUrl,
      imageUrl: resource.imageUrl,
      verification: resource.verification,
      trustScore: resource.trustScore,
      trustLabel: resource.trustLabel,
      trustComponents: resource.trustComponents,
      trustExplanation: resource.trustExplanation,
      confidenceScore: resource.confidenceScore,
      confidenceLabel: resource.confidenceLabel,
      confidenceComponents: resource.confidenceComponents,
      confidenceExplanation: resource.confidenceExplanation,
      evidenceRole: resource.evidenceRole,
      reasonUsed: resource.reasonUsed,
      influenceScore: resource.influenceScore,
      freshness: resource.freshness,
      crossVerification: resource.crossVerification,
      scoreVersion: resource.scoreVersion,
    };
  }

  function dedupeSourceItems(items: SourceItem[]): SourceItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.url ?? item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const visibleSources = buildSourceItems(sourceMessage);
  const resourceDescription = visibleSources.length
    ? `${visibleSources.length} source${visibleSources.length === 1 ? "" : "s"} checked for this answer.`
    : "No external sources were used for this answer.";

  const inlineMentions = selectedContextMentions.filter(
    (mention) => mention.kind !== "file" && mention.kind !== "document",
  );
  const previewMentions = selectedContextMentions.filter(
    (mention) => mention.kind === "file" || mention.kind === "document",
  );

  useEffect(() => {
    const rail = composerMentionsRailRef.current;
    if (!rail) return;

    const updateOverflow = () => {
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      setComposerRailOverflow(maxScroll > 4);
      setComposerCanScrollLeft(rail.scrollLeft > 4);
      setComposerCanScrollRight(rail.scrollLeft < maxScroll - 4);
    };
    updateOverflow();

    rail.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", updateOverflow);
      observer.disconnect();
    };
  }, [inlineMentions.length, activeMode, fastMode, imageModeSelected]);

  useEffect(() => {
    const rail = previewMentionsRailRef.current;
    if (!rail) return;

    const updateOverflow = () => setPreviewRailOverflow(rail.scrollWidth > rail.clientWidth + 4);
    updateOverflow();

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [previewMentions.length]);

  function scrollPreviewMentions(direction: -1 | 1) {
    const rail = previewMentionsRailRef.current;
    if (!rail) return;
    const firstChip = rail.querySelector<HTMLElement>("[data-context-pill]");
    const step = (firstChip?.offsetWidth ?? 140) + 8;
    rail.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  function startComposerRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const rail = composerMentionsRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    composerRailDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
    };
    rail.setPointerCapture(event.pointerId);
  }

  function moveComposerRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = composerRailDragRef.current;
    const rail = composerMentionsRailRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !rail) return;
    event.preventDefault();
    rail.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  }

  function endComposerRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = composerRailDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    composerRailDragRef.current = null;
    composerMentionsRailRef.current?.releasePointerCapture(event.pointerId);
  }

  return (
    <TooltipProvider delay={180}>
    <div className="chat-surface flex h-full min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--chat-background)]">
        <div className="hidden">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2">
                  <h1 className="text-base font-semibold tracking-[-0.02em] text-[var(--chat-foreground)]">
                    Agent chat
                  </h1>
                  <InfoTooltip label="Answers can combine workspace memory, uploaded documents, and live web results." />
                </div>
                <p className="mt-0.5 text-xs text-[var(--chat-muted-foreground)]">
                  Memory-aware workspace
                </p>
              </div>
              <div ref={serviceMenuRef} className="relative">
                <button
                  ref={serviceMenuButtonRef}
                  type="button"
                  onClick={() => setServiceMenuOpen((open) => !open)}
                  aria-expanded={serviceMenuOpen}
                  aria-label="Show service connection details"
                  className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 text-sm text-[var(--chat-foreground)] shadow-[0_8px_24px_-20px_rgba(64,43,24,0.45)] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-surface-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:gap-2.5 sm:px-3.5"
                >
                  <span className={`size-2 rounded-full ${backendState.backendOk === false ? "bg-red-400" : backendState.backendOk === null ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="hidden font-medium sm:inline">
                    {backendState.backendOk === false
                      ? "Connection issue"
                      : backendState.backendOk === null
                        ? "Checking services"
                        : "Services connected"}
                  </span>
                  <span className="text-xs text-[var(--chat-muted-foreground)]">
                    {connectedCount}/{serviceItems.length}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[var(--chat-muted-foreground)] transition-transform ${
                      serviceMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {serviceMenuOpen ? (
                  <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 shadow-[0_18px_42px_-18px_rgba(64,43,24,0.22)]">
                    <div className="border-b border-[var(--chat-border)] px-3 py-2">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-[var(--chat-foreground)]">Services</p>
                        <InfoTooltip label="Connection health for storage, retrieval, models, and the active artifact." side="left" />
                      </div>
                      <p className="text-xs text-[var(--chat-muted-foreground)]">
                        Live backend connections and active artifact.
                      </p>
                    </div>
                    <div className="space-y-1 p-2">
                      {serviceItems.map((item) => (
                        <ServiceRow
                          key={item.label}
                          label={item.label}
                          value={item.value}
                          tone={item.tone}
                        />
                      ))}
                    </div>
                    <div className="border-t border-[var(--chat-border)] p-2">
                      <button
                        type="button"
                        onClick={() => setVisualizationOpen((open) => !open)}
                        className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[var(--chat-foreground)] transition-colors duration-150 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                      >
                        <span>See visualization</span>
                        <ChevronRight
                          className={`h-4 w-4 text-[var(--chat-subtle-foreground)] transition ${
                            visualizationOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {visualizationOpen ? (
                      <div className="border-t border-[var(--chat-border)] px-3 py-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
                          Pipeline Flow
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <VisualizationChip
                            label="Upload"
                            detail={
                              uploadedDocument
                                ? uploadedDocument.filename
                                : "Select PDF"
                            }
                            active={Boolean(uploadedDocument)}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Extract"
                            detail="Read pages"
                            active={completedSteps.has("extract")}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Chunk"
                            detail="Split text"
                            active={completedSteps.has("chunk")}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Tokenize"
                            detail="Count tokens"
                            active={completedSteps.has("tokenize")}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Embed"
                            detail="Create vectors"
                            active={completedSteps.has("embed")}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Vector DB"
                            detail="Store in Milvus"
                            active={completedSteps.has("milvus")}
                          />
                          <VisualizationArrow />
                          <VisualizationChip
                            label="Answer"
                            detail="Reply in chat"
                            active={completedSteps.has("ready")}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        </div>

        <div
          ref={threadScrollRef}
          onScroll={syncThreadScrollState}
          onWheel={() => {
            isScrollingToLatestRef.current = false;
          }}
          onTouchStart={() => {
            isScrollingToLatestRef.current = false;
          }}
          className="chat-scrollbar flex flex-1 overflow-y-auto bg-[var(--chat-background)] px-3 py-6 sm:px-6 sm:py-8"
        >
          <div
            className={`mx-auto flex w-full max-w-4xl flex-1 flex-col ${
              hasMessages ? "justify-start" : "items-center justify-center"
            }`}
          >
            <ChatStatus error={inlineError} onRetry={retryRequest ? retryLastRequest : undefined} />
            {loadingConversationId ? (
              <ChatThreadSkeleton />
            ) : !hasMessages ? (
              <Welcome
                disabled={Boolean(uploadedDocument && !pipelineReady) || typing}
                onSuggestion={(suggestion) => {
                  setInput(suggestion);
                  textareaRef.current?.focus();
                }}
              />
            ) : (
              <motion.div
                key={currentConversationId ?? "local-thread"}
                className="w-full"
                initial={
                  prefersReducedMotion
                    ? false
                    : { opacity: 0 }
                }
                animate={{ opacity: 1 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.12, ease: [0.23, 1, 0.32, 1] }
                }
              >
                <MessageList
                  messages={messages}
                  isTyping={typing}
                  activity={chatActivityState}
                  route={queryRoute}
                  plan={queryPlan}
                  liveSources={querySources}
                  showReasoningSummary={activeMode === "thinking" || activeMode === "deep-research"}
                  fastMode={fastMode}
                  confirmation={pendingConfirmation}
                  onApproveTool={approvePendingTool}
                  onRejectTool={rejectPendingTool}
                  onEditTool={editPendingTool}
                  onStop={stopCurrentQuery}
                  copiedMessageId={copiedMessageId}
                  sharedMessageId={sharedMessageId}
                  onCopy={(message) => void copyMessage(message)}
                  onDownload={downloadMessage}
                  onFeedback={(message, rating) => void setMessageFeedback(message, rating)}
                  onShare={(message) => void shareMessage(message)}
                  onReport={openReportDialog}
                  editingMessageId={editingMessageId}
                  editingDraft={editingDraft}
                  onEditStart={startEditingMessage}
                  onEditDraftChange={setEditingDraft}
                  onEditCancel={cancelEditingMessage}
                  onEditSubmit={submitEditedMessage}
                  onReply={replyToMessage}
                  onRegenerate={regenerateAnswer}
                  onSources={showSources}
                  onFollowUp={(question) => void sendMessage(question)}
                />
                <div ref={bottomRef} />
              </motion.div>
            )}
          </div>
        </div>

        <div className="chat-composer-fade relative px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-5">
          <AnimatePresence initial={false}>
            {showScrollToBottom ? (
              <motion.button
                type="button"
                aria-label="Scroll to latest message"
                title="Scroll to latest message"
                initial={{ opacity: 0, scale: 0.92, x: "-50%", y: 6 }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: 0 }}
                exit={{ opacity: 0, scale: 0.94, x: "-50%", y: 4 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => scrollToLatest("smooth")}
                className="absolute -top-12 left-1/2 z-20 flex size-11 items-center justify-center rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-raised)] text-[var(--chat-foreground)] shadow-[0_12px_30px_-16px_rgba(64,43,24,0.45)] backdrop-blur-md transition-[background-color,border-color,color] duration-150 hover:border-[var(--chat-accent)] hover:bg-[var(--chat-surface)] hover:text-[var(--chat-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </motion.button>
            ) : null}
          </AnimatePresence>
          <div className="mx-auto w-full max-w-[768px]">
          <div className="chat-prompt-shell relative rounded-[22px] border border-[var(--chat-border)] bg-[var(--chat-composer)] px-3.5 pb-3 pt-2.5 sm:rounded-[26px] sm:px-4 sm:pb-3.5 sm:pt-3">
            {activeProject ? <div className="mb-2 flex min-h-9 items-center">
              <ProjectSelector
                projects={projects}
                selected={activeProject}
                loading={projectsLoading}
                onSelect={selectActiveProject}
                onCreate={() => setProjectCreateOpen(true)}
              />
              <span className="ml-auto hidden max-w-[44%] truncate px-2 text-[11px] text-[var(--chat-subtle-foreground)] sm:block">
                Project context is active
              </span>
            </div> : null}
            <ArtifactMentionMenu
              menuRef={artifactMentionMenuRef}
              open={artifactMentionOpen}
              stage={artifactMentionStage}
              items={filteredArtifactOptions}
              loading={
                artifactMentionStage === "artifacts" && artifactOptionsLoading
              }
              error={
                artifactMentionStage === "artifacts" ||
                artifactMentionStage === "files" ||
                artifactMentionStage === "documents"
                  ? artifactOptionsError
                  : artifactMentionStage === "github_repositories"
                    ? githubMentionError
                  : null
              }
              query={artifactMentionQuery}
              activeIndex={artifactMentionIndex}
              contextItems={contextMentionOptions}
              selectedContextIds={selectedContextMentions.map((mention) => mention.id)}
              contextLoading={
                artifactMentionStage === "projects"
                  ? projectsLoading
                  : artifactMentionStage === "files" ||
                      artifactMentionStage === "documents"
                    ? artifactOptionsLoading
                  : artifactMentionStage === "skills" && skillMentionLoading
                    ? true
                    : artifactMentionStage === "github_repositories" && githubMentionLoading
              }
              search={mentionSearch}
              onSearchChange={(value) => {
                setMentionSearch(value);
                setArtifactMentionIndex(0);
              }}
              onOpenStage={(stage) => {
                setArtifactMentionStage(stage);
                setArtifactMentionIndex(0);
                if (stage === "projects" || stage === "github_repositories") setMentionSearch("");
              }}
              onBack={() => {
                setArtifactMentionStage("root");
                setArtifactMentionIndex(0);
              }}
              onSelect={selectArtifactMention}
              onSelectContext={selectContextMention}
              onClose={() => {
                setArtifactMentionOpen(false);
                setArtifactMentionStage("root");
                setArtifactMentionIndex(0);
                window.requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
            {(visibleDocument && !artifactCommitted) || attachment || pastedTextDocument || ocrImages.length ? (
            <div className="mb-3 flex flex-wrap gap-3">
              {visibleDocument && !artifactCommitted ? (
                <ArtifactPreview
                  label={visibleDocument.title || visibleDocument.filename}
                  filename={visibleDocument.filename}
                  detail={pipelineReady ? "Ready" : "Processing"}
                  tone={pipelineReady ? "success" : "neutral"}
                  onOpen={() => {
                    setDocumentPreviewFile(null);
                    setDocumentPreviewOpen(true);
                  }}
                  onRemove={clearCurrentArtifact}
                />
              ) : attachment ? (
                <AttachmentChip
                  attachment={attachment}
                  onOpen={() => {
                    setDocumentPreviewFile(attachment.file ?? null);
                    setDocumentPreviewOpen(true);
                  }}
                  onRemove={() => {
                    setDocumentPreviewOpen(false);
                    setDocumentPreviewFile(null);
                    setAttachment(null);
                  }}
                />
              ) : null}
              {pastedTextDocument ? (
                <ArtifactPreview
                  label={pastedTextDocument.name}
                  detail={`${pastedTextDocument.content.length.toLocaleString()} chars`}
                  tone="success"
                  onOpen={() => {
                    setDocumentPreviewFile(pastedTextDocument.file);
                    setDocumentPreviewOpen(true);
                  }}
                  onRemove={() => {
                    setDocumentPreviewOpen(false);
                    setDocumentPreviewFile(null);
                    setPastedTextDocument(null);
                  }}
                />
              ) : null}
              {ocrImages.map((image) => (
                <ImageOcrPreview
                  key={image.id}
                  image={image}
                  onOpen={() => {
                    setDocumentPreviewFile(image.file);
                    setDocumentPreviewOpen(true);
                  }}
                  onRemove={() => {
                    if (documentPreviewFile === image.file) {
                      setDocumentPreviewOpen(false);
                      setDocumentPreviewFile(null);
                    }
                    removeOcrImage(image.id);
                  }}
                />
              ))}
            </div>
            ) : null}

            <AnimatePresence initial={false}>
              {replyingTo ? (
                <motion.div
                  key={replyingTo.id}
                  initial={{ height: 0, opacity: 0, scale: 0.98 }}
                  animate={{ height: "auto", opacity: 1, scale: 1 }}
                  exit={{ height: 0, opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="mb-3 overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-muted)]"
                >
                  <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                    <span
                      className="h-9 w-0.5 shrink-0 rounded-full bg-[var(--chat-accent)]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-accent)]">
                        Asking about this response
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--chat-muted-foreground)]">
                        {replyingTo.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      title="Cancel reply"
                      onClick={() => setReplyingTo(null)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-muted-foreground)] transition-colors duration-150 hover:bg-[var(--chat-background)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:size-8"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {previewMentions.length ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-2 overflow-hidden rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-muted)]/45 p-2"
                  aria-label="Selected context"
                >
                  <details open>
                    <summary className="cursor-pointer select-none text-xs font-semibold text-[var(--chat-foreground)]">
                      Context Preview · {selectedContextMentions.length} resource{selectedContextMentions.length === 1 ? "" : "s"}
                    </summary>
                    <p className="mt-1 text-[11px] text-[var(--chat-muted-foreground)]">
                      These references resolve into a ranked, deduplicated context graph before submission.
                    </p>
                    {contextPreviewLoading ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--chat-muted-foreground)]">
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        Resolving authorized context…
                      </p>
                    ) : contextPreview?.nodes.length ? (
                      <ul className="mt-2 space-y-1" aria-label="Resolved context">
                        {contextPreview.nodes.slice(0, 5).map((node) => (
                          <li key={node.id} className="rounded-lg bg-[var(--chat-background)] px-2 py-1.5">
                            <span className="block text-[11px] font-medium">{node.label}</span>
                            <span className="block truncate text-[10px] text-[var(--chat-muted-foreground)]">
                              {node.preview}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : contextPreview?.message ? (
                      <p role="status" className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700">
                        {contextPreview.message}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5">
                        {previewRailOverflow ? (
                          <button
                            type="button"
                            aria-label="Scroll context chips left"
                            onClick={() => scrollPreviewMentions(-1)}
                            className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                          >
                            <ChevronLeft className="size-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                        <div
                          ref={previewMentionsRailRef}
                          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {previewMentions.map((mention) => (
                            <ContextMentionPill
                              key={`${mention.kind}:${mention.id}`}
                              mention={mention}
                              onRemove={() => removeContextMention(mention)}
                            />
                          ))}
                        </div>
                        {previewRailOverflow ? (
                          <button
                            type="button"
                            aria-label="Scroll context chips right"
                            onClick={() => scrollPreviewMentions(1)}
                            className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                          >
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </details>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {promptQueue.length ? (
              <PromptQueueList
                items={promptQueue}
                onMove={moveQueuedPrompt}
                onReorder={reorderQueuedPrompt}
                onRemove={removeQueuedPrompt}
              />
            ) : null}

            <label htmlFor="chat-input" className="sr-only">Message TrueMemory</label>
            <ScrollArea
              viewportRef={composerScrollRef}
              orientation="vertical"
              className="w-full pr-2"
              style={{ height: `${composerHeight}px` }}
              aria-label="Message composer"
            >
            <textarea
              ref={textareaRef}
              id="chat-input"
              name="chat-input"
              rows={1}
              value={input}
              placeholder={
                typing
                  ? "Message TrueMemory while it works..."
                  : imageModeSelected
                    ? "Describe the image you want..."
                    : !uploadedDocument || pipelineReady
                      ? "Ask anything..."
                      : "Preparing your file..."
              }
              onChange={(e) => {
                const nextValue = e.target.value;
                setInput(nextValue);
                setSlashMenuOpen(nextValue.trimStart().startsWith("/") && !nextValue.includes("\n"));
                updateArtifactMention(nextValue);
                autoResize();
              }}
              onPaste={handleComposerPaste}
              onKeyDown={handleKeyDown}
              disabled={Boolean(uploadedDocument && !pipelineReady) || imageGenerating}
              className={`block w-full resize-none overflow-hidden bg-transparent px-0.5 text-[16px] leading-6 text-[var(--chat-foreground)] outline-none placeholder:text-[var(--chat-subtle-foreground)] disabled:opacity-50 sm:text-[15px] ${uploadedDocument && !pipelineReady ? "preparing-file-input" : ""}`}
              style={{ minHeight: "28px" }}
            />
            </ScrollArea>

            <div className="mt-3 flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div ref={quickMenuRef} className="relative">
                  <button
                    ref={quickMenuButtonRef}
                    type="button"
                    aria-label={(quickMenuOpen || slashMenuOpen) ? "Close composer actions" : "Open composer actions"}
                    aria-expanded={quickMenuOpen || slashMenuOpen}
                    onClick={() => {
                      setSlashMenuOpen(false);
                      setModeMenuOpen(false);
                      setQuickMenuOpen((v) => !v);
                    }}
                    className={`group/quick flex size-11 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] transition-[background-color,border-color,color,transform] duration-150 hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:size-9 ${(quickMenuOpen || slashMenuOpen) ? "border-[var(--chat-border-strong)] bg-[var(--chat-surface-muted)] text-[var(--chat-foreground)]" : ""}`}
                  >
                    <Plus
                      className={`h-4 w-4 transition-transform duration-200 ease-out ${(quickMenuOpen || slashMenuOpen) ? "rotate-45" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  <QuickActionMenu
                    open={quickMenuOpen || slashMenuOpen}
                    activeMode={activeMode}
                    selectedModel={selectedModel}
                    onSelect={openQuickAction}
                    onSelectModel={(model) => {
                      setSelectedModel(model);
                      setQuickMenuOpen(false);
                      window.requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                    onOpenSkills={() => {
                      setArtifactMentionOpen(true);
                      setArtifactMentionStage("skills");
                      setMentionSearch("");
                      setQuickMenuOpen(false);
                    }}
                    enabledSkills={skillMentionOptions.filter((skill) =>
                      (loadEnabledAgentSkills(skillMentionOptions) ?? []).includes(skill.name),
                    )}
                    onUseSkill={(skill) => {
                      setSelectedContextMentions((current) => current.some((item) => item.id === skill.name)
                        ? current
                        : [...current, { id: skill.name, label: skill.name, description: skill.description, kind: "skills" }]);
                      setQuickMenuOpen(false);
                    }}
                    projectControl={
                      <ProjectSelector
                        projects={projects}
                        selected={activeProject}
                        loading={projectsLoading}
                        onSelect={selectActiveProject}
                        onCreate={() => setProjectCreateOpen(true)}
                      />
                    }
                  />
                </div>
                <ComposerModeSelector
                  activeMode={activeMode}
                  fastMode={fastMode}
                  menuRef={modeMenuRef}
                  onSelect={(action) => {
                    openQuickAction(action);
                    setModeMenuOpen(false);
                  }}
                  onToggleFast={() => setFastMode((value) => !value)}
                  open={modeMenuOpen}
                  onToggle={() => setModeMenuOpen((value) => !value)}
                />
                <AnimatePresence initial={false}>
                  {IMAGE_GENERATION_ENABLED && imageModeSelected ? (
                    <ActiveImageActionTab
                      onOpen={selectImageMode}
                      onClear={() => setImageModeSelected(false)}
                    />
                  ) : null}
                </AnimatePresence>
                <div className="group/composer-rail relative min-w-0 flex-1">
                  {composerCanScrollLeft ? (
                    <button
                      type="button"
                      aria-label="Scroll selected context left"
                      onClick={() => {
                        const rail = composerMentionsRailRef.current;
                        if (!rail) return;
                        const firstChip = rail.querySelector<HTMLElement>("[data-context-pill]");
                        const step = (firstChip?.offsetWidth ?? 132) + 8;
                        rail.scrollBy({ left: -step, behavior: "smooth" });
                      }}
                      className="pointer-events-none absolute left-0 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] opacity-0 shadow-sm transition-[background-color,color,opacity,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] group-hover/composer-rail:pointer-events-auto group-hover/composer-rail:opacity-100 group-focus-within/composer-rail:pointer-events-auto group-focus-within/composer-rail:opacity-100"
                    >
                      <ChevronLeft className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                  <div
                    ref={composerMentionsRailRef}
                    onPointerDown={startComposerRailDrag}
                    onPointerMove={moveComposerRailDrag}
                    onPointerUp={endComposerRailDrag}
                    onPointerCancel={endComposerRailDrag}
                    className={`flex w-full min-w-0 cursor-auto select-none items-center gap-1.5 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${composerCanScrollLeft ? "pl-9" : ""} ${composerCanScrollRight ? "pr-9" : ""}`}
                  >
                    {inlineMentions.map((mention) => (
                      <ContextMentionPill
                        key={`${mention.kind}:${mention.id}`}
                        mention={mention}
                        onRemove={() => removeContextMention(mention)}
                        compact
                      />
                    ))}
                  </div>
                  {composerCanScrollRight ? (
                    <button
                      type="button"
                      aria-label="Scroll selected context right"
                      onClick={() => {
                        const rail = composerMentionsRailRef.current;
                        if (!rail) return;
                        const firstChip = rail.querySelector<HTMLElement>("[data-context-pill]");
                        const step = (firstChip?.offsetWidth ?? 132) + 8;
                        rail.scrollBy({ left: step, behavior: "smooth" });
                      }}
                      className="pointer-events-none absolute right-0 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] opacity-0 shadow-sm transition-[background-color,color,opacity,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] group-hover/composer-rail:pointer-events-auto group-hover/composer-rail:opacity-100 group-focus-within/composer-rail:pointer-events-auto group-focus-within/composer-rail:opacity-100"
                    >
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              {typing ? (
                <div className="flex shrink-0 items-center gap-2">
                  {input.trim() ? (
                    <button
                      type="button"
                      onClick={enqueueCurrentPrompt}
                      aria-label="Add prompt to queue"
                      title="Add to queue"
                      className="chat-queue-action"
                    >
                      <ListOrdered className="size-3.5" aria-hidden="true" />
                      <span>Queue</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={stopCurrentQuery}
                    aria-label="Stop generation"
                    className="chat-composer-action"
                  >
                    <span className="size-3 rounded-[3px] bg-current" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={(!input.trim() && !pastedTextDocument && readyOcrImages.length === 0) || ocrIsReading || Boolean(uploadedDocument && !pipelineReady) || imageGenerating}
                  aria-label="Send message"
                  className="chat-composer-action"
                >
                  <ArrowUp className="size-[17px]" strokeWidth={2.15} aria-hidden="true" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              id="file-upload"
              name="file-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,.pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.markdown,.json,.html,.htm,.py,.js,.jsx,.ts,.tsx,.css,.scss,.sql,.yaml,.yml,.xml,.toml,.ini,.log,.java,.go,.rs,.c,.h,.cpp,.hpp,.sh,.ps1"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFileSelection(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>
          </div>
        </div>
      </main>

      <ProcessingDialog
        open={processingOpen}
        filename={attachment?.name ?? "document"}
        status={manualStatusMessage ?? "Preparing your document..."}
      />

      <DocumentPreviewDialog
        open={documentPreviewOpen}
        onOpenChange={(open) => {
          setDocumentPreviewOpen(open);
          if (!open) setDocumentPreviewFile(null);
        }}
        document={documentPreviewFile ? null : visibleDocument}
        file={documentPreviewFile ?? (!visibleDocument ? attachment?.file ?? null : null)}
      />

      <ProjectCreateDialog
        open={projectCreateOpen}
        workspaceId={activeWorkspaceId}
        onOpenChange={setProjectCreateOpen}
        onCreated={(project) => {
          setProjects((current) => [project, ...current]);
          selectActiveProject(project);
          toast.success(`${project.name} created`);
        }}
      />

      <Dialog
        open={Boolean(reportMessage)}
        onOpenChange={(open) => {
          if (!open) closeReportDialog();
        }}
      >
        <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] shadow-[0_28px_80px_-36px_rgba(64,43,24,0.5)] sm:max-w-[460px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitReport();
            }}
          >
              <DialogHeader className="border-b border-[var(--chat-border)] px-5 py-5 pr-12">
                <DialogTitle className="text-lg font-semibold tracking-[-0.025em]">
                  Report this response
                </DialogTitle>
                <DialogDescription className="leading-6 text-[var(--chat-muted-foreground)]">
                  Tell us what went wrong. Your feedback helps improve future answers.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 px-5 py-6">
                <div className="space-y-2.5">
                  <label htmlFor="report-reason" className="block text-sm font-medium leading-5 text-[var(--chat-foreground)]">
                    Reason
                  </label>
                  <DropdownMenu open={reportReasonOpen} onOpenChange={setReportReasonOpen}>
                    <DropdownMenuTrigger
                      render={
                        <button
                          id="report-reason"
                          type="button"
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-3 text-sm text-[var(--chat-foreground)] transition-colors duration-150 hover:border-[var(--chat-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                        />
                      }
                    >
                      <span className="truncate">
                        {REPORT_REASONS.find((reason) => reason.value === reportReason)?.label}
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-(--anchor-width) min-w-(--anchor-width) p-1">
                      <DropdownMenuRadioGroup
                        value={reportReason}
                        onValueChange={(value) => {
                          setReportReason(value as ReportReason);
                          setReportReasonOpen(false);
                        }}
                      >
                        {REPORT_REASONS.map((reason) => (
                          <DropdownMenuRadioItem
                            key={reason.value}
                            value={reason.value}
                            className="min-h-9 rounded-md px-2.5 py-1.5 text-sm"
                          >
                            <span className="truncate">{reason.label}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                  <div className="space-y-2.5">
                    <label htmlFor="report-details" className="block text-sm font-medium leading-5 text-[var(--chat-foreground)]">
                      Details <span className="text-[var(--chat-subtle-foreground)]">(optional)</span>
                    </label>
                  <textarea
                    id="report-details"
                  value={reportDetails}
                  maxLength={800}
                  rows={4}
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Describe the problem without including private information."
                  className="w-full resize-none rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] px-3 py-2.5 text-[16px] leading-6 text-[var(--chat-foreground)] outline-none placeholder:text-[var(--chat-subtle-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:text-sm"
                />
              </div>

              {reportError ? (
                <p role="alert" className="text-sm text-red-700">
                  {reportError}
                </p>
              ) : null}
            </div>

            <DialogFooter className="m-0 flex-row justify-end rounded-none border-t border-[var(--chat-border)] bg-[var(--chat-surface-muted)] px-5 py-4">
              <button
                type="button"
                onClick={closeReportDialog}
                disabled={reportSubmitting}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-[var(--chat-muted-foreground)] transition-colors duration-150 hover:bg-[var(--chat-background)] hover:text-[var(--chat-foreground)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportSubmitting}
                className="min-h-11 rounded-full bg-[var(--chat-accent)] px-5 text-sm font-semibold text-[var(--chat-accent-foreground)] transition-[background-color,filter,transform] duration-150 hover:bg-[var(--chat-accent-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full border-l border-[var(--chat-border)] bg-[var(--chat-surface)] p-0 text-[var(--chat-foreground)] sm:max-w-[600px]">
          <div className="flex h-full flex-col">
            <SheetHeader className="relative border-b border-[var(--chat-border)] px-6 pb-5 pt-6 pr-20 sm:px-7 sm:pr-20">
              <SheetTitle className="text-base font-semibold tracking-[-0.02em] text-[var(--chat-foreground)]">
                Sources
              </SheetTitle>
              <SheetDescription className="text-sm text-[var(--chat-muted-foreground)]">
                {resourceDescription}
              </SheetDescription>
              <SheetClose
                render={
                  <button
                    type="button"
                    aria-label="Close sources"
                    className="absolute right-5 top-5 inline-flex size-11 items-center justify-center rounded-xl text-[var(--chat-muted-foreground)] transition-[background-color,color,transform] duration-100 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                  />
                }
              >
                <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </SheetClose>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-7">
              {visibleSources.length ? (
                <div className="space-y-6">
                  <SourceExplorerOverview sources={visibleSources} />
                  <section aria-labelledby="source-list-title" className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h2 id="source-list-title" className="text-xs font-semibold text-[var(--chat-foreground)]">
                          Sources
                        </h2>
                        <p className="mt-1 text-[10px] text-[var(--chat-subtle-foreground)]">
                          Used sources appear first.
                        </p>
                      </div>
                    </div>
                    {[...visibleSources]
                      .sort((left, right) => {
                        const roleRank = (role?: QuerySource["evidence_role"]) =>
                          role === "primary" ? 3 : role === "supporting" ? 2 : 1;
                        return (
                          roleRank(right.evidenceRole) - roleRank(left.evidenceRole) ||
                          (right.trustScore ?? -1) - (left.trustScore ?? -1)
                        );
                      })
                      .map((source, index) => (
                        <SourceIntelligenceCard key={source.id} source={source} rank={index + 1} />
                      ))}
                  </section>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--chat-border-strong)] bg-[var(--chat-background)] p-4 text-sm text-[var(--chat-muted-foreground)]">
                  No external sources were used for this answer.
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  );
}

function PromptQueueList({
  items,
  onMove,
  onReorder,
  onRemove,
}: {
  items: QueuedPrompt[];
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  return (
    <section aria-label="Queued prompts" className="mb-3 border-b border-[var(--chat-border)] pb-3">
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <ListOrdered className="size-3.5 text-[var(--chat-accent)]" aria-hidden="true" />
        <p className="text-[11px] font-semibold text-[var(--chat-foreground)]">
          Queue <span className="font-normal text-[var(--chat-subtle-foreground)]">{items.length}</span>
        </p>
      </div>
      <ol className="space-y-1">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={(event) => {
              setDraggedId(item.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromId = event.dataTransfer.getData("text/plain") || draggedId;
              if (fromId) onReorder(fromId, item.id);
              setDraggedId(null);
            }}
            className={`group flex min-h-9 cursor-grab items-center gap-2 rounded-lg bg-[var(--chat-surface-muted)]/55 px-2 transition-[background-color,opacity,transform] duration-150 active:cursor-grabbing ${draggedId === item.id ? "opacity-45" : "hover:bg-[var(--chat-surface-muted)]"}`}
          >
            <span className="w-4 shrink-0 text-center font-mono text-[9px] tabular-nums text-[var(--chat-subtle-foreground)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--chat-foreground)]">
              {item.question}
            </span>
            <div className="flex shrink-0 items-center opacity-70 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                aria-label={`Move queued prompt ${index + 1} up`}
                disabled={index === 0}
                onClick={() => onMove(item.id, -1)}
                className="grid size-8 place-items-center rounded-md text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-background)] hover:text-[var(--chat-foreground)] disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <ArrowUp className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move queued prompt ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => onMove(item.id, 1)}
                className="grid size-8 place-items-center rounded-md text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-background)] hover:text-[var(--chat-foreground)] disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <ArrowDown className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove queued prompt ${index + 1}`}
                onClick={() => onRemove(item.id)}
                className="grid size-8 place-items-center rounded-md text-[var(--chat-muted-foreground)] hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Welcome({
  onSuggestion,
  disabled,
}: {
  onSuggestion: (suggestion: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="flex w-full max-w-2xl flex-col items-center px-4 py-6 text-center sm:py-8">
      <div className="welcome-kontext-mark relative size-14 overflow-hidden" aria-hidden="true">
        <PaperDither
          className="inset-0"
          dark={{ colorBack: "#3a1c0b", colorFront: "#f19045" }}
          light={{ colorBack: "#f8d4b5", colorFront: "#e67d2b" }}
          eager
          maxPixelCount={128 * 128}
          scale={0.7}
          shape="swirl"
          size={1.65}
          speed={0.1}
          type="4x4"
        />
      </div>
      <div className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
        <span className="size-2 rounded-full bg-[var(--chat-accent)]" aria-hidden="true" />
        TrueMemory
      </div>
      <h2 className="mt-2 text-balance font-heading text-2xl font-semibold tracking-[-0.04em] text-[var(--chat-foreground)] sm:text-3xl">
        What are you working on?
      </h2>
      <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-[var(--chat-muted-foreground)]">
        Ask anything, attach a PDF, or use live web context.
      </p>

      <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            onClick={() => onSuggestion(suggestion.prompt)}
            disabled={disabled}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 text-sm font-medium text-[var(--chat-muted-foreground)] shadow-[0_8px_20px_-18px_rgba(64,43,24,0.34)] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion.label}
            <ArrowUpRight className="size-3.5 shrink-0 text-[var(--chat-accent)] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </section>
  );
}

function InfoTooltip({ label, side = "bottom" }: { label: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="relative inline-flex size-8 items-center justify-center rounded-full text-[var(--chat-subtle-foreground)] transition-colors duration-150 before:absolute before:-inset-1.5 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side={side} sideOffset={6} className="max-w-64 text-pretty leading-5">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ProcessingDialog({
  open,
  filename,
  status,
}: {
  open: boolean;
  filename: string;
  status: string;
}) {
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[560px] gap-5 rounded-[28px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-5 text-[var(--chat-foreground)] shadow-[0_22px_52px_-34px_rgba(64,43,24,0.2)] ring-0 sm:max-w-[560px] sm:p-6"
      >
        <DialogHeader className="gap-2 pr-4">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-[var(--chat-accent)]" aria-hidden="true" />
            <DialogTitle className="truncate text-lg font-semibold tracking-[-0.025em] text-[var(--chat-foreground)]">
              Preparing {filename}
            </DialogTitle>
          </div>
          <DialogDescription aria-live="polite" className="text-sm leading-6 text-[var(--chat-muted-foreground)]">
            {status}
          </DialogDescription>
        </DialogHeader>

        <LoadingCarousel
          tips={PROCESSING_TIPS}
          aspectRatio="wide"
          autoplayInterval={2600}
          showIndicators
          showNavigation={false}
          showProgress
          className="max-w-none rounded-[20px] border border-[var(--chat-border)] bg-[var(--chat-surface-muted)] shadow-none"
        />

        <p className="text-center text-xs leading-5 text-[var(--chat-subtle-foreground)]">
          Keep this window open. The chat will unlock automatically when indexing is complete.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ChatStatus({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry?: () => void;
}) {
  if (!error) return null;
  const isOpenRouterConfigError =
    error.includes("OPENROUTER_API_KEY") ||
    error.includes("OpenRouter is not configured on the backend");

  return (
    <div
      role="alert"
      className={`mb-5 flex w-full max-w-xl items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        isOpenRouterConfigError
          ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-900 dark:text-amber-100"
          : "border-red-500/25 bg-red-500/[0.06] text-red-700"
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1.5 leading-6">
        <p>{error}</p>
        {isOpenRouterConfigError ? (
          <p className="text-xs leading-5 text-amber-900/75 dark:text-amber-100/75">
            Check <Link href="/status" className="underline underline-offset-2">/status</Link> and add the key to the backend `.env`, then restart the server.
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
            isOpenRouterConfigError
              ? "border-amber-500/25 text-amber-950 hover:bg-amber-500/10 focus-visible:ring-amber-500/40 dark:text-amber-50"
              : "border-red-500/25 text-red-800 hover:bg-red-500/10 focus-visible:ring-red-500/40"
          }`}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

function ChatThreadSkeleton() {
  return (
    <div className="w-full space-y-8 pt-6">
      <div className="flex justify-end">
        <div className="h-9 w-48 animate-pulse rounded-2xl bg-[var(--chat-surface-muted)]" />
      </div>
      <div className="flex gap-4">
        <div className="h-7 w-7 flex-shrink-0 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
          <div className="h-4 w-10/12 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
          <div className="h-4 w-7/12 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-9 w-36 animate-pulse rounded-2xl bg-[var(--chat-surface-muted)]" />
      </div>
      <div className="flex gap-4">
        <div className="h-7 w-7 flex-shrink-0 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-9/12 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
          <div className="h-4 w-8/12 animate-pulse rounded-full bg-[var(--chat-surface-muted)]" />
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "error";
}) {
  const classes =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-700"
        : tone === "error"
          ? "bg-red-500/10 text-red-700"
          : "bg-[var(--chat-surface-muted)] text-[var(--chat-muted-foreground)]";
  const dotClass =
    tone === "success"
      ? "bg-emerald-400"
      : tone === "warning"
        ? "bg-amber-400"
        : tone === "error"
          ? "bg-red-400"
          : "bg-zinc-500";

  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${classes}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-sm text-[var(--chat-foreground)]">{label}</span>
      </div>
      <span className="max-w-40 truncate text-sm text-[var(--chat-muted-foreground)]">{value}</span>
    </div>
  );
}

function VisualizationChip({
  label,
  detail,
  active,
}: {
  label: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div
      className={`min-w-[92px] rounded-2xl border px-3 py-2 ${
        active
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-[var(--chat-border)] bg-[var(--chat-background)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            active ? "bg-emerald-400" : "bg-zinc-600"
          }`}
        />
        <p className="text-sm font-medium text-[var(--chat-foreground)]">{label}</p>
      </div>
      <p className="mt-1 truncate text-[11px] text-[var(--chat-muted-foreground)]">{detail}</p>
    </div>
  );
}

function VisualizationArrow() {
  return <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--chat-subtle-foreground)]" />;
}

function ImageOcrPreview({
  image,
  onOpen,
  onRemove,
}: {
  image: ImageOcrAttachment;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const status = image.status === "reading"
    ? "Preparing image…"
    : image.status === "ready"
      ? image.result?.text
        ? "Text ready"
        : "Ready for visual analysis"
      : "Could not read";
  const provider = image.status === "ready" ? image.result?.model : undefined;

  return (
    <div className="group relative flex w-[220px] items-center gap-3 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 shadow-[0_12px_28px_-24px_rgba(64,43,24,0.55)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--chat-border-strong)] hover:shadow-[0_16px_34px_-24px_rgba(64,43,24,0.65)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ${image.file.name}`}
        title={`Preview ${image.file.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
      >
        <span
          className="relative block h-14 w-16 shrink-0 overflow-hidden rounded-[10px] bg-[var(--chat-surface-muted)] bg-cover bg-center shadow-[inset_0_0_0_1px_var(--chat-border)]"
          style={{ backgroundImage: `url(${image.previewUrl})` }}
          aria-hidden="true"
        >
          {image.status === "reading" ? (
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--chat-surface)]/70 backdrop-blur-[2px]">
              <Loader2 className="size-4 animate-spin text-[var(--chat-accent)]" aria-hidden="true" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1 pr-5">
          <span className="block truncate text-xs font-medium text-[var(--chat-foreground)]">
            {image.file.name}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-[var(--chat-muted-foreground)]">
            <ScanText className="size-3 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{status}</span>
          </span>
          {provider ? (
            <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--chat-subtle-foreground)]">
              {provider}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${image.file.name}`}
        title="Remove image"
        className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-[var(--chat-surface)]/90 text-[var(--chat-muted-foreground)] opacity-100 shadow-sm backdrop-blur-sm transition-[background-color,color,opacity,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function ContextMentionPill({
  mention,
  onRemove,
  compact = false,
}: {
  mention: SelectedContextMention;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 2 }}
      title={mention.kind === "skills" ? `Skills: ${mention.description}` : `${mention.kind}: ${mention.description}`}
      data-context-pill
      className={`inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-background)] text-xs text-[var(--chat-foreground)] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${compact ? "h-9 pl-2 pr-0.5" : "h-8 pl-2.5 pr-1"}`}
    >
      {mention.kind === "connectors" ? (
        <ConnectorMentionLogo option={mention} size="compact" />
      ) : (
        <span className="font-mono font-semibold text-[var(--chat-accent)]" aria-hidden="true">
          @
        </span>
      )}
      <span className="max-w-44 truncate font-medium">{mention.label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${mention.label} context`}
        className={`grid shrink-0 place-items-center rounded-md text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${compact ? "size-8" : "size-7"}`}
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </motion.div>
  );
}

function ConnectorMentionLogo({
  option,
  size = "default",
}: {
  option: ContextMentionOption;
  size?: "compact" | "default";
}) {
  const [source, setSource] = useState<"brand" | "favicon" | "fallback">(
    option.brandIcon ? "brand" : option.domain ? "favicon" : "fallback",
  );
  const logoUrl =
    source === "brand" && option.brandIcon
      ? `https://cdn.jsdelivr.net/npm/@thesvg/icons/icons/${encodeURIComponent(option.brandIcon)}.svg`
      : source === "favicon" && option.domain
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(option.domain)}&sz=128`
        : "";
  const dimensions = size === "compact" ? "size-5 rounded-full p-[3px]" : "size-9 rounded-full p-1.5";

  if (!logoUrl || source === "fallback") {
    const isWebhook = option.id === "webhook";
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center overflow-hidden border shadow-sm ring-1 ring-black/5 ${dimensions}`}
        style={{
          backgroundColor: isWebhook ? "#f6821f" : "#ffffff",
          borderColor: isWebhook ? "rgba(246, 130, 31, 0.62)" : "rgba(0, 0, 0, 0.14)",
          color: "#18181b",
        }}
      >
        {isWebhook ? (
          <Webhook className={size === "compact" ? "size-3" : "size-4"} strokeWidth={1.8} />
        ) : (
          <Globe className={size === "compact" ? "size-3" : "size-4"} strokeWidth={1.8} />
        )}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden border border-black/15 bg-white shadow-sm ring-1 ring-black/5 ${dimensions}`}
    >
      <img
        src={logoUrl}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full rounded-full object-contain [clip-path:circle(50%)]"
        onError={() =>
          setSource((current) =>
            current === "brand" && option.domain ? "favicon" : "fallback",
          )
        }
      />
    </span>
  );
}

function AttachmentChip({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: Attachment;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const statusTone =
    attachment.status === "uploaded"
      ? "bg-emerald-500/15 text-emerald-700"
      : attachment.status === "error"
        ? "bg-red-500/15 text-red-700"
        : "bg-[var(--chat-surface-muted)] text-[var(--chat-muted-foreground)]";

  return (
    <div className="inline-flex items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1 text-xs text-[var(--chat-foreground)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ${attachment.name}`}
        className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-full px-1.5 text-left transition-[background-color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
      >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--chat-surface-muted)] text-[var(--chat-muted-foreground)]">
        {attachment.status === "uploading" || attachment.status === "processing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : attachment.status === "uploaded" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="max-w-44 truncate">{attachment.name}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusTone}`}>
        {attachment.detail ?? attachment.status}
      </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="ml-0.5 flex size-9 items-center justify-center rounded-full text-[var(--chat-muted-foreground)] transition-colors duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
      >
      <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ArtifactMentionMenu({
  menuRef,
  open,
  stage,
  items,
  loading,
  error,
  query,
  activeIndex,
  contextItems,
  selectedContextIds,
  contextLoading,
  search,
  onSearchChange,
  onOpenStage,
  onBack,
  onSelect,
  onSelectContext,
  onClose,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  stage: ContextMentionStage;
  items: ArtifactItem[];
  loading: boolean;
  error: string | null;
  query: string;
  activeIndex: number;
  contextItems: ContextMentionOption[];
  selectedContextIds: string[];
  contextLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenStage: (stage: Exclude<ContextMentionStage, "root">) => void;
  onBack: () => void;
  onSelect: (artifact: ArtifactItem) => void;
  onSelectContext: (option: ContextMentionOption) => void;
  onClose: () => void;
}) {
  const stageTitle = {
    root: "Add context",
    artifacts: "Your artifacts",
    projects: "Projects",
    files: "Workspace files",
    documents: "Documents",
    resources: "Context resources",
    github_repositories: "GitHub repositories",
    skills: "Agent skills",
    connectors: "Connectors",
    memory: "Memory",
  }[stage];
  const stageDescription = {
    root: "Choose a source to mention",
    artifacts: "Select a saved file for this chat",
    projects: "Search PostgreSQL projects in this workspace",
    files: "Search files available in the active project",
    documents: "Search indexed documents available in the active project",
    resources: "Search workspaces, projects, agents, files, GitHub, MCP, APIs, and databases",
    github_repositories: "Search connected repositories, then ground this request in code, issues, and pull requests",
    skills: "Load specialized instructions for this request",
    connectors: "Mention a connected service",
    memory: "Choose which saved context to emphasize",
  }[stage];
  const rootOptions: Array<{
    id: Exclude<ContextMentionStage, "root">;
    label: string;
    description: string;
    icon: typeof FolderOpen;
  }> = [
    { id: "artifacts", label: "Artifacts", description: "Files saved to your workspace", icon: FolderOpen },
    { id: "projects", label: "Projects", description: "Project files, chats, memory, and sources", icon: FolderOpen },
    { id: "resources", label: "Resources", description: "Projects, agents, GitHub, MCP, APIs, and databases", icon: Search },
    { id: "skills", label: "Skills", description: "Reusable agent instructions", icon: Sparkles },
    { id: "connectors", label: "Connectors", description: "Connected apps and services", icon: Globe },
    { id: "memory", label: "Memory", description: "Conversation and workspace memory", icon: BrainCircuit },
  ];

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          ref={menuRef}
          role="listbox"
          aria-label={stage === "root" ? "Mention options" : stageTitle}
          initial={{ opacity: 0, y: 6, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-full overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-raised)] p-2 text-[var(--chat-foreground)] shadow-[0_18px_42px_-22px_rgba(64,43,24,0.22)]"
        >
          <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              {stage !== "root" ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back to main mention menu"
                  title="Back"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <div className="min-w-0">
              <p className="text-sm font-semibold">{stageTitle}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--chat-muted-foreground)]">
                {stageDescription}
              </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close context menu"
              title="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--chat-muted-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          {stage === "root" ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {rootOptions.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => onOpenStage(option.id)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,transform] duration-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
                    index === activeIndex
                      ? "bg-[var(--chat-surface-muted)]"
                      : "hover:bg-[var(--chat-surface-muted)]"
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--chat-accent)]/10 text-[var(--chat-accent)]">
                    <option.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--chat-muted-foreground)]">
                      {option.description}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : loading ? (
            <div className="space-y-2 p-1" aria-label="Loading artifacts">
              {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-[var(--chat-surface-muted)]" />)}
            </div>
          ) : error ? (
            <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-4 text-sm text-red-700">{error}</p>
          ) : stage !== "artifacts" ? (
            contextLoading ? (
              <div className="space-y-2 p-1" aria-label={`Loading ${stage}`}>
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-[var(--chat-surface-muted)]" />
                ))}
              </div>
            ) : (
              <div>
              {stage === "projects" || stage === "files" || stage === "documents" || stage === "github_repositories" ? (
                <label className="mb-2 flex min-h-11 items-center gap-2 rounded-xl bg-[var(--chat-background)] px-3">
                  <Search className="size-4 text-[var(--chat-muted-foreground)]" aria-hidden="true" />
                  <span className="sr-only">Search {stage}</span>
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={stage === "github_repositories" ? "Search connected repositories" : `Search ${stage}`}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--chat-subtle-foreground)]"
                  />
                </label>
              ) : null}
              {stage === "connectors" ? (
                <div className="mb-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] p-2">
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">Filters</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['All sources', 'Connected apps', 'Knowledge bases'].map((filter) => (
                      <span key={filter} className="rounded-full bg-[var(--chat-surface-muted)] px-2 py-1 text-[11px] text-[var(--chat-muted-foreground)]">{filter}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {contextItems.length ? (
              <ScrollArea className="h-64" orientation="vertical" aria-label={`${stageTitle} options`}>
                <div className="space-y-1 pr-2">
                  {contextItems.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onClick={() => onSelectContext(option)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,transform] duration-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
                        index === activeIndex
                          ? "bg-[var(--chat-surface-muted)]"
                          : "hover:bg-[var(--chat-surface-muted)]"
                      }`}
                    >
                      {stage === "connectors" ? (
                        <ConnectorMentionLogo option={option} />
                      ) : (
                        <span className="h-5 w-px bg-[var(--chat-accent)]" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{option.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--chat-muted-foreground)]">
                          {option.description}
                        </span>
                      </span>
                      {stage === "connectors" && selectedContextIds.includes(option.id) ? (
                        <Check className="size-4 text-[var(--chat-accent)]" aria-label="Selected" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              ) : (
              <div className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-muted)] px-4 py-6 text-center text-sm text-[var(--chat-muted-foreground)]">
                {stage === "projects" ? (
                  <div className="space-y-1.5">
                    <p className="font-medium text-[var(--chat-foreground)]">
                      {search.trim()
                        ? "No matching projects."
                        : "No projects in this workspace yet."}
                    </p>
                    <p className="text-xs leading-5 text-[var(--chat-subtle-foreground)]">
                      {search.trim()
                        ? "Try a shorter query or clear the search to see every project."
                        : "Create a project first, then mention it here to anchor the chat to that workspace context."}
                    </p>
                  </div>
                ) : (
                  <p>No {stage} available.</p>
                )}
              </div>
              )}
              </div>
            )
          ) : items.length ? (
            <ScrollArea className="h-64" orientation="vertical" aria-label="Artifact results">
              <div className="space-y-1 pr-2">
                {items.map((artifact, index) => (
                  <button
                    key={artifact.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => onSelect(artifact)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,transform] duration-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${index === activeIndex ? "bg-[var(--chat-surface-muted)]" : "hover:bg-[var(--chat-surface-muted)]"}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--chat-accent)]/10 text-[var(--chat-accent)]">
                      <ArtifactTypeIcon filename={artifact.filename} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{artifact.title || artifact.filename}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--chat-muted-foreground)]">{artifact.filename}</span>
                    </span>
                    <span className="rounded-md border border-[var(--chat-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--chat-subtle-foreground)]">
                      {artifactExtension(artifact.filename)}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-xl bg-[var(--chat-surface-muted)] px-4 py-6 text-center">
              <FileText className="mx-auto size-5 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">{query ? "No matching artifacts" : "No artifacts yet"}</p>
              <p className="mt-1 text-xs text-[var(--chat-muted-foreground)]">Upload files from the Artifacts page first.</p>
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function getArtifactMentionContext(value: string): { start: number; query: string } | null {
  const start = value.lastIndexOf("@");
  if (start < 0 || (start > 0 && !/\s/.test(value[start - 1]))) return null;
  const tail = value.slice(start + 1);
  if (tail.startsWith('"')) {
    const query = tail.slice(1);
    if (query.includes('"')) return null;
    return { start, query };
  }
  if (/\s/.test(tail)) return null;
  return { start, query: tail };
}

function artifactToUploadResponse(artifact: ArtifactItem): UploadResponse {
  return {
    doc_id: artifact.id,
    title: artifact.title,
    mime_type: artifact.mime_type,
    filename: artifact.filename,
    size_bytes: artifact.size_bytes,
    size_human: formatArtifactBytes(artifact.size_bytes),
    page_count: artifact.page_count ?? 1,
    uploaded_at: artifact.created_at,
    stored_path: "",
    pipeline_step: artifact.status,
  };
}

function mimeTypeForArtifact(filename: string): string {
  const extension = artifactExtension(filename).toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(extension)) return `image/${extension === "jpg" ? "jpeg" : extension}`;
  if (extension === "pdf") return "application/pdf";
  if (extension === "csv") return "text/csv";
  return "application/octet-stream";
}

function isDocumentArtifact(artifact: ArtifactItem): boolean {
  const mimeType = artifact.mime_type.toLowerCase();
  if (
    mimeType.startsWith("image/")
    || mimeType.startsWith("audio/")
    || mimeType.startsWith("video/")
  ) {
    return false;
  }
  if (
    mimeType.startsWith("text/")
    || mimeType === "application/pdf"
    || mimeType.includes("document")
    || mimeType.includes("spreadsheet")
    || mimeType.includes("presentation")
    || mimeType.includes("json")
    || mimeType.includes("xml")
  ) {
    return true;
  }
  return [
    "pdf", "txt", "md", "doc", "docx", "rtf",
    "csv", "xls", "xlsx", "ppt", "pptx", "json", "xml",
  ].includes(artifactExtension(artifact.filename).toLowerCase());
}

function isImageArtifact(document: UploadResponse): boolean {
  return document.mime_type?.startsWith("image/") === true || mimeTypeForArtifact(document.filename).startsWith("image/");
}

function imageMimeTypeForArtifact(document: UploadResponse): string {
  return document.mime_type?.startsWith("image/")
    ? document.mime_type
    : mimeTypeForArtifact(document.filename);
}

function dedupeImageAttachments(
  attachments: NonNullable<Message["imageAttachments"]>,
): NonNullable<Message["imageAttachments"]> {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    if (seen.has(attachment.artifactId)) return false;
    seen.add(attachment.artifactId);
    return true;
  });
}

function formatArtifactBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactPreview({
  label,
  filename,
  detail,
  tone,
  onOpen,
  onRemove,
}: {
  label: string;
  filename?: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "error";
  onOpen: () => void;
  onRemove: () => void;
}) {
  const detailClass =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-700"
        : tone === "error"
          ? "bg-red-500/15 text-red-700"
          : "bg-[var(--chat-surface-muted)] text-[var(--chat-muted-foreground)]";

  return (
    <div className="group relative w-32 overflow-hidden rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] shadow-[0_10px_20px_-16px_rgba(64,43,24,0.16)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ${label}`}
        className="block w-full text-left transition-[background-color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
      >
      <div className="h-24 bg-[var(--chat-background)] p-2">
        <div className="h-full rounded-sm border border-[var(--chat-border)] bg-[var(--chat-surface)] px-1.5 py-1 text-[5px] leading-[1.25] text-[var(--chat-muted-foreground)]">
          <div className="mb-1 h-1 w-16 rounded bg-[var(--chat-surface-muted)]" />
          <div className="space-y-0.5">
            <div className="h-0.5 rounded bg-[var(--chat-surface-muted)]" />
            <div className="h-0.5 rounded bg-[var(--chat-surface-muted)]" />
            <div className="h-0.5 w-4/5 rounded bg-[var(--chat-surface-muted)]" />
            <div className="mt-1 h-0.5 rounded bg-[var(--chat-surface-muted)]" />
            <div className="h-0.5 rounded bg-[var(--chat-surface-muted)]" />
            <div className="h-0.5 w-3/4 rounded bg-[var(--chat-surface-muted)]" />
          </div>
          <div className="mt-3 inline-flex rounded bg-[var(--chat-accent)] px-1 py-0.5 text-[8px] font-bold leading-none text-[var(--chat-accent-foreground)]">
            {artifactExtension(filename || label)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <ArtifactTypeIcon filename={filename || label} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--chat-foreground)]">
          {label}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${detailClass}`}>
          {detail}
        </span>
      </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-raised)] text-[var(--chat-muted-foreground)] shadow-sm backdrop-blur transition-colors duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function artifactExtension(filename: string): string {
  const extension = filename.includes(".") ? filename.split(".").pop() : "FILE";
  return (extension || "FILE").toUpperCase().slice(0, 5);
}

function ArtifactTypeIcon({ filename }: { filename: string }) {
  const extension = artifactExtension(filename).toLowerCase();
  const className = "h-3.5 w-3.5 flex-shrink-0 text-[var(--chat-subtle-foreground)]";
  if (["xlsx", "xls", "csv"].includes(extension)) {
    return <FileSpreadsheet className={className} aria-hidden="true" />;
  }
  if (["pptx", "ppt"].includes(extension)) {
    return <Presentation className={className} aria-hidden="true" />;
  }
  return <FileText className={className} aria-hidden="true" />;
}

function ComposerModeSelector({
  activeMode,
  fastMode,
  menuRef,
  onSelect,
  onToggleFast,
  open,
  onToggle,
}: {
  activeMode: ChatMode | null;
  fastMode: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onSelect: (action: QuickAction) => void;
  onToggleFast: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const modes = QUICK_ACTIONS.filter((action) => ["thinking", "deep-research", "web-search"].includes(action.id));
  const current = modes.find((mode) => mode.id === activeMode);
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Choose response mode"
        aria-expanded={open}
        onClick={onToggle}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${open || activeMode || fastMode ? "border-[var(--chat-accent)]/45 bg-[var(--chat-highlight)] text-[var(--chat-foreground)]" : "border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] hover:bg-[var(--chat-surface-muted)]"}`}
      >
        <BrainCircuit className="size-3.5" aria-hidden="true" />
        <span>{fastMode ? "Fast" : current?.label ?? "Mode"}</span>
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute bottom-11 left-0 z-50 w-48 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 shadow-[0_18px_44px_-20px_rgba(32,21,16,0.38)] backdrop-blur-sm">
          {modes.map((mode) => (
            <button key={mode.id} type="button" onClick={() => onSelect(mode)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs hover:bg-[var(--chat-surface-muted)]">
              <QuickActionIcon kind={mode.icon} />
              <span className="flex-1">{mode.label}</span>
              {activeMode === mode.id ? <Check className="size-3.5 text-[var(--chat-accent)]" /> : null}
            </button>
          ))}
          <button type="button" aria-pressed={fastMode} onClick={onToggleFast} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs hover:bg-[var(--chat-surface-muted)]">
            <Sparkles className="size-4 text-[var(--chat-muted-foreground)]" />
            <span className="flex-1">Fast</span>
            {fastMode ? <Check className="size-3.5 text-[var(--chat-accent)]" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function QuickActionMenu({
  open,
  activeMode,
  selectedModel,
  onSelect,
  onSelectModel,
  onOpenSkills,
  enabledSkills,
  onUseSkill,
  projectControl,
}: {
  open: boolean;
  activeMode: ChatMode | null;
  selectedModel: Model | null;
  onSelect: (action: QuickAction) => void;
  onSelectModel: (model: Model) => void;
  onOpenSkills: () => void;
  enabledSkills: AgentSkill[];
  onUseSkill: (skill: AgentSkill) => void;
  projectControl: ReactNode;
}) {
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  useEffect(() => {
    if (open) return;
    window.queueMicrotask(() => {
      setSkillsOpen(false);
      setModelsOpen(false);
    });
  }, [open]);
  const primaryActions = QUICK_ACTIONS.filter((action) => ["photos", "attach", "screenshot", "connector"].includes(action.id));
  const currentModel = selectedModel ?? MODELS[0];

  const renderAction = (action: QuickAction) => (
    <button
      key={action.id}
      type="button"
      aria-pressed={action.id === "attach" || action.id === "photos" ? undefined : activeMode === action.id}
      onClick={() => onSelect(action)}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-[background-color,color,transform] duration-100 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)] ${
        activeMode === action.id
          ? "bg-[var(--chat-surface-muted)] text-[var(--chat-foreground)]"
          : "text-[var(--chat-foreground)] hover:bg-[var(--chat-surface-muted)]"
      }`}
    >
      <QuickActionIcon kind={action.icon} />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {activeMode === action.id ? (
        <Check className="size-3.5 text-[var(--chat-accent)]" aria-hidden="true" />
      ) : null}
    </button>
  );

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={`absolute bottom-13 left-0 z-50 w-[min(13rem,calc(100vw-2rem))] origin-bottom-left rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-raised)] p-1.5 shadow-[0_20px_52px_-22px_rgba(32,21,16,0.42),0_2px_8px_-4px_rgba(32,21,16,0.18)] backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out sm:bottom-10 ${
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0"
      }`}
    >
      <div>
        <div className="mb-1 px-0.5">{projectControl}</div>
        <div className="mx-2 my-1 h-px origin-center scale-y-50 bg-[var(--chat-border)] opacity-55" aria-hidden="true" />
        {primaryActions.map(renderAction)}
        <div className="mx-2 my-1 h-px origin-center scale-y-50 bg-[var(--chat-border)] opacity-55" aria-hidden="true" />
        <div
          className="relative"
          onMouseEnter={() => setSkillsOpen(true)}
          onMouseLeave={() => setSkillsOpen(false)}
        >
          <button
            type="button"
            title="Skills"
            onClick={onOpenSkills}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-[var(--chat-foreground)] transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
          >
            <BrainCircuit className="size-4 text-[var(--chat-muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">Skills</span>
            <ChevronRight className="size-3.5 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
          </button>
          {skillsOpen ? (
            <div className="absolute bottom-0 left-full w-[13rem] pl-3">
              <div className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 shadow-[0_18px_44px_-20px_rgba(32,21,16,0.38)] backdrop-blur-sm">
                {enabledSkills.length ? enabledSkills.map((skill) => (
                  <button key={skill.name} type="button" onClick={() => onUseSkill(skill)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs hover:bg-[var(--chat-surface-muted)]">
                    <Sparkles className="size-3.5 text-[var(--chat-accent)]" />
                    <span className="flex-1 truncate">{skill.name}</span>
                  </button>
                )) : <p className="px-2.5 py-2 text-xs text-[var(--chat-muted-foreground)]">No enabled skills</p>}
                <div className="my-1 h-px bg-[var(--chat-border)] opacity-60" />
                <button type="button" onClick={() => { window.location.assign("/skills"); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs hover:bg-[var(--chat-surface-muted)]"><Webhook className="size-3.5 text-[var(--chat-muted-foreground)]" /><span>Manage skills</span></button>
                <button type="button" onClick={() => { window.location.assign("/skills?discover=1"); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs hover:bg-[var(--chat-surface-muted)]"><Plus className="size-3.5 text-[var(--chat-muted-foreground)]" /><span>Browse skills</span></button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mx-2 my-1 h-px origin-center scale-y-50 bg-[var(--chat-border)] opacity-55" aria-hidden="true" />
        <div
          className="relative"
          onMouseEnter={() => setModelsOpen(true)}
          onMouseLeave={() => setModelsOpen(false)}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={modelsOpen}
            onClick={() => setModelsOpen((value) => !value)}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-[var(--chat-foreground)] transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
          >
            <Webhook className="size-4 text-[var(--chat-muted-foreground)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block">Model</span>
              <span className="block truncate text-[10px] font-normal text-[var(--chat-subtle-foreground)]">
                {currentModel.name} · {currentModel.provider}
              </span>
            </span>
            <ChevronRight className="size-3.5 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
          </button>
          {modelsOpen ? (
            <div className="absolute bottom-0 left-full w-[min(18rem,calc(100vw-2rem))] pl-3">
              <div className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1.5 shadow-[0_18px_44px_-20px_rgba(32,21,16,0.38)] backdrop-blur-sm">
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={model.id === currentModel.id}
                    aria-disabled={model.disabled || undefined}
                    disabled={model.disabled}
                    onClick={() => onSelectModel(model)}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)] ${model.disabled ? "cursor-not-allowed opacity-50" : ""} ${model.id === currentModel.id ? "bg-[var(--chat-surface-muted)] text-[var(--chat-foreground)]" : "text-[var(--chat-foreground)] hover:bg-[var(--chat-surface-muted)]"}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: model.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{model.name}</span>
                    <span className="flex max-w-32 shrink-0 items-center gap-1.5 text-right text-[10px] font-normal text-[var(--chat-subtle-foreground)]">
                      <span className="max-w-20 truncate">{model.provider}</span>
                      {model.caps?.includes("Free") ? (
                        <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] text-emerald-500">
                          Free
                        </span>
                      ) : model.caps?.includes("Paid") ? (
                        <span className="rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[9px] text-amber-500">
                          Paid
                        </span>
                      ) : null}
                    </span>
                    {model.id === currentModel.id ? <Check className="size-3.5 text-[var(--chat-accent)]" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActiveChatModeTab({
  mode,
  onClear,
}: {
  mode: ChatMode;
  onClear: () => void;
}) {
  const item = CHAT_MODES[mode];

  return (
    <motion.button
      type="button"
      aria-pressed="true"
      aria-label={`${item.label} mode selected. Turn off ${item.label} mode`}
      title={`${item.label} mode selected`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
      style={{ transformOrigin: "left center" }}
      onClick={onClear}
      className="group/mode inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--chat-accent)]/45 bg-[var(--chat-highlight)] text-[var(--chat-foreground)] shadow-[0_8px_20px_-18px_rgba(121,65,24,0.55)] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--chat-accent)] hover:bg-[var(--chat-surface-muted)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:h-9 sm:w-auto sm:px-3"
    >
      <QuickActionIcon kind={item.icon} />
      <span className="hidden max-w-28 truncate text-xs font-medium sm:inline">
        {item.label}
      </span>
      <X className="hidden size-3.5 text-[var(--chat-subtle-foreground)] transition-colors duration-150 group-hover/mode:text-[var(--chat-foreground)] sm:block" aria-hidden="true" />
    </motion.button>
  );
}

function ActiveImageActionTab({
  onOpen,
  onClear,
}: {
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, width: 0 }}
      animate={{ opacity: 1, scale: 1, width: "auto" }}
      exit={{ opacity: 0, scale: 0.98, width: 0 }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
      className="group/image-mode inline-flex h-11 shrink-0 items-center overflow-hidden rounded-full border border-[var(--chat-accent)]/45 bg-[var(--chat-highlight)] text-[var(--chat-foreground)] shadow-[0_8px_20px_-18px_rgba(121,65,24,0.55)] sm:h-9"
    >
      <button
        type="button"
        aria-label="Open image generator"
        title="Open image generator"
        onClick={onOpen}
        className="inline-flex h-full items-center gap-2 px-3 text-xs font-medium transition-colors hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
      >
        <ImageIcon className="size-4 text-[var(--chat-accent)]" aria-hidden="true" />
        <span className="max-w-28 truncate">Image</span>
      </button>
      <button
        type="button"
        aria-label="Clear image generation mode"
        title="Clear image generation mode"
        onClick={onClear}
        className="flex size-9 items-center justify-center border-l border-[var(--chat-accent)]/20 text-[var(--chat-subtle-foreground)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

function QuickActionIcon({ kind }: { kind: QuickActionIconKind }) {
  switch (kind) {
    case "paperclip":
      return <Paperclip className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "spark":
      return <Sparkles className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "search":
      return <Search className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "globe":
      return <Globe className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "image":
      return <ImageIcon className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "camera":
      return <Camera className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "plug":
      return <Plug className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    case "share":
      return <Share2 className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
    default:
      return <BrainCircuit className="h-4 w-4 text-[var(--chat-muted-foreground)]" />;
  }
}

function compactSourceDescription(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}
