"use client";

import type { ImageContent } from "@earendil-works/pi-ai";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
import { blobToImageContent } from "@/lib/agent/images";
import { pushCompileLog } from "@/lib/compile-logs";
import {
  compositeAnnotationBlob,
  downloadBlob,
  measureSvgNaturalSize,
  renderSvgToCanvas,
  svgToPngBlob,
  toFileSlug,
} from "@/lib/image-export";
import { canvasToSinglePagePdfBlob } from "@/lib/pdf-export";

const EXPORT_SCALE = 3;

interface Props {
  docTitle: string;
  status: Status;
  /** Annotation rewrites the svg viewport; freeze fit/grid while it is active. */
  annotating: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setLeftTab: (tab: "assistant" | "instruction") => void;
  setPendingAnnotation: (value: {
    id: string;
    content: ImageContent;
    promptText: string;
  }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useWorkbenchPreview({
  docTitle,
  status,
  annotating,
  stageRef,
  canvasRef,
  setLeftTab,
  setPendingAnnotation,
  t,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [exporting, setExporting] = useState(false);
  const zoomRef = useRef(zoom);
  const tRef = useRef(t);
  const annotatingRef = useRef(annotating);

  useEffect(() => {
    annotatingRef.current = annotating;
  }, [annotating]);

  // Actual on-screen scale: the fit-to-container base times the user zoom, so
  // zoom = 1 always shows the drawing as large as the canvas allows.
  const displayScale = fitScale * zoom;
  const displayScaleRef = useRef(displayScale);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    displayScaleRef.current = displayScale;
  }, [displayScale]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const getPreviewSvg = useCallback(
    () => canvasRef.current?.querySelector("svg") ?? null,
    [canvasRef],
  );

  /**
   * Base scale that makes the current drawing fill the canvas (contain), used
   * as the zoom = 1 size. Recomputed whenever a new svg lands or the canvas
   * resizes, so the drawing always opens as large as it can fit.
   */
  const computeFitScale = useCallback(() => {
    if (annotatingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const svg = canvas?.querySelector("svg");
    if (!canvas || !svg) {
      return;
    }
    // Ignore partial/loader svgs that have no laid-out viewBox yet.
    const box = svg.viewBox.baseVal;
    if (box.width <= 0 || box.height <= 0) {
      return;
    }
    const style = window.getComputedStyle(canvas);
    const availW =
      canvas.clientWidth -
      Number.parseFloat(style.paddingLeft || "0") -
      Number.parseFloat(style.paddingRight || "0");
    const availH =
      canvas.clientHeight -
      Number.parseFloat(style.paddingTop || "0") -
      Number.parseFloat(style.paddingBottom || "0");
    if (availW <= 0 || availH <= 0) {
      return;
    }
    const natural = measureSvgNaturalSize(svg, displayScaleRef.current);
    if (natural.width <= 0 || natural.height <= 0) {
      return;
    }
    // Leave a hair of slack so sub-pixel rounding never spawns a scrollbar.
    const scale = Math.min(
      Math.max(0, availW - 1) / natural.width,
      Math.max(0, availH - 1) / natural.height,
    );
    if (Number.isFinite(scale) && scale > 0) {
      setFitScale(scale);
    }
  }, [canvasRef]);

  // Re-fit when a render completes and whenever the canvas changes size.
  useEffect(() => {
    if (status !== "done") {
      return;
    }
    const raf = requestAnimationFrame(computeFitScale);
    return () => cancelAnimationFrame(raf);
  }, [status, computeFitScale]);

  // Annotation rewrites the svg viewport; re-fit once it ends.
  useEffect(() => {
    if (annotating) {
      return;
    }
    const raf = requestAnimationFrame(computeFitScale);
    return () => cancelAnimationFrame(raf);
  }, [annotating, computeFitScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(computeFitScale);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, computeFitScale]);

  // TikZJax inserts the svg and then sets its width/height attributes, and it
  // may replace the node during a render, so re-fit whenever the subtree or
  // those attributes change (and not on our own style.zoom writes).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MutationObserver === "undefined") {
      return;
    }
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeFitScale);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(canvas, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["width", "height"],
    });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [canvasRef, computeFitScale]);

  const fitView = useCallback(() => {
    setZoom(1);
    requestAnimationFrame(computeFitScale);
  }, [computeFitScale]);

  const ensurePlaceholderSvg = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || getPreviewSvg() !== null) return;
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
  }, [canvasRef, getPreviewSvg, stageRef]);

  const handleAnnotateFinish = useCallback(
    (hasContent: boolean, overlay: SVGSVGElement | null) => {
      const svg = getPreviewSvg();
      const host = canvasRef.current?.parentElement ?? null;
      if (!hasContent || !svg || host === null) return;
      void compositeAnnotationBlob(svg, overlay, host)
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
    [canvasRef, getPreviewSvg, setLeftTab, setPendingAnnotation],
  );

  const runExport = useCallback(
    async (action: (svg: SVGSVGElement) => Promise<string>) => {
      if (exporting || status !== "done") return;
      const svg = getPreviewSvg();
      if (!svg) return;
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
    [exporting, getPreviewSvg, status],
  );

  const handleCopyImage = useCallback(
    () =>
      runExport(async (svg) => {
        if (!navigator.clipboard?.write)
          throw new Error("clipboard unavailable");
        const natural = measureSvgNaturalSize(svg, displayScaleRef.current);
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": await svgToPngBlob(
              svg,
              natural,
              displayScaleRef.current,
            ),
          }),
        ]);
        return tRef.current("workbench.copyDetail", {
          zoom: `${Math.round(zoomRef.current * 100)}%`,
        });
      }),
    [runExport],
  );

  const handleExportPng = useCallback(
    () =>
      runExport(async (svg) => {
        const natural = measureSvgNaturalSize(svg, displayScaleRef.current);
        downloadBlob(
          await svgToPngBlob(svg, natural, EXPORT_SCALE),
          `${toFileSlug(docTitle)}.png`,
        );
        return `${toFileSlug(docTitle)}.png`;
      }),
    [docTitle, runExport],
  );

  const handleExportPdf = useCallback(
    () =>
      runExport(async (svg) => {
        const natural = measureSvgNaturalSize(svg, displayScaleRef.current);
        const canvas = await renderSvgToCanvas(
          svg,
          natural.width * EXPORT_SCALE,
          natural.height * EXPORT_SCALE,
        );
        downloadBlob(
          canvasToSinglePagePdfBlob(canvas, natural.width, natural.height),
          `${toFileSlug(docTitle)}.pdf`,
        );
        return `${toFileSlug(docTitle)}.pdf`;
      }),
    [docTitle, runExport],
  );

  return {
    zoom,
    displayScale,
    setZoom,
    zoomRef,
    exporting,
    fitView,
    ensurePlaceholderSvg,
    handleAnnotateFinish,
    handleCopyImage,
    handleExportPng,
    handleExportPdf,
  };
}
