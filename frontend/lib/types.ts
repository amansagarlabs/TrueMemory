/** API types shared across components — keeps upload/chat contracts in one place. */

export type ChatMode = "thinking" | "deep-research" | "web-search";

export type UploadResponse = {
  doc_id: string;
  title?: string;
  mime_type?: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  page_count: number;
  uploaded_at: string;
  stored_path: string;
  pipeline_step: string;
};

export type ImageOcrResponse = {
  text: string;
  markdown: string;
  provider: "tesseract" | "paddleocr-vl" | string;
  model: string;
  language: string;
  confidence: number | null;
  warnings: string[];
  artifact_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
};

export type PipelineStepId =
  | "upload"
  | "extract"
  | "chunk"
  | "tokenize"
  | "embed"
  | "milvus"
  | "ready";

export type StepStatus = "pending" | "running" | "done" | "error";

export type PipelineStepState = {
  id: PipelineStepId;
  label: string;
  status: StepStatus;
  duration_ms?: number;
  data?: Record<string, unknown>;
};

export type PipelineEvent = {
  type: "step" | "complete" | "error";
  id?: PipelineStepId;
  status?: StepStatus;
  label?: string;
  duration_ms?: number;
  data?: Record<string, unknown>;
  metrics?: Record<string, number>;
  doc_id?: string;
  message?: string;
};

export type RetrievedChunk = {
  chunk_index: number;
  page: number;
  text: string;
  preview: string;
  similarity: number | null;
  distance: number | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  retrieval?: {
    retrieval_ms: number;
    chunks: RetrievedChunk[];
  };
  metrics?: {
    retrieval_ms: number;
    llm_ms: number;
    total_ms: number;
    model: string;
  };
};

export type QueryMode = "auto" | "social" | "direct" | "utility" | "memory" | "document" | "search" | "scrape" | "map" | "crawl" | "agent";

export interface QueryRouteDecision {
  mode: Exclude<QueryMode, "auto">;
  needs_fresh_data: boolean;
  needs_web: boolean;
  needs_citations: boolean;
  target_urls: string[];
  search_queries: string[];
  reason: string;
  reason_code: string;
  confidence: number;
  max_tool_calls: number;
  fallback_mode?: QueryMode | null;
  requires_confirmation: boolean;
  live_data_kind?: "cricket" | "football" | "sports" | "weather" | "market" | "election" | "traffic" | "news" | "event" | null;
  live_data_label?: string | null;
}

export interface QueryPlanStep {
  id: string;
  mode: QueryMode;
  label: string;
  status: "pending" | "active" | "complete" | "failed" | "denied";
  detail?: string | null;
  requires_confirmation?: boolean;
}

export interface QueryExecutionPlan {
  route: QueryMode;
  steps: QueryPlanStep[];
  max_tool_calls: number;
  allows_replan: boolean;
  capabilities?: QueryCapability[];
}

export interface QueryCapability {
  id: string;
  label: string;
  reason: string;
  confidence: number;
  dependencies: string[];
  estimated_latency_ms: number;
  estimated_tokens: number;
}

export interface QuerySource {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content?: string;
  quote?: string | null;
  image_url?: string | null;
  image_landing_url?: string | null;
  image_attribution?: string | null;
  image_license?: string | null;
  image_provider?: string | null;
  source_type: "search" | "scrape" | "crawl" | "document" | "memory";
  provider?: string | null;
  provider_label?: string | null;
  published_at?: string | null;
  retrieved_at?: string | null;
  citation_index?: number | null;
  canonical_url?: string | null;
  favicon_url?: string | null;
  verification?: SourceVerification;
  trust_score?: number | null;
  trust_label?: SourceConfidenceLabel | null;
  trust_components?: Record<string, number>;
  trust_explanation?: string | null;
  confidence_score?: number | null;
  confidence_label?: SourceConfidenceLabel | null;
  confidence_components?: Record<string, number>;
  confidence_explanation?: string | null;
  evidence_role?: SourceEvidenceRole | null;
  reason_used?: string | null;
  influence_score?: number | null;
  freshness?: SourceFreshness;
  cross_verification?: SourceCrossVerification;
  content_hash?: string | null;
  language?: string | null;
  license?: string | null;
  score_version?: string | null;
  retrieval?: {
    bm25_score?: number;
    dense_score?: number;
    reranked?: boolean;
  };
}

export type SourceConfidenceLabel = "very_high" | "high" | "medium" | "low";

export type SourceEvidenceRole = "primary" | "supporting" | "background" | "ignored";

export interface SourceVerification {
  status?: "verified" | "probable" | "unverified" | "conflicting" | "revoked";
  type?: string;
  label?: string;
  signals?: string[];
  method?: string;
}

export interface SourceFreshness {
  status?: "fresh" | "aging" | "stale" | "unknown";
  label?: string;
  age_days?: number | null;
  source_date?: string | null;
}

export interface SourceCrossVerification {
  status?: "available" | "not_evaluated" | "verified" | "conflicting";
  independent_sources?: number;
  supporting_source_ids?: string[];
  conflicting_source_ids?: string[];
  duplicate_source_ids?: string[];
}

export interface HybridRetrievalMetrics {
  retrieval_ms: number;
  dense: boolean;
  bm25: boolean;
  reranked: boolean;
  count: number;
}

