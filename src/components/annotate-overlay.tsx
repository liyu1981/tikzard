"use client";

import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "@/components/agent/icons";

/**
 * Transparent annotation layer for the preview picture: freehand strokes,
 * rectangle/ellipse/arrow shapes, and text labels drawn on a canvas covering
 * the whole preview panel.
 *
 * The drawing surface is portaled into the preview panel host so it stays
 * fixed over the visible picture area; at compose time only the region
 * aligned with the svg's on-screen box is transferred onto the exported
 * picture. Ops are kept in a list and fully redrawn on change, which makes
 * undo/clear trivial and resize-safe.
 */

/** Marker palette offered in the toolbar (contrast-safe on white previews). */
const ANNOTATE_COLORS = [
  { key: "red", value: "#e11d48" },
  { key: "orange", value: "#f97316" },
  { key: "green", value: "#22c55e" },
  { key: "blue", value: "#3b82f6" },
  { key: "purple", value: "#a855f7" },
  { key: "pink", value: "#ec4899" },
  { key: "black", value: "#171717" },
] as const;

type AnnotateTool = "pen" | "text" | "rect" | "ellipse" | "arrow";

interface StrokeOp {
  kind: "stroke";
  color: string;
  points: { x: number; y: number }[];
}

/** Drag-drawn shape between a start corner and the current pointer. */
interface ShapeOp {
  kind: "rect" | "ellipse" | "arrow";
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TextOp {
  kind: "text";
  color: string;
  x: number;
  y: number;
  text: string;
}

type AnnotateOp = StrokeOp | ShapeOp | TextOp;

/** Shapes smaller than this (device px) on either axis count as stray clicks. */
const MIN_SHAPE_PX = 3;

interface TextDraft {
  /** Position in CSS px relative to the overlay wrapper. */
  x: number;
  y: number;
  /** Committed font size in CSS px, so the input previews the real size. */
  fontPx: number;
  value: string;
}

interface AnnotateLayerProps {
  /** Portal target: the positioned preview panel host element. */
  mount: HTMLDivElement;
  /** Out-param so the parent can composite the overlay onto the SVG. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onFinish: (hasContent: boolean) => void;
  onCancel: () => void;
}

function TypeIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </svg>
  );
}

function UndoIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

function RectangleIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}

function EllipseIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function ArrowUpRightIcon(props: React.ComponentProps<"svg">) {
  return (
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
      {...props}
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

/** Stroke width in device px, proportional to the artwork size. */
function lineWidthFor(canvas: HTMLCanvasElement): number {
  return Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 220));
}

/** Annotation font size in device px, proportional to the artwork size. */
function fontSizeFor(canvas: HTMLCanvasElement): number {
  return Math.max(14, Math.round(Math.min(canvas.width, canvas.height) / 30));
}

