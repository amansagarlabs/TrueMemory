"use client";

import { Check, ChevronDown, Circle, CircleDot, ListTodo } from "lucide-react";
import type { QueryExecutionPlan } from "@/lib/types";

type TodoListProps = {
  title?: string;
  statusLabel?: string;
  plan?: QueryExecutionPlan | null;
  active?: boolean;
  className?: string;
};

export function TodoList({ title = "To-dos", statusLabel, plan, active = false, className = "" }: TodoListProps) {
  const steps = plan?.steps ?? [];
  const doneCount = steps.filter((step) => step.status === "complete").length;
  const currentIndex = steps.findIndex((step) => step.status === "active");

  return (
    <div className={["todo-panel", className].filter(Boolean).join(" ")}>
      <div className="todo-panel-head">
        <span className="todo-panel-head-icon" aria-hidden="true">
          <ListTodo className="size-3.5" />
        </span>
        <span className="todo-panel-title-wrap">
          <span className="todo-panel-title">{title}</span>
          {statusLabel ? <span className="todo-panel-status">{statusLabel}</span> : null}
        </span>
        <span className="todo-panel-count">{doneCount}/{steps.length || 0}</span>
        <ChevronDown className="todo-panel-chevron" aria-hidden="true" />
      </div>
      <ul className="todo-panel-list" aria-label={title}>
        {steps.map((step, index) => {
          const isDone = step.status === "complete";
          const isActive = step.status === "active" || (active && index === currentIndex);
          return (
            <li key={step.id} className={["todo-panel-item", isDone ? "is-done" : "", isActive ? "is-active" : ""].filter(Boolean).join(" ")}>
              <span className="todo-panel-glyph" aria-hidden="true">
                {isDone ? <Check className="size-3.5" /> : isActive ? <CircleDot className="size-3.5" /> : <Circle className="size-3.5" />}
              </span>
              <span className="todo-panel-label">{step.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
