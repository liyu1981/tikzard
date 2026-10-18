"use client";

import type * as React from "react";
import { useTranslation } from "react-i18next";
import { PencilIcon } from "@/components/agent/icons";
import { AnnotateLayer } from "@/components/annotate-overlay";
import { CompileLogs } from "@/components/compile-logs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CopyIcon,
  ExportIcon,
  GridIcon,
  ImageFileIcon,
  PdfFileIcon,
} from "@/components/workbench-icons";
import {
  formatDuration,
  type RightTab,
  STATUS_DOT,
  STATUS_KEY,
  type Status,
  TAB_PILL,
} from "@/components/workbench-types";

interface Props {
  rightTab: RightTab;
  status: Status;
  doneInfo: { at: number; ms: number } | null;
  nowTick: number;
  zoom: number;
  exporting: boolean;
  annotating: boolean;
  helperGrid: boolean;
  previewHostEl: HTMLDivElement | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onRightTabChange: (tab: RightTab) => void;
  onAnnotateToggle: () => void;
  onHelperGridToggle: () => void;
  onFit: () => void;
  onZoomChange: (zoom: number | ((current: number) => number)) => void;
  onExportCopy: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onAnnotateFinish: (hasContent: boolean) => void;
  onAnnotateCancel: () => void;
  onPreviewHostChange: (element: HTMLDivElement | null) => void;
}

export function WorkbenchPreviewPanel({
  rightTab,
  status,
  doneInfo,
  nowTick,
  zoom,
  exporting,
  annotating,
  helperGrid,
  previewHostEl,
  stageRef,
  canvasRef,
  onRightTabChange,
  onAnnotateToggle,
  onHelperGridToggle,
  onFit,
  onZoomChange,
  onExportCopy,
  onExportPng,
  onExportPdf,
  onAnnotateFinish,
  onAnnotateCancel,
  onPreviewHostChange,
}: Props) {
  const { t } = useTranslation();
  const tabs: { id: RightTab; labelKey: string }[] = [
    { id: "preview", labelKey: "workbench.previewLabel" },
    { id: "logs", labelKey: "workbench.compileLogs" },
  ];
  let relativeRenderedAt: string | null = null;
  if (doneInfo) {
    const seconds = Math.max(0, Math.floor((nowTick - doneInfo.at) / 1000));
    relativeRenderedAt =
      seconds < 10
        ? t("workbench.justNow")
        : seconds < 60
          ? t("workbench.secondsAgo", { count: seconds })
          : seconds < 3600
            ? t("workbench.minutesAgo", { count: Math.floor(seconds / 60) })
            : t("workbench.hoursAgo", { count: Math.floor(seconds / 3600) });
  }

  return (
    <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
      <div className="flex h-8 shrink-0 items-center justify-between">
        <div
          role="tablist"
          aria-label={t("workbench.resultTabsLabel")}
          className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/50 p-0.5 shadow-sm backdrop-blur-md"
        >
          {tabs.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={rightTab === id}
              onClick={() => onRightTabChange(id)}
              className={`${TAB_PILL} ${rightTab === id ? "bg-white/15 text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:bg-neutral-500/10 hover:text-foreground"}`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        {rightTab === "preview" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("workbench.helperGrid")}
              title={t("workbench.helperGrid")}
              aria-pressed={helperGrid}
              onClick={onHelperGridToggle}
              className={`rounded-full border border-border/50 bg-background/70 p-1.5 shadow-sm backdrop-blur-md transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95] ${helperGrid ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <GridIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("workbench.annotate")}
              title={t("workbench.annotate")}
              aria-pressed={annotating}
              onClick={onAnnotateToggle}
              className={`rounded-full border border-border/50 bg-background/70 p-1.5 shadow-sm backdrop-blur-md transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95] ${annotating ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <div className="flex items-center gap-0.5 rounded-full border border-border/50 bg-background/70 p-0.5 shadow-sm backdrop-blur-md">
              <button
                type="button"
                aria-label={t("workbench.zoomFit")}
                title={t("workbench.zoomFit")}
                onClick={onFit}
                className="rounded-full p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t("workbench.zoomOut")}
                title={t("workbench.zoomOut")}
                onClick={() => onZoomChange((z) => Math.max(0.25, z - 0.25))}
                className="rounded-full p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t("workbench.zoomReset")}
                title={t("workbench.zoomReset")}
                onClick={() => onZoomChange(1)}
                className="min-w-12 rounded-full px-2 py-1 text-center font-mono text-xs tabular-nums text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label={t("workbench.zoomIn")}
                title={t("workbench.zoomIn")}
                onClick={() => onZoomChange((z) => Math.min(4, z + 0.25))}
                className="rounded-full p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("workbench.export")}
                title={t("workbench.export")}
                disabled={status !== "done" || exporting}
                className="rounded-full border border-border/50 bg-background/70 p-1.5 text-muted-foreground shadow-sm backdrop-blur-md transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ExportIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuItem onSelect={onExportCopy} className="text-sm">
                  <CopyIcon />
                  {t("workbench.copyImage")}
                  <DropdownMenuShortcut className="tabular-nums">
                    {Math.round(zoom * 100)}%
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onExportPng} className="text-sm">
                  <ImageFileIcon />
                  {t("workbench.exportPng")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportPdf} className="text-sm">
                  <PdfFileIcon />
                  {t("workbench.exportPdf")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div
        className={
          rightTab === "preview"
            ? "flex min-h-0 flex-1 flex-col gap-2"
            : "hidden"
        }
      >
        <div ref={onPreviewHostChange} className="relative min-h-0 flex-1">
          <div
            ref={canvasRef}
            className="flex h-full items-center justify-center overflow-auto rounded-lg border border-black/10 bg-white p-4 shadow-inner"
          >
            <div
              ref={stageRef}
              style={{ zoom }}
              className={
                zoom > 1
                  ? "[&_svg]:h-auto"
                  : "[&_svg]:h-auto [&_svg]:max-w-full"
              }
            />
          </div>
          {annotating && previewHostEl !== null && (
            <AnnotateLayer
              mount={previewHostEl}
              stage={stageRef.current}
              onFinish={onAnnotateFinish}
              onCancel={onAnnotateCancel}
            />
          )}
        </div>
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
            />
            {t(STATUS_KEY[status])}
          </span>
          {status === "done" && doneInfo && (
            <span className="truncate text-muted-foreground tabular-nums">
              {t("workbench.compileTime", {
                time: formatDuration(doneInfo.ms),
              })}
              {" · "}
              {relativeRenderedAt}
            </span>
          )}
        </div>
      </div>
      <CompileLogs
        className={rightTab === "logs" ? "min-h-0 flex-1" : "hidden"}
      />
    </div>
  );
}
