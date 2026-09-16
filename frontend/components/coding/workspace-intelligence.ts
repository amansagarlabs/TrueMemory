import {
  readLocalFile,
  type LocalDirectoryHandle,
  type LocalFileHandle,
} from "@/components/coding/local-workspace";

export type WorkspaceActivity = {
  id: string;
  label: string;
  detail: string;
  status: "running" | "completed" | "failed";
};

export type InspectedWorkspaceFile = {
  path: string;
  content: string;
  reason: string;
  symbols: string[];
  imports: string[];
  score: number;
};

export type WorkspaceIntelligence = {
  framework: string;
  packageManager: string;
  architecture: string[];
  dependencies: string[];
  missingDependencies: string[];
  risks: string[];
  filesScanned: number;
  filesIndexed: number;
  estimatedFilesToChange: number;
  inspectedFiles: InspectedWorkspaceFile[];
  knownPaths: string[];
  projectMap: string;
  searchSummary: string;
  workspaceIsEmpty: boolean;
};

type WorkspaceFile = {
  path: string;
  handle: LocalFileHandle;
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const SOURCE_EXTENSIONS = new Set([
  "astro",
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "graphql",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "md",
  "mjs",
  "php",
  "prisma",
  "py",
  "rb",
  "rs",
  "scss",
  "sql",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "vue",
  "yaml",
  "yml",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "application",
  "build",
  "change",
  "create",
  "current",
  "for",
  "in",
  "implement",
  "make",
  "of",
  "please",
  "project",
  "the",
  "to",
  "using",
  "with",
]);

const ESSENTIAL_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "pyproject.toml",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
]);

const PROJECT_MARKER_FILES = new Set([
  ...ESSENTIAL_FILES,
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

function extension(path: string) {
  return path.split(".").pop()?.toLowerCase() || "";
}

function isIndexable(path: string) {
  const name = path.split("/").pop()?.toLowerCase() || "";
  return PROJECT_MARKER_FILES.has(name) || SOURCE_EXTENSIONS.has(extension(path));
}

function goalTokens(goal: string) {
  return [...new Set(
    goal
      .toLowerCase()
      .match(/[a-z][a-z0-9_-]{2,}/g)
      ?.filter((token) => !STOP_WORDS.has(token)) || [],
  )].slice(0, 18);
}

async function scanDirectory(
  directory: LocalDirectoryHandle,
  parentPath: string,
  files: WorkspaceFile[],
  directories: Set<string>,
  maxFiles: number,
  depth: number,
) {
  if (depth > 12 || files.length >= maxFiles) return;
  for await (const handle of directory.values()) {
    if (files.length >= maxFiles) break;
    const path = parentPath ? `${parentPath}/${handle.name}` : handle.name;
    if (handle.kind === "directory") {
      if (IGNORED_DIRECTORIES.has(handle.name.toLowerCase())) continue;
      directories.add(path);
      await scanDirectory(
        handle,
        path,
        files,
        directories,
        maxFiles,
        depth + 1,
      );
      continue;
    }
    if (isIndexable(path)) files.push({ path, handle });
  }
}

function parsePackageManifest(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      ...parsed.dependencies,
      ...parsed.devDependencies,
    };
  } catch {
    return {};
  }
}

