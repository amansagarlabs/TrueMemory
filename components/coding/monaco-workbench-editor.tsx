"use client";

import Editor, {
  DiffEditor,
  loader,
  type BeforeMount,
  type DiffOnMount,
  type Monaco as MonacoReactApi,
  type OnMount,
} from "@monaco-editor/react";
import * as monacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef } from "react";

type MonacoWorkerEnvironment = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

if (typeof window !== "undefined") {
  const workerScope = self as typeof self & {
    MonacoEnvironment?: MonacoWorkerEnvironment;
  };
  workerScope.MonacoEnvironment = {
    getWorker: (_moduleId, label) => {
      if (label === "json") {
        return new Worker(
          new URL(
            "monaco-editor/language/json/json.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new Worker(
          new URL(
            "monaco-editor/language/css/css.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new Worker(
          new URL(
            "monaco-editor/language/html/html.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      if (label === "typescript" || label === "javascript") {
        return new Worker(
          new URL(
            "monaco-editor/language/typescript/ts.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      return new Worker(
        new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
        { type: "module" },
      );
    },
  };
  loader.config({ monaco: monacoApi });
}

export type MonacoDiagnostic = {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
  code?: string;
};

export type MonacoEditorSnapshot = {
  path: string;
  language: string;
  line: number;
  column: number;
  selection:
    | {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      }
    | null;
  diagnostics: MonacoDiagnostic[];
};

type MonacoFileEditorProps = {
  workspaceKey: string;
  path: string;
  value: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  className?: string;
  onChange?: (value: string) => void;
  onSave?: () => void | Promise<void>;
  onSnapshotChange?: (snapshot: MonacoEditorSnapshot) => void;
  externalDiagnostics?: MonacoDiagnostic[];
  revealPosition?: {
    line: number;
    column: number;
    requestId: number;
  } | null;
};

type MonacoDiffSurfaceProps = {
  workspaceKey: string;
  path: string;
  original: string;
  modified: string;
  className?: string;
  revealFirstChange?: boolean;
};

const VIEW_STATE_PREFIX = "kontext-monaco-view";

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function modelUri(workspaceKey: string, path: string, variant = "working") {
  const workspace = encodeURIComponent(workspaceKey || "workspace");
  const file = normalizePath(path || "untitled")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `file:///kontext/${workspace}/${variant}/${file}`;
}

function viewStateKey(workspaceKey: string, path: string) {
  return `${VIEW_STATE_PREFIX}:${workspaceKey}:${normalizePath(path)}`;
}

function markerSeverity(
  monaco: MonacoReactApi,
  severity: number,
): MonacoDiagnostic["severity"] {
  if (severity === monaco.MarkerSeverity.Error) return "error";
  if (severity === monaco.MarkerSeverity.Warning) return "warning";
  if (severity === monaco.MarkerSeverity.Info) return "info";
  return "hint";
}

function serializeMarkers(
  monaco: MonacoReactApi,
  markers: editor.IMarker[],
): MonacoDiagnostic[] {
  return markers.map((marker) => ({
    severity: markerSeverity(monaco, marker.severity),
    message: marker.message,
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
    source: marker.source,
    code:
      typeof marker.code === "string"
        ? marker.code
        : marker.code?.value,
  }));
}

export function languageForPath(path: string) {
  const fileName = normalizePath(path).split("/").pop()?.toLowerCase() || "";
  if (/\.d\.ts$/.test(fileName)) return "typescript";
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  const languages: Record<string, string> = {
    bash: "shell",
    c: "c",
    cc: "cpp",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    dockerfile: "dockerfile",
    env: "ini",
    go: "go",
    graphql: "graphql",
    gql: "graphql",
    h: "cpp",
    hpp: "cpp",
    html: "html",
    ini: "ini",
    java: "java",
    js: "javascript",
    json: "json",
    jsonc: "json",
    jsx: "javascript",
    less: "less",
    lua: "lua",
    md: "markdown",
    mdx: "markdown",
    mjs: "javascript",
    cjs: "javascript",
    php: "php",
    prisma: "graphql",
    properties: "ini",
    ps1: "powershell",
    py: "python",
    rb: "ruby",
    rs: "rust",
    scss: "scss",
    sh: "shell",
    sql: "sql",
    svelte: "html",
    swift: "swift",
    toml: "ini",
    ts: "typescript",
    tsx: "typescript",
    vue: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  if (fileName === "dockerfile") return "dockerfile";
  if (fileName === "makefile") return "shell";
  return languages[extension || ""] || "plaintext";
}

const configureMonaco: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("kontext-infrastructure", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "71777F" },
      { token: "keyword", foreground: "FF8B3D" },
      { token: "string", foreground: "9CD67A" },
      { token: "number", foreground: "E6C07B" },
      { token: "type.identifier", foreground: "65B9F4" },
    ],
    colors: {
      "editor.background": "#111315",
      "editor.foreground": "#D7DBE0",
      "editorLineNumber.foreground": "#4D535B",
      "editorLineNumber.activeForeground": "#AAB0B8",
      "editorCursor.foreground": "#F28A3A",
      "editor.selectionBackground": "#2F6F954A",
      "editor.inactiveSelectionBackground": "#2F6F9528",
      "editor.lineHighlightBackground": "#E67D2B0B",
      "editor.lineHighlightBorder": "#00000000",
      "editorGutter.background": "#0D0F11",
      "editorIndentGuide.background1": "#FFFFFF0C",
      "editorIndentGuide.activeBackground1": "#FFFFFF20",
      "editorBracketMatch.background": "#E67D2B1E",
      "editorBracketMatch.border": "#E67D2B66",
      "editorError.foreground": "#F87171",
      "editorWarning.foreground": "#FBBF24",
      "editorInfo.foreground": "#60A5FA",
      "editorWidget.background": "#17191C",
      "editorWidget.border": "#FFFFFF14",
      "editorSuggestWidget.background": "#17191C",
      "editorSuggestWidget.border": "#FFFFFF14",
      "editorSuggestWidget.selectedBackground": "#FFFFFF12",
      "editorHoverWidget.background": "#17191C",
      "editorHoverWidget.border": "#FFFFFF14",
      "diffEditor.insertedTextBackground": "#2EA04330",
      "diffEditor.removedTextBackground": "#F8514930",
      "diffEditor.insertedLineBackground": "#2EA04314",
      "diffEditor.removedLineBackground": "#F8514914",
      "diffEditor.diagonalFill": "#FFFFFF0A",
    },
  });

  // Monaco 0.56 exposes language services from the top-level API. The legacy
  // `monaco.languages.typescript` namespace only exists in its declaration
  // compatibility layer and is undefined at runtime in ESM builds.
  const typescript = monacoApi.typescript;
  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    checkJs: true,
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    resolveJsonModule: true,
    target: typescript.ScriptTarget.ESNext,
  };
  typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
  typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: true,
  });
  typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: true,
  });
};

const sharedEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  accessibilitySupport: "auto",
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  codeLens: true,
  contextmenu: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  dragAndDrop: true,
  find: {
    addExtraSpaceOnTop: false,
    seedSearchStringFromSelection: "selection",
  },
  folding: true,
  foldingHighlight: true,
  fontFamily:
    '"Geist Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontLigatures: true,
  fontSize: 13,
  formatOnPaste: true,
  formatOnType: true,
  glyphMargin: true,
  guides: {
    bracketPairs: true,
    indentation: true,
    highlightActiveBracketPair: true,
    highlightActiveIndentation: true,
  },
  hover: { enabled: "on", delay: 250, sticky: true },
  lineHeight: 21,
  lineNumbersMinChars: 3,
  links: true,
  matchBrackets: "always",
  minimap: { enabled: true, maxColumn: 80, renderCharacters: false, scale: 1 },
  mouseWheelZoom: true,
  multiCursorModifier: "alt",
  occurrencesHighlight: "multiFile",
  padding: { top: 8, bottom: 12 },
  quickSuggestions: {
    comments: "off",
    other: "on",
    strings: "on",
  },
  renderLineHighlight: "all",
  renderValidationDecorations: "on",
  roundedSelection: false,
  scrollBeyondLastLine: false,
  smoothScrolling: false,
  stickyScroll: { enabled: true, maxLineCount: 5 },
  suggest: { preview: true, showStatusBar: true },
  tabCompletion: "on",
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: true,
    nonBasicASCII: false,
  },
};

