import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type EvaluationAssertion = {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

export type EvaluationCaseResult = {
  id: string;
  question: string;
  critical: boolean;
  passed: boolean;
  route: {
    mode: string;
    reason: string;
    needs_web: boolean;
    needs_citations: boolean;
    max_tool_calls: number;
    requires_confirmation: boolean;
  };
  assertions: EvaluationAssertion[];
};

export type EvaluationReport = {
  schema_version: string;
  suite: string;
  generated_at: string;
  dataset: string;
  cases: number;
  passed_cases: number;
  failed_cases: number;
  assertions: number;
  passed_assertions: number;
  score: number;
  critical_failures: string[];
  gate: "pass" | "fail";
  results: EvaluationCaseResult[];
  metrics?: {
    intent_accuracy: number;
    subject_accuracy: number;
    web_accuracy: number;
    unnecessary_web_searches: number;
    unnecessary_web_rate: number;
  };
};

export async function runEvaluation(signal?: AbortSignal): Promise<EvaluationReport> {
  const response = await fetch(`${API_URL}/api/evaluation/run`, {
    method: "POST",
    headers: buildAuthHeaders("Kontext Evaluation"),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : `Evaluation failed (${response.status})`,
    );
  }

  return response.json() as Promise<EvaluationReport>;
}

export async function runAdminEvaluation(signal?: AbortSignal): Promise<EvaluationReport> {
  const response = await fetch(`${API_URL}/api/evaluation/run`, {
    method: "POST",
    headers: buildAuthHeaders("Kontext Admin Evaluation"),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Admin evaluation failed (${response.status})`);
  return response.json() as Promise<EvaluationReport>;
}
