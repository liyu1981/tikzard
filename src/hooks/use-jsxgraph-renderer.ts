"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
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
  const boardRef = useRef<Board | null>(null);
  const lastRenderedCodeRef = useRef<string | null>(null);
  const renderSeqRef = useRef(0);
  const renderStartRef = useRef(0);
  const statusRef = useRef(status);
  const doneInfoMsRef = useRef<number | null>(null);
  const codeRef = useRef(code);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    doneInfoMsRef.current = doneInfo?.ms ?? null;
  }, [doneInfo]);

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

        const ms = Math.max(
          1,
          Math.round(performance.now() - renderStartRef.current),
        );
        setDoneInfo({ at: Date.now(), ms });
        setStatus("done");
      } catch (err) {
        console.error("[jsxgraph] render error:", err);
        const ms = Math.max(
          1,
          Math.round(performance.now() - renderStartRef.current),
        );
        setDoneInfo({ at: Date.now(), ms });
        setStatus("error");
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
    renderNow,
    lastRenderedCodeRef,
    renderSeqRef,
    boardRef,
    statusRef,
    doneInfoMsRef,
  };
}
