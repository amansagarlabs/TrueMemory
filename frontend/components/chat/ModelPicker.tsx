"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { MODEL_PROVIDERS, MODELS, Model } from "@/components/chat/types";
import { credentialedFetch } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  selected: Model | null;
  onSelect: (m: Model) => void;
}

export default function ModelPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState("");
  const [liveModels, setLiveModels] = useState<Model[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    credentialedFetch(`${API_URL}/api/models/openrouter/free`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !Array.isArray(payload?.models)) return;
        const models = payload.models.map((model: { id: string; name: string; description?: string; input_modalities?: string[] }) => ({
          id: model.id,
          name: model.name.replace(/\s*\(free\)\s*$/i, ""),
          color: "linear-gradient(135deg,#20a887,#146c5a)",
          provider: "OpenRouter",
          group: "OpenRouter Free",
          caps: ["Free", "OpenRouter", ...(model.input_modalities?.includes("image") ? ["Vision"] : [])],
          description: model.description,
          dynamic: true,
        } satisfies Model));
        setLiveModels(models);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const current = selected ?? MODELS[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && (open || showMore)) {
        setOpen(false);
        setShowMore(false);
        setQuery("");
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, showMore]);

  const availableModels = [MODELS[0], ...liveModels, ...MODELS.slice(1)].filter((model, index, models) =>
    models.findIndex((candidate) => candidate.id === model.id) === index,
  );
  const filteredModels = availableModels.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );
  const grouped = filteredModels.reduce<Record<string, Model[]>>((acc, m) => {
    const group = m.group ?? m.provider ?? "Available";
    (acc[group] ??= []).push(m);
    return acc;
  }, {});
  const orderedGroups = [
    ...MODEL_PROVIDERS.filter((provider) => grouped[provider]?.length),
    ...Object.keys(grouped).filter((group) => !MODEL_PROVIDERS.includes(group as typeof MODEL_PROVIDERS[number])),
  ];
  const compactLimit = 7;
  const compactModels = filteredModels.slice(0, compactLimit);
  const compactHasMore = filteredModels.length > compactLimit;
  const compactGrouped = compactModels.reduce<Record<string, Model[]>>((acc, m) => {
    const group = m.group ?? m.provider ?? "Available";
    (acc[group] ??= []).push(m);
    return acc;
  }, {});
  const compactOrderedGroups = [
    ...MODEL_PROVIDERS.filter((provider) => compactGrouped[provider]?.length),
    ...Object.keys(compactGrouped).filter((group) => !MODEL_PROVIDERS.includes(group as typeof MODEL_PROVIDERS[number])),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="model-picker-panel"
        aria-label={`Choose model, currently ${current.name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-transparent bg-[var(--chat-background)] px-3 text-xs font-semibold text-[var(--chat-muted-foreground)] shadow-[inset_0_0_0_1px_var(--chat-border)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] sm:h-9"
      >
        <ModelDot color={current.color} />
        <span className="max-w-24 truncate sm:max-w-32">{current.name}</span>
        <ChevronDown className={`size-3.5 text-[var(--chat-subtle-foreground)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div id="model-picker-panel" role="dialog" aria-label="Choose a model" className="absolute bottom-13 left-0 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-[20px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 shadow-[0_24px_60px_-30px_rgba(64,43,24,0.42)] backdrop-blur-sm sm:bottom-11 dark:shadow-black/70">
          <div className="px-1 pb-2 pt-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
              Response model
            </p>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--chat-subtle-foreground)]" aria-hidden="true" />
          <input
            id="model-search"
            name="model-search"
            autoFocus
            aria-label="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models..."
            className="h-11 w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-background)] pl-9 pr-3 text-sm text-[var(--chat-foreground)] outline-none placeholder:text-[var(--chat-subtle-foreground)] focus:border-[var(--chat-accent)] focus:ring-2 focus:ring-[var(--chat-focus)] sm:h-10"
          />
          </div>
          <div role="listbox" aria-label="Available models">
          {compactOrderedGroups.map((group) => {
            const models = compactGrouped[group] ?? [];
            return (
            <div key={group} role="group" aria-label={group} className="mb-2">
              <p className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">
                {group}
              </p>
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={m.id === current.id}
                  aria-disabled={m.disabled || undefined}
                  disabled={m.disabled}
                  onClick={() => {
                    if (m.disabled) return;
                    onSelect(m);
                    setOpen(false);
                    setShowMore(false);
                    setQuery("");
                    window.requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
                    m.disabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-[var(--chat-surface-muted)]"
                  } ${
                    m.id === current.id
                      ? "bg-[var(--chat-surface-muted)] text-[var(--chat-foreground)]"
                      : "text-[var(--chat-muted-foreground)]"
                  }`}
                >
                  <ModelDot color={m.color} />
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{m.name}</span>
                      {m.caps?.includes("Free") ? (
                        <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-medium text-emerald-500">
                          Free
                        </span>
                      ) : null}
                      {m.disabled ? (
                        <span className="rounded-full bg-[var(--chat-surface-muted)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--chat-subtle-foreground)]">
                          Coming soon
                        </span>
                      ) : null}
                    </span>
                    {m.description ? (
                      <span className="truncate text-[10px] font-normal text-[var(--chat-subtle-foreground)]">
                        {m.description}
                      </span>
                    ) : null}
                    </span>
                  <span className="flex shrink-0 gap-1">
                    {m.caps?.map((cap) => (
                      <span
                        key={cap}
                        className="rounded-full bg-[var(--chat-surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--chat-muted-foreground)]"
                      >
                        {cap}
                      </span>
                    ))}
                  </span>
                  {m.id === current.id ? <Check className="size-3.5 shrink-0 text-[var(--chat-accent)]" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
            );
          })}
          {compactHasMore ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              aria-label={`Show all ${filteredModels.length} available models`}
              className="mt-1 flex min-h-10 w-full items-center justify-center rounded-xl border border-dashed border-[var(--chat-border)] px-3 text-sm text-[var(--chat-muted-foreground)] transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)]"
            >
              Show more models ({filteredModels.length - compactLimit})
            </button>
          ) : null}
          </div>
        </div>
      )}

      {showMore ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowMore(false);
              window.requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All available models"
            className="w-[min(40rem,calc(100vw-1.5rem))] rounded-[24px] border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3 shadow-[0_30px_80px_-28px_rgba(32,21,16,0.5)] backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-3 px-1 pb-3 pt-1">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-subtle-foreground)]">
                  More models
                </p>
                <p className="mt-1 text-xs text-[var(--chat-subtle-foreground)]">
                  Browse the full catalog and keep the compact picker closed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMore(false);
                  window.requestAnimationFrame(() => triggerRef.current?.focus());
                }}
                className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-background)] text-[var(--chat-muted-foreground)] transition-colors duration-100 hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)]"
                aria-label="Close more models dialog"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto pr-1">
              <div role="listbox" aria-label="Available models">
                {orderedGroups.map((group) => {
                  const models = grouped[group] ?? [];
                  return (
                    <div key={group} role="group" aria-label={group} className="mb-2">
                      <p className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--chat-subtle-foreground)]">
                        {group}
                      </p>
                      {models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={m.id === current.id}
                          aria-disabled={m.disabled || undefined}
                          disabled={m.disabled}
                          onClick={() => {
                            if (m.disabled) return;
                            onSelect(m);
                            setOpen(false);
                            setShowMore(false);
                            setQuery("");
                            window.requestAnimationFrame(() => triggerRef.current?.focus());
                          }}
                          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus)] ${
                            m.disabled
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-[var(--chat-surface-muted)]"
                          } ${
                            m.id === current.id
                              ? "bg-[var(--chat-surface-muted)] text-[var(--chat-foreground)]"
                              : "text-[var(--chat-muted-foreground)]"
                          }`}
                        >
                          <ModelDot color={m.color} />
                          <span className="flex min-w-0 flex-1 flex-col text-left">
                            <span className="flex items-center gap-1.5 truncate">
                              <span>{m.name}</span>
                              {m.caps?.includes("Free") ? (
                                <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-medium text-emerald-500">
                                  Free
                                </span>
                              ) : null}
                              {m.disabled ? (
                                <span className="rounded-full bg-[var(--chat-surface-muted)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--chat-subtle-foreground)]">
                                  Coming soon
                                </span>
                              ) : null}
                            </span>
                            {m.description ? (
                              <span className="truncate text-[10px] font-normal text-[var(--chat-subtle-foreground)]">
                                {m.description}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {m.caps?.map((cap) => (
                              <span
                                key={cap}
                                className="rounded-full bg-[var(--chat-surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--chat-muted-foreground)]"
                              >
                                {cap}
                              </span>
                            ))}
                          </span>
                          {m.id === current.id ? <Check className="size-3.5 shrink-0 text-[var(--chat-accent)]" aria-hidden="true" /> : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}
