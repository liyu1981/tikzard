"use client";

import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  type HelperGridMapping,
  readHelperGridMapping,
} from "@/lib/helper-grid";

/**
 * Compute the helper-grid mapping from the rendered svg whenever the drawing
 * re-renders, the zoom changes, or the canvas resizes. Returns null while the
 * grid is off or before a drawing is available.
 */
export function useHelperGrid(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  recomputeKey: string,
  annotating: boolean,
): HelperGridMapping | null {
  const [mapping, setMapping] = useState<HelperGridMapping | null>(null);

  const compute = useCallback(() => {
    // Annotation rewrites the svg viewport, so keep the last good mapping.
    if (annotating) {
      return;
    }
    setMapping(active ? readHelperGridMapping(canvasRef.current) : null);
  }, [active, annotating, canvasRef]);

  useEffect(() => {
    // `recomputeKey` (render/zoom signature) intentionally forces a re-read.
    void recomputeKey;
    if (!active) {
      setMapping(null);
      return;
    }
    const raf = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(raf);
  }, [active, recomputeKey, compute]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(compute);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active, canvasRef, compute]);

  // The grid layer is fixed behind the scroll container, so re-anchor it to the
  // drawing as the canvas scrolls.
  useEffect(() => {
    if (!active) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const onScroll = () => {
      requestAnimationFrame(compute);
    };
    canvas.addEventListener("scroll", onScroll, { passive: true });
    return () => canvas.removeEventListener("scroll", onScroll);
  }, [active, canvasRef, compute]);

  return mapping;
}
