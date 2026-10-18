import { useAtomValue } from "jotai";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  XIcon,
} from "@/components/agent/icons";
import { TikzEditor } from "@/components/tikz-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffIcon } from "@/components/workbench-icons";
import { type DiffHunk, type DiffLine, diffTexts } from "@/lib/diff";
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

function sourceLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  source: TikzVersion["source"],
): string {
  return source === "agent"
    ? t("versions.sourceAgent")
    : t("versions.sourceManual");
}

/** "AI assistant · repositioned the axes" — the commit message of a version. */
function versionSummary(
  t: (key: string, options?: Record<string, unknown>) => string,
  version: TikzVersion,
): string {
  const base = sourceLabel(t, version.source);
  return version.note ? `${base} · ${version.note}` : base;
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

/** Dropdown that selects one version, showing `vN` + the commit message. */
function VersionSelect({
  versions,
  value,
  onValueChange,
  ariaLabel,
}: {
  versions: TikzVersion[];
  value: number | null;
  onValueChange: (no: number) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const current = versions.find((v) => v.number === value) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="glass-control !border-border/60 flex min-w-0 items-center gap-1.5 rounded-lg bg-clip-padding px-2.5 py-1.5 text-left transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
        >
          <span className="inline-flex shrink-0 items-center rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold">
            {current ? `v${current.number}` : "—"}
          </span>
          {current && <VersionDot source={current.source} />}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {current ? versionSummary(t, current) : ""}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="thin-scrollbar max-h-80 w-80 overflow-y-auto"
      >
        {versions.map((version) => (
          <DropdownMenuItem
            key={version.number}
            onSelect={() => onValueChange(version.number)}
            className="gap-1.5"
          >
            <CheckIcon
              className={`size-3.5 shrink-0 ${
                version.number === value ? "opacity-100" : "opacity-0"
              }`}
            />
            <span className="inline-flex shrink-0 items-center rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold">
              v{version.number}
            </span>
            <VersionDot source={version.source} />
            <span className="min-w-0 flex-1 truncate text-xs">
              {versionSummary(t, version)}
            </span>
            <span className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
              {formatStamp(version.createdAt)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DiffRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/**
 * Pair a hunk's edit script into side-by-side rows: context lines appear in
 * both columns, a run of removals is paired index-wise with the run of
 * additions that follows it, and an unpaired line leaves the other cell blank.
 */
function toRows(lines: DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let removes: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    const count = Math.max(removes.length, adds.length);
    for (let i = 0; i < count; i += 1) {
      rows.push({ left: removes[i] ?? null, right: adds[i] ?? null });
    }
    removes = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.type === "remove") {
      removes.push(line);
    } else if (line.type === "add") {
      adds.push(line);
    } else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

function DiffCell({
  line,
  side,
}: {
  line: DiffLine | null;
  side: "left" | "right";
}) {
  const tone =
    line === null
      ? "bg-foreground/[0.02]"
      : line.type === "remove"
        ? "bg-red-500/10 text-red-700 dark:text-red-300"
        : line.type === "add"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground/70";
  const marker =
    line === null
      ? " "
      : line.type === "remove"
        ? "-"
        : line.type === "add"
          ? "+"
          : " ";
  return (
    <div
      className={`flex min-w-0 px-2 font-mono text-xs leading-5 ${tone} ${
        side === "left" ? "border-r border-border/30" : ""
      }`}
    >
      <span className="w-4 shrink-0 select-none text-muted-foreground/40">
        {marker}
      </span>
      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono">
        {line?.text || " "}
      </pre>
    </div>
  );
}

function Hunk({ hunk }: { hunk: DiffHunk }) {
  const rows = toRows(hunk.lines);
  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      <div className="border-b border-border/40 bg-background/40 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground tabular-nums">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      <div className="grid grid-cols-2">
        {rows.map((row) => (
          <Fragment key={`${row.left?.id ?? "n"}:${row.right?.id ?? "n"}`}>
            <DiffCell line={row.left} side="left" />
            <DiffCell line={row.right} side="right" />
          </Fragment>
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

/**
 * Version browser dialog. Default view: pick a version and read its content in
 * a read-only editor. With the diff toggle on: pick a left and a right version
 * and see the diff between them.
 */
export function VersionBrowser({ open, onOpenChange, onRestore }: Props) {
  const { t } = useTranslation();
  const currentDocId = useAtomValue(currentDocIdAtom);
  const docTitle = useAtomValue(docTitleAtom);
  const [versions, setVersions] = useState<TikzVersion[]>([]);
  const [diffMode, setDiffMode] = useState(false);
  const [selectedNo, setSelectedNo] = useState<number | null>(null);
  const [leftNo, setLeftNo] = useState<number | null>(null);
  const [rightNo, setRightNo] = useState<number | null>(null);
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

  // Always open in the default (single-version) view.
  useEffect(() => {
    if (open) {
      setDiffMode(false);
    }
  }, [open]);

  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.number - a.number),
    [versions],
  );

  // Seed/repair the selections when the version list changes: the view picks
  // the newest, and the diff picks the previous version against the newest.
  useEffect(() => {
    if (versions.length === 0) {
      setSelectedNo(null);
      setLeftNo(null);
      setRightNo(null);
      return;
    }
    const ascending = [...versions].sort((a, b) => a.number - b.number);
    const newest = ascending[ascending.length - 1];
    const older = ascending[ascending.length - 2] ?? newest;
    const exists = (no: number | null) =>
      no !== null && versions.some((v) => v.number === no);
    setSelectedNo((prev) => (exists(prev) ? prev : newest.number));
    setRightNo((prev) => (exists(prev) ? prev : newest.number));
    setLeftNo((prev) => (exists(prev) ? prev : older.number));
  }, [versions]);

  const selected = versions.find((v) => v.number === selectedNo) ?? null;
  const left = versions.find((v) => v.number === leftNo) ?? null;
  const right = versions.find((v) => v.number === rightNo) ?? null;

  // Diff is always left -> right, exactly as selected.
  useEffect(() => {
    if (left === null || right === null) {
      setDiff([]);
      return;
    }
    setDiff(diffTexts(left.code, right.code));
  }, [left, right]);

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

  const toggleButton = (
    <button
      type="button"
      aria-pressed={diffMode}
      onClick={() => setDiffMode((prev) => !prev)}
      className={`glass-control inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-clip-padding px-3 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] ${
        diffMode ? "!border-primary/50 text-primary" : "!border-border/60"
      }`}
    >
      <DiffIcon className="size-3.5" />
      {t("versions.diff")}
    </button>
  );

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

              {versions.length === 0 ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
                  <HistoryIcon className="size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {t("versions.empty")}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                  <div className="flex shrink-0 items-center gap-2">
                    {diffMode ? (
                      <>
                        <VersionSelect
                          versions={sorted}
                          value={leftNo}
                          onValueChange={setLeftNo}
                          ariaLabel={t("versions.leftVersion")}
                        />
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          →
                        </span>
                        <VersionSelect
                          versions={sorted}
                          value={rightNo}
                          onValueChange={setRightNo}
                          ariaLabel={t("versions.rightVersion")}
                        />
                      </>
                    ) : (
                      <VersionSelect
                        versions={sorted}
                        value={selectedNo}
                        onValueChange={setSelectedNo}
                        ariaLabel={t("versions.selectVersion")}
                      />
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {!diffMode && selected && (
                        <button
                          type="button"
                          onClick={() => handleRestore(selected.number)}
                          disabled={restoring !== null}
                          className="glass-control !border-border/60 inline-flex shrink-0 items-center gap-1 rounded-lg bg-clip-padding px-2.5 py-1.5 text-xs font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-40"
                        >
                          {restoring === selected.number ? (
                            <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <CheckIcon className="size-3" />
                          )}
                          {t("versions.restore")}
                        </button>
                      )}
                      {toggleButton}
                    </div>
                  </div>

                  {diffMode ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <p className="shrink-0 text-xs font-medium text-muted-foreground">
                        {t("versions.diffTitle", {
                          older: left ? `v${left.number}` : "—",
                          newer: right ? `v${right.number}` : "—",
                        })}
                      </p>
                      {diff.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("versions.diffIdentical")}
                        </p>
                      ) : (
                        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                          {diff.map((hunk) => (
                            <Hunk key={hunk.id} hunk={hunk} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : selected ? (
                    <TikzEditor
                      value={selected.code}
                      onChange={() => undefined}
                      readOnly
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
