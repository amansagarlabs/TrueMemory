import { buildAuthHeaders, credentialedFetch as fetch } from "@/lib/auth";
import type { AuthWorkspace } from "@/lib/types";
import { API_URL } from "@/services/api";

export async function fetchWorkspaces(): Promise<AuthWorkspace[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/workspaces`, {
      headers: buildAuthHeaders("TrueMemory Memory"),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Workspace service timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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
        ...buildAuthHeaders("TrueMemory Memory"),
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
    headers: buildAuthHeaders("TrueMemory Memory"),
  });
  if (!response.ok) throw new Error(`Space could not be deleted (${response.status}).`);
}