function detectFramework(
  paths: string[],
  dependencies: Record<string, string>,
  goal: string,
) {
  if (dependencies.next || paths.some((path) => /^next\.config\./.test(path))) {
    const version = dependencies.next?.replace(/^[^\d]*/, "");
    return version ? `Next.js ${version}` : "Next.js";
  }
  if (dependencies["@remix-run/react"]) return "Remix";
  if (dependencies["react-router"]) return "React Router";
  if (dependencies["@angular/core"]) return "Angular";
  if (dependencies.nuxt) return "Nuxt";
  if (dependencies.vue) return "Vue";
  if (dependencies.svelte || paths.some((path) => path.endsWith(".svelte"))) {
    return "Svelte";
  }
  if (dependencies.astro || paths.some((path) => path.endsWith(".astro"))) {
    return "Astro";
  }
  if (dependencies.react) return "React";
  if (paths.includes("pyproject.toml") || paths.includes("requirements.txt")) {
    return "Python";
  }
  if (paths.includes("go.mod")) return "Go";
  if (paths.some((path) => path.toLowerCase() === "cargo.toml")) return "Rust";
  if (/\bnext(?:\.?js)?\b/i.test(goal)) return "Next.js";
  if (/\breact\b/i.test(goal)) return "React";
  if (/\bvue\b/i.test(goal)) return "Vue";
  if (/\bsvelte\b/i.test(goal)) return "Svelte";
  if (/\bpython\b|\bfastapi\b|\bdjango\b/i.test(goal)) return "Python";
  if (/\brust\b/i.test(goal)) return "Rust";
  if (/\bgolang\b|\bgo app\b/i.test(goal)) return "Go";
  return "Unknown";
}

function detectPackageManager(paths: string[], framework: string) {
  if (paths.includes("pnpm-lock.yaml")) return "pnpm";
  if (paths.includes("yarn.lock")) return "Yarn";
  if (paths.includes("bun.lock") || paths.includes("bun.lockb")) return "Bun";
  if (paths.includes("package-lock.json")) return "npm";
  if (paths.includes("package.json")) return "npm (lockfile not found)";
  if (paths.includes("uv.lock")) return "uv";
  if (paths.includes("poetry.lock")) return "Poetry";
  if (paths.includes("requirements.txt")) return "pip";
  if (
    paths.length === 0 &&
    /^(Next\.js|React|Vue|Svelte|Astro|Remix)/.test(framework)
  ) {
    return "npm (scaffold default)";
  }
  return "Not detected";
}

function inferMissingDependencies(
  goal: string,
  framework: string,
  dependencies: Record<string, string>,
) {
  const required = new Set<string>();
  if (framework === "Next.js") {
    required.add("next");
    required.add("react");
    required.add("react-dom");
  } else if (framework === "React") {
    required.add("react");
    required.add("react-dom");
  }
  const requested: Array<[RegExp, string]> = [
    [/\btailwind\b/i, "tailwindcss"],
    [/\bprisma\b/i, "prisma"],
    [/\bzod\b/i, "zod"],
    [/\bzustand\b/i, "zustand"],
    [/\bvitest\b/i, "vitest"],
    [/\bplaywright\b/i, "@playwright/test"],
  ];
  for (const [pattern, dependency] of requested) {
    if (pattern.test(goal)) required.add(dependency);
  }
  return [...required].filter((dependency) => !dependencies[dependency]);
}

function extractSymbols(content: string) {
  const symbols = new Set<string>();
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\bdef\s+([A-Za-z_][\w]*)\s*\(/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) symbols.add(match[1]);
      if (symbols.size >= 40) break;
    }
  }
  return [...symbols];
}

function extractImports(content: string) {
  const imports = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+([A-Za-z0-9_.,{}*\s]+)\s+from\s+["']([^"']+)["']/gm,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[2] || match[1];
      if (value && !value.includes("{")) imports.add(value.trim());
      if (imports.size >= 40) break;
    }
  }
  return [...imports];
}

function pathScore(path: string, tokens: string[], framework: string) {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() || lower;
  let score = ESSENTIAL_FILES.has(name) ? 24 : 0;
  if (/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|uv\.lock|poetry\.lock)$/.test(lower)) {
    score -= 30;
  }
  for (const token of tokens) {
    if (name.includes(token)) score += 18;
    else if (lower.includes(token)) score += 9;
  }
  if (/^(app|src)\/(page|index|main|app)\.[jt]sx?$/.test(lower)) score += 12;
  if (/^(app|src)\/.*(page|route|layout)\.[jt]sx?$/.test(lower)) score += 8;
  if (framework.startsWith("Next.js") && /^app\/(page|layout)\.tsx?$/.test(lower)) {
    score += 14;
  }
  if (/test|spec|__tests__/.test(lower)) score += 2;
  return score;
}

