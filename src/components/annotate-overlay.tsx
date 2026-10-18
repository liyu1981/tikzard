"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "@/components/agent/icons";

/**
 * Annotation layer.
 *
 * It is a self-contained, transparent SVG surface stacked above the rendered
 * drawing (grid < drawing < this < toolbar). Marks live in the container's own
 * pixel space — the layer always covers the whole preview edge to edge, so
 * drawing never depends on the generated TikZ svg's viewBox, zoom or internal
 * structure. The finishing step composites this surface over the drawing.
 */

const ANNOTATE_FONT_FAMILY = "cmr10";

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

/** Fixed screen-space stroke width / text size, in layer pixels. */
const STROKE_WIDTH = 2.5;
const FONT_SIZE = 16;
/** Shapes smaller than this (px) on either axis count as stray clicks. */
const MIN_SHAPE_PX = 3;

type AnnotateTool = "pen" | "text" | "rect" | "ellipse" | "arrow";

interface Pt {
  x: number;
  y: number;
}

/** Stable identity for React keys; assigned from a monotonic counter. */
interface OpBase {
  id: number;
}

interface StrokeOp extends OpBase {
  kind: "stroke";
  color: string;
  width: number;
  points: Pt[];
}

/** Drag-drawn shape between a start corner and the current pointer. */
interface ShapeOp extends OpBase {
  kind: "rect" | "ellipse" | "arrow";
  color: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TextOp extends OpBase {
  kind: "text";
  color: string;
  size: number;
  /** Anchor is the top-left of the label, in layer pixels. */
  x: number;
  y: number;
  text: string;
}

type AnnotateOp = StrokeOp | ShapeOp | TextOp;

interface TextDraft {
  /** Anchor in layer pixels (top-left of the future label). */
  x: number;
  y: number;
  size: number;
  fontPx: number;
  value: string;
}

interface AnnotateLayerProps {
  /** The preview host the layer covers and positions against. */
  mount: HTMLDivElement;
  /** `overlay` is the finished surface, for compositing onto the snapshot. */
  onFinish: (hasContent: boolean, overlay: SVGSVGElement | null) => void;
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

/** Trim float noise so serialized coordinates stay readable. */
function fx(value: number): number {
  return Number(value.toFixed(2));
}

/** Quadratic smoothing through segment midpoints softens mouse jitter. */
function strokePathD(pts: Pt[]): string {
  if (pts.length < 2) {
    return "";
  }
  let d = `M ${fx(pts[0].x)} ${fx(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${fx(pts[i].x)} ${fx(pts[i].y)} ${fx(midX)} ${fx(midY)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${fx(last.x)} ${fx(last.y)}`;
}

/** Arrow shaft plus an open V head at the drag target end, as one path. */
function arrowPathD(op: ShapeOp): string {
  const dx = op.x2 - op.x1;
  const dy = op.y2 - op.y1;
  const angle = Math.atan2(dy, dx);
  const head = Math.max(Math.hypot(dx, dy) * 0.25, op.width * 4);
  const spread = Math.PI / 7;
  return (
    `M ${fx(op.x1)} ${fx(op.y1)} L ${fx(op.x2)} ${fx(op.y2)} ` +
    `M ${fx(op.x2 - head * Math.cos(angle - spread))} ${fx(op.y2 - head * Math.sin(angle - spread))} ` +
    `L ${fx(op.x2)} ${fx(op.y2)} ` +
    `L ${fx(op.x2 - head * Math.cos(angle + spread))} ${fx(op.y2 - head * Math.sin(angle + spread))}`
  );
}

function strokeAttrs(color: string, width: number) {
  return {
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
    // Marks are display-only; every pointer event must reach the capture
    // surface underneath instead of dying on existing strokes.
    pointerEvents: "none" as const,
  };
}

function OpNode({ op }: { op: AnnotateOp }) {
  switch (op.kind) {
    case "stroke": {
      if (op.points.length === 1) {
        const p = op.points[0];
        return (
          <circle
            cx={fx(p.x)}
            cy={fx(p.y)}
            r={op.width / 2}
            fill={op.color}
            pointerEvents="none"
          />
        );
      }
      return (
        <path d={strokePathD(op.points)} {...strokeAttrs(op.color, op.width)} />
      );
    }
    case "rect":
      return (
        <rect
          x={fx(Math.min(op.x1, op.x2))}
          y={fx(Math.min(op.y1, op.y2))}
          width={fx(Math.abs(op.x2 - op.x1))}
          height={fx(Math.abs(op.y2 - op.y1))}
          {...strokeAttrs(op.color, op.width)}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={fx((op.x1 + op.x2) / 2)}
          cy={fx((op.y1 + op.y2) / 2)}
          rx={fx(Math.abs(op.x2 - op.x1) / 2)}
          ry={fx(Math.abs(op.y2 - op.y1) / 2)}
          {...strokeAttrs(op.color, op.width)}
        />
      );
    case "arrow":
      return <path d={arrowPathD(op)} {...strokeAttrs(op.color, op.width)} />;
    case "text":
      // Alphabetic baseline offset ≈0.8em reproduces the top-left anchor.
      return (
        <text
          x={fx(op.x)}
          y={fx(op.y + op.size * 0.8)}
          fill={op.color}
          fontFamily={ANNOTATE_FONT_FAMILY}
          fontSize={fx(op.size)}
          pointerEvents="none"
        >
          {op.text}
        </text>
      );
  }
}

export function AnnotateLayer({
  mount,
  onFinish,
  onCancel,
}: AnnotateLayerProps) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<AnnotateTool>("pen");
  const [color, setColor] = useState<string>(ANNOTATE_COLORS[0].value);
  const [ops, setOps] = useState<AnnotateOp[]>([]);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  /** Overlay-size in px, so the capture surface stays aligned on resize. */
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, bumpTick] = useReducer((count: number) => count + 1, 0);

