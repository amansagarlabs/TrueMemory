"use client";

import { useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import type { AuthProject } from "@/lib/types";
import { persistProject } from "@/services/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProjectCreateDialog({
  open,
  workspaceId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: AuthProject) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setDescription("");
      setError(null);
      setSaving(false);
    }
    onOpenChange(nextOpen);
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !workspaceId || saving) return;
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();
    try {
      const project = await persistProject({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        created_at: now,
        last_active: now,
      });
      onCreated(project);
      changeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be created.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : changeOpen}>
      <DialogContent className="dark w-[calc(100vw-2rem)] max-w-[560px] gap-0 rounded-[24px] border border-white/10 bg-[#141412] p-0 text-white shadow-[0_32px_100px_-40px_rgba(0,0,0,0.95)] sm:max-w-[560px]">
        <DialogHeader className="border-b border-white/[0.08] px-6 py-5 pr-14">
          <DialogTitle className="text-xl font-semibold tracking-[-0.035em]">
            Create project
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-white/40">
            Keep related chats, artifacts, decisions, and memory in one context.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={createProject}>
          <div className="space-y-4 px-6 py-6">
            <div>
              <label htmlFor="new-project-name" className="text-sm font-medium text-white/70">
                Project name
              </label>
              <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 focus-within:border-[#f6e879]/55 focus-within:ring-2 focus-within:ring-[#f6e879]/10">
                <Folder className="size-4 shrink-0 text-white/35" aria-hidden="true" />
                <input
                  id="new-project-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  placeholder="Project name"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <div>
              <label htmlFor="new-project-description" className="text-sm font-medium text-white/70">
                What are you working on?
              </label>
              <textarea
                id="new-project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={4}
                placeholder="Add the goal, scope, or outcome for this project."
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[#f6e879]/55 focus:ring-2 focus:ring-[#f6e879]/10"
              />
            </div>
            {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          </div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-white/[0.08] px-6 pb-6 pt-4">
            <button
              type="button"
              onClick={() => changeOpen(false)}
              disabled={saving}
              className="min-h-11 rounded-xl px-4 text-sm text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6e879]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="inline-flex min-h-11 min-w-32 items-center justify-center gap-2 rounded-xl bg-[#f6e879] px-4 text-sm font-semibold text-[#171814] transition-[background-color,transform] duration-100 hover:bg-[#fff39a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6e879] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141412]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Create project
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
