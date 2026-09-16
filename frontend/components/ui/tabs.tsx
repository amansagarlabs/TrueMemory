"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Tabs as BaseTabs } from "@base-ui/react";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof BaseTabs.Root>) {
  return <BaseTabs.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-[18px] border border-border bg-muted/55 p-1 text-muted-foreground shadow-inner dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "inline-flex flex-1 items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] outline-none active:scale-[0.98] data-[active]:bg-card data-[active]:text-foreground data-[active]:shadow-[0_1px_2px_rgba(32,20,12,0.06),0_5px_14px_-8px_rgba(32,20,12,0.2)] focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-white/55 dark:data-[active]:bg-white/[0.08] dark:data-[active]:text-white dark:data-[active]:shadow-[0_10px_24px_-16px_rgba(0,0,0,0.6)] dark:focus-visible:ring-[#f6e879]/50",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
