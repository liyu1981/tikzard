"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentChat } from "@/components/agent/agent-chat";
import { CompileLogs } from "@/components/compile-logs";
import { TikzEditor } from "@/components/tikz-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import {
  beginCompileLog,
  COMPILE_FAILURE_PATTERN,
  getCompileLogsSince,
  getLastCompileLogId,
  installTikzConsoleCapture,
  pushCompileLog,
  setRenderFailureListener,
} from "@/lib/compile-logs";
import { loadMostRecentDocument, saveDocument } from "@/lib/documents";
import {
  downloadBlob,
  measureSvgNaturalSize,
  renderSvgToCanvas,
  svgToPngBlob,
  toFileSlug,
} from "@/lib/image-export";
import { canvasToSinglePagePdfBlob } from "@/lib/pdf-export";
import { ensureTikzJax } from "@/lib/tikzjax";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  type LeftTab,
  leftTabAtom,
} from "@/lib/workbench-state";

type Status =
  | "booting"
  | "ready"
  | "rendering"
  | "done"
  | "timeout"
  | "loadError";

type RightTab = "preview" | "logs";

const STATUS_KEY: Record<Status, string> = {
  booting: "workbench.statusBooting",
  ready: "workbench.statusReady",
  rendering: "workbench.statusRendering",
  done: "workbench.statusDone",
  timeout: "workbench.statusTimeout",
  loadError: "workbench.statusLoadError",
};

