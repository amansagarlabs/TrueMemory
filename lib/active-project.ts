export const ACTIVE_PROJECT_CHANGED_EVENT = "kontext-active-project-changed";

export function loadActiveProjectId(_userId: string, _workspaceId: string): string {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("project") || "";
}

export function saveActiveProjectId(
  _userId: string,
  _workspaceId: string,
  projectId: string | null,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set("project", projectId);
  else url.searchParams.delete("project");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(
    new CustomEvent(ACTIVE_PROJECT_CHANGED_EVENT, {
      detail: { userId: _userId, workspaceId: _workspaceId, projectId },
    }),
  );
}
