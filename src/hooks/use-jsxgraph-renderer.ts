"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
import { beginCompileLog, pushCompileLog } from "@/lib/compile-logs";
import { type Board, createBoard, JXG } from "@/lib/jsxgraph";

const DEBOUNCE_MS = 300;

interface Props {
  code: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
}

export function useJsxGraphRenderer({ code, stageRef }: Props) {
  const [status, setStatus] = useState<Status>("done");
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showAxes, setShowAxes] = useState(true);
  const boardRef = useRef<Board | null>(null);
  const lastRenderedCodeRef = useRef<string | null>(null);
  const renderSeqRef = useRef(0);
  const renderStartRef = useRef(0);
  const statusRef = useRef(status);
  const doneInfoMsRef = useRef<number | null>(null);
  const codeRef = useRef(code);
  const showAxesRef = useRef(showAxes);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    doneInfoMsRef.current = doneInfo?.ms ?? null;
  }, [doneInfo]);

  useEffect(() => {
    showAxesRef.current = showAxes;
  }, [showAxes]);

  /** Toggle visibility of axes, grid, and ticks on the live board. */
  const toggleAxes = useCallback(() => {
    setShowAxes((prev) => {
      const next = !prev;
      const board = boardRef.current;
      if (board) {
        applyAxesVisibility(board, next);
      }
      return next;
    });
  }, []);

  // Single render function — called from the debounce effect
  const renderNow = useCallback(
    (source: string) => {
      const host = stageRef.current;
      if (!host) {
        console.warn("[renderer] stageRef.current is null, skipping render");
        return;
      }

      renderStartRef.current = performance.now();
      lastRenderedCodeRef.current = source;
      renderSeqRef.current += 1;
      setDoneInfo(null);
      setStatus("rendering");
      beginCompileLog("Render started");

      // Destroy previous board
      if (boardRef.current) {
        try {
          JXG.JSXGraph.freeBoard(boardRef.current);
        } catch {
          // ignore cleanup errors
        }
        boardRef.current = null;
      }

      // Clear the container
      while (host.firstChild) {
        host.removeChild(host.firstChild);
      }

      try {
        const board = createBoard(host);
        boardRef.current = board;

        // Execute user code — the snippet receives (board, JXG)
        const fn = new Function("board", "JXG", source);
        fn(board, JXG);

        // Apply current axes visibility to newly created elements
        if (!showAxesRef.current) {
          applyAxesVisibility(board, false);
        }

        const ms = Math.max(
          1,
          Math.round(performance.now() - renderStartRef.current),
        );
        setDoneInfo({ at: Date.now(), ms });
        setStatus("done");
        pushCompileLog("info", `Rendered in ${ms}ms`);
      } catch (err) {
        console.error("[jsxgraph] render error:", err);
        const ms = Math.max(
          1,
          Math.round(performance.now() - renderStartRef.current),
        );
        setDoneInfo({ at: Date.now(), ms });
        setStatus("error");
        pushCompileLog(
          "error",
          `Render error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [stageRef],
  );

  // Debounced auto-render: fires on every code change (including mount)
  useEffect(() => {
    if (status === "rendering") {
      return;
    }
    if (code === lastRenderedCodeRef.current) {
      return;
    }
    const timer = window.setTimeout(() => renderNow(code), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [code, renderNow, status]);

  // Keep nowTick updating so "X seconds ago" refreshes
  useEffect(() => {
    if (status !== "done") {
      return;
    }
    const ticker = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [status]);

  return {
    status,
    doneInfo,
    nowTick,
    showAxes,
    renderNow,
    toggleAxes,
    lastRenderedCodeRef,
    renderSeqRef,
    boardRef,
    statusRef,
    doneInfoMsRef,
  };
}

/**
 * Show or hide all axes, grids, and ticks on the board.
 * Points, lines, curves, and other user elements stay visible.
 */
function applyAxesVisibility(board: Board, visible: boolean): void {
  const objects = board.objects as Record<
    string,
    JXG.GeometryElement & { isTick?: boolean }
  >;
  for (const key of Object.keys(objects)) {
    const el = objects[key];
    const type = el.elType;
    if (
      type === "axis" ||
      type === "axisx" ||
      type === "axisy" ||
      type === "grid"
    ) {
      if (visible) {
        el.showElement();
      } else {
        el.hideElement();
      }
    }
    // Hide ticks that belong to axes (they have isTick or are children of axes)
    if (type === "ticks" || el.isTick) {
      if (visible) {
        el.showElement();
      } else {
        el.hideElement();
      }
    }
  }
  board.update();
}