const STATUS_DOT: Record<Status, string> = {
  booting: "bg-neutral-400",
  ready: "bg-emerald-500",
  rendering: "animate-pulse bg-amber-500",
  done: "bg-emerald-500",
  timeout: "bg-red-500",
  loadError: "bg-red-500",
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function ExportIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function CopyIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function ImageFileIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function PdfFileIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

/** Debounce for auto-recompile while the user (or the agent) types. */
const AUTO_RENDER_DELAY_MS = 600;

/** Raster oversampling factor for PNG/PDF file exports (3× ≈ print quality). */
const EXPORT_SCALE = 3;

export function TikzWorkbench() {
  const { t } = useTranslation();
  const [code, setCode] = useAtom(codeAtom);
  const docTitle = useAtomValue(docTitleAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const leftTab = useAtomValue(leftTabAtom);
  const setLeftTab = useSetAtom(leftTabAtom);
  const [status, setStatus] = useState<Status>("booting");
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastRenderedCodeRef = useRef<string | null>(null);
  const renderSeqRef = useRef(0);
  const renderStartRef = useRef(0);
  const hydratedRef = useRef(false);
  const docIdRef = useRef<string | null>(null);
  const codeRef = useRef(code);
  const statusRef = useRef(status);
  const doneInfoMsRef = useRef<number | null>(null);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    doneInfoMsRef.current = doneInfo?.ms ?? null;
  }, [doneInfo]);

  // Scale the drawing to fully fit the visible canvas (never upscales).
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = canvas?.querySelector("svg");
    if (!canvas || !svg) {
      return;
    }
    const style = window.getComputedStyle(canvas);
    const availW =
      canvas.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const availH =
      canvas.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom);
    // getBoundingClientRect is in visual px, i.e. layout size multiplied by
    // the current zoom — divide it back out to get the natural size.
    const rect = svg.getBoundingClientRect();
    const natW = Math.max(1, rect.width / zoom);
    const natH = Math.max(1, rect.height / zoom);
    const scale = Math.min(availW / natW, availH / natH, 1);
    setZoom(Math.max(0.25, Math.round(scale * 100) / 100));
  }, [zoom]);

  const getPreviewSvg = useCallback(
    () => canvasRef.current?.querySelector("svg") ?? null,
    [],
  );

  const runExport = useCallback(
    async (action: (svg: SVGSVGElement) => Promise<string>) => {
      if (exporting || statusRef.current !== "done") {
        return;
      }
      const svg = getPreviewSvg();
      if (!svg) {
        return;
      }
      setExporting(true);
      try {
        pushCompileLog(
          "info",
          tRef.current("workbench.exportDone", { detail: await action(svg) }),
        );
      } catch {
        pushCompileLog("error", tRef.current("workbench.exportFailed"));
      } finally {
        setExporting(false);
      }
    },
    [exporting, getPreviewSvg],
  );

  const handleCopyImage = useCallback(
    () =>
      runExport(async (svg) => {
        if (!navigator.clipboard?.write) {
          throw new Error("clipboard unavailable");
        }
        const natural = measureSvgNaturalSize(svg, zoom);
        const blob = await svgToPngBlob(svg, natural, zoom);
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        return tRef.current("workbench.copyDetail", {
          zoom: `${Math.round(zoom * 100)}%`,
        });
      }),
    [runExport, zoom],
  );

  const handleExportPng = useCallback(
    () =>
      runExport(async (svg) => {
        const natural = measureSvgNaturalSize(svg, zoom);
        const blob = await svgToPngBlob(svg, natural, EXPORT_SCALE);
        const filename = `${toFileSlug(docTitle)}.png`;
        downloadBlob(blob, filename);
        return filename;
      }),
    [docTitle, runExport, zoom],
  );

  const handleExportPdf = useCallback(
    () =>
      runExport(async (svg) => {
        const natural = measureSvgNaturalSize(svg, zoom);
        const canvas = await renderSvgToCanvas(
          svg,
          natural.width * EXPORT_SCALE,
          natural.height * EXPORT_SCALE,
        );
        const blob = canvasToSinglePagePdfBlob(
          canvas,
          natural.width,
          natural.height,
        );
        const filename = `${toFileSlug(docTitle)}.pdf`;
        downloadBlob(blob, filename);
        return filename;
      }),
    [docTitle, runExport, zoom],
  );

  const renderNow = useCallback(
    (source: string) => {
      const host = stageRef.current;
      if (!host) {
        return;
      }
      host.replaceChildren();
      renderStartRef.current = performance.now();
      lastRenderedCodeRef.current = source;
      renderSeqRef.current += 1;
      setDoneInfo(null);
      setStatus("rendering");
      beginCompileLog(t("workbench.logStart"));
      const el = document.createElement("script");
      el.type = "text/tikz";
      el.textContent = source;
      host.appendChild(el);
    },
    [t],
  );

  // Bridge the live workbench state into the agent's tools: reads see the
  // freshest source/status; writes land in the shared source atom and the
  // auto-render effect below recompiles the preview.
  const applyAgentCode = useCallback(
    (next: string) => {
      setCode(next);
    },
    [setCode],
  );

  const agentBridge = useMemo<EditorMutationBridge>(() => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    return {
      getCode: () => codeRef.current,
      setCode: applyAgentCode,
      getRenderStatus: () => ({
        status: statusRef.current,
        durationMs: doneInfoMsRef.current,
      }),
      waitForRender: async (timeoutMs = 50000) => {
        const deadline = performance.now() + timeoutMs;
        const startSeq = renderSeqRef.current;
        const sinceLogId = getLastCompileLogId();
        const failedSince = () =>
          getCompileLogsSince(sinceLogId).some((entry) =>
            COMPILE_FAILURE_PATTERN.test(entry.text),
          );
        while (
          renderSeqRef.current === startSeq &&
          performance.now() < deadline
        ) {
          await sleep(100);
        }
        let failed = false;
        while (performance.now() < deadline) {
          // Log content is the authoritative failure signal — a failed
          // compile never produces an <svg> for the observer to see.
          failed = failedSince();
          if (failed) {
            break;
          }
          if (
            statusRef.current === "done" ||
            statusRef.current === "loadError"
          ) {
            break;
          }
          await sleep(100);
        }
        return {
          status: failed || failedSince() ? "timeout" : statusRef.current,
          durationMs: failed ? null : doneInfoMsRef.current,
        };
      },
    };
  }, [applyAgentCode]);

  useEffect(() => {
    let cancelled = false;
    installTikzConsoleCapture();
    ensureTikzJax()
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("loadError");
          pushCompileLog("error", tRef.current("workbench.statusLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate the workbench with the most recently edited document from
  // IndexedDB, or start a fresh (unsaved) document id when none exists.
  useEffect(() => {
    let cancelled = false;
    void loadMostRecentDocument().then((doc) => {
      if (cancelled) {
        return;
      }
      if (doc !== undefined) {
        docIdRef.current = doc.id;
        setCode(doc.code);
        setDocTitle(doc.title);
        setCurrentDocId(doc.id);
      }
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [setCode, setCurrentDocId, setDocTitle]);

  // Debounced autosave of the current document (code + title) to IndexedDB.
  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      let id = currentDocId ?? docIdRef.current;
      if (id === null) {
        id = crypto.randomUUID();
        docIdRef.current = id;
        setCurrentDocId(id);
      }
      void saveDocument({ id, title: docTitle, code, updatedAt: Date.now() });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [code, currentDocId, docTitle, setCurrentDocId]);

  // Recompile whenever the source differs from the last compile attempt —
  // the first render fires right after the engine boots, later edits are
  // debounced while typing. Explicit Render clicks always bypass this and
  // force a fresh compilation via renderNow.
  useEffect(() => {
    if (
      status === "booting" ||
      status === "loadError" ||
      status === "rendering"
    ) {
      return;
    }
    if (code === lastRenderedCodeRef.current) {
      return;
    }
    const timer = window.setTimeout(
      () => renderNow(code),
      AUTO_RENDER_DELAY_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [code, status, renderNow]);

  // A failed compile surfaces as an <img> placeholder (never an <svg>), so
  // the render observer can't see it — end the "compiling" state as soon as
  // the runtime reports a failure instead of waiting for the watchdog.
  useEffect(() => {
    setRenderFailureListener(() => setStatus("timeout"));
    return () => {
      setRenderFailureListener(null);
    };
  }, []);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (host.querySelector("svg")) {
        const ms = Math.max(
          1,
          Math.round(performance.now() - renderStartRef.current),
        );
        setDoneInfo({ at: Date.now(), ms });
        setStatus("done");
        pushCompileLog(
          "info",
          tRef.current("workbench.compileTime", {
            time: formatDuration(ms),
          }),
        );
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (status !== "rendering") {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus("timeout");
      pushCompileLog("error", tRef.current("workbench.logTimeout"));
    }, 45000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "done") {
      return;
    }
    const ticker = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      window.clearInterval(ticker);
    };
  }, [status]);

  const busy = status === "booting" || status === "loadError";

  const relativeRenderedAt = (() => {
    if (!doneInfo) {
      return null;
    }
    const seconds = Math.max(0, Math.floor((nowTick - doneInfo.at) / 1000));
    if (seconds < 10) {
      return t("workbench.justNow");
    }
    if (seconds < 60) {
      return t("workbench.secondsAgo", { count: seconds });
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return t("workbench.minutesAgo", { count: minutes });
    }
    return t("workbench.hoursAgo", { count: Math.floor(minutes / 60) });
  })();

  const TABS: { id: LeftTab; labelKey: string }[] = [
    { id: "assistant", labelKey: "agent.title" },
    { id: "instruction", labelKey: "workbench.editorLabel" },
  ];

  const RIGHT_TABS: { id: RightTab; labelKey: string }[] = [
    { id: "preview", labelKey: "workbench.previewLabel" },
    { id: "logs", labelKey: "workbench.compileLogs" },
  ];

  const tabPill =
    "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition duration-150";

  return (
    <div className="materialize grid h-full min-h-0 w-full grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <div className="glass-control flex min-h-0 min-h-[calc(100dvh-7rem)] flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <div className="flex h-8 shrink-0 items-center justify-between">
          <div
            role="tablist"
            aria-label={t("workbench.tabsLabel")}
            className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/50 p-0.5 shadow-sm backdrop-blur-md"
          >
            {TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={leftTab === id}
                onClick={() => setLeftTab(id)}
                className={`${tabPill} ${
                  leftTab === id
                    ? "bg-white/15 text-foreground shadow-sm dark:bg-white/15"
                    : "text-muted-foreground hover:bg-neutral-500/10 hover:text-foreground"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
        {leftTab === "instruction" ? (
          <>
            <TikzEditor value={code} onChange={setCode} />
            <div className="flex h-9 shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => renderNow(code)}
                  className="glass-control !border-border/60 rounded-lg bg-clip-padding px-4 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("workbench.render")}
                </button>
              </div>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {t("workbench.hint")}
              </p>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1">
            <AgentChat bridge={agentBridge} className="h-full" />
          </div>
        )}
      </div>
      <div className="glass-control flex min-h-0 min-h-[calc(100dvh-7rem)] flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <div className="flex h-8 shrink-0 items-center justify-between">
          <div
            role="tablist"
            aria-label={t("workbench.resultTabsLabel")}
            className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/50 p-0.5 shadow-sm backdrop-blur-md"
          >
            {RIGHT_TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rightTab === id}
                onClick={() => setRightTab(id)}
                className={`${tabPill} ${
                  rightTab === id
                    ? "bg-white/15 text-foreground shadow-sm dark:bg-white/15"
                    : "text-muted-foreground hover:bg-neutral-500/10 hover:text-foreground"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          {rightTab === "preview" && (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-0.5 rounded-full border border-border/50 bg-background/70 p-0.5 shadow-sm backdrop-blur-md">
                <button
                  type="button"
                  aria-label={t("workbench.zoomFit")}
                  title={t("workbench.zoomFit")}
                  onClick={fitView}
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
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
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
                  onClick={() => setZoom(1)}
                  className="min-w-12 rounded-full px-2 py-1 text-center font-mono text-xs tabular-nums text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95]"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  aria-label={t("workbench.zoomIn")}
                  title={t("workbench.zoomIn")}
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
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
                  <DropdownMenuItem
                    onSelect={() => void handleCopyImage()}
                    className="text-sm"
                  >
                    <CopyIcon />
                    {t("workbench.copyImage")}
                    <DropdownMenuShortcut className="tabular-nums">
                      {Math.round(zoom * 100)}%
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void handleExportPng()}
                    className="text-sm"
                  >
                    <ImageFileIcon />
                    {t("workbench.exportPng")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void handleExportPdf()}
                    className="text-sm"
                  >
                    <PdfFileIcon />
                    {t("workbench.exportPdf")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {/* Both tab contents stay mounted so renders triggered from the
            editor land even while the logs tab is shown. */}
        <div
          className={
            rightTab === "preview"
              ? "flex min-h-0 flex-1 flex-col gap-2"
              : "hidden"
          }
        >
          <div
            ref={canvasRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-black/10 bg-white p-4 shadow-inner"
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
    </div>
  );
}
