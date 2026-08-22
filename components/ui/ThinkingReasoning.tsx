"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ThinkingOrb, type ThinkingOrbVariant } from "@/components/ui/ThinkingOrb";

export function ThinkingReasoning({
  label = "Thinking",
  sentences = [],
  active = true,
  duration,
  completedLabel,
  defaultExpanded = true,
  orb = "v1",
  footer,
  children,
  className = "",
}: {
  label?: string;
  sentences?: string[];
  active?: boolean;
  duration?: number;
  completedLabel?: string;
  defaultExpanded?: boolean;
  orb?: ThinkingOrbVariant;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(active && defaultExpanded);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(duration ?? 0);

  useEffect(() => {
    if (!active || duration !== undefined) return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [active, duration, startedAt]);

  const seconds = Math.max(0, Math.round(duration ?? elapsed));
  const summary = active ? label : completedLabel ?? `Thought for ${seconds}s`;

  return (
    <section className={`thinking-reasoning ${className}`} aria-label={summary}>
      <button
        type="button"
        className="thinking-reasoning-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <ThinkingOrb variant={orb} size="sm" />
        <span className={active ? "thinking-state-shimmer" : "thinking-reasoning-label"}>{summary}</span>
        <ChevronDown className={`thinking-reasoning-chevron ${expanded ? "is-expanded" : ""}`} aria-hidden="true" />
      </button>
      <div className={`thinking-reasoning-collapsible ${expanded ? "is-expanded" : ""}`}>
        <div className="thinking-reasoning-inner">
          {children ?? (
            <div className="thinking-reasoning-stream">
              {sentences.map((sentence, index) => <p key={`${sentence}-${index}`}>{sentence}</p>)}
            </div>
          )}
          {footer ? <div className="thinking-reasoning-footer">{footer}</div> : null}
        </div>
      </div>
    </section>
  );
}
