"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentChat } from "@/components/agent/agent-chat";
import { CheckIcon, HistoryIcon, PencilIcon } from "@/components/agent/icons";
import { AnnotateLayer } from "@/components/annotate-overlay";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VersionBrowser } from "@/components/version-browser";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import { blobToImageContent } from "@/lib/agent/images";
import {
  beginCompileLog,
  COMPILE_FAILURE_PATTERN,
  getCompileLogsSince,
  getLastCompileLogId,
  installTikzConsoleCapture,
  pushCompileLog,
  setRenderFailureListener,
} from "@/lib/compile-logs";
import { saveDocument, setLastOpenedDocId } from "@/lib/documents";
import {
  annotatedSnapshotBlob,
  canvasToPngBlob,
  downloadBlob,
  measureSvgNaturalSize,
  renderSvgToCanvas,
  svgToPngBlob,
  toFileSlug,
} from "@/lib/image-export";
import { canvasToSinglePagePdfBlob } from "@/lib/pdf-export";
import { ensureTikzJax } from "@/lib/tikzjax";
import { getVersions, saveNewVersion, type TikzVersion } from "@/lib/versions";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  type LeftTab,
  leftTabAtom,
  pendingAnnotationAtom,
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

/** Longest side allowed for stored document thumbnails. */
const THUMBNAIL_MAX_PX = 640;

/** Delay after a successful compile before capturing the thumbnail. */
const THUMBNAIL_DELAY_MS = 1500;

/** How long the "Saved" confirmation stays on the save-version button. */
const VERSION_SAVED_FEEDBACK_MS = 1600;