export function MonacoFileEditor({
  workspaceKey,
  path,
  value,
  readOnly = false,
  wordWrap = true,
  className,
  onChange,
  onSave,
  onSnapshotChange,
  externalDiagnostics = [],
  revealPosition,
}: MonacoFileEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<MonacoReactApi | null>(null);
  const diagnosticsRef = useRef<MonacoDiagnostic[]>([]);
  const onSaveRef = useRef(onSave);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  const externalDiagnosticsRef = useRef(externalDiagnostics);
  const currentPathRef = useRef(path);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const language = useMemo(() => languageForPath(path), [path]);
  const uri = useMemo(
    () => modelUri(workspaceKey, path),
    [workspaceKey, path],
  );

  useEffect(() => {
    onSaveRef.current = onSave;
    onSnapshotChangeRef.current = onSnapshotChange;
    externalDiagnosticsRef.current = externalDiagnostics;
    currentPathRef.current = path;
  }, [externalDiagnostics, onSave, onSnapshotChange, path]);

  const emitSnapshot = useCallback(() => {
    const instance = editorRef.current;
    const position = instance?.getPosition();
    const selection = instance?.getSelection();
    if (!instance || !position) return;
    onSnapshotChangeRef.current?.({
      path: currentPathRef.current,
      language: instance.getModel()?.getLanguageId() || "plaintext",
      line: position.lineNumber,
      column: position.column,
      selection: selection
        ? {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null,
      diagnostics: diagnosticsRef.current,
    });
  }, []);

  const applyExternalDiagnostics = useCallback(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    const model = instance?.getModel();
    if (!instance || !monaco || !model) return;
    const severity: Record<MonacoDiagnostic["severity"], number> = {
      error: monaco.MarkerSeverity.Error,
      warning: monaco.MarkerSeverity.Warning,
      info: monaco.MarkerSeverity.Info,
      hint: monaco.MarkerSeverity.Hint,
    };
    monaco.editor.setModelMarkers(
      model,
      "kontext-runtime",
      externalDiagnosticsRef.current.map((diagnostic) => ({
        severity: severity[diagnostic.severity],
        message: diagnostic.message,
        startLineNumber: diagnostic.startLineNumber,
        startColumn: diagnostic.startColumn,
        endLineNumber: diagnostic.endLineNumber,
        endColumn: diagnostic.endColumn,
        source: diagnostic.source,
        code: diagnostic.code,
      })),
    );
    diagnosticsRef.current = serializeMarkers(
      monaco,
      monaco.editor.getModelMarkers({ resource: model.uri }),
    );
  }, []);

  const persistViewState = useCallback(() => {
    const instance = editorRef.current;
    if (!instance || typeof window === "undefined") return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const viewState = instance.saveViewState();
      if (!viewState) return;
      try {
        window.localStorage.setItem(
          viewStateKey(workspaceKey, currentPathRef.current),
          JSON.stringify(viewState),
        );
      } catch {
        // View state persistence is a convenience; the editor remains usable.
      }
    }, 160);
  }, [workspaceKey]);

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void onSaveRef.current?.();
    });
    instance.onDidChangeCursorPosition(() => {
      emitSnapshot();
      persistViewState();
    });
    instance.onDidChangeCursorSelection(() => {
      emitSnapshot();
      persistViewState();
    });
    instance.onDidScrollChange(persistViewState);
    applyExternalDiagnostics();
    emitSnapshot();
  };

  useEffect(() => {
    externalDiagnosticsRef.current = externalDiagnostics;
    applyExternalDiagnostics();
  }, [applyExternalDiagnostics, externalDiagnostics, path]);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(viewStateKey(workspaceKey, path));
        if (raw) {
          instance.restoreViewState(
            JSON.parse(raw) as editor.ICodeEditorViewState,
          );
        }
      } catch {
        // Ignore malformed or unavailable local view state.
      }
      instance.focus();
      emitSnapshot();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [emitSnapshot, path, workspaceKey]);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || !revealPosition) return;
    const position = {
      lineNumber: revealPosition.line,
      column: revealPosition.column,
    };
    instance.setPosition(position);
    instance.revealPositionInCenter(position);
    instance.focus();
  }, [revealPosition]);

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      editorRef.current = null;
      monacoRef.current = null;
    },
    [],
  );

  return (
    <Editor
      aria-label={undefined}
      className={className}
      height="100%"
      path={uri}
      language={language}
      value={value}
      theme="kontext-infrastructure"
      beforeMount={configureMonaco}
      onMount={handleMount}
      onChange={(nextValue) => onChange?.(nextValue ?? "")}
      onValidate={(markers) => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        diagnosticsRef.current = serializeMarkers(monaco, markers);
        emitSnapshot();
      }}
      saveViewState
      loading={<MonacoEditorLoading label="Loading editor" />}
      options={{
        ...sharedEditorOptions,
        ariaLabel: path ? `Editing ${path}` : "Code editor",
        readOnly,
        readOnlyMessage: {
          value: "This repository snapshot is read-only.",
        },
        wordWrap: wordWrap ? "on" : "off",
      }}
    />
  );
}

