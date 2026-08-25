import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type IngestionItem = {
  id: string;
  source_id: string;
  source_type: string;
  provider: string;
  title?: string | null;
  canonical_url?: string | null;
  normalized_content?: string | null;
  memory_key?: string | null;
  memory_content?: string | null;
  decision: string;
  confidence?: number | null;
  importance?: number | null;
  memory_id?: string | null;
  provenance?: Record<string, unknown>;
  extracted?: Record<string, unknown>;
  error?: string | null;
};

export type IngestionEvent = {
  stage: string;
  status: string;
  message?: string | null;
  created_at?: string;
  payload?: Record<string, unknown>;
};

export type IngestionJob = {
  job_id: string;
  status: string;
  current_stage: string;
  provider: string;
  source_type: string;
  source_url?: string | null;
  attempt: number;
  error?: string | null;
  candidate_count: number;
  memory_count: number;
  discovered_items: number;
  job: {
    events?: IngestionEvent[];
    items?: IngestionItem[];
    [key: string]: unknown;
  };
};

export type CreateIngestionInput = {
  provider?: string;
  source_type: "text" | "note" | "url" | "website" | "search_result" | "file" | "artifact" | "document" | "pdf";
  source_url?: string;
  external_id?: string;
  content?: string;
  key?: string;
  scope?: string;
  workspace_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
  target?: "candidate" | "reference" | "durable";
  discover?: boolean;
  max_pages?: number;
  idempotency_key?: string;
  priority?: number;
  source_version?: string;
};

function headers() {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders("TrueMemory Memory"),
  };
}

async function parse<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : fallback;
    throw new Error(detail);
  }
  return data as T;
}

export async function createIngestionJob(input: CreateIngestionInput): Promise<IngestionJob> {
  const response = await fetch(`${API_URL}/v1/ingestion`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  return parse<IngestionJob>(response, "The memory ingestion job could not be created.");
}

export async function getIngestionJob(jobId: string): Promise<IngestionJob> {
  const response = await fetch(`${API_URL}/v1/ingestion/${encodeURIComponent(jobId)}`, {
    headers: headers(),
    cache: "no-store",
  });
  return parse<IngestionJob>(response, "The memory ingestion status could not be loaded.");
}

export async function approveIngestionItem(itemId: string): Promise<IngestionItem> {
  const response = await fetch(`${API_URL}/v1/ingestion/items/${encodeURIComponent(itemId)}/approve`, {
    method: "POST",
    headers: headers(),
  });
  const data = await parse<{ item: IngestionItem }>(response, "This memory candidate could not be saved.");
  return data.item;
}

export async function rejectIngestionItem(itemId: string): Promise<IngestionItem> {
  const response = await fetch(`${API_URL}/v1/ingestion/items/${encodeURIComponent(itemId)}/reject`, {
    method: "POST",
    headers: headers(),
  });
  const data = await parse<{ item: IngestionItem }>(response, "This memory candidate could not be rejected.");
  return data.item;
}
