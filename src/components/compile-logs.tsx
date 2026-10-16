"use client";

import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { compileLogsAtom } from "@/lib/compile-logs";

interface Props {
  className?: string;
}

export function CompileLogs({ className }: Props) {
  const { t } = useTranslation();
  const logs = useAtomValue(compileLogsAtom);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {logs.length === 0 ? (
        <p className="flex-1 self-center pt-8 text-center text-xs text-muted-foreground">
          {t("workbench.compileLogsEmpty")}
        </p>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border border-border/40 bg-background/40 p-2 font-mono text-xs leading-relaxed">
          {logs.map((entry) => (
            <div
              key={entry.id}
              className={
                entry.level === "error"
                  ? "text-red-500"
                  : entry.level === "warn"
                    ? "text-amber-500"
                    : "text-muted-foreground"
              }
            >
              <span className="select-none opacity-50">
                {new Date(entry.at).toLocaleTimeString()}{" "}
              </span>
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
