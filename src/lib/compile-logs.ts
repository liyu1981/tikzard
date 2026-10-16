"use client";

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

/** Start a render: wipe previous output first unless auto-clear is off. */
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
 * Pattern for detecting JSXGraph render failures from error logs.
 */
export const COMPILE_FAILURE_PATTERN = /\[jsxgraph\]|render error|Error:/i;
