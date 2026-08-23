"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrashIcon } from "@/components/agent/icons";
import type { CompileLogEntry } from "@/lib/compile-logs";
import {
  compileLogsAtom,
  getAutoClearLogs,
  setAutoClearLogs,
} from "@/lib/compile-logs";

const LEVEL_COLOR: Record<CompileLogEntry["level"], string> = {
  info: "text-foreground/80",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-500",
};

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CompileLogs({ className }: { className?: string }) {
  const { t } = useTranslation();
  const logs = useAtomValue(compileLogsAtom);
  const setLogs = useSetAtom(compileLogsAtom);
  const [autoClear, setAutoClear] = useState(getAutoClearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever new compile output arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  return (
    <section
      aria-label={t("workbench.compileLogs")}
      className={`flex min-h-0 flex-col rounded-lg border border-border/40 bg-background ${className ?? ""}`}
    >
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 px-2">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {t("workbench.compileLogs")}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="flex cursor-pointer items-center gap-1 text-[0.65rem] text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={autoClear}
              onChange={(event) => {
                setAutoClearLogs(event.target.checked);
                setAutoClear(event.target.checked);
              }}
              className="size-3 accent-primary"
            />
            {t("workbench.autoClearLogs")}
          </label>
          <button
            type="button"
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
            aria-label={t("workbench.compileLogsClear")}
            title={t("workbench.compileLogsClear")}
            className="rounded-md p-1 text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95] disabled:pointer-events-none disabled:opacity-40"
          >
            <TrashIcon className="size-3" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-1.5 font-mono text-[0.7rem] leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="font-sans text-muted-foreground">
            {t("workbench.compileLogsEmpty")}
          </p>
        ) : (
          <ol className="space-y-0.5">
            {logs.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatClock(entry.at)}
                </span>
                <span
                  className={`whitespace-pre-wrap break-words ${LEVEL_COLOR[entry.level]}`}
                >
                  {entry.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
