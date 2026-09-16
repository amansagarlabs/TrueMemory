"use client";

import {
  Folder,
  FolderOpen,
  Loader2,
  Copy,
  FileCode2,
  Scissors,
  Clipboard,
  Trash2,
  TerminalSquare,
  Eye,
} from "lucide-react";
import {
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree";
import { FileTypeIcon } from "@/components/coding/file-type-icon";
import { cn } from "@/lib/utils";
import type { GithubRepositoryTreeEntry } from "@/services/github";

type RepositoryTreeProps = {
  entries: GithubRepositoryTreeEntry[];
  activePath: string;
  loadingPath?: string;
  loadingFolderPaths?: string[];
  onOpenFile: (path: string) => void;
  onExpandFolder?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (path: string) => void;
  onNewFile?: (folderPath: string) => void;
  onNewFolder?: (folderPath: string) => void;
  expandAll?: boolean;
};

type RepositoryTreeNode = {
  name: string;
  path: string;
  type: "blob" | "tree";
  children: string[];
};

type RepositoryTreeData = {
  root: RepositoryTreeNode;
  items: Record<string, RepositoryTreeNode>;
  firstLevelFolders: string[];
};

export function buildRepositoryTree(
  entries: GithubRepositoryTreeEntry[],
): RepositoryTreeData {
  const root: RepositoryTreeNode = {
    name: "",
    path: "",
    type: "tree",
    children: [],
  };
  const nodes = new Map<string, RepositoryTreeNode>([["", root]]);

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let node = nodes.get(currentPath);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isLeaf ? entry.type : "tree",
          children: [],
        };
        nodes.set(currentPath, node);
        parent.children.push(currentPath);
      } else if (isLeaf) {
        node.type = entry.type;
      }
      parent = node;
    });
  }

  for (const node of nodes.values()) {
    node.children.sort((leftId, rightId) => {
      const left = nodes.get(leftId);
      const right = nodes.get(rightId);
      if (!left || !right) return 0;
      if (left.type !== right.type) return left.type === "tree" ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }

  return {
    root,
    items: Object.fromEntries(nodes),
    firstLevelFolders: root.children.filter(
      (itemId) => nodes.get(itemId)?.type === "tree",
    ),
  };
}

function ancestorFolders(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function RepositoryTree({
  entries,
  activePath,
  loadingPath,
  loadingFolderPaths = [],
  onOpenFile,
  onExpandFolder,
  onDeleteFile,
  onDeleteFolder,
  onNewFile,
  onNewFolder,
  expandAll,
}: RepositoryTreeProps) {
  const data = useMemo(() => buildRepositoryTree(entries), [entries]);
  const onExpandFolderRef = useRef(onExpandFolder);
  const [manualExpandedItems, setManualExpandedItems] = useState<string[]>(
    () => data.firstLevelFolders.slice(0, 1),
  );
  const activeAncestors = useMemo(
    () => ancestorFolders(activePath),
    [activePath],
  );
  const expandedItems = useMemo(
    () => [...new Set([...manualExpandedItems, ...activeAncestors])],
    [activeAncestors, manualExpandedItems],
  );
  const updateExpandedItems = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      setManualExpandedItems((current) => {
        const visible = [...new Set([...current, ...activeAncestors])];
        return typeof next === "function" ? next(visible) : next;
      });
    },
    [activeAncestors],
  );

  const tree = useTree<RepositoryTreeNode>({
    rootItemId: "root",
    state: { expandedItems },
    setExpandedItems: updateExpandedItems,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().type === "tree",
    onPrimaryAction: (item) => {
      const node = item.getItemData();
      if (node.type === "blob") onOpenFile(node.path);
    },
    dataLoader: {
      getItem: (itemId) =>
        itemId === "root" ? data.root : data.items[itemId],
      getChildren: (itemId) =>
        itemId === "root"
          ? data.root.children
          : (data.items[itemId]?.children ?? []),
    },
    indent: 14,
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [data, expandedItems, tree]);

  useEffect(() => {
    onExpandFolderRef.current = onExpandFolder;
  }, [onExpandFolder]);

  useEffect(() => {
    for (const path of expandedItems) {
      if (data.items[path]?.type === "tree") {
        onExpandFolderRef.current?.(path);
      }
    }
  }, [data.items, expandedItems]);

  const expandAllRef = useRef(expandAll);
  useEffect(() => {
    if (expandAll === expandAllRef.current) return;
    expandAllRef.current = expandAll;
    const timer = window.setTimeout(() => {
      if (expandAll) {
        const allFolderPaths = Object.values(data.items)
          .filter((node) => node.type === "tree")
          .map((node) => node.path);
        setManualExpandedItems(allFolderPaths);
      } else {
        setManualExpandedItems([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expandAll, data.items]);

  return (
    <Tree
      tree={tree}
      indent={14}
      label="Repository files"
      className="min-w-max pr-1"
    >
      {tree.getItems().map((item) => {
        const node = item.getItemData();
        const isActive = node.path === activePath;
        const isLoading = node.path === loadingPath;
        const isFolderLoading = loadingFolderPaths.includes(node.path);
        const isFile = node.type === "blob";
        return (
          <ContextMenu.Root key={item.getId()}>
            <ContextMenu.Trigger
              render={
                <TreeItem
                  item={item}
                  title={node.path}
                  aria-current={isActive ? "page" : undefined}
                />
              }
            >
              <TreeItemLabel
                className={cn(
                  "relative mr-1",
                  isActive &&
                    "bg-[#e67d2b]/12 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[#e67d2b]",
                )}
              >
                {isFolderLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-[#f6b15b] motion-reduce:animate-none" />
                ) : node.type === "tree" ? (
                  item.isExpanded() ? (
                    <FolderOpen className="size-4 shrink-0 text-[#e0ad5b]" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-[#d49b46]" />
                  )
                ) : isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-[#f6b15b] motion-reduce:animate-none" />
                ) : (
                  <FileTypeIcon path={node.path} />
                )}
                <span className="truncate">{node.name}</span>
              </TreeItemLabel>
            </ContextMenu.Trigger>

            <ContextMenu.Portal>
              <ContextMenu.Positioner sideOffset={-2} align="start">
                <ContextMenu.Popup className="z-50 min-w-[220px] rounded-lg border border-white/[0.12] bg-[#252526] p-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
                  {isFile ? (
                    <>
                      <ContextMenuItem
                        icon={<FileCode2 className="size-3.5" />}
                        label="New File..."
                        shortcut=""
                        onClick={() => onNewFile?.(node.path.split("/").slice(0, -1).join("/") || "")}
                      />
                      <ContextMenuItem
                        icon={<Folder className="size-3.5" />}
                        label="New Folder..."
                        shortcut=""
                        onClick={() => onNewFolder?.(node.path.split("/").slice(0, -1).join("/") || "")}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Eye className="size-3.5" />}
                        label="Open"
                        shortcut=""
                        onClick={() => onOpenFile(node.path)}
                      />
                      <ContextMenuItem
                        icon={<FileCode2 className="size-3.5" />}
                        label="Open to the Side"
                        shortcut=""
                        onClick={() => onOpenFile(node.path)}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Copy className="size-3.5" />}
                        label="Copy Path"
                        shortcut="Shift+Alt+C"
                        onClick={() => copyToClipboard(node.path)}
                      />
                      <ContextMenuItem
                        icon={<Copy className="size-3.5" />}
                        label="Copy Relative Path"
                        shortcut="Ctrl+K Ctrl+Shift+C"
                        onClick={() => copyToClipboard(node.path)}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<TerminalSquare className="size-3.5" />}
                        label="Open in Terminal"
                        shortcut=""
                        onClick={() => {}}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Trash2 className="size-3.5" />}
                        label="Delete"
                        shortcut="Del"
                        onClick={() => onDeleteFile?.(node.path)}
                        danger
                      />
                    </>
                  ) : (
                    <>
                      <ContextMenuItem
                        icon={<FolderOpen className="size-3.5" />}
                        label="New File..."
                        shortcut=""
                        onClick={() => onNewFile?.(node.path)}
                      />
                      <ContextMenuItem
                        icon={<Folder className="size-3.5" />}
                        label="New Folder..."
                        shortcut=""
                        onClick={() => onNewFolder?.(node.path)}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Copy className="size-3.5" />}
                        label="Copy Path"
                        shortcut="Shift+Alt+C"
                        onClick={() => copyToClipboard(node.path)}
                      />
                      <ContextMenuItem
                        icon={<Copy className="size-3.5" />}
                        label="Copy Relative Path"
                        shortcut="Ctrl+K Ctrl+Shift+C"
                        onClick={() => copyToClipboard(node.path)}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<TerminalSquare className="size-3.5" />}
                        label="Open in Terminal"
                        shortcut=""
                        onClick={() => {}}
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Scissors className="size-3.5" />}
                        label="Cut"
                        shortcut="Ctrl+X"
                        onClick={() => {}}
                      />
                      <ContextMenuItem
                        icon={<Copy className="size-3.5" />}
                        label="Copy"
                        shortcut="Ctrl+C"
                        onClick={() => {}}
                      />
                      <ContextMenuItem
                        icon={<Clipboard className="size-3.5" />}
                        label="Paste"
                        shortcut="Ctrl+V"
                        onClick={() => {}}
                        disabled
                      />
                      <ContextMenu.Separator className="my-[4px] mx-1 h-px bg-white/[0.12]" />
                      <ContextMenuItem
                        icon={<Trash2 className="size-3.5" />}
                        label="Delete"
                        shortcut="Del"
                        onClick={() => onDeleteFolder?.(node.path)}
                        danger
                      />
                    </>
                  )}
                </ContextMenu.Popup>
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </Tree>
  );
}

function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <ContextMenu.Item
      className={cn(
        "flex min-h-[32px] cursor-pointer items-center gap-2.5 rounded-[4px] px-3 text-[13px] leading-none outline-none",
        "data-[highlighted]:bg-[#264f78] data-[highlighted]:text-white",
        danger
          ? "text-[#f44747] data-[highlighted]:bg-[#5a1d1d] data-[highlighted]:text-[#f48771]"
          : "text-white",
        disabled && "pointer-events-none text-white/30",
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-white/70 data-[highlighted]:text-white/90">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut ? (
        <span className="ml-4 text-[11px] text-white/50 data-[highlighted]:text-white/70">{shortcut}</span>
      ) : null}
    </ContextMenu.Item>
  );
}
