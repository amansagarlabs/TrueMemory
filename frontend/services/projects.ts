import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";
import type { AuthProject } from "@/lib/types";
import { API_URL } from "@/services/api";

export async function fetchProjects(workspaceId: string): Promise<AuthProject[]> {
  const response = await fetch(
    `${API_URL}/api/projects?workspace_id=${encodeURIComponent(workspaceId)}`,
    { headers: buildAuthHeaders("Kontext Memory"), cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Projects could not be loaded (${response.status}).`);
  const data = await response.json();
  return (data.items ?? []) as AuthProject[];
}

export async function persistProject(project: AuthProject): Promise<AuthProject> {
  const response = await fetch(`${API_URL}/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders("Kontext Memory") },
    body: JSON.stringify(project),
  });
  if (!response.ok) throw new Error(`Project could not be saved (${response.status}).`);
  const data = await response.json();
  return data.item as AuthProject;
}

export async function createProject(input: {
  workspaceId: string;
  name: string;
  description?: string;
}): Promise<AuthProject> {
  const now = new Date().toISOString();
  return persistProject({
    id: crypto.randomUUID(),
    workspace_id: input.workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() || "",
    created_at: now,
    last_active: now,
  });
}

export async function archiveProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders("Kontext Memory"),
  });
  if (!response.ok) throw new Error(`Project could not be archived (${response.status}).`);
}