export interface QueryConfirmationRequest {
  approval_id: string;
  tool: string;
  title: string;
  description: string;
}

export type ChatStreamEvent = {
  type:
    | "request.accepted"
    | "route.decision"
    | "plan.created"
    | "skills.activated"
    | "capabilities.activated"
    | "step.started"
    | "step.progress"
    | "step.completed"
    | "step.failed"
    | "source.discovered"
    | "answer.sources"
    | "answer.followups"
    | "answer.final"
    | "confirmation.required"
    | "status"
    | "retrieval"
    | "retrieval.hybrid"
    | "token"
    | "done"
    | "error";
  stage?: "routing" | "memory" | "document" | "image" | "web" | "sources" | "answer";
  content?: string;
  conversation_id?: string;
  message?: string;
  retrieval_ms?: number;
  top_k?: number;
  chunks?: RetrievedChunk[];
  llm_ms?: number;
  total_ms?: number;
  model?: string;
  answer_length?: number;
  message_id?: string | null;
  route?: QueryRouteDecision;
  plan?: QueryExecutionPlan;
  step_id?: string;
  source?: QuerySource;
  sources?: QuerySource[];
  followups?: string[];
  hybrid?: HybridRetrievalMetrics;
  approval_id?: string;
  tool?: string;
  title?: string;
  description?: string;
  skills?: Array<{ name: string; description: string }>;
  capabilities?: QueryCapability[];
  status?: string;
  web_sources?: Array<{
    title: string;
    url: string;
    content?: string;
    snippet?: string;
    image_url?: string | null;
    source_type?: string;
    provider?: string | null;
    provider_label?: string | null;
    citation_index?: number | null;
    score?: number | null;
  }>;
  knowledge_sources?: Array<{
    id?: string;
    title: string;
    url: string;
    domain?: string;
    content?: string;
    snippet?: string;
    quote?: string | null;
    image_url?: string | null;
    source_type?: string;
    provider?: string | null;
    provider_label?: string | null;
    citation_index?: number | null;
    retrieval?: HybridRetrievalMetrics;
  }>;
};

export type RecentConversation = {
  id: string;
  title: string;
  updated_at: string;
  last_message_at?: string | null;
  message_count: number;
  last_message?: string | null;
  is_pinned?: boolean;
  status?: "active" | "archived" | "deleted";
};

/** Storage scopes used to keep each product surface's history isolated. */
export type ConversationType =
  | "artifact_chat"
  | "coding_chat"
  | "agents_chat"
  | "workflow_chat";

export type StoredConversationMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  created_at: string;
  retrieval_ms?: number | null;
  llm_ms?: number | null;
  total_ms?: number | null;
  message_status?: string | null;
  metadata?: {
    chat_mode?: ChatMode | "auto";
    fast_mode?: boolean;
    image_attachments?: Array<{
      artifact_id: string;
      filename: string;
      mime_type: string;
    }>;
    artifact_attachment?: {
      artifact_id: string;
      title: string;
      filename: string;
      mime_type: string;
    } | null;
    context_mentions?: Array<{
      kind: "skills" | "connectors" | "memory";
      id: string;
      label: string;
    }>;
    feedback?: {
      rating?: "up" | "down" | null;
      report_reason?: string | null;
    };
    route?: QueryRouteDecision;
    plan?: QueryExecutionPlan;
    followups?: string[];
    web_sources?: Array<{
      title: string;
      url: string;
      content?: string;
      snippet?: string;
      image_url?: string | null;
      source_type?: string;
      provider?: string | null;
      provider_label?: string | null;
      citation_index?: number | null;
    }>;
    knowledge_sources?: Array<{
      id?: string;
      title: string;
      url: string;
      domain?: string;
      content?: string;
      snippet?: string;
      quote?: string | null;
      image_url?: string | null;
      source_type?: string;
      provider?: string | null;
      provider_label?: string | null;
      citation_index?: number | null;
    }>;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  username?: string | null;
  full_name?: string | null;
  name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  website?: string | null;
  timezone?: string | null;
  locale?: string | null;
  preferences?: {
    onboarding?: {
      persona?: string | null;
      heardAbout?: string | null;
      onboardingUseCase?: string | null;
      workspaceName?: string | null;
      step?: string | null;
    };
    coding?: Record<string, unknown>;
  };
  plan: "free" | "pro" | "team" | "enterprise";
  created_at?: string;
  platforms?: (
    | "Kontext Memory"
    | "Kontext Crawl"
    | "Kontext Web"
    | "AmanAgentLab"
    | "AmanCrawl"
  )[];
  workspaces?: AuthWorkspace[];
};

export type AuthWorkspace = {
  id: string;
  name: string;
  platform:
    | "Kontext Memory"
    | "Kontext Crawl"
    | "Kontext Web"
    | "AmanAgentLab"
    | "AmanCrawl";
  last_active: string;
};

export type AuthProject = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  created_at: string;
  last_active: string;
};

export type AuthSession = {
  session_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type AuthContext = {
  authenticated: boolean;
  user: AuthUser | null;
  platform: string;
  session_token: string | null;
  scopes: string[];
};

export type AuthError = {
  error: "unauthenticated" | "forbidden";
  message: string;
  action: "redirect_to_login" | "refresh_token" | "upgrade_plan";
  missing_scope?: string;
};
