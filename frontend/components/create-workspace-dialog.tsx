"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PaperDither } from "@/components/ui/paper-dither";
import { X } from "lucide-react";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[#0d0d0c] border-white/10 text-white p-0 overflow-hidden group/dialog">
        {/* Close button - visible on hover */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-white/40 opacity-0 transition-all duration-200 hover:bg-white/[0.08] hover:text-white group-hover/dialog:opacity-100"
        >
          <X className="size-4" />
        </button>

        <div className="flex min-h-[340px]">
          {/* Left: Dither visual */}
          <div className="relative hidden w-[45%] overflow-hidden bg-[#0a0a09] sm:block">
            <PaperDither
              className="absolute inset-0"
              dark={{ colorBack: "#0a0a09", colorFront: "#f27a28" }}
              light={{ colorBack: "#0a0a09", colorFront: "#f27a28" }}
              eager
              maxPixelCount={600 * 400}
              scale={0.65}
              shape="wave"
              size={2.4}
              speed={0.14}
              type="4x4"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0d0d0c]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a09] via-transparent to-[#0a0a09]" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center p-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">New context</div>
              <h2 className="mt-3 font-heading text-2xl font-medium tracking-[-0.04em] text-white">Create workspace</h2>
              <p className="mt-2 text-center text-xs leading-5 text-white/40">Separate sources, memory, and active work by project.</p>
            </div>
          </div>

          {/* Right: Form */}
          <div className="relative flex flex-1 flex-col p-8">
            <div className="flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Workspace</p>
              <h2 className="mt-3 font-heading text-xl font-medium tracking-[-0.03em] text-white">Create new workspace</h2>
              <p className="mt-2 text-sm text-white/45">Give your workspace a name to get started.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="workspace-name" className="text-sm font-medium text-white/70">
                    Workspace name
                  </label>
                  <input
                    id="workspace-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Product research"
                    maxLength={80}
                    autoFocus
                    className="mt-2.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6e879]/50 focus:ring-2 focus:ring-[#f6e879]/10"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="rounded-xl bg-[#f6e879] px-5 py-2.5 text-sm font-semibold text-[#171814] transition hover:bg-[#fff39a] disabled:opacity-40"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
