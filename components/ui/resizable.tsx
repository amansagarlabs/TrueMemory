"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex h-full w-full data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel(props: PanelProps) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle = false,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative z-20 flex w-px shrink-0 items-center justify-center bg-white/[0.08] outline-none transition-colors duration-100 after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-[#e67d2b]/60 focus-visible:bg-[#e67d2b] focus-visible:ring-2 focus-visible:ring-[#e67d2b]/40 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <span className="z-10 grid h-7 w-3 place-items-center rounded-sm border border-white/[0.1] bg-[#1c1c1c] text-white/35 group-aria-[orientation=horizontal]:rotate-90">
          <GripVertical className="size-3" />
        </span>
      ) : null}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
