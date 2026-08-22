import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ENABLED_SKILLS_KEY = "kontext-enabled-agent-skills";

export type AgentSkill = {
  name: string;
  description: string;
  kind: string;
  default_enabled: boolean;
};

export type SkillDiscoveryResult = AgentSkill & {
  id: string;
  author: string;
  registry: string;
  source_url?: string | null;
  version: string;
  license: string;
  verified: boolean;
  official: boolean;
  open_source: boolean;
  downloads: number;
  stars: number;
  trust_score: number;
  security_score: number;
  tags: string[];
};

export async function fetchAgentSkills(): Promise<AgentSkill[]> {
  const response = await fetch(`${API_URL}/api/skills`, {
    cache: "no-store",
    headers: buildAuthHeaders("Kontext Skills"),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Skills could not be loaded (${response.status})`,
    );
  }
  return (data.items ?? []) as AgentSkill[];
}

export async function discoverAgentSkills(query: string): Promise<SkillDiscoveryResult[]> {
  const response = await fetch(`${API_URL}/api/skills/discover?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
    headers: buildAuthHeaders("Kontext Skill Discovery"),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Skill discovery failed");
  return (data.items ?? []) as SkillDiscoveryResult[];
}

export async function createAgentSkill(input: {
  name: string;
  description: string;
  instructions: string;
}): Promise<AgentSkill> {
  const response = await fetch(`${API_URL}/api/skills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders("Kontext Skills"),
    },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Skill could not be created (${response.status})`,
    );
  }
  return data.item as AgentSkill;
}

export function loadEnabledAgentSkills(
  availableSkills?: AgentSkill[],
): string[] | undefined {
  if (typeof window === "undefined") {
    return availableSkills?.map((skill) => skill.name);
  }
  const saved = window.localStorage.getItem(ENABLED_SKILLS_KEY);
  if (!saved) {
    return availableSkills
      ?.filter((skill) => skill.default_enabled !== false)
      .map((skill) => skill.name);
  }
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return availableSkills?.map((skill) => skill.name);
  }
}

export function saveEnabledAgentSkills(names: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ENABLED_SKILLS_KEY,
    JSON.stringify(Array.from(new Set(names)).sort()),
  );
}
