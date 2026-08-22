"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureTikzJax } from "@/lib/tikzjax";

const EXAMPLE_CODE = String.raw`\begin{tikzpicture}
  \draw[->, thick] (-0.5,0) -- (4.5,0) node[right] {$x$};
  \draw[->, thick] (0,-0.5) -- (0,3) node[above] {$y$};
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
  booting: "demo.statusBooting",
  ready: "demo.statusReady",
  rendering: "demo.statusRendering",
  done: "demo.statusDone",
  timeout: "demo.statusTimeout",
  loadError: "demo.statusLoadError",
};

const STATUS_CLASS: Record<Status, string> = {
  booting: "border border-white/10 bg-white/10 text-muted-foreground",
  ready: "border border-emerald-300/20 bg-emerald-400/15 text-emerald-300",
  rendering:
    "animate-pulse border border-amber-300/20 bg-amber-400/15 text-amber-300",
  done: "border border-emerald-300/20 bg-emerald-400/15 text-emerald-300",
  timeout: "border border-red-300/20 bg-red-400/15 text-red-300",
  loadError: "border border-red-300/20 bg-red-400/15 text-red-300",
};

export function TikzDemo() {
  const { t } = useTranslation();
  const [code, setCode] = useState(EXAMPLE_CODE);
  const [status, setStatus] = useState<Status>("booting");
  const stageRef = useRef<HTMLDivElement>(null);
  const autoRenderedRef = useRef(false);
  const renderFnRef = useRef<() => void>(() => {});

  const renderNow = useCallback((source: string) => {
    const host = stageRef.current;
    if (!host) {
      return;
    }
    host.replaceChildren();
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

  const busy = status === "booting" || status === "loadError";

  return (
    <div className="materialize grid h-[36rem] w-full grid-cols-1 gap-4 lg:h-[calc(100vh-11rem)] lg:grid-cols-2">
      <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <label htmlFor="tikz-source" className="text-sm font-medium">
          {t("demo.editorLabel")}
        </label>
        <textarea
          id="tikz-source"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="min-h-0 w-full flex-1 resize-y rounded-lg border border-border/40 bg-background/40 p-3 font-mono text-sm outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => renderNow(code)}
            className="glass-control !border-border/60 rounded-lg bg-clip-padding px-4 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("demo.render")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setCode(EXAMPLE_CODE);
              renderNow(EXAMPLE_CODE);
            }}
            className="glass-control !border-border/60 rounded-lg bg-clip-padding px-4 py-1.5 text-sm font-medium text-muted-foreground transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("demo.resetExample")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("demo.hint")}</p>
      </div>
      <div className="glass-control relative flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
        <span
          className={`absolute top-3 right-3 z-10 rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-md ${STATUS_CLASS[status]}`}
        >
          {t(STATUS_KEY[status])}
        </span>
        <p className="text-sm font-medium text-muted-foreground">
          {t("demo.previewLabel")}
        </p>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-black/10 bg-white p-4 shadow-inner">
          <div ref={stageRef} className="[&_svg]:h-auto [&_svg]:max-w-full" />
        </div>
      </div>
    </div>
  );
}