export function MonacoDiffSurface({
  workspaceKey,
  path,
  original,
  modified,
  className,
  revealFirstChange = true,
}: MonacoDiffSurfaceProps) {
  const language = useMemo(() => languageForPath(path), [path]);
  const handleMount: DiffOnMount = (instance) => {
    if (!revealFirstChange) return;
    window.setTimeout(() => {
      instance.revealFirstDiff?.();
    }, 0);
  };

  return (
    <DiffEditor
      className={className}
      height="100%"
      original={original}
      modified={modified}
      originalLanguage={language}
      modifiedLanguage={language}
      originalModelPath={modelUri(workspaceKey, path, "original")}
      modifiedModelPath={modelUri(workspaceKey, path, "proposed")}
      theme="kontext-infrastructure"
      beforeMount={configureMonaco}
      onMount={handleMount}
      loading={<MonacoEditorLoading label="Preparing diff" />}
      options={{
        ...sharedEditorOptions,
        ariaLabel: `Review changes for ${path}`,
        diffCodeLens: true,
        diffWordWrap: "on",
        enableSplitViewResizing: true,
        hideUnchangedRegions: {
          enabled: true,
          contextLineCount: 3,
          minimumLineCount: 4,
          revealLineCount: 12,
        },
        ignoreTrimWhitespace: false,
        originalEditable: false,
        readOnly: true,
        renderMarginRevertIcon: false,
        renderSideBySide: true,
        renderOverviewRuler: true,
        useInlineViewWhenSpaceIsLimited: true,
      }}
    />
  );
}

function MonacoEditorLoading({ label }: { label: string }) {
  return (
    <div
      className="flex h-full items-center justify-center bg-[#111315]"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2 text-[12px] text-white/42">
        <span className="size-2 animate-pulse rounded-full bg-[#e67d2b] motion-reduce:animate-none" />
        {label}
      </span>
    </div>
  );
}