function contentScore(content: string, tokens: string[]) {
  const lower = content.toLowerCase();
  return tokens.reduce((score, token) => {
    const first = lower.indexOf(token);
    if (first < 0) return score;
    const occurrences = lower.split(token).length - 1;
    return score + Math.min(occurrences, 5) * 4;
  }, 0);
}

function relevanceReason(
  path: string,
  tokens: string[],
  framework: string,
  content: string,
) {
  const matches = tokens.filter((token) => content.toLowerCase().includes(token));
  if (path === "package.json") return "Defines the framework, scripts, and dependencies.";
  if (/tsconfig|jsconfig/.test(path)) return "Defines compiler and path-alias conventions.";
  if (/layout\.[jt]sx?$/.test(path)) return "Controls the application shell and shared providers.";
  if (/page\.[jt]sx?$|index\.[jt]sx?$/.test(path)) {
    return `Primary ${framework} route or entry point for the requested feature.`;
  }
  if (matches.length) return `Contains related terms: ${matches.slice(0, 4).join(", ")}.`;
  if (/test|spec/.test(path)) return "Existing validation pattern for nearby behavior.";
  return "Relevant source selected from the project map and dependency structure.";
}

function estimateFiles(goal: string, inspected: InspectedWorkspaceFile[]) {
  const explicit = goal.match(/\b(\d+)\s+files?\b/i)?.[1];
  if (explicit) return Math.max(1, Math.min(Number(explicit), 20));
  if (/\b(refactor|migrate|rename|across|entire)\b/i.test(goal)) {
    return Math.min(Math.max(inspected.length, 2), 8);
  }
  if (/\b(create|build|implement|add|fix|update)\b/i.test(goal)) return 2;
  return 1;
}

export async function analyzeLocalWorkspace(
  root: LocalDirectoryHandle,
  goal: string,
  onActivity: (activity: WorkspaceActivity) => void,
  onFileHandle?: (path: string, handle: LocalFileHandle) => void,
): Promise<WorkspaceIntelligence> {
  onActivity({
    id: "scan",
    label: "Detecting project",
    detail: "Scanning source paths and configuration files.",
    status: "running",
  });

  const files: WorkspaceFile[] = [];
  const directories = new Set<string>();
  await scanDirectory(root, "", files, directories, 4_000, 0);
  for (const file of files) onFileHandle?.(file.path, file.handle);
  const paths = files.map((file) => file.path);
  const packageFile = files.find((file) => file.path === "package.json");
  const packageContent = packageFile ? await readLocalFile(packageFile.handle) : "";
  const dependencyMap = parsePackageManifest(packageContent);
  const framework = detectFramework(paths, dependencyMap, goal);
  const packageManager = detectPackageManager(paths, framework);
  const workspaceIsEmpty = paths.length === 0;

  onActivity({
    id: "scan",
    label: `${framework} project detected`,
    detail: `${files.length} indexable files · ${packageManager}`,
    status: "completed",
  });

  const tokens = goalTokens(goal);
  const candidates = files
    .map((file) => ({
      ...file,
      pathScore: pathScore(file.path, tokens, framework),
    }))
    .sort((left, right) => right.pathScore - left.pathScore);

  const readCandidates = candidates.slice(0, 180);
  const indexed: Array<WorkspaceFile & { content: string; score: number }> = [];
  let indexedCharacters = 0;
  for (const candidate of readCandidates) {
    if (indexedCharacters >= 900_000) break;
    try {
      const content =
        candidate.path === "package.json"
          ? packageContent
          : await readLocalFile(candidate.handle);
      if (content.startsWith("// ") && content.includes("binary")) continue;
      indexedCharacters += content.length;
      indexed.push({
        path: candidate.path,
        handle: candidate.handle,
        content,
        score: candidate.pathScore + contentScore(content, tokens),
      });
    } catch {
      // An unreadable file is excluded from model context and cannot ground a decision.
    }
  }

  const inspectedFiles = indexed
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((file) => ({
      path: file.path,
      content: file.content,
      reason: relevanceReason(file.path, tokens, framework, file.content),
      symbols: extractSymbols(file.content),
      imports: extractImports(file.content),
      score: file.score,
    }));

  for (const file of inspectedFiles) {
    onActivity({
      id: `read:${file.path}`,
      label: `Reading ${file.path}`,
      detail: file.reason,
      status: "completed",
    });
  }

  const relatedMatches = inspectedFiles.filter((file) =>
    tokens.some((token) => file.content.toLowerCase().includes(token)),
  );
  const searchSummary = workspaceIsEmpty
    ? "The workspace is empty; there are no existing files or features to preserve."
    : relatedMatches.length
    ? `${relatedMatches.length} relevant files contain related implementation terms.`
    : `No existing ${tokens.slice(0, 3).join(" / ") || "matching"} feature was found in indexed source.`;
  onActivity({
    id: "search",
    label: `Searching for ${tokens.slice(0, 3).join(" ") || "related implementation"}`,
    detail: searchSummary,
    status: "completed",
  });

  const architecture = [...directories]
    .filter((path) => !path.includes("/"))
    .sort()
    .slice(0, 20);
  const dependencies = Object.keys(dependencyMap).sort();
  const risks = [
    inspectedFiles.length === 0 && !workspaceIsEmpty
      ? "No readable source files were found; implementation must stop."
      : "",
    framework === "Unknown" && !workspaceIsEmpty
      ? "Framework conventions could not be detected from project files."
      : "",
    packageManager.includes("lockfile not found")
      ? "No JavaScript lockfile was found, so dependency resolution may drift."
      : "",
  ].filter(Boolean);

  return {
    framework,
    packageManager,
    architecture,
    dependencies,
    missingDependencies: inferMissingDependencies(
      goal,
      framework,
      dependencyMap,
    ),
    risks,
    filesScanned: files.length,
    filesIndexed: indexed.length,
    estimatedFilesToChange: estimateFiles(goal, inspectedFiles),
    inspectedFiles,
    knownPaths: paths,
    projectMap: paths.slice(0, 1_500).join("\n"),
    searchSummary,
    workspaceIsEmpty,
  };
}

