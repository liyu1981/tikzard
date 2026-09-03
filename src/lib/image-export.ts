"use client";

/**
 * Rasterize the JSXGraph-rendered preview <svg> into PNG bitmaps.
 *
 * Unlike the old TikZ pipeline, JSXGraph renders standard SVG with web fonts
 * — no special font inlining is needed for export.
 */

function parseLengthPx(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/.exec(value);
  if (!match) {
    return null;
  }
  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return match[2] === "pt" ? (n * 96) / 72 : n;
}

/**
 * Intrinsic CSS-pixel size of the drawing. Prefers the svg's own width and
 * height attributes; falls back to the visual rect divided by the current zoom.
 */
export function measureSvgNaturalSize(
  svg: SVGSVGElement,
  zoom: number,
): { width: number; height: number } {
  const w = parseLengthPx(svg.getAttribute("width"));
  const h = parseLengthPx(svg.getAttribute("height"));
  if (w !== null && h !== null) {
    return { width: w, height: h };
  }
  // getBoundingClientRect is in visual px, i.e. layout size × zoom.
  const factor = zoom > 0 ? zoom : 1;
  const rect = svg.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width / factor),
    height: Math.max(1, rect.height / factor),
  };
}

/**
 * Draw the svg into an offscreen canvas at device resolution
 * pixelWidth × pixelHeight on an opaque white background (matching the
 * light-scheme preview canvas).
 */
export async function renderSvgToCanvas(
  svg: SVGSVGElement,
  pixelWidth: number,
  pixelHeight: number,
): Promise<HTMLCanvasElement> {
  const width = Math.max(1, Math.round(pixelWidth));
  const height = Math.max(1, Math.round(pixelHeight));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const xml = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener(
        "error",
        () => reject(new Error("svg decode failed")),
        {
          once: true,
        },
      );
      img.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas 2d context unavailable");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG encoding failed"));
      }
    }, "image/png");
  });
}

export async function svgToPngBlob(
  svg: SVGSVGElement,
  naturalSize: { width: number; height: number },
  scale: number,
): Promise<Blob> {
  const canvas = await renderSvgToCanvas(
    svg,
    naturalSize.width * scale,
    naturalSize.height * scale,
  );
  return canvasToPngBlob(canvas);
}

/** Longest side allowed for an annotated snapshot attached to the assistant. */
export const ANNOTATION_MAX_PX = 1568;

/**
 * Rasterize the live preview <svg> — including its <g data-annotation-layer>
 * marks, which live inside the artwork's own coordinate system — into one
 * downscaled PNG blob for the assistant.
 */
export async function annotatedSnapshotBlob(
  svg: SVGSVGElement,
  zoom: number,
  maxPx: number = ANNOTATION_MAX_PX,
): Promise<Blob> {
  const natural = measureSvgNaturalSize(svg, zoom);
  const scale = Math.min(1, maxPx / Math.max(natural.width, natural.height));
  return svgToPngBlob(svg, natural, scale);
}

/** Trigger a browser download for a blob built in-memory. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Document title → safe file stem, e.g. "Phase Diagram" → "phase-diagram". */
export function toFileSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "jsxgraph";
}
