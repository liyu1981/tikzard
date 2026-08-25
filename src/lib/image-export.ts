"use client";

/**
 * Rasterize the TikZJax-rendered preview <svg> into PNG bitmaps.
 *
 * The generated SVG typesets glyphs with <text font-family="cmr10"> nodes,
 * relying on @font-face rules served from /tikzjax/fonts.min.css. A
 * standalone SVG loaded through <img> cannot fetch external resources, so
 * every font family used by the drawing is inlined as a base64 data URI
 * before serialization — otherwise exported images lose all text.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_BASE_URL = "/tikzjax/fonts/";

/** family -> @font-face CSS with embedded data, or null when unavailable. */
const fontFaceCache = new Map<string, string | null>();

async function loadFontFaceCss(family: string): Promise<string | null> {
  if (fontFaceCache.has(family)) {
    return fontFaceCache.get(family) ?? null;
  }
  try {
    const res = await fetch(
      `${FONT_BASE_URL}${encodeURIComponent(family)}.woff2`,
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const css = `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");}`;
    fontFaceCache.set(family, css);
    return css;
  } catch {
    fontFaceCache.set(family, null);
    return null;
  }
}

function collectFontFamilies(svg: SVGSVGElement): string[] {
  const families = new Set<string>();
  for (const el of svg.querySelectorAll("[font-family]")) {
    const value = el.getAttribute("font-family");
    if (value) {
      families.add(value.trim());
    }
  }
  return [...families];
}

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
 * height attributes (TikZJax writes them in pt); falls back to the visual
 * rect divided by the current zoom.
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

  const fontCss = (
    await Promise.all(collectFontFamilies(clone).map(loadFontFaceCss))
  )
    .filter((css): css is string => css !== null)
    .join("\n");
  if (fontCss) {
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = fontCss;
    clone.insertBefore(style, clone.firstChild);
  }

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
  return slug || "tikz";
}
