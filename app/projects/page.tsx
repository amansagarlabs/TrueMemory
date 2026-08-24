"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderKanban,
  MessageSquareText,
  Plus,
  Trash2,
} from "lucide-react";

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { PaperDither } from "@/components/ui/paper-dither";
import { isAuthenticated, loadAuthUser } from "@/lib/auth";
import { loadActiveWorkspaceId } from "@/lib/workspaces";
import { loadActiveProjectId, saveActiveProjectId } from "@/lib/active-project";
import type { AuthProject, AuthUser } from "@/lib/types";
import { archiveProject, fetchProjects, persistProject } from "@/services/projects";
import { fetchWorkspaces } from "@/services/workspaces";

const projectLimits: Record<AuthUser["plan"], number> = {
  free: 3,
  pro: 25,
  team: -1,
  enterprise: -1,
};

export default function ProjectsPage() {
  const [user] = useState<AuthUser | null>(() =>
    isAuthenticated() ? loadAuthUser() : null,
  );
  const [projects, setProjects] = useState<AuthProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const [workspaceId, setWorkspaceId] = useState("");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchWorkspaces()
      .then((workspaces) => {
        const requested = loadActiveWorkspaceId(userId);
        const nextWorkspaceId = workspaces.some((item) => item.id === requested) ? requested : workspaces[0]?.id || "";
        setWorkspaceId(nextWorkspaceId);
        if (!nextWorkspaceId) return undefined;
        const nextProjectId = loadActiveProjectId(userId, nextWorkspaceId);
        setActiveProjectId(nextProjectId);
        return fetchProjects(nextWorkspaceId).then((items) => ({ items, workspaceId: nextWorkspaceId, projectId: nextProjectId }));
      })
      .then((result) => {
        if (!active) return;
        if (!result) return;
        const { items, workspaceId: loadedWorkspaceId } = result;
        setProjects(items);
        if (result.projectId && !items.some((item) => item.id === result.projectId)) {
          setActiveProjectId("");
          saveActiveProjectId(userId, loadedWorkspaceId, null);
        }
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Projects could not be loaded."));
    return () => { active = false; };
  }, [userId]);

  if (!user || !workspaceId) return null;

  const limit = projectLimits[user.plan];
  const canCreate = limit === -1 || projects.length < limit;

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !canCreate || !workspaceId) return;

    const now = new Date().toISOString();
    setError(null);
    try {
      const project = await persistProject({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        name: trimmedName,
        description: description.trim(),
        created_at: now,
        last_active: now,
      });
      setProjects((current) => [project, ...current]);
      setName("");
      setDescription("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be saved.");
    }
  }

  async function removeProject(id: string) {
    if (!userId || !workspaceId) return;
    setError(null);
    try {
      await archiveProject(id);
      setProjects((current) => current.filter((project) => project.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId("");
        saveActiveProjectId(userId, workspaceId, null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be archived.");
    }
  }

  function selectProject(project: AuthProject) {
    if (!userId || !workspaceId) return;
    setActiveProjectId(project.id);
    saveActiveProjectId(userId, workspaceId, project.id);
    window.location.assign(`/chat?project=${encodeURIComponent(project.id)}`);
  }

  return (
    <AuthenticatedAppShell variant="chat">
      <div className="theme-surface-page projects-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
        <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/chat"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/55 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.07] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd4f13] dark:focus-visible:ring-[#f19045]"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Chat
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]"
            >
              <span
                aria-hidden="true"
                className="size-6 rounded-full bg-[linear-gradient(135deg,#ffb36b,#f19045_42%,#bd4f13)]"
              />
              TrueMemory
            </Link>
          </header>

          <section className="relative mt-7 overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0a08] p-6 sm:p-8 lg:p-10">
            <PaperDither
              className="inset-y-0 right-0 w-[58%] opacity-75"
              dark={{ colorBack: "#0c0a0800", colorFront: "#e85d18" }}
              light={{ colorBack: "#fffaf6", colorFront: "#d86516" }}
              eager
              maxPixelCount={900 * 420}
              scale={0.74}
              shape="warp"
              size={2.2}
              speed={0.14}
              type="4x4"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.94)_50%,rgba(12,10,8,0.14)_100%)]" />
            <div className="relative z-10 max-w-xl">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#bd4f13] dark:text-[#f19045]">
                Organized context
              </p>
              <h1 className="mt-3 text-balance font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
                Your projects.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-7 text-white/45">
                Group conversations, artifacts, and ongoing research around a clear outcome.
                Open a project to continue its work in Chat.
              </p>
            </div>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
            <section className="h-fit rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#bd4f13] dark:text-[#f19045]">
                New project
              </p>
              <form onSubmit={createProject} className="mt-5 space-y-4">
                <div>
                  <label
                    className="text-sm font-medium text-white/70"
                    htmlFor="project-name"
                  >
                    Project name
                  </label>
                  <input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Competitive research"
                    maxLength={80}
                    className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#bd4f13]/60 focus:ring-2 focus:ring-[#bd4f13]/15 dark:focus:border-[#f19045]/60 dark:focus:ring-[#f19045]/15"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium text-white/70"
                    htmlFor="project-description"
                  >
                    Description
                  </label>
                  <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What are you trying to accomplish?"
                    maxLength={240}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[#bd4f13]/60 focus:ring-2 focus:ring-[#bd4f13]/15 dark:focus:border-[#f19045]/60 dark:focus:ring-[#f19045]/15"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canCreate || !name.trim()}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#bd4f13] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#a9430f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 dark:bg-[#f19045] dark:text-white dark:hover:bg-[#ffad68]"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Create project
                </button>
              </form>
              <p className="mt-4 text-xs leading-5 text-white/30">
                {limit === -1
                  ? "Unlimited projects on your plan."
                  : `${projects.length} of ${limit} projects used.`}
              </p>
              {error ? <p role="alert" className="mt-3 text-xs text-red-300">{error}</p> : null}
            </section>

            <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10100f]">
              <div className="flex min-h-16 items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/75">
                  <FolderKanban aria-hidden="true" className="size-4 text-[#bd4f13] dark:text-[#f19045]" />
                  Managed projects
                </div>
                <span className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2 py-1 font-mono text-[10px] tabular-nums text-white/40">
                  {projects.length}
                </span>
              </div>

              {projects.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-black/25 text-white/25">
                    <FolderKanban aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-4 text-sm font-medium text-white/60">No projects yet</p>
                  <p className="mt-2 text-xs text-white/30">
                    Create your first project using the form.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.07]">
                  {projects.map((project) => (
                    <article
                      key={project.id}
                      className={`flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.025] ${
                        activeProjectId === project.id ? "bg-[#bd4f13]/[0.045] dark:bg-[#f19045]/[0.08]" : ""
                      }`}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e85d18]/20 bg-[#e85d18]/10 text-[#f07837]">
                        <FolderKanban aria-hidden="true" className="size-[18px]" />
                      </span>
                      <button
                        type="button"
                        onClick={() => selectProject(project)}
                        className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd4f13] dark:focus-visible:ring-[#f19045]"
                      >
                        <p className="truncate text-sm font-semibold text-white/80">
                          {project.name}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-white/35">
                          {project.description || "No description added"}
                        </p>
                        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/22">
                          {activeProjectId === project.id ? "Selected · " : ""}
                          Updated {new Date(project.last_active).toLocaleDateString()}
                        </p>
                      </button>
                      {activeProjectId === project.id ? (
                        <span title="Selected project" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#bd4f13]/10 text-[#bd4f13] dark:bg-[#f19045]/10 dark:text-[#f19045]">
                          <Check aria-hidden="true" className="size-4" />
                        </span>
                      ) : null}
                      <Link
                        href={`/chat?project=${encodeURIComponent(project.id)}`}
                        aria-label={`Open ${project.name} in chat`}
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-white/35 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd4f13] dark:focus-visible:ring-[#f19045]"
                      >
                        <MessageSquareText aria-hidden="true" className="size-4" />
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${project.name}`}
                        onClick={() => removeProject(project.id)}
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-white/25 transition-[background-color,color,transform] duration-150 hover:bg-red-400/[0.08] hover:text-red-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                      <ArrowRight
                        aria-hidden="true"
                        className="hidden size-4 text-white/15 sm:block"
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AuthenticatedAppShell>
  );
}