export function TikzWorkbench() {
  const { t } = useTranslation();
  const [code, setCode] = useAtom(codeAtom);
  const docTitle = useAtomValue(docTitleAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const leftTab = useAtomValue(leftTabAtom);
  const setLeftTab = useSetAtom(leftTabAtom);
  const setPendingAnnotation = useSetAtom(pendingAnnotationAtom);
  const [status, setStatus] = useState<Status>("booting");
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [saveVersionState, setSaveVersionState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  /** Number the NEXT snapshot will get (max existing + 1); null until loaded. */
  const [nextVersionNo, setNextVersionNo] = useState<number | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** Whether the annotation overlay is active on the preview picture. */
  const [annotating, setAnnotating] = useState(false);
  /** Preview panel host element the annotation overlay portals into. */
  const [previewHostEl, setPreviewHostEl] = useState<HTMLDivElement | null>(
    null,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastRenderedCodeRef = useRef<string | null>(null);
  const renderSeqRef = useRef(0);
  const renderStartRef = useRef(0);
  const hydratedRef = useRef(false);
  const codeRef = useRef(code);
  const statusRef = useRef(status);
  const zoomRef = useRef(zoom);
  const doneInfoMsRef = useRef<number | null>(null);
  const saveVersionTimerRef = useRef<number | null>(null);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Clear the pending "saved" feedback revert on unmount.
  useEffect(
    () => () => {
      if (saveVersionTimerRef.current !== null) {
        window.clearTimeout(saveVersionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  // Annotation needs an <svg> node to draw into, but a fresh document has
  // none until the first successful compile. Provision a blank placeholder
  // sized to the preview content box so annotate mode works from the start;
  // the layer's viewport logic then stretches its viewBox over the whole
  // container. The next compile replaces it (renderNow clears the stage).
  const ensurePlaceholderSvg = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || getPreviewSvg() !== null) {
      return;
    }
    const style = window.getComputedStyle(canvas);
    const width = Math.max(
      1,
      canvas.clientWidth -
        Number.parseFloat(style.paddingLeft || "0") -
        Number.parseFloat(style.paddingRight || "0"),
    );
    const height = Math.max(
      1,
      canvas.clientHeight -
        Number.parseFloat(style.paddingTop || "0") -
        Number.parseFloat(style.paddingBottom || "0"),
    );
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-annotate-placeholder", "");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    stage.replaceChildren(svg);
  }, [getPreviewSvg]);

  // Finish annotation: the marks already live inside the rendered SVG, so
  // rasterizing it captures them directly; downscale to a vision-friendly
  // size and stage the snapshot in the assistant composer with a preset
  // instruction (never sent automatically). No marks just closes.
  const handleAnnotateFinish = useCallback(
    (hasContent: boolean) => {
      const svg = getPreviewSvg();
      setAnnotating(false);
      if (!hasContent || !svg) {
        return;
      }
      void annotatedSnapshotBlob(svg, zoomRef.current)
        .then(blobToImageContent)
        .then((content) => {
          setPendingAnnotation({
            id: crypto.randomUUID(),
            content,
            promptText: tRef.current("agent.annotatedPrompt"),
          });
          setLeftTab("assistant");
          pushCompileLog("info", tRef.current("workbench.annotateAttached"));
        })
        .catch(() =>
          pushCompileLog("error", tRef.current("workbench.exportFailed")),
        );
    },
    [getPreviewSvg, setLeftTab, setPendingAnnotation],
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

  // Resolve the document id for a version save, minting one for a fresh
  // (unsaved) document exactly like the autosave effect does so a snapshot
  // can be taken before the debounced save has run.
  const ensureDocId = useCallback((): string => {
    if (currentDocId !== null) {
      return currentDocId;
    }
    const id = crypto.randomUUID();
    setCurrentDocId(id);
    setLastOpenedDocId(id);
    return id;
  }, [currentDocId, setCurrentDocId]);

  const handleSaveVersion = useCallback(async (): Promise<number> => {
    const id = ensureDocId();
    const version = await saveNewVersion(id, codeRef.current, "manual");
    setNextVersionNo(version.number + 1);
    pushCompileLog(
      "info",
      tRef.current("workbench.versionSaved", { number: version.number }),
    );
    return version.number;
  }, [ensureDocId]);

  // Restoring a snapshot first checkpoints the current editor source (so the
  // work being replaced is never lost), then swaps the source atom.
  const handleRestoreVersion = useCallback(
    async (version: TikzVersion) => {
      const id = ensureDocId();
      if (codeRef.current !== version.code) {
        const checkpoint = await saveNewVersion(id, codeRef.current, "manual");
        setNextVersionNo(checkpoint.number + 1);
        pushCompileLog(
          "info",
          tRef.current("workbench.versionSaved", {
            number: checkpoint.number,
          }),
        );
      }
      setCode(version.code);
      pushCompileLog(
        "info",
        tRef.current("workbench.versionRestored", { number: version.number }),
      );
    },
    [ensureDocId, setCode],
  );

  // Load (and later re-load) the next version number whenever the open
  // document changes, so the save button can advertise it up front.
  useEffect(() => {
    if (currentDocId === null) {
      setNextVersionNo(null);
      return;
    }
    let cancelled = false;
    void getVersions(currentDocId)
      .then((list) => {
        if (!cancelled) {
          setNextVersionNo((list.at(-1)?.number ?? 0) + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextVersionNo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentDocId]);

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
      saveVersion: async (note) => {
        const id = ensureDocId();
        const version = await saveNewVersion(id, codeRef.current, "agent", {
          note,
        });
        setNextVersionNo(version.number + 1);
        pushCompileLog(
          "info",
          tRef.current("workbench.versionSaved", { number: version.number }),
        );
        return version.number;
      },
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
  }, [applyAgentCode, ensureDocId]);

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

  // The page shell seeds the atoms (code/title/id) from the last-opened
  // document before mounting this workbench, so there is nothing to hydrate
  // here — only mark the store as ready so the autosave below can run.
  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Mint the document id eagerly instead of waiting for the debounced
  // autosave: per-document features (AI chat history isolation) key off it
  // immediately, even before the first edit lands.
  useEffect(() => {
    if (!hydratedRef.current || currentDocId !== null) {
      return;
    }
    const id = crypto.randomUUID();
    setCurrentDocId(id);
    setLastOpenedDocId(id);
  }, [currentDocId, setCurrentDocId]);

  // Debounced autosave of the current document (code + title + latest
  // thumbnail) to IndexedDB. A null currentDocId mints a fresh id, which is
  // how "New document" forks into its own record; that minted id also
  // becomes the last-opened pointer.
  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      let id = currentDocId;
      if (id === null) {
        id = crypto.randomUUID();
        setCurrentDocId(id);
        setLastOpenedDocId(id);
      }
      void saveDocument({
        id,
        title: docTitle,
        code,
        thumbnail: thumbnail ?? undefined,
        updatedAt: Date.now(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [code, currentDocId, docTitle, setCurrentDocId, thumbnail]);

  // A fresh (unsaved) document — e.g. right after "New document" — starts
  // without a snapshot instead of inheriting the previous document's one.
  useEffect(() => {
    if (currentDocId === null) {
      setThumbnail(null);
    }
  }, [currentDocId]);

  // After every successful compile, capture a downscaled snapshot of the
  // drawing as the document's stored thumbnail. Best-effort: failures leave
  // the previous thumbnail in place.
  useEffect(() => {
    if (status !== "done") {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const svg = canvasRef.current?.querySelector("svg");
      if (!svg || cancelled) {
        return;
      }
      const natural = measureSvgNaturalSize(svg, zoomRef.current);
      const scale = Math.min(
        1,
        THUMBNAIL_MAX_PX / Math.max(natural.width, natural.height),
      );
      renderSvgToCanvas(svg, natural.width * scale, natural.height * scale)
        .then((canvas) => canvasToPngBlob(canvas))
        .then((blob) => {
          if (!cancelled) {
            setThumbnail(blob);
          }
        })
        .catch(() => {
          // keep the previous thumbnail
        });
    }, THUMBNAIL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [status]);

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
    <div className="materialize grid h-full min-h-0 w-full grid-cols-1 grid-rows-[repeat(2,minmax(0,1fr))] gap-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
      <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
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
          {/* Version history is document-scoped, so it lives on the panel
              chrome rather than inside the source editor's action row. */}
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setVersionsOpen(true)}
                  aria-label={t("workbench.history")}
                  title={t("workbench.history")}
                  className="glass-control !border-border/60 flex size-7 items-center justify-center rounded-full bg-clip-padding p-1.5 text-muted-foreground transition duration-150 hover:-translate-y-px hover:brightness-[1.06] hover:text-foreground active:scale-[0.98]"
                >
                  <HistoryIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("workbench.history")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* Both panes stay mounted; tabs only toggle visibility, so the
            assistant keeps its session list, expanded chats, and live agent
            instance across switches. */}
        <div className={leftTab === "instruction" ? "contents" : "hidden"}>
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
              <button
                type="button"
                disabled={saveVersionState !== "idle"}
                onClick={() => {
                  if (saveVersionState !== "idle") {
                    return;
                  }
                  setSaveVersionState("saving");
                  void handleSaveVersion()
                    .then(() => {
                      // Confirm success briefly, then re-arm the button.
                      setSaveVersionState("saved");
                      if (saveVersionTimerRef.current !== null) {
                        window.clearTimeout(saveVersionTimerRef.current);
                      }
                      saveVersionTimerRef.current = window.setTimeout(
                        () => setSaveVersionState("idle"),
                        VERSION_SAVED_FEEDBACK_MS,
                      );
                    })
                    .catch(() => setSaveVersionState("idle"));
                }}
                title={t("workbench.saveVersion")}
                className={`glass-control !border-border/60 inline-flex items-center gap-1 rounded-lg bg-clip-padding px-3 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${saveVersionState === "saved" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
              >
                {saveVersionState === "saving" ? (
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                {saveVersionState === "saved"
                  ? t("workbench.saved")
                  : nextVersionNo === null
                    ? t("workbench.saveVersion")
                    : t("workbench.saveVersionNumbered", {
                        number: nextVersionNo,
                      })}
              </button>
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {t("workbench.hint")}
            </p>
          </div>
        </div>
        <div className={leftTab === "assistant" ? "min-h-0 flex-1" : "hidden"}>
          <AgentChat
            bridge={agentBridge}
            docId={currentDocId}
            className="h-full"
          />
        </div>
      </div>
      <VersionBrowser
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestore={handleRestoreVersion}
      />
      <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
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
              <button
                type="button"
                aria-label={t("workbench.annotate")}
                title={t("workbench.annotate")}
                aria-pressed={annotating}
                onClick={() => {
                  if (!annotating) {
                    ensurePlaceholderSvg();
                  }
                  setAnnotating((prev) => !prev);
                }}
                className={`rounded-full border border-border/50 bg-background/70 p-1.5 shadow-sm backdrop-blur-md transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95] ${
                  annotating
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <PencilIcon className="size-3.5" />
              </button>
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
          <div ref={setPreviewHostEl} className="relative min-h-0 flex-1">
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
                onFinish={handleAnnotateFinish}
                onCancel={() => setAnnotating(false)}
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
    </div>
  );
}
