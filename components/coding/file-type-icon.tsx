"use client";

import {
  Atom,
  Braces,
  CodeXml,
  Container,
  Database,
  File,
  FileArchive,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileText,
  Package,
  Palette,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type FilePresentation = {
  Icon: LucideIcon;
  className: string;
  label: string;
};

const basename = (path: string) =>
  path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() || "";

const extension = (path: string) => {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
};

export function getFilePresentation(path: string): FilePresentation {
  const name = basename(path);
  const ext = extension(path);

  if (
    name === "dockerfile" ||
    name.startsWith("dockerfile.") ||
    name === "compose.yaml" ||
    name === "compose.yml" ||
    name.startsWith("docker-compose.")
  ) {
    return {
      Icon: Container,
      className: "text-sky-400",
      label: "Container configuration",
    };
  }

  if (
    name === "package.json" ||
    name === "package-lock.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    name === "bun.lock" ||
    name === "bun.lockb"
  ) {
    return {
      Icon: Package,
      className: "text-rose-400",
      label: "Package manifest",
    };
  }

  if (
    name.startsWith(".env") ||
    name === ".editorconfig" ||
    name === ".npmrc" ||
    name === ".nvmrc" ||
    name === ".prettierrc" ||
    name === ".eslintrc" ||
    name === "tsconfig.json" ||
    name === "components.json"
  ) {
    return {
      Icon: FileCog,
      className: "text-amber-300",
      label: "Configuration file",
    };
  }

  if (
    name === ".gitignore" ||
    name === ".gitattributes" ||
    name === ".gitmodules"
  ) {
    return {
      Icon: FileCode2,
      className: "text-orange-300",
      label: "Git configuration",
    };
  }

  if (["tsx", "jsx"].includes(ext)) {
    return {
      Icon: Atom,
      className: "text-cyan-400",
      label: ext === "tsx" ? "React TypeScript file" : "React JavaScript file",
    };
  }

  if (["ts", "mts", "cts"].includes(ext)) {
    return {
      Icon: FileCode2,
      className: "text-sky-400",
      label: "TypeScript file",
    };
  }

  if (["js", "mjs", "cjs"].includes(ext)) {
    return {
      Icon: FileCode2,
      className: "text-yellow-300",
      label: "JavaScript file",
    };
  }

  if (["html", "htm", "vue", "svelte", "astro"].includes(ext)) {
    return {
      Icon: CodeXml,
      className: "text-orange-400",
      label: "Markup file",
    };
  }

  if (["css", "scss", "sass", "less", "styl"].includes(ext)) {
    return {
      Icon: Palette,
      className: "text-violet-400",
      label: "Stylesheet",
    };
  }

  if (["py", "pyi", "pyw"].includes(ext)) {
    return {
      Icon: FileCode2,
      className: "text-blue-300",
      label: "Python file",
    };
  }

  if (
    ["go", "rs", "java", "kt", "kts", "swift", "c", "h", "cpp", "hpp", "cs", "rb", "php"].includes(
      ext,
    )
  ) {
    return {
      Icon: FileCode2,
      className: "text-teal-300",
      label: "Source file",
    };
  }

  if (["json", "jsonc"].includes(ext)) {
    return {
      Icon: FileJson,
      className: "text-yellow-300",
      label: "JSON file",
    };
  }

  if (["yaml", "yml", "toml", "ini", "conf", "config"].includes(ext)) {
    return {
      Icon: Braces,
      className: "text-amber-300",
      label: "Configuration file",
    };
  }

  if (["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"].includes(ext)) {
    return {
      Icon: TerminalSquare,
      className: "text-emerald-400",
      label: "Shell script",
    };
  }

  if (["sql", "db", "sqlite", "sqlite3"].includes(ext)) {
    return {
      Icon: Database,
      className: "text-cyan-300",
      label: "Database file",
    };
  }

  if (["md", "mdx", "txt", "rst"].includes(ext) || name === "license") {
    return {
      Icon: FileText,
      className: "text-sky-200/75",
      label: "Document",
    };
  }

  if (
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "bmp"].includes(
      ext,
    )
  ) {
    return {
      Icon: FileImage,
      className: "text-emerald-300",
      label: "Image file",
    };
  }

  if (["zip", "tar", "gz", "tgz", "rar", "7z", "jar"].includes(ext)) {
    return {
      Icon: FileArchive,
      className: "text-amber-300",
      label: "Archive file",
    };
  }

  return {
    Icon: File,
    className: "text-white/38",
    label: "File",
  };
}

type FileTypeIconProps = {
  path: string;
  className?: string;
  decorative?: boolean;
};

export function FileTypeIcon({
  path,
  className,
  decorative = true,
}: FileTypeIconProps) {
  const presentation = getFilePresentation(path);
  const Icon = presentation.Icon;

  return (
    <Icon
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : presentation.label}
      className={cn(
        "size-4 shrink-0 stroke-[1.7]",
        presentation.className,
        className,
      )}
    />
  );
}
