"use client";

import { zlibSync } from "fflate";

/**
 * Minimal single-page PDF writer: embeds an RGBA canvas as a Flate-compressed
 * DeviceRGB image XObject on a page sized to the drawing (1 CSS px = 0.75 pt).
 * No dependencies beyond fflate, keeping exports fully offline.
 */

const PT_PER_PX = 72 / 96;

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function rgbaToRgb(pixels: Uint8ClampedArray): Uint8Array {
  const rgb = new Uint8Array((pixels.length / 4) * 3);
  let out = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    rgb[out++] = pixels[i];
    rgb[out++] = pixels[i + 1];
    rgb[out++] = pixels[i + 2];
  }
  return rgb;
}

/**
 * Build a PDF whose only page shows `canvas` at its natural size.
 * `cssWidth`/`cssHeight` are the unzoomed CSS-pixel dimensions of the
 * drawing; the canvas may be rasterized at any multiple of them.
 */
export function canvasToSinglePagePdfBlob(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): Blob {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas 2d context unavailable");
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // /FlateDecode expects the zlib-wrapped DEFLATE format (RFC 1950).
  const imageStream = zlibSync(rgbaToRgb(data), { level: 6 });

  const pageWidthPt = cssWidth * PT_PER_PX;
  const pageHeightPt = cssHeight * PT_PER_PX;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? latin1Bytes(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObj = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObj(2);
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  beginObj(3);
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(pageWidthPt)} ${formatNumber(pageHeightPt)}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  beginObj(4);
  push(
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageStream.length} >>\nstream\n`,
  );
  push(imageStream);
  push("\nendstream\nendobj\n");

  beginObj(5);
  const content = `q\n${formatNumber(pageWidthPt)} 0 0 ${formatNumber(pageHeightPt)} 0 0 cm\n/Im0 Do\nQ\n`;
  push(
    `<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
  );

  const xrefStart = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id++) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
