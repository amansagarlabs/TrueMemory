import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type GithubRepositoryOption = {
  id: string;
  full_name: string;
  name: string;
  description: string;
  html_url: string;
  updated_at: string;
  visibility: string;
  language: string;
  default_branch: string;
};

export type GithubRepositoryTreeEntry = {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size: number;
  mode: string;
};

export type GithubRepositoryTree = {
  repository: string;
  ref: string;
  sha: string;
  truncated: boolean;
  entries: GithubRepositoryTreeEntry[];
  empty?: boolean;
};

export type GithubRepositoryFile = {
  repository: string;
  ref: string;
  path: string;
  sha: string;
  size: number;
  html_url: string;
  content: string;
};

export async function fetchGithubRepositories(
  query = "",
  limit = 20,
  signal?: AbortSignal,
): Promise<GithubRepositoryOption[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await fetch(
    `${API_URL}/api/chat/context/github/repositories?${params.toString()}`,
    {
      headers: { ...buildAuthHeaders("Kontext GitHub context") },
      cache: "no-store",
      signal,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "GitHub repositories could not be loaded.",
    );
  }
  return Array.isArray(payload.items) ? payload.items : [];
}

function repositoryEndpoint(fullName: string) {
  const [owner, name, ...rest] = fullName.split("/");
  if (!owner || !name || rest.length) {
    throw new Error("The GitHub repository name is invalid.");
  }
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export async function fetchGithubRepositoryTree(
  fullName: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<GithubRepositoryTree> {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await fetch(
    `${API_URL}/api/chat/context/github/repositories/${repositoryEndpoint(fullName)}/tree${query}`,
    {
      headers: { ...buildAuthHeaders("Kontext GitHub repository tree") },
      cache: "no-store",
      signal,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The repository tree could not be loaded.",
    );
  }
  return {
    repository: String(payload.repository || fullName),
    ref: String(payload.ref || ref || ""),
    sha: String(payload.sha || ""),
    truncated: Boolean(payload.truncated),
    entries: Array.isArray(payload.entries) ? payload.entries : [],
    empty: Boolean(payload.empty),
  };
}

export async function fetchGithubRepositoryFile(
  fullName: string,
  path: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<GithubRepositoryFile> {
  const params = new URLSearchParams({ path });
  if (ref) params.set("ref", ref);
  const response = await fetch(
    `${API_URL}/api/chat/context/github/repositories/${repositoryEndpoint(fullName)}/file?${params.toString()}`,
    {
      headers: { ...buildAuthHeaders("Kontext GitHub repository file") },
      cache: "no-store",
      signal,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The repository file could not be loaded.",
    );
  }
  return payload as GithubRepositoryFile;
}
