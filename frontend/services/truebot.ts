import { credentialedFetch } from "@/lib/auth";

export type AgentInput = {
  name: string; description: string; instructions: string; provider: string; model: string;
  workspace_id: string | null; memory_enabled: boolean; tools: string[];
  max_output_tokens: number; max_steps: number; timeout_seconds: number; status: "active" | "paused";
};
export type BotAgent = AgentInput & { id: string; created_at: string; updated_at: string };
export type BotRun = {
  id: string; agent_id: string; task: string; status: "queued" | "running" | "completed" | "failed" | "cancelled";
  output: string | null; error: string | null; usage: Record<string, unknown>; created_at: string; updated_at: string;
};
export type BotLimits = { max_agents: number; daily_runs: number; concurrent_runs: number };
export type BotConfig = {
  enabled: boolean; worker_ready: boolean;
  providers: { id: string; name: string; configured: boolean; models: string[]; runtime: string; capabilities: string[] }[];
  templates: { id: string; name: string; description: string; instructions: string; tools: string[] }[];
  limits: BotLimits; tools: { id: string; name: string; description: string }[]; automations_enabled: boolean;
};
export type BotUsage = { agents: number; runs_today: number; active_runs: number; limits: BotLimits };

const base = (process.env.NEXT_PUBLIC_API_URL || "https://truememory.onrender.com").replace(/\/$/, "");
export async function botRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await credentialedFetch(`${base}/api/truebot${path}`, {
      ...init, signal: init.signal ?? controller.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "x-aman-platform": "TrueBot", ...init.headers },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = typeof data.detail === "string" ? data.detail : typeof data.message === "string" ? data.message : null;
      throw new Error(response.status === 401 ? "Your session expired. Sign in again to continue." : detail || `TrueBot request failed (${response.status}). Please try again.`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("TrueBot took too long to respond. Please retry.");
    throw error;
  } finally { clearTimeout(timeout); }
}
