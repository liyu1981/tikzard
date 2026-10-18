import { atom, getDefaultStore } from "jotai";

export interface CompileLogEntry {
  id: number;
  at: number;
  level: "info" | "warn" | "error";
  text: string;
}

const MAX_COMPILE_LOGS = 200;

export const compileLogsAtom = atom<CompileLogEntry[]>([]);

let nextId = 0;

export function pushCompileLog(
  level: CompileLogEntry["level"],
  text: string,
): void {
  const entry: CompileLogEntry = { id: nextId++, at: Date.now(), level, text };
  getDefaultStore().set(compileLogsAtom, (prev) => [
    ...prev.slice(-(MAX_COMPILE_LOGS - 1)),
    entry,
  ]);
}

const AUTO_CLEAR_KEY = "workbench.autoClearLogs";

export function getAutoClearLogs(): boolean {
  try {
    return localStorage.getItem(AUTO_CLEAR_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoClearLogs(value: boolean): void {
  try {
    localStorage.setItem(AUTO_CLEAR_KEY, value ? "true" : "false");
  } catch {
    return;
  }
}

/** Start a compile: wipe previous output first unless auto-clear is off. */
export function beginCompileLog(startMessage: string): void {
  if (getAutoClearLogs()) {
    getDefaultStore().set(compileLogsAtom, []);
  }
  pushCompileLog("info", startMessage);
}

/** Latest log lines as plain text, oldest first — for tool error reports. */
export function getRecentCompileLogs(max: number): string {
  const logs = getDefaultStore().get(compileLogsAtom).slice(-max);
  return logs.map((entry) => `[${entry.level}] ${entry.text}`).join("\n");
}

/** Marker for "logs so far" — pair with getCompileLogsSince(). */
export function getLastCompileLogId(): number {
  return nextId - 1;
}

export function getCompileLogsSince(id: number): CompileLogEntry[] {
  return getDefaultStore()
    .get(compileLogsAtom)
    .filter((entry) => entry.id > id);
}

/**
 * Console phrases emitted by the runtime when a compile will NOT produce a
 * drawing. Log content is the reliable failure signal: the broken-source
 * placeholder is an <img>, so neither the SVG observer nor the status flag
 * alone can be trusted.
 */
export const COMPILE_FAILURE_PATTERN =
  /TikZJax (rendering failed|unable to prepare TikZ source|worker \d+ initialization failed)/;

type RenderFailureListener = (message: string) => void;

let renderFailureListener: RenderFailureListener | null = null;

/**
 * Fired when the runtime reports a failed render or worker initialization.
 * The workbench uses this to leave the "compiling" state immediately instead
 * of waiting for the timeout watchdog — the failure placeholder is an <img>,
 * so the SVG-watching observer never sees it.
 */
export function setRenderFailureListener(
  listener: RenderFailureListener | null,
): void {
  renderFailureListener = listener;
}

type PatchedLevel = "log" | "warn" | "error";

const captured = new Map<PatchedLevel, (...args: unknown[]) => void>();

function formatArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.message;
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

/**
 * The vendored tikzjax runtime has no log API — worker stdout, timing
 * messages, and compile failures (which embed the full TeX log) only reach
 * the page through console.log/warn/error. Install once, before the runtime
 * loads, and mirror anything mentioning "TikZJax" into compileLogsAtom.
 */
export function installTikzConsoleCapture(): void {
  if (typeof window === "undefined" || captured.size > 0) {
    return;
  }
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    captured.set(level, original);
    console[level] = (...args: unknown[]) => {
      original(...args);
      const parts = args.map(formatArg);
      // Debug output from the agent tools must never be re-captured, or the
      // echoed "TikZJax rendering failed" text would pollute the log stream.
      if (parts.some((part) => part.startsWith("[tikz-debug]"))) {
        return;
      }
      if (parts.some((part) => part.includes("TikZJax"))) {
        const joined = parts.join(" ");
        pushCompileLog(level === "log" ? "info" : level, joined);
        if (level !== "log" && COMPILE_FAILURE_PATTERN.test(joined)) {
          renderFailureListener?.(joined);
        }
      }
    };
  }
}
