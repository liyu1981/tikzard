"use client";

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  XIcon,
} from "@/components/agent/icons";
import { type DiffHunk, diffTexts } from "@/lib/diff";
import { getVersions, type TikzVersion } from "@/lib/versions";
import { currentDocIdAtom, docTitleAtom } from "@/lib/workbench-state";

function formatStamp(at: number): string {
  const d = new Date(at);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VersionDot({ source }: { source: TikzVersion["source"] }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${
        source === "agent" ? "bg-amber-400" : "bg-emerald-400"
      }`}
    />
  );
}

function Hunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      <div className="border-b border-border/40 bg-background/40 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground tabular-nums">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      <div className="max-h-72 overflow-auto">
        {hunk.lines.map((line) => (
          <div
            key={line.id}
            className={`flex px-2 font-mono text-xs leading-5 ${
              line.type === "add"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : line.type === "remove"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : "text-muted-foreground/70"
            }`}
          >
            <span className="w-4 shrink-0 select-none text-muted-foreground/40">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <pre className="whitespace-pre-wrap break-all font-mono">
              {line.text || " "}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restore a snapshot into the editor. Runs after saving the current
   *  source as a new version so nothing is lost by overwriting it. */
  onRestore: (version: TikzVersion) => Promise<void>;
}

/** Version browser dialog: list saved snapshots, diff any two, restore one. */
export function VersionBrowser({ open, onOpenChange, onRestore }: Props) {
  const { t } = useTranslation();
  const currentDocId = useAtomValue(currentDocIdAtom);
  const docTitle = useAtomValue(docTitleAtom);
  const [versions, setVersions] = useState<TikzVersion[]>([]);
  const [baseNo, setBaseNo] = useState<number | null>(null);
  const [compareNo, setCompareNo] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [diff, setDiff] = useState<DiffHunk[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (currentDocId === null) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void getVersions(currentDocId).then((list) => {
      if (!cancelled) {
        setVersions(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, currentDocId]);

  const sorted = [...versions].sort((a, b) => b.number - a.number);
  const base = versions.find((v) => v.number === baseNo) ?? null;
  const compare = versions.find((v) => v.number === compareNo) ?? null;

  // Refresh the diff whenever the selected pair changes.
  useEffect(() => {
    if (!base || !compare || base.number === compare.number) {
      setDiff([]);
      return;
    }
    const [older, newer] =
      base.number < compare.number ? [base, compare] : [compare, base];
    setDiff(diffTexts(older.code, newer.code));
  }, [base, compare]);

  function handleToggleCompare(no: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(no)) {
        next.delete(no);
      } else {
        next.add(no);
      }
      return next;
    });
    if (baseNo === no) {
      setBaseNo(null);
    } else if (compareNo === no) {
      setCompareNo(null);
    } else if (baseNo === null) {
      setBaseNo(no);
    } else {
      setCompareNo(no);
    }
  }

  async function handleRestore(no: number) {
    const version = versions.find((v) => v.number === no);
    if (!version) {
      return;
    }
    setRestoring(no);
    try {
      await onRestore(version);
    } finally {
      setRestoring(null);
    }
    onOpenChange(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const pair = base && compare && base.number !== compare.number;
  const [diffOlder, diffNewer] = pair
    ? base.number < compare.number
      ? [base, compare]
      : [compare, base]
    : [null, null];

  return (
    <>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
          >
            <div className="glass-dialog materialize flex h-[44rem] max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-clip-padding">
              <header className="apple-panel flex shrink-0 items-center justify-between px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <HistoryIcon className="size-4 text-muted-foreground" />
                  {t("versions.title")}
                  {docTitle && (
                    <span className="max-w-[24rem] truncate text-xs font-normal text-muted-foreground">
                      · {docTitle}
                    </span>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label={t("agent.close")}
                  className="rounded-lg p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95]"
                >
                  <XIcon className="size-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {versions.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <HistoryIcon className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {t("versions.empty")}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {sorted.map((version) => {
                      const expandedState = expanded.has(version.number);
                      const isBase = baseNo === version.number;
                      const isCompare = compareNo === version.number;
                      return (
                        <div
                          key={version.number}
                          className={`rounded-xl border transition-colors ${
                            isBase || isCompare
                              ? "border-primary/50 bg-primary/5"
                              : "border-border/40 bg-foreground/[0.03]"
                          }`}
                        >
                          <div className="flex items-center gap-2 p-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleCompare(version.number)
                              }
                              aria-expanded={expandedState}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-foreground/[0.05]"
                            >
                              <ChevronDownIcon
                                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expandedState ? "rotate-180" : ""}`}
                              />
                              <span className="inline-flex shrink-0 items-center rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                                v{version.number}
                              </span>
                              <VersionDot source={version.source} />
                              <span className="min-w-0 flex-1 truncate text-xs">
                                {version.source === "agent"
                                  ? t("versions.sourceAgent")
                                  : t("versions.sourceManual")}
                                {version.note && (
                                  <span className="text-muted-foreground">
                                    {" · "}
                                    {version.note}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
                                {formatStamp(version.createdAt)}
                              </span>
                            </button>
                            <span
                              className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.65rem] ${
                                isBase && isCompare
                                  ? "bg-primary/10 text-primary"
                                  : isBase
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {isBase && t("versions.base")}
                              {isCompare && !isBase && t("versions.compare")}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRestore(version.number)}
                              disabled={restoring !== null}
                              aria-label={t("versions.restore")}
                              title={t("versions.restore")}
                              className="glass-control !border-border/60 inline-flex shrink-0 items-center gap-1 rounded-lg bg-clip-padding px-2 py-1 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-40"
                            >
                              {restoring === version.number ? (
                                <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <CheckIcon className="size-3" />
                              )}
                              {t("versions.restore")}
                            </button>
                          </div>

                          {expandedState && (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-border/30 bg-background/40 px-4 py-2 font-mono text-xs text-muted-foreground/80">
                              {version.code}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {pair && diffOlder && diffNewer && (
                <footer className="apple-scrim flex shrink-0 flex-col gap-2 border-t border-border/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("versions.diffTitle", {
                      older: `v${diffOlder.number}`,
                      newer: `v${diffNewer.number}`,
                    })}
                  </p>
                  {diff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("versions.diffIdentical")}
                    </p>
                  ) : (
                    <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                      {diff.map((hunk) => (
                        <Hunk key={hunk.id} hunk={hunk} />
                      ))}
                    </div>
                  )}
                </footer>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
