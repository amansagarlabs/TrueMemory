const ACTIVE_GITHUB_REPOSITORY_KEY = "kontext-active-github-repository";

export const ACTIVE_GITHUB_REPOSITORY_CHANGED_EVENT =
  "kontext-active-github-repository-changed";

export type ActiveGithubRepositoryChange = {
  userId: string;
  workspaceId: string;
  fullName: string | null;
};

function repositoryKey(userId: string, workspaceId?: string) {
  return `${ACTIVE_GITHUB_REPOSITORY_KEY}:${userId}:${workspaceId || "default"}`;
}

export function loadActiveGithubRepository(
  userId: string,
  workspaceId?: string,
): string {
  if (typeof window === "undefined") return "";
  return (
    window.localStorage.getItem(repositoryKey(userId, workspaceId)) || ""
  );
}

export function saveActiveGithubRepository(
  userId: string,
  workspaceId: string | undefined,
  fullName: string | null,
) {
  if (typeof window === "undefined") return;

  if (fullName) {
    window.localStorage.setItem(repositoryKey(userId, workspaceId), fullName);
  } else {
    window.localStorage.removeItem(repositoryKey(userId, workspaceId));
  }

  window.dispatchEvent(
    new CustomEvent<ActiveGithubRepositoryChange>(
      ACTIVE_GITHUB_REPOSITORY_CHANGED_EVENT,
      {
        detail: {
          userId,
          workspaceId: workspaceId || "default",
          fullName,
        },
      },
    ),
  );
}
