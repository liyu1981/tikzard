import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, type Status } from "@/components/workbench-types";
import {
  beginCompileLog,
  installTikzConsoleCapture,
  pushCompileLog,
  setRenderFailureListener,
} from "@/lib/compile-logs";
import { withGridCalibration } from "@/lib/helper-grid";
import { ensureTikzJax } from "@/lib/tikzjax";

const AUTO_RENDER_DELAY_MS = 600;
const RENDER_TIMEOUT_MS = 45000;

interface Props {
  code: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string, options?: Record<string, unknown>) => string;
  packages: string[];
  libraries: string[];
  /** Draw the view-only helper coordinate grid under the drawing. */
  helperGrid: boolean;
}

export function useTikzRenderer({
  code,
  stageRef,
  t,
  packages,
  libraries,
  helperGrid,
}: Props) {
  const [status, setStatus] = useState<Status>("booting");
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const lastRenderedCodeRef = useRef<string | null>(null);
  const lastRenderedHelperGridRef = useRef(false);
  const lastRenderedPackagesRef = useRef<string>("");
  const lastRenderedLibrariesRef = useRef<string>("");
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
      lastRenderedHelperGridRef.current = helperGrid;
      lastRenderedPackagesRef.current = packages.join(",");
      lastRenderedLibrariesRef.current = libraries.join(",");
      renderSeqRef.current += 1;
      setDoneInfo(null);
      setStatus("rendering");
      beginCompileLog(tRef.current("workbench.logStart"));
      const el = document.createElement("script");
      el.type = "text/tikz";
      // TikZJax loads only the packages/libraries named here; the editor
      // source stays a clean tikzpicture with no \usepackage or
      // \usetikzlibrary noise.
      if (packages.length > 0) {
        el.setAttribute("data-tex-packages", packages.join(","));
      }
      if (libraries.length > 0) {
        el.setAttribute("data-tikz-libraries", libraries.join(","));
      }
      el.textContent = helperGrid ? withGridCalibration(source) : source;
      host.appendChild(el);
    },
    [stageRef, packages, libraries, helperGrid],
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
      status === "rendering"
    ) {
      return;
    }
    const packagesKey = packages.join(",");
    const librariesKey = libraries.join(",");
    // Skip only when neither the source, the helper grid, nor the
    // package/library selections changed.
    if (
      code === lastRenderedCodeRef.current &&
      helperGrid === lastRenderedHelperGridRef.current &&
      packagesKey === lastRenderedPackagesRef.current &&
      librariesKey === lastRenderedLibrariesRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => renderNow(code),
      AUTO_RENDER_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [code, packages, libraries, helperGrid, renderNow, status]);

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
