"use client";

import Link from "next/link";
import { memo, useEffect, useRef } from "react";
import type { ComponentType, CSSProperties, MouseEvent } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const lineVariants = {
  normal: { width: 24 },
  active: { width: 40 },
  hover: { width: 40 },
};

type LineNavWidths = {
  normal: number;
  active: number;
  hover: number;
};

const MotionLink = motion.create(Link);

export type LineNavItem = {
  title: string;
  href: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
};

export type LineNavProps = {
  className?: string;
  /** @fumadocsHref #linenavitem */
  items: LineNavItem[];
  /** Href of the active item. */
  activeHref?: string;
  orientation?: "vertical" | "horizontal";
  compact?: boolean;
  density?: "default" | "dense";
  markerPosition?: "left" | "right";
  revealLabelOnHover?: boolean;
  floatingLabelSide?: "left" | "right";
  lineWidths?: LineNavWidths;
  /** Scroll the active item into view on mount. */
  scrollActiveIntoView?: boolean;
  /** Called when an item is clicked. */
  onItemClick?: (item: LineNavItem, event: MouseEvent<HTMLAnchorElement>) => void;
};

export function LineNav({
  className,
  items,
  activeHref,
  orientation = "horizontal",
  compact = false,
  density = "default",
  markerPosition = "left",
  revealLabelOnHover = false,
  floatingLabelSide,
  lineWidths = {
    normal: lineVariants.normal.width,
    active: lineVariants.active.width,
    hover: lineVariants.hover.width,
  },
  scrollActiveIntoView = true,
  onItemClick,
}: LineNavProps) {
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (scrollActiveIntoView) {
      activeItemRef.current?.scrollIntoView({ block: "center" });
    }
  }, [scrollActiveIntoView]);

  return (
    <nav
      className={cn(
        orientation === "vertical"
          ? cn("flex flex-col", density === "dense" ? "gap-0 py-1" : "gap-1 py-2")
          : "flex flex-row items-center gap-2",
        className,
      )}
      style={
        {
          "--line-nav-width": `${lineVariants.normal.width}px`,
        } as CSSProperties
      }
    >
      {items.map((item, index) => {
        const isActive = item.href === activeHref;

        return (
          <LineNavItem
            key={item.href}
            ref={isActive ? activeItemRef : undefined}
            compact={compact}
            density={density}
            markerPosition={markerPosition}
            revealLabelOnHover={revealLabelOnHover}
            floatingLabelSide={floatingLabelSide}
            lineWidths={lineWidths}
            orientation={orientation}
            icon={item.icon}
            title={item.title}
            description={item.description}
            href={item.href}
            active={isActive}
            isLast={index === items.length - 1}
            onClick={onItemClick ? (event) => onItemClick(item, event) : undefined}
          />
        );
      })}
    </nav>
  );
}

const LineNavItem = memo(function LineNavItem({
  ref,
  compact = false,
  density = "default",
  markerPosition = "left",
  revealLabelOnHover = false,
  floatingLabelSide,
  lineWidths,
  orientation = "horizontal",
  icon: Icon,
  title,
  description,
  href,
  active = false,
  isLast = false,
  onClick,
}: {
  ref?: React.Ref<HTMLAnchorElement>;
  compact?: boolean;
  density?: "default" | "dense";
  markerPosition?: "left" | "right";
  revealLabelOnHover?: boolean;
  floatingLabelSide?: "left" | "right";
  lineWidths: LineNavWidths;
  orientation?: "vertical" | "horizontal";
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  href: string;
  active?: boolean;
  isLast?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const isVertical = orientation === "vertical";
  const itemLineVariants = {
    normal: { width: lineWidths.normal },
    active: { width: lineWidths.active },
    hover: { width: lineWidths.hover },
  };

  return (
    <div className="flex items-center gap-2">
      <MotionLink
        ref={ref}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/line-nav relative flex items-center transition-[color,background-color,transform] ease-out",
          isVertical
            ? compact
              ? "h-10 w-10 justify-center rounded-xl"
              : cn(
                  "w-full min-w-0",
                  density === "dense"
                    ? floatingLabelSide
                      ? cn(
                          "h-[var(--line-nav-row-height,1rem)] px-1",
                          markerPosition === "right" ? "justify-end" : "justify-start",
                        )
                      : "h-8 px-1"
                    : "h-10 rounded-xl px-2.5",
                )
            : "h-px",
        )}
        href={href}
        initial={false}
        animate={active ? "active" : "normal"}
        whileHover="hover"
        onClick={onClick}
      >
        {isVertical ? (
          <>
            <motion.span
              className={cn(
                "block h-px shrink-0 transition-[background-color] ease-out group-hover/line-nav:bg-foreground",
                active ? "bg-foreground" : "bg-foreground/20",
                markerPosition === "right"
                  ? density === "dense"
                    ? "order-2 ml-3"
                    : "order-2 ml-2"
                  : density === "dense"
                    ? "mr-3"
                    : "mr-2",
              )}
              variants={itemLineVariants}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            />
            <div
              className={cn(
                "flex min-w-0 items-center",
                markerPosition === "right" && !floatingLabelSide && "order-1 flex-1",
                floatingLabelSide &&
                  cn(
                    "pointer-events-auto absolute top-1/2 z-10 w-max max-w-[232px] -translate-y-1/2",
                    floatingLabelSide === "left"
                      ? "right-full justify-end pr-3 text-right"
                      : "left-full justify-start pl-3 text-left",
                  ),
                compact ? "justify-center" : "gap-2",
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground group-hover/line-nav:text-foreground",
                  )}
                />
              ) : null}
              {!compact ? (
                <span
                  className={cn(
                    "min-w-0 truncate transition-[color] ease-out group-hover/line-nav:text-foreground",
                    active ? "text-foreground" : "text-muted-foreground",
                    density === "dense"
                      ? floatingLabelSide
                        ? "block rounded-md border border-border/70 bg-muted/90 px-2.5 py-1.5 text-sm font-medium leading-5 text-foreground shadow-md backdrop-blur-md"
                        : "text-[13px] leading-none"
                      : "text-sm",
                    revealLabelOnHover &&
                      "translate-x-1 opacity-0 transition-[color,opacity,transform] duration-100 group-hover/line-nav:translate-x-0 group-hover/line-nav:opacity-100 group-focus-visible/line-nav:translate-x-0 group-focus-visible/line-nav:opacity-100",
                  )}
                >
                  <span className="block truncate">{title}</span>
                  {floatingLabelSide && description ? (
                    <span className="mt-0.5 block max-w-[210px] truncate text-[11px] font-normal leading-4 text-muted-foreground">
                      {description}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="sr-only">{title}</span>
              )}
            </div>
          </>
        ) : (
          <>
            <motion.span
              className={cn(
                "block h-px shrink-0 transition-[background-color] ease-out group-hover/line-nav:bg-foreground",
                active ? "bg-foreground" : "bg-foreground/20",
              )}
              variants={lineVariants}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            />
            <span
              className={cn(
                "text-sm whitespace-nowrap transition-[color] ease-out group-hover/line-nav:text-foreground",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {title}
            </span>
          </>
        )}
      </MotionLink>

    </div>
  );
});
