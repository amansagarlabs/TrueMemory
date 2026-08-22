"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

interface ScrollAreaProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>,
    "children"
  > {
  children?: React.ReactNode;
  orientation?: ScrollAreaOrientation;
  maxHeight?: string;
  maxWidth?: string;
  scrollbar?: boolean;
  viewportRef?: React.Ref<HTMLDivElement>;
  viewportClassName?: string;
  contentClassName?: string;
}

type ScrollBarProps = React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.Scrollbar
>;

const ScrollBar = React.forwardRef<HTMLDivElement, ScrollBarProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      orientation={orientation}
      data-slot="scroll-area-scrollbar"
      className={cn(
        "z-20 flex touch-none select-none opacity-0 transition-[opacity,background-color] duration-200 ease-out data-[hovering]:opacity-100 data-[scrolling]:opacity-100 motion-reduce:transition-none",
        orientation === "vertical"
          ? "h-full w-2.5 border-l border-l-transparent p-0.5"
          : "h-2.5 w-full flex-col border-t border-t-transparent p-0.5",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 cursor-grab rounded-full bg-white/20 transition-colors duration-150 hover:bg-white/32 active:cursor-grabbing data-[scrolling]:bg-white/28 motion-reduce:transition-none"
      />
    </ScrollAreaPrimitive.Scrollbar>
  ),
);
ScrollBar.displayName = "ScrollBar";

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  (
    {
      className,
      children,
      orientation = "vertical",
      maxHeight,
      maxWidth,
      scrollbar = true,
      viewportRef,
      viewportClassName,
      contentClassName,
      style,
      ...props
    },
    ref,
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      data-slot="scroll-area"
      className={cn(
        "group/scroll-area relative min-h-0 min-w-0 overflow-hidden",
        className,
      )}
      style={{ ...style, maxHeight, maxWidth }}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          viewportClassName,
        )}
      >
        <ScrollAreaPrimitive.Content
          data-slot="scroll-area-content"
          className={cn(
            orientation === "horizontal" ? "min-w-max" : "w-full min-w-0 max-w-full",
            contentClassName,
          )}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>

      {scrollbar && orientation !== "horizontal" ? (
        <ScrollBar orientation="vertical" />
      ) : null}
      {scrollbar && orientation !== "vertical" ? (
        <ScrollBar orientation="horizontal" />
      ) : null}
      {scrollbar && orientation === "both" ? (
        <ScrollAreaPrimitive.Corner
          data-slot="scroll-area-corner"
          className="bg-[#151719]"
        />
      ) : null}
    </ScrollAreaPrimitive.Root>
  ),
);
ScrollArea.displayName = "ScrollArea";

export { ScrollArea, ScrollBar };
export type { ScrollAreaProps, ScrollBarProps };