export function AnnotateLayer({
  mount,
  canvasRef,
  onFinish,
  onCancel,
}: AnnotateLayerProps) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<AnnotateTool>("pen");
  const [color, setColor] = useState<string>(ANNOTATE_COLORS[0].value);
  const [ops, setOps] = useState<AnnotateOp[]>([]);
  const [draft, setDraft] = useState<TextDraft | null>(null);

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveOpRef = useRef<AnnotateOp | null>(null);
  const draftRef = useRef<TextDraft | null>(null);
  const opsRef = useRef<AnnotateOp[]>([]);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      localCanvasRef.current = el;
      canvasRef.current = el;
    },
    [canvasRef],
  );

  const applyOps = useCallback((next: AnnotateOp[]) => {
    opsRef.current = next;
    setOps(next);
  }, []);

  // The ref is the authoritative draft (claimed/read from event handlers
  // that race with focus changes); state mirrors it purely for rendering.
  const applyDraft = useCallback((next: TextDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const redraw = useCallback(() => {
    const canvas = localCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lw = lineWidthFor(canvas);
    const fs = fontSizeFor(canvas);
    const draw = (op: AnnotateOp) => {
      if (op.kind === "text") {
        ctx.fillStyle = op.color;
        ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(op.text, op.x, op.y);
        return;
      }
      ctx.strokeStyle = op.color;
      ctx.fillStyle = op.color;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (op.kind !== "stroke") {
        const dx = op.x2 - op.x1;
        const dy = op.y2 - op.y1;
        if (op.kind === "rect") {
          ctx.strokeRect(
            Math.min(op.x1, op.x2),
            Math.min(op.y1, op.y2),
            Math.abs(dx),
            Math.abs(dy),
          );
          return;
        }
        if (op.kind === "ellipse") {
          ctx.beginPath();
          ctx.ellipse(
            op.x1 + dx / 2,
            op.y1 + dy / 2,
            Math.abs(dx) / 2,
            Math.abs(dy) / 2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          return;
        }
        // Arrow: shaft plus a V head at the drag target end.
        const angle = Math.atan2(dy, dx);
        const head = Math.max(Math.hypot(dx, dy) * 0.25, lw * 4);
        const spread = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.moveTo(
          op.x2 - head * Math.cos(angle - spread),
          op.y2 - head * Math.sin(angle - spread),
        );
        ctx.lineTo(op.x2, op.y2);
        ctx.lineTo(
          op.x2 - head * Math.cos(angle + spread),
          op.y2 - head * Math.sin(angle + spread),
        );
        ctx.stroke();
        return;
      }
      const pts = op.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, lw / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Quadratic smoothing through segment midpoints softens mouse jitter.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i += 1) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    };
    for (const op of ops) {
      draw(op);
    }
    if (liveOpRef.current) {
      draw(liveOpRef.current);
    }
  }, [ops]);

  // Keep the backing store matched to the laid-out size (device-pixel sharp)
  // whenever zoom, layout, or the underlying render changes the box.
  useLayoutEffect(() => {
    const canvas = localCanvasRef.current;
    if (!canvas) {
      return;
    }
    const sync = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [redraw]);

  const commitDraft = useCallback(() => {
    const pending = draftRef.current;
    if (!pending) {
      return;
    }
    applyDraft(null);
    const text = pending.value.trim();
    const canvas = localCanvasRef.current;
    if (text === "" || !canvas) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    applyOps([
      ...opsRef.current,
      {
        kind: "text",
        color: colorRef.current,
        x: pending.x * dpr,
        y: pending.y * dpr,
        text,
      },
    ]);
  }, [applyDraft, applyOps]);

  // Escape closes the text editor first; otherwise it leaves annotate mode.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (draftRef.current) {
        applyDraft(null);
        return;
      }
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [applyDraft, onCancel]);

  const toCanvasPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    // Drawing surface: suppress default focus/drag behavior so opening the
    // text editor isn't undone by the browser moving focus right back out.
    event.preventDefault();
    const point = toCanvasPoint(event);
    const active = toolRef.current;
    if (active === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      liveOpRef.current = {
        kind: "stroke",
        color: colorRef.current,
        points: [point],
      };
      return;
    }
    if (active === "text") {
      // Claim the open editor before spawning the next one, so the old
      // input's blur can never commit or cancel the new draft.
      commitDraft();
      const wrapperRect = mount.getBoundingClientRect();
      const canvas = localCanvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      const fontPx = canvas ? Math.max(10, fontSizeFor(canvas) / dpr) : 14;
      applyDraft({
        x: event.clientX - wrapperRect.left,
        y: event.clientY - wrapperRect.top,
        fontPx,
        value: "",
      });
      return;
    }
    // Shape tools: anchor one corner, stretch to the pointer until release.
    event.currentTarget.setPointerCapture(event.pointerId);
    liveOpRef.current = {
      kind: active,
      color: colorRef.current,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const live = liveOpRef.current;
    if (!live) {
      return;
    }
    const point = toCanvasPoint(event);
    if (live.kind === "stroke") {
      live.points.push(point);
    } else if (live.kind !== "text") {
      live.x2 = point.x;
      live.y2 = point.y;
    }
    redraw();
  };

  const handlePointerUp = () => {
    const live = liveOpRef.current;
    if (!live) {
      return;
    }
    liveOpRef.current = null;
    if (live.kind === "rect" || live.kind === "ellipse") {
      if (
        Math.abs(live.x2 - live.x1) < MIN_SHAPE_PX ||
        Math.abs(live.y2 - live.y1) < MIN_SHAPE_PX
      ) {
        redraw();
        return;
      }
    } else if (
      live.kind === "arrow" &&
      Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < MIN_SHAPE_PX
    ) {
      redraw();
      return;
    }
    applyOps([...opsRef.current, live]);
  };

  // Keep the freshly opened editor focused; stable identity so the 1 Hz
  // workbench re-render doesn't detach/reattach it every tick.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);

  const empty = ops.length === 0;
  const iconBtn =
    "rounded-full p-1.5 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40";
  const activeBtn =
    "rounded-full bg-primary/15 p-1.5 text-primary transition duration-150 active:scale-[0.95]";
  const divider = <div className="mx-0.5 h-5 w-px bg-border/70" />;

  return (
    <>
      {createPortal(
        <>
          <canvas
            ref={setCanvas}
            style={{
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
            }}
            className={`absolute inset-0 z-10 touch-none select-none ${
              tool === "text" ? "cursor-text" : "cursor-crosshair"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {draft && (
            <input
              ref={focusOnMount}
              value={draft.value}
              onChange={(event) => {
                const current = draftRef.current;
                if (current) {
                  applyDraft({ ...current, value: event.target.value });
                }
              }}
              onBlur={() => {
                // Only this input's own draft may be committed by its blur;
                // a stale blur after a swap must not touch the new editor.
                if (draftRef.current === draft) {
                  commitDraft();
                }
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDraft();
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  applyDraft(null);
                }
              }}
              placeholder={t("workbench.annotatePlaceholder")}
              aria-label={t("workbench.annotateText")}
              style={{
                left: draft.x,
                top: draft.y,
                fontSize: `${draft.fontPx}px`,
                minWidth: "5rem",
              }}
              className="absolute z-20 rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 outline-none focus-visible:border-ring"
            />
          )}
        </>,
        mount,
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="glass-control pointer-events-auto flex items-center gap-0.5 rounded-full bg-clip-padding p-1.5 shadow-lg">
          <button
            type="button"
            aria-label={t("workbench.annotatePen")}
            aria-pressed={tool === "pen"}
            title={t("workbench.annotatePen")}
            onClick={() => setTool("pen")}
            className={tool === "pen" ? activeBtn : iconBtn}
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workbench.annotateText")}
            aria-pressed={tool === "text"}
            title={t("workbench.annotateText")}
            onClick={() => setTool("text")}
            className={tool === "text" ? activeBtn : iconBtn}
          >
            <TypeIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workbench.annotateRect")}
            aria-pressed={tool === "rect"}
            title={t("workbench.annotateRect")}
            onClick={() => setTool("rect")}
            className={tool === "rect" ? activeBtn : iconBtn}
          >
            <RectangleIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workbench.annotateEllipse")}
            aria-pressed={tool === "ellipse"}
            title={t("workbench.annotateEllipse")}
            onClick={() => setTool("ellipse")}
            className={tool === "ellipse" ? activeBtn : iconBtn}
          >
            <EllipseIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workbench.annotateArrow")}
            aria-pressed={tool === "arrow"}
            title={t("workbench.annotateArrow")}
            onClick={() => setTool("arrow")}
            className={tool === "arrow" ? activeBtn : iconBtn}
          >
            <ArrowUpRightIcon className="size-3.5" />
          </button>
          {divider}
          {ANNOTATE_COLORS.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              aria-label={t(`workbench.color.${swatch.key}`)}
              aria-pressed={color === swatch.value}
              title={t(`workbench.color.${swatch.key}`)}
              onClick={() => setColor(swatch.value)}
              className={`size-5 shrink-0 rounded-full border border-black/10 shadow-sm transition duration-150 hover:scale-110 active:scale-95 ${
                color === swatch.value
                  ? "ring-2 ring-ring ring-offset-1 ring-offset-background/60"
                  : ""
              }`}
              style={{ backgroundColor: swatch.value }}
            />
          ))}
          {divider}
          <button
            type="button"
            aria-label={t("workbench.annotateUndo")}
            title={t("workbench.annotateUndo")}
            disabled={empty}
            onClick={() => applyOps(opsRef.current.slice(0, -1))}
            className={iconBtn}
          >
            <UndoIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("workbench.annotateClear")}
            title={t("workbench.annotateClear")}
            disabled={empty}
            onClick={() => applyOps([])}
            className={iconBtn}
          >
            <TrashIcon className="size-3.5" />
          </button>
          {divider}
          <button
            type="button"
            aria-label={t("workbench.annotateCancel")}
            title={t("workbench.annotateCancel")}
            onClick={onCancel}
            className={iconBtn}
          >
            <XIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onFinish(opsRef.current.length > 0)}
            className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:brightness-[1.06] active:brightness-95"
          >
            <CheckIcon className="size-3.5" />
            {t("workbench.annotateFinish")}
          </button>
        </div>
      </div>
    </>
  );
}
