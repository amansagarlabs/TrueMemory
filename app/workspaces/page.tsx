"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";

import { isAuthenticated, loadAuthUser } from "@/lib/auth";
import { normalizeWorkspaceNames, saveWorkspaces } from "@/lib/workspaces";
import type { AuthUser, AuthWorkspace } from "@/lib/types";
import { PaperDither } from "@/components/ui/paper-dither";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { deleteWorkspace, fetchWorkspaces, persistWorkspace } from "@/services/workspaces";

const workspaceLimits: Record<AuthUser["plan"], number> = {
  free: 1,
  pro: 10,
  team: -1,
  enterprise: -1,
};

export default function WorkspacesPage() {
  const router = useRouter();
  const [user] = useState<AuthUser | null>(() => (isAuthenticated() ? loadAuthUser() : null));
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const currentUser = user;

  useEffect(() => {
    if (!currentUser) {
      router.replace("/login?redirect=/workspaces");
      return;
    }
    let active = true;
    void fetchWorkspaces()
      .then((items) => {
        if (active) {
          const next = normalizeWorkspaceNames(items);
          setWorkspaces(next);
          saveWorkspaces(currentUser.id, next);
        }
      })
      .catch(() => {
        if (active) setWorkspaces([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [currentUser, router]);

  if (!currentUser) return null;

  const currentUserId = currentUser.id;
  const limit = workspaceLimits[currentUser.plan];
  const canCreate = limit === -1 || workspaces.length < limit;

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !canCreate) return;
    const workspace: AuthWorkspace = {
        id: crypto.randomUUID(),
        name: trimmedName,
        platform: "Kontext Memory",
        last_active: new Date().toISOString(),
    };
    try {
      const created = await persistWorkspace(workspace);
      const next = normalizeWorkspaceNames([...workspaces, created]);
      setWorkspaces(next);
      saveWorkspaces(currentUserId, next);
      setName("");
    } catch {
      // Keep the form values so the user can retry after a backend failure.
    }
  }

  async function renameWorkspace(workspace: AuthWorkspace) {
    const nextName = window.prompt("Rename Space", workspace.name)?.trim();
    if (!nextName || nextName === workspace.name) return;
    try {
      const updated = await persistWorkspace({ ...workspace, name: nextName });
      setWorkspaces((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      // Keep the confirmed backend state visible when an update fails.
    }
  }

  async function removeWorkspace(workspace: AuthWorkspace) {
    if (!window.confirm(`Delete ${workspace.name}? Its scoped context will be removed.`)) return;
    try {
      await deleteWorkspace(workspace.id);
      setWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
    } catch {
      // Do not remove the row unless the backend confirms deletion.
    }
  }

  return (
    <AuthenticatedAppShell>
    <div className="theme-surface-page workspaces-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
        <header className="flex items-center justify-between gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white">
            <ArrowLeft aria-hidden="true" className="size-4" /> Dashboard
          </Link>
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]"><span aria-hidden="true" className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)]" />TrueMemory</Link>
        </header>

        <section className="relative mt-7 overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0a08] p-6 sm:p-8 lg:p-10">
          <PaperDither className="inset-y-0 right-0 w-[58%] opacity-75" dark={{ colorBack: "#0c0a0800", colorFront: "#e85d18" }} light={{ colorBack: "#fffaf6", colorFront: "#d86516" }} eager maxPixelCount={900 * 420} scale={0.74} shape="warp" size={2.2} speed={0.16} type="4x4" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.94)_50%,rgba(12,10,8,0.14)_100%)]" />
          <div className="relative z-10 max-w-xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-[#f6e879]">TrueMemory / Spaces</p>
            <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Spaces keep context in bounds.</h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-white/45">A Space contains the memories, agents, applications, connections, and activity that belong together.</p>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <section className="h-fit rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">New Space</p>
            <form onSubmit={createWorkspace} className="mt-5">
              <label className="text-sm font-medium text-white/70" htmlFor="workspace-name">Space name</label>
              <input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Product research" maxLength={80} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6e879]/50 focus:ring-2 focus:ring-[#f6e879]/10" />
              <button type="submit" disabled={!canCreate || !name.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6e879] px-4 py-3 text-sm font-semibold text-[#171814] transition hover:bg-[#fff39a] disabled:cursor-not-allowed disabled:opacity-35">
                <Plus aria-hidden="true" className="size-4" /> Create Space
              </button>
            </form>
            <p className="mt-4 text-xs leading-5 text-white/30">{limit === -1 ? "Unlimited workspaces on your plan." : `${workspaces.length} of ${limit} workspaces used.`}</p>
          </section>

          <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10100f]">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/75"><FolderKanban aria-hidden="true" className="size-4 text-[#f6e879]" />Your Spaces</div>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/40">{workspaces.length}</span>
            </div>
            {loading ? (
              <div className="px-6 py-16 text-center"><p className="text-sm font-medium text-white/60">Loading workspaces...</p></div>
            ) : workspaces.length === 0 ? (
              <div className="px-6 py-16 text-center"><p className="text-sm font-medium text-white/60">No Space yet</p><p className="mt-2 text-xs text-white/30">Create your first memory boundary using the form.</p></div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.025]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e85d18]/20 bg-[#e85d18]/10 text-[#f07837]"><FolderKanban aria-hidden="true" className="size-[18px]" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white/80">{workspace.name}</p><p className="mt-1 text-[10px] text-white/30">{workspace.platform} · active {new Date(workspace.last_active).toLocaleDateString()}</p></div>
                    <Link href="/chat" aria-label={`Open ${workspace.name}`} className="grid size-9 place-items-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white"><ArrowRight aria-hidden="true" className="size-4" /></Link>
                    <button type="button" aria-label={`Rename ${workspace.name}`} onClick={() => void renameWorkspace(workspace)} className="grid size-9 place-items-center rounded-lg text-white/25 transition hover:bg-white/[0.06] hover:text-white"><Pencil aria-hidden="true" className="size-4" /></button>
                    <button type="button" aria-label={`Delete ${workspace.name}`} onClick={() => void removeWorkspace(workspace)} className="grid size-9 place-items-center rounded-lg text-white/25 transition hover:bg-red-400/[0.08] hover:text-red-300"><Trash2 aria-hidden="true" className="size-4" /></button>
                  </div>
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
