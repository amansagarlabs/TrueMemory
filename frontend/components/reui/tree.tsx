"use client";

import { createContext, useContext } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ItemInstance, TreeInstance } from "@headless-tree/core";
import { ChevronDown, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type TreeToggleIcon = "chevron" | "plus-minus";

type TreeContextValue<T> = {
  indent: number;
  currentItem?: ItemInstance<T>;
  tree?: TreeInstance<T>;
  toggleIconType: TreeToggleIcon;
};

const TreeContext = createContext<TreeContextValue<unknown>>({
  indent: 20,
  toggleIconType: "chevron",
});

function useTreeContext<T>() {
  return useContext(TreeContext) as TreeContextValue<T>;
}

type TreeProps<T> = React.HTMLAttributes<HTMLDivElement> & {
  indent?: number;
  tree: TreeInstance<T>;
  toggleIconType?: TreeToggleIcon;
  label?: string;
};

function Tree<T>({
  indent = 20,
  tree,
  className,
  toggleIconType = "chevron",
  label,
  style,
  ...props
}: TreeProps<T>) {
  const containerProps = tree.getContainerProps(label);
  const mergedStyle = {
    ...style,
    ...containerProps.style,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties;

  return (
    <TreeContext.Provider
      value={{
        indent,
        tree: tree as TreeInstance<unknown>,
        toggleIconType,
      }}
    >
      <div
        {...props}
        {...containerProps}
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
      />
    </TreeContext.Provider>
  );
}

type TreeItemProps<T> = Omit<
  useRender.ComponentProps<"button">,
  "item" | "indent"
> & {
  item: ItemInstance<T>;
};

function TreeItem<T>({
  item,
  className,
  render,
  children,
  style,
  ...props
}: TreeItemProps<T>) {
  const parentContext = useTreeContext<T>();
  const itemProps = item.getProps();
  const mergedStyle = {
    ...style,
    ...itemProps.style,
    "--tree-padding": `${item.getItemMeta().level * parentContext.indent}px`,
  } as React.CSSProperties;

  const defaultProps = {
    "data-slot": "tree-item",
    "data-focus": item.isFocused() || undefined,
    "data-folder": item.isFolder() || undefined,
    "data-selected": item.isSelected?.() || undefined,
    "aria-expanded": item.isFolder() ? item.isExpanded() : undefined,
    style: mergedStyle,
    className: cn(
      "z-10 ps-(--tree-padding) text-left outline-none select-none focus-visible:z-20",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    ),
  };

  return (
    <TreeContext.Provider
      value={{
        indent: parentContext.indent,
        tree: parentContext.tree as unknown as
          | TreeInstance<unknown>
          | undefined,
        toggleIconType: parentContext.toggleIconType,
        currentItem: item as unknown as ItemInstance<unknown>,
      }}
    >
      {useRender({
        defaultTagName: "button",
        render,
        props: mergeProps<"button">(
          defaultProps,
          props,
          itemProps,
          { children },
        ),
      })}
    </TreeContext.Provider>
  );
}

type TreeItemLabelProps<T> = React.HTMLAttributes<HTMLSpanElement> & {
  item?: ItemInstance<T>;
};

function TreeItemLabel<T>({
  item: providedItem,
  children,
  className,
  ...props
}: TreeItemLabelProps<T>) {
  const { currentItem, toggleIconType } = useTreeContext<T>();
  const item = providedItem || currentItem;

  if (!item) return null;

  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-[12px]",
        "text-white/58 transition-colors duration-75 hover:bg-white/[0.045] hover:text-white/82",
        "in-focus-visible:ring-2 in-focus-visible:ring-[#e67d2b] in-focus-visible:ring-offset-1 in-focus-visible:ring-offset-[#101214]",
        "in-data-[selected=true]:bg-white/[0.07] in-data-[selected=true]:text-white",
        className,
      )}
      {...props}
    >
      {item.isFolder() ? (
        toggleIconType === "plus-minus" ? (
          item.isExpanded() ? (
            <Minus className="size-3.5 shrink-0 text-white/36" />
          ) : (
            <Plus className="size-3.5 shrink-0 text-white/36" />
          )
        ) : (
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-white/32 transition-transform duration-100 motion-reduce:transition-none",
              !item.isExpanded() && "-rotate-90",
            )}
          />
        )
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden="true" />
      )}
      {children ?? item.getItemName()}
    </span>
  );
}

export { Tree, TreeItem, TreeItemLabel };
