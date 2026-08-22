"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Folder, Plus, Search, X } from "lucide-react";
import type { AuthProject } from "@/lib/types";

export function ProjectSelector({
  projects,
  selected,
  loading,
  onSelect,
  onCreate,
}: {
  projects: AuthProject[];
  selected: AuthProject | null;
  loading?: boolean;
  onSelect: (project: AuthProject | null) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? projects.filter((project) =>
          `${project.name} ${project.description}`.toLowerCase().includes(normalized),
        )
      : projects;
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-9 max-w-[240px] items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-[var(--chat-foreground)] transition-[background-color,transform] duration-100 hover:bg-[var(--chat-surface-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
      >
        <Folder className="size-3.5 shrink-0 text-[var(--chat-muted-foreground)]" aria-hidden="true" />
        <span className="truncate">{selected?.name ?? "Select project"}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-[min(320px,calc(100vw-40px))] rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-raised)] p-2 shadow-[0_22px_60px_-24px_rgba(0,0,0,0.72)]">
          <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--chat-background)] px-3 text-[var(--chat-muted-foreground)]">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--chat-foreground)] outline-none placeholder:text-[var(--chat-subtle-foreground)]"
            />
          </label>
          <div role="listbox" aria-label="Projects" className="mt-1 max-h-56 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-3 text-xs text-[var(--chat-muted-foreground)]">Loading projects…</p>
            ) : filtered.length ? (
              filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="option"
                  aria-selected={project.id === selected?.id}
                  onClick={() => {
                    onSelect(project);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
                >
                  <Folder className="size-4 shrink-0 text-[var(--chat-muted-foreground)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.id === selected?.id ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center">
                <p className="text-sm font-medium text-[var(--chat-foreground)]">
                  {query.trim() ? "No matching projects." : "No projects in this workspace yet."}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--chat-muted-foreground)]">
                  {query.trim()
                    ? "Try a different search term or clear the field."
                    : "Create a project to start grouping chats and context."}
                </p>
              </div>
            )}
          </div>
          <div className="mt-1 border-t border-[var(--chat-border)] pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              New project
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
                setQuery("");
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus)]"
            >
              <X className="size-4" aria-hidden="true" />
              Don&apos;t work in a project
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
