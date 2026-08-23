import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";
import type { AuthWorkspace } from "@/lib/types";
import { API_URL } from "@/services/api";

export async function fetchWorkspaces(): Promise<AuthWorkspace[]> {
  const response = await fetch(`${API_URL}/api/workspaces`, {
    headers: buildAuthHeaders("Kontext Memory"),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Workspaces could not be loaded (${response.status}).`);
  const data = await response.json();
  return (data.items ?? []) as AuthWorkspace[];
}

export async function persistWorkspace(
  workspace: AuthWorkspace,
): Promise<AuthWorkspace> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspace.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders("Kontext Memory"),
      },
      body: JSON.stringify(workspace),
    },
  );
  if (!response.ok) throw new Error(`Workspace could not be saved (${response.status}).`);
  const data = await response.json();
  return data.item as AuthWorkspace;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders("Kontext Memory"),
  });
  if (!response.ok) throw new Error(`Space could not be deleted (${response.status}).`);
}
