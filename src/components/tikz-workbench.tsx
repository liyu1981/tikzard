"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TikzEditor } from "@/components/tikz-editor";
import { ensureTikzJax } from "@/lib/tikzjax";

const EXAMPLE_CODE = String.raw`\begin{tikzpicture}
  % draw x axis with arrow tip, labeled $x$
  \draw[->, thick] (-0.5,0) -- (4.5,0) node[right] {$x$};
  % draw y axis with arrow tip, labeled $y$
  \draw[->, thick] (0,-0.5) -- (0,3) node[above] {$y$};
  % draw the parabola y = x^2 / 4 for x in [0, 3]
  \draw[domain=0:3, smooth, thick, blue!70!black]
    plot ({\x}, {0.25*\x*\x});
\end{tikzpicture}`;

type Status =
  | "booting"
  | "ready"
  | "rendering"
  | "done"
  | "timeout"
  | "loadError";

const STATUS_KEY: Record<Status, string> = {
  booting: "workbench.statusBooting",
  ready: "workbench.statusReady",
  rendering: "workbench.statusRendering",
  done: "workbench.statusDone",
  timeout: "workbench.statusTimeout",
  loadError: "workbench.statusLoadError",
};

const STATUS_DOT: Record<Status, string> = {
  booting: "bg-neutral-400",
  ready: "bg-emerald-500",
  rendering: "animate-pulse bg-amber-500",
  done: "bg-emerald-500",
  timeout: "bg-red-500",
  loadError: "bg-red-500",
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function TikzWorkbench() {
  const { t } = useTranslation();
  const [code, setCode] = useState(EXAMPLE_CODE);
  const [status, setStatus] = useState<Status>("booting");
  const [zoom, setZoom] = useState(1);
  const [doneInfo, setDoneInfo] = useState<{ at: number; ms: number } | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const autoRenderedRef = useRef(false);
  const renderFnRef = useRef<() => void>(() => {});
  const renderStartRef = useRef(0);

  // Scale the drawing to fully fit the visible canvas (never upscales).
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = canvas?.querySelector("svg");
    if (!canvas || !svg) {
      return;
    }
    const style = window.getComputedStyle(canvas);
    const availW =
      canvas.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const availH =
      canvas.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom);
    // getBoundingClientRect is in visual px, i.e. layout size multiplied by
    // the current zoom — divide it back out to get the natural size.
    const rect = svg.getBoundingClientRect();
    const natW = Math.max(1, rect.width / zoom);
    const natH = Math.max(1, rect.height / zoom);
    const scale = Math.min(availW / natW, availH / natH, 1);
    setZoom(Math.max(0.25, Math.round(scale * 100) / 100));
  }, [zoom]);

  const renderNow = useCallback((source: string) => {
    const host = stageRef.current;
    if (!host) {
      return;
    }
    host.replaceChildren();
    renderStartRef.current = performance.now();
    setDoneInfo(null);
    setStatus("rendering");
    const el = document.createElement("script");
    el.type = "text/tikz";
    el.textContent = source;
    host.appendChild(el);
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureTikzJax()
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("loadError");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    renderFnRef.current = () => renderNow(code);
  }, [code, renderNow]);

  useEffect(() => {
    if (status !== "ready" || autoRenderedRef.current) {
      return;
    }
    autoRenderedRef.current = true;
    renderFnRef.current();
  }, [status]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (host.querySelector("svg")) {
        setDoneInfo({
          at: Date.now(),
          ms: Math.max(
            1,
            Math.round(performance.now() - renderStartRef.current),
          ),
        });
        setStatus("done");
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (status !== "rendering") {
      return;
    }
    const timer = window.setTimeout(() => setStatus("timeout"), 45000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "done") {
      return;
    }
    const ticker = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      window.clearInterval(ticker);
    };
  }, [status]);

  const busy = status === "booting" || status === "loadError";

  const relativeRenderedAt = (() => {
    if (!doneInfo) {
      return null;
    }
    const seconds = Math.max(0, Math.floor((nowTick - doneInfo.at) / 1000));
    if (seconds < 10) {
      return t("workbench.justNow");
    }
    if (seconds < 60) {
      return t("workbench.secondsAgo", { count: seconds });
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return t("workbench.minutesAgo", { count: minutes });
    }
    return t("workbench.hoursAgo", { count: Math.floor(minutes / 60) });
  })();

  return (
    <div className="materialize grid h-[36rem] w-full grid-cols-1 gap-4 lg:h-[calc(100vh-11rem)] lg:grid-cols-2">
      <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <div className="flex h-8 shrink-0 items-center">
          <label htmlFor="tikz-source" className="text-sm font-medium">
            {t("workbench.editorLabel")}
          </label>
        </div>
        <TikzEditor value={code} onChange={setCode} />
        <div className="flex h-9 shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => renderNow(code)}
              className="glass-control !border-border/60 rounded-lg bg-clip-padding px-4 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workbench.render")}
            </button>
          </div>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {t("workbench.hint")}
          </p>
        </div>
      </div>
      <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <div className="flex h-8 shrink-0 items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            {t("workbench.previewLabel")}
          </p>
          <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white/85 p-0.5 shadow-sm backdrop-blur-md">
            <button
              type="button"
              aria-label={t("workbench.zoomFit")}
              title={t("workbench.zoomFit")}
              onClick={fitView}
              className="rounded-full p-1.5 text-neutral-600 transition duration-150 hover:bg-neutral-500/10 hover:text-neutral-900 active:scale-[0.95]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t("workbench.zoomOut")}
              title={t("workbench.zoomOut")}
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              className="rounded-full p-1.5 text-neutral-600 transition duration-150 hover:bg-neutral-500/10 hover:text-neutral-900 active:scale-[0.95]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t("workbench.zoomReset")}
              title={t("workbench.zoomReset")}
              onClick={() => setZoom(1)}
              className="min-w-12 rounded-full px-2 py-1 text-center font-mono text-xs tabular-nums text-neutral-700 transition duration-150 hover:bg-neutral-500/10 hover:text-neutral-900 active:scale-[0.95]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label={t("workbench.zoomIn")}
              title={t("workbench.zoomIn")}
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
              className="rounded-full p-1.5 text-neutral-600 transition duration-150 hover:bg-neutral-500/10 hover:text-neutral-900 active:scale-[0.95]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-black/10 bg-white p-4 shadow-inner"
        >
          <div
            ref={stageRef}
            style={{ zoom }}
            className={
              zoom > 1 ? "[&_svg]:h-auto" : "[&_svg]:h-auto [&_svg]:max-w-full"
            }
          />
        </div>
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
            />
            {t(STATUS_KEY[status])}
          </span>
          {status === "done" && doneInfo && (
            <span className="truncate text-muted-foreground tabular-nums">
              {t("workbench.compileTime", {
                time: formatDuration(doneInfo.ms),
              })}
              {" · "}
              {relativeRenderedAt}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
