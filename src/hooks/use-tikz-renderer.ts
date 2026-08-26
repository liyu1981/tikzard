"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, type Status } from "@/components/workbench-types";
import {
  beginCompileLog,
  installTikzConsoleCapture,
  pushCompileLog,
  setRenderFailureListener,
} from "@/lib/compile-logs";
import { ensureTikzJax } from "@/lib/tikzjax";

const AUTO_RENDER_DELAY_MS = 600;
const RENDER_TIMEOUT_MS = 45000;

interface Props {
  code: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useTikzRenderer({ code, stageRef, t }: Props) {
  const [status, setStatus] = useState<Status>("booting");
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const lastRenderedCodeRef = useRef<string | null>(null);
  const renderSeqRef = useRef(0);
  const renderStartRef = useRef(0);
  const statusRef = useRef(status);
  const doneInfoMsRef = useRef<number | null>(null);
  const tRef = useRef(t);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    doneInfoMsRef.current = doneInfo?.ms ?? null;
  }, [doneInfo]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
      beginCompileLog(tRef.current("workbench.logStart"));
      const el = document.createElement("script");
      el.type = "text/tikz";
      el.textContent = source;
      host.appendChild(el);
    },
    [stageRef],
  );

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

  useEffect(() => {
    if (
      status === "booting" ||
      status === "loadError" ||
      status === "rendering" ||
      code === lastRenderedCodeRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => renderNow(code),
      AUTO_RENDER_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [code, renderNow, status]);

  useEffect(() => {
    setRenderFailureListener(() => setStatus("timeout"));
    return () => setRenderFailureListener(null);
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
    return () => observer.disconnect();
  }, [stageRef]);

  useEffect(() => {
    if (status !== "rendering") {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus("timeout");
      pushCompileLog("error", tRef.current("workbench.logTimeout"));
    }, RENDER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

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
    statusRef,
    doneInfoMsRef,
  };
}
