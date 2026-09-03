"use client";

import type { ImageContent } from "@earendil-works/pi-ai";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
import { blobToImageContent } from "@/lib/agent/images";
import {
  annotatedSnapshotBlob,
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
  stageRef,
  canvasRef,
  setLeftTab,
  setPendingAnnotation,
  t,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const zoomRef = useRef(zoom);
  const tRef = useRef(t);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const getPreviewSvg = useCallback(
    () => canvasRef.current?.querySelector("svg") ?? null,
    [canvasRef],
  );

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = canvas?.querySelector("svg");
    if (!canvas || !svg) return;
    const style = window.getComputedStyle(canvas);
    const availW =
      canvas.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const availH =
      canvas.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom);
    const rect = svg.getBoundingClientRect();
    const natW = Math.max(1, rect.width / zoomRef.current);
    const natH = Math.max(1, rect.height / zoomRef.current);
    const scale = Math.min(availW / natW, availH / natH, 1);
    setZoom(Math.max(0.25, Math.round(scale * 100) / 100));
  }, [canvasRef]);

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
    (hasContent: boolean) => {
      const svg = getPreviewSvg();
      if (!hasContent || !svg) return;
      void annotatedSnapshotBlob(svg, zoomRef.current)
        .then(blobToImageContent)
        .then((content) => {
          setPendingAnnotation({
            id: crypto.randomUUID(),
            content,
            promptText: tRef.current("agent.annotatedPrompt"),
          });
          setLeftTab("assistant");
        })
        .catch(() => {
          // Export failed silently
        });
    },
    [getPreviewSvg, setLeftTab, setPendingAnnotation],
  );

  const runExport = useCallback(
    async (action: (svg: SVGSVGElement) => Promise<string>) => {
      if (exporting || status !== "done") return;
      const svg = getPreviewSvg();
      if (!svg) return;
      setExporting(true);
      try {
        await action(svg);
      } catch {
        // Export failed silently
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
        const natural = measureSvgNaturalSize(svg, zoomRef.current);
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": await svgToPngBlob(svg, natural, zoomRef.current),
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
        const natural = measureSvgNaturalSize(svg, zoomRef.current);
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
        const natural = measureSvgNaturalSize(svg, zoomRef.current);
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