export function buildWorkspaceContext(intelligence: WorkspaceIntelligence) {
  const header = `WORKSPACE INTELLIGENCE
Framework: ${intelligence.framework}
Package manager: ${intelligence.packageManager}
Empty workspace: ${intelligence.workspaceIsEmpty ? "yes" : "no"}
Architecture roots: ${intelligence.architecture.join(", ") || "None"}
Dependencies: ${intelligence.dependencies.join(", ") || "None"}
Missing dependencies: ${intelligence.missingDependencies.join(", ") || "None detected"}
Files scanned: ${intelligence.filesScanned}
Files indexed: ${intelligence.filesIndexed}
Estimated files to change: ${intelligence.estimatedFilesToChange}
Risks: ${intelligence.risks.join("; ") || "No structural risk detected"}
Search result: ${intelligence.searchSummary}`;

  const inspectedParts: string[] = [];
  let remainingFileBudget = 11_500;
  for (const file of intelligence.inspectedFiles) {
    if (remainingFileBudget < 500) break;
    const prefix = `<file path=${JSON.stringify(file.path)} reason=${JSON.stringify(file.reason)}>
Symbols: ${file.symbols.join(", ") || "None detected"}
Imports: ${file.imports.join(", ") || "None detected"}\n`;
    const suffix = "\n</file>";
    const contentBudget = Math.min(
      4_500,
      remainingFileBudget - prefix.length - suffix.length,
    );
    if (contentBudget <= 0) break;
    const part = `${prefix}${file.content.slice(0, contentBudget)}${suffix}`;
    inspectedParts.push(part);
    remainingFileBudget -= part.length + 2;
  }

  const projectMap = intelligence.knownPaths.slice(0, 350).join("\n");
  return `${header}

INSPECTED FILES
${inspectedParts.join("\n\n") || "None. The workspace is explicitly empty."}

PROJECT MAP
${projectMap || "Empty workspace"}`.slice(0, 15_500);
}