  const overlayRef = useRef<SVGSVGElement>(null);
  const liveOpRef = useRef<StrokeOp | ShapeOp | null>(null);
  const draftRef = useRef<TextDraft | null>(null);
  const opsRef = useRef<AnnotateOp[]>([]);
  const nextIdRef = useRef(1);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

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

  // Track the host size so the capture surface always covers it.
  useEffect(() => {
    const read = () => {
      const rect = mount.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    read();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(read);
    observer.observe(mount);
    return () => observer.disconnect();
  }, [mount]);

  const commitDraft = useCallback(() => {
    const pending = draftRef.current;
    if (!pending) {
      return;
    }
    applyDraft(null);
    const text = pending.value.trim();
    if (text === "") {
      return;
    }
    applyOps([
      ...opsRef.current,
      {
        id: nextIdRef.current++,
        kind: "text",
        color: colorRef.current,
        size: pending.size,
        x: pending.x,
        y: pending.y,
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

  const pointFromEvent = (clientX: number, clientY: number): Pt => {
    const rect = mount.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    // Drawing surface: suppress default focus/drag behavior so opening the
    // text editor isn't undone by the browser moving focus right back out.
    event.preventDefault();
    const point = pointFromEvent(event.clientX, event.clientY);
    const active = toolRef.current;
    if (active === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      liveOpRef.current = {
        id: nextIdRef.current++,
        kind: "stroke",
        color: colorRef.current,
        width: STROKE_WIDTH,
        points: [point],
      };
      bumpTick();
      return;
    }
    if (active === "text") {
      // Claim the open editor before spawning the next one, so the old
      // input's blur can never commit or cancel the new draft.
      commitDraft();
      applyDraft({
        x: point.x,
        y: point.y,
        size: FONT_SIZE,
        fontPx: FONT_SIZE,
        value: "",
      });
      return;
    }
    // Shape tools: anchor one corner, stretch to the pointer until release.
    event.currentTarget.setPointerCapture(event.pointerId);
    liveOpRef.current = {
      id: nextIdRef.current++,
      kind: active,
      color: colorRef.current,
      width: STROKE_WIDTH,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    };
    bumpTick();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const live = liveOpRef.current;
    if (!live) {
      return;
    }
    const point = pointFromEvent(event.clientX, event.clientY);
    if (live.kind === "stroke") {
      live.points.push(point);
    } else {
      live.x2 = point.x;
      live.y2 = point.y;
    }
    bumpTick();
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
        bumpTick();
        return;
      }
    } else if (
      live.kind === "arrow" &&
      Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < MIN_SHAPE_PX
    ) {
      bumpTick();
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
        <svg
          ref={overlayRef}
          aria-hidden="true"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${fx(size.width)} ${fx(size.height)}`}
          className="absolute inset-0 z-20"
          style={{ overflow: "visible" }}
        >
          <rect
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fill="none"
            pointerEvents="all"
            style={{
              touchAction: "none",
              cursor: tool === "text" ? "text" : "crosshair",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {ops.map((op) => (
            <OpNode key={op.id} op={op} />
          ))}
          {liveOpRef.current && <OpNode op={liveOpRef.current} />}
        </svg>,
        mount,
      )}
      {draft &&
        createPortal(
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
            className="absolute z-30 rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 outline-none focus-visible:border-ring"
          />,
          mount,
        )}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
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
            onClick={() => {
              commitDraft();
              onFinish(opsRef.current.length > 0, overlayRef.current);
            }}
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
