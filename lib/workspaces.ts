import type { AuthUser, AuthWorkspace } from "@/lib/types";

export function loadWorkspaces(user: AuthUser): AuthWorkspace[] {
  return normalizeWorkspaceNames(user.workspaces || []);
}

export function normalizeWorkspaceNames(workspaces: AuthWorkspace[]) {
  const seen = new Set<string>();
  return workspaces.flatMap((workspace) => {
    if (seen.has(workspace.id)) return [];
    seen.add(workspace.id);
    return [
      workspace.platform === "AmanCrawl"
        ? { ...workspace, platform: "Kontext Web" as const }
        : workspace,
    ];
  });
}

export function saveWorkspaces(userId: string, workspaces: AuthWorkspace[]) {
  void userId;
  void workspaces;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("kontext-workspaces-changed"));
}

export function loadActiveWorkspaceId(userId: string) {
  void userId;
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("workspace") || "";
}

export function saveActiveWorkspaceId(userId: string, workspaceId: string) {
  void userId;
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const currentWorkspaceId = url.searchParams.get("workspace") || "";
  if (currentWorkspaceId === workspaceId) return;
  if (workspaceId) url.searchParams.set("workspace", workspaceId);
  else url.searchParams.delete("workspace");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event("kontext-workspaces-changed"));
}
