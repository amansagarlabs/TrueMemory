"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";

import type {
  CodingCommandResult,
  CodingRuntime,
} from "@/services/coding";

type RuntimeTerminalProps = {
  runtime: CodingRuntime | null;
  command: string;
  results: CodingCommandResult[];
  busy: boolean;
  canStart: boolean;
  onCommandChange: (command: string) => void;
  onRequestCommand: () => void;
  onStart: () => void;
  onStop: () => void;
};

const WELCOME = [
  "\x1b[1;38;5;208m\x2588 ContextOS Terminal\x1b[0m",
  "\x1b[90mType commands or use the input below the terminal.\x1b[0m",
  "\x1b[90m─────────────────────────────────────────────────\x1b[0m",
  "",
].join("\r\n");

export function RuntimeTerminal({
  runtime,
  command,
  results,
  busy,
  canStart,
  onCommandChange,
  onRequestCommand,
  onStart,
  onStop,
}: RuntimeTerminalProps) {
  const running = runtime?.status === "running";
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resultsShownRef = useRef(new Set<number>());

  const writeLine = useCallback((text: string) => {
    xtermRef.current?.write(text + "\r\n");
  }, []);

  const writePrompt = useCallback(() => {
    xtermRef.current?.write("\r\n\x1b[38;5;208m$\x1b[0m ");
  }, []);

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0A0A0A",
        foreground: "#EDEDED",
        cursor: "#FF5A1F",
        cursorAccent: "#000000",
        black: "#0A0A0A",
        brightBlack: "#444444",
        red: "#EF4444",
        green: "#22C55E",
        yellow: "#F59E0B",
        blue: "#3B82F6",
        magenta: "#C792EA",
        cyan: "#9ECEFF",
        white: "#EDEDED",
        brightWhite: "#FFFFFF",
      },
      fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 500,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    term.write(WELCOME);
    writePrompt();

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(termRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, [writePrompt]);

  useEffect(() => {
    if (!xtermRef.current) return;

    const newResults = results.filter((_, i) => !resultsShownRef.current.has(i));
    if (newResults.length === 0) return;

    newResults.forEach((result, idx) => {
      const globalIdx = results.length - newResults.length + idx;
      resultsShownRef.current.add(globalIdx);

      writeLine("");
      writeLine(`\x1b[32m$\x1b[0m ${result.command}`);

      if (result.stdout) {
        result.stdout.split("\n").forEach((line) => writeLine(line));
      }
      if (result.stderr) {
        result.stderr.split("\n").forEach((line) => {
          writeLine(`\x1b[31m${line}\x1b[0m`);
        });
      }

      const color = result.exit_code === 0 ? "\x1b[32m" : "\x1b[31m";
      writeLine(
        `${color}Process exited with code ${result.exit_code}\x1b[0m`
      );
    });

    writePrompt();
  }, [results, writeLine, writePrompt]);

  useEffect(() => {
    if (!running || !xtermRef.current) return;
    resultsShownRef.current = new Set(results.map((_, i) => i));
  }, [running, results]);

  if (!running) {
    return (
      <div className="flex min-h-28 items-center justify-center px-4 py-5">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-white/42">
            <LockKeyhole className="size-4" />
          </span>
          <p className="mt-3 text-[12px] font-medium text-white/72">
            Isolated runtime is {runtime?.status || "not started"}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-white/34">
            Start a task-scoped container with no network, a read-only base
            filesystem, and one writable repository workspace.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || busy}
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg bg-white/[0.08] px-3 text-[11px] font-medium text-white/78 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Start isolated runtime
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-300/70">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Runtime active
          </span>
          <span className="inline-flex items-center gap-1.5 text-white/32">
            <ShieldCheck className="size-3" />
            Network disabled
          </span>
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[10px] text-white/38 transition-colors hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] disabled:opacity-35"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Square className="size-3" />
          )}
          Stop
        </button>
      </div>

      <div
        ref={termRef}
        className="min-h-0 flex-1 overflow-hidden bg-[#0A0A0A] p-2"
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (command.trim() && !busy) onRequestCommand();
        }}
        className="flex items-center gap-2 border-t border-white/[0.07] pt-2"
      >
        <span className="text-emerald-300">$</span>
        <input
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-label="Runtime command"
          placeholder="npm test"
          className="min-h-9 min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white/78 outline-none placeholder:text-white/22"
        />
        <button
          type="submit"
          disabled={!command.trim() || busy}
          aria-label="Review command for approval"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-white/[0.07] text-white/60 transition-colors hover:bg-white/[0.11] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] disabled:cursor-not-allowed disabled:opacity-25"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
      </form>
    </div>
  );
}
