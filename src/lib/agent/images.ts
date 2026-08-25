"use client";

/**
 * Client-side intake for images attached to agent chat messages: validate,
 * optionally downscale huge uploads, and produce pi-ai `ImageContent` blocks
 * (base64) that ride along with `Agent.prompt(text, images)`.
 */

import type { ImageContent } from "@earendil-works/pi-ai";

/** Images allowed per single message. */
export const MAX_ATTACHMENT_IMAGES = 4;

/** Hard ceiling on one uploaded file, pre-resize. */
export const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024;

/**
 * Fixed vision-token cost assumed per attached image when estimating the
 * conversation's context usage (close to what major vision APIs charge for
 * a mid-sized image; exact pixel-based pricing varies per provider).
 */
export const IMAGE_TOKEN_ESTIMATE = 1100;

/** Longest allowed side after downscale (matches common vision-API sweet spot). */
const MAX_IMAGE_DIMENSION = 1568;

/** Files up to this size pass through untouched when no resize is needed. */
const PASS_THROUGH_MAX_BYTES = 4 * 1024 * 1024;

/** Re-encoded results above this fall back to flattening onto white. */
const ENCODED_MAX_BYTES = 4 * 1024 * 1024;

const JPEG_QUALITY = 0.9;

const SUPPORTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type ImageLoadFailure = "unsupportedType" | "tooLarge" | "decodeFailed";

export type ImageLoadResult =
  | { ok: true; content: ImageContent }
  | { ok: false; reason: ImageLoadFailure };

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_TYPES.has(type);
}

/** Data URL for rendering an ImageContent block (thumbnails, full view). */
export function imageContentToDataUrl(content: ImageContent): string {
  return `data:${content.mimeType};base64,${content.data}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function blobToContent(
  blob: Blob,
  fallbackMime: string,
): Promise<ImageContent> {
  return {
    type: "image",
    mimeType: blob.type || fallbackMime,
    data: await blobToBase64(blob),
  };
}

function renderToBlob(
  bitmap: ImageBitmap,
  scale: number,
  flatten: boolean,
  type: string,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return Promise.resolve(null);
  }
  if (flatten) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, JPEG_QUALITY);
  });
}

/**
 * Turn a picked/pasted/dropped file into an ImageContent block. Large or
 * high-resolution sources are downscaled to MAX_IMAGE_DIMENSION and
 * re-encoded; small-enough files pass through byte-for-byte so GIF
 * animation and exact pixels survive.
 */
export async function fileToImageContent(file: File): Promise<ImageLoadResult> {
  if (!isSupportedImageType(file.type)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "decodeFailed" };
  }
  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    if (scale === 1 && file.size <= PASS_THROUGH_MAX_BYTES) {
      bitmap.close();
      return { ok: true, content: await blobToContent(file, file.type) };
    }
    // Preserve alpha for formats that commonly carry it; JPEG gets a white
    // matte because transparency renders black when flattened.
    const lossless = file.type === "image/png" || file.type === "image/gif";
    let blob = await renderToBlob(
      bitmap,
      scale,
      !lossless,
      lossless ? "image/png" : "image/jpeg",
    );
    if (lossless && blob !== null && blob.size > ENCODED_MAX_BYTES) {
      blob = await renderToBlob(bitmap, scale, true, "image/jpeg");
    }
    if (blob === null) {
      return { ok: false, reason: "decodeFailed" };
    }
    return { ok: true, content: await blobToContent(blob, file.type) };
  } finally {
    bitmap.close();
  }
}

/** Turn an in-memory blob (e.g. a composed annotated snapshot) into a
    base64 ImageContent block for the composer. */
export async function blobToImageContent(blob: Blob): Promise<ImageContent> {
  return blobToContent(blob, "image/png");
}

/** True when the model catalog entry accepts image input. */
export function supportsImageInput(model: {
  input?: readonly string[];
}): boolean {
  return Array.isArray(model.input) && model.input.includes("image");
}
