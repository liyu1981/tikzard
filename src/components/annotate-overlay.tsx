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
 * Annotation layer drawn straight into the TikZJax-rendered preview <svg>:
 * freehand strokes, rectangle/ellipse/arrow shapes, and text labels become
 * real SVG nodes inside a dedicated <g data-annotation-layer> group appended
 * to the artwork svg. Marks therefore live in the artwork's own coordinate
 * system (pt user units) — they stay registered at any zoom or panel size,
 * and ride along when the svg is cloned and serialized for the annotated
 * snapshot; no compositing math is needed.
 *
 * Ops are kept in a list and re-rendered declaratively through a portal into
 * the group, which makes undo/clear trivial. A TikZ recompile replaces the
 * svg node (marks are temporary by design); the observer recreates the group
 * on the fresh node and the same ops re-appear.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Font for committed text labels. Must be one of the families vendored under
 * /tikzjax/fonts so the export rasterizer can inline it as base64 @font-face
 * (standalone SVGs loaded via <img> cannot fetch external resources).
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
  /** Stroke width in svg user units (pt), frozen at draw time. */
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
  /** Font size in svg user units (pt), frozen at creation time. */
  size: number;
  /** Anchor is the top-left of the label, in svg user units. */
  x: number;
  y: number;
  text: string;
}

type AnnotateOp = StrokeOp | ShapeOp | TextOp;

/** Shapes smaller than this (screen px) on either axis count as stray clicks. */
const MIN_SHAPE_PX = 3;

interface TextDraft {
  /** Anchor in svg user units (top-left of the future label). */
  ux: number;
  uy: number;
  /** Editor position in CSS px relative to the preview panel host. */
  x: number;
  y: number;
  /** Frozen font size in svg user units. */
  size: number;
  /** Same size in screen px, so the input previews the real rendered size. */
  fontPx: number;
  value: string;
}

interface AnnotateLayerProps {
  /** Portal target: the positioned preview panel host element. */
  mount: HTMLDivElement;
  /** Zoomed stage that contains the generated svg. */
  stage: HTMLDivElement | null;
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

/** Trim float noise so serialized coordinates stay readable. */
function fx(value: number): number {
  return Number(value.toFixed(2));
}

/** Stroke width in svg user units (pt), proportional to the artwork size. */
function strokeWidthFor(svg: SVGSVGElement): number {
  const box = svg.viewBox.baseVal;
  return Math.max(1, Math.min(box.width, box.height) / 200);
}

/** Annotation font size in svg user units (pt), proportional to artwork. */
function fontSizeFor(svg: SVGSVGElement): number {
  const box = svg.viewBox.baseVal;
  return Math.max(9, Math.round(Math.min(box.width, box.height) / 26));
}

/**
 * Screen px → svg user units via the viewBox and the visual rect.
 * getBoundingClientRect already includes CSS zoom/scroll, so this linear map
 * stays exact at any zoom without relying on getScreenCTM.
 */
function toUserPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Pt | null {
  const rect = svg.getBoundingClientRect();
  const box = svg.viewBox.baseVal;
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return null;
  }
  return {
    x: box.x + ((clientX - rect.left) * box.width) / rect.width,
    y: box.y + ((clientY - rect.top) * box.height) / rect.height,
  };
}

/** User units per screen px, for converting pixel thresholds. */
function unitsPerScreenPx(svg: SVGSVGElement): number {
  const rect = svg.getBoundingClientRect();
  return rect.width > 0 ? svg.viewBox.baseVal.width / rect.width : 1;
}

/** DOM state captured before the svg becomes the full annotation surface. */
interface SavedViewport {
  svg: SVGSVGElement;
  stage: HTMLDivElement;
  viewBox: string | null;
  width: string | null;
  height: string | null;
  preserveAspectRatio: string | null;
  svgStyle: string;
  stageStyle: string;
  originalChildren: Node[];
  artwork: SVGGElement;
  artworkWidth: number;
  artworkHeight: number;
  /** False when the typeset box was empty (fresh/failed document). */
  hasArtwork: boolean;
  originalViewBox: { x: number; y: number; width: number; height: number };
}

/**
 * The drawable area around the artwork: the preview scroll container's
 * content box (its padding/border frame is excluded because max-w-full
 * constrains the svg to that box — growing into the padding would clamp and
 * rescale the whole artwork). Falls back to the host itself.
 */
function drawableEdges(host: HTMLElement): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const el = host.firstElementChild;
  if (!(el instanceof HTMLElement)) {
    const rect = host.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  }
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const padL = parseFloat(style.paddingLeft || "0");
  const padR = parseFloat(style.paddingRight || "0");
  const padT = parseFloat(style.paddingTop || "0");
  const padB = parseFloat(style.paddingBottom || "0");
  const borL = parseFloat(style.borderLeftWidth || "0");
  const borR = parseFloat(style.borderRightWidth || "0");
  const borT = parseFloat(style.borderTopWidth || "0");
  const borB = parseFloat(style.borderBottomWidth || "0");
  return {
    left: rect.left + padL + borL,
    right: rect.right - padR - borR,
    top: rect.top + padT + borT,
    bottom: rect.bottom - padB - borB,
  };
}

/** Current CSS zoom applied to the stage, with a safe fallback. */
function stageZoom(stage: HTMLElement): number {
  const value = Number.parseFloat(window.getComputedStyle(stage).zoom);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Update the full-stage viewport and the transform that keeps the original
 * TikZ artwork centered at its original visual size.
 */
function updateAnnotationViewport(saved: SavedViewport, host: HTMLElement) {
  const { svg, stage, originalViewBox, artwork } = saved;
  const zoom = stageZoom(stage);
  const edge = drawableEdges(host);
  const availableWidth = Math.max(1, (edge.right - edge.left) / zoom);
  const availableHeight = Math.max(1, (edge.bottom - edge.top) / zoom);
  const stageWidth = Math.max(availableWidth, saved.artworkWidth);
  const stageHeight = Math.max(availableHeight, saved.artworkHeight);

  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageHeight}px`;
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${fx(stageWidth)} ${fx(stageHeight)}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.maxWidth = "none";
  svg.style.maxHeight = "none";
  if (
    !saved.hasArtwork ||
    originalViewBox.width <= 0 ||
    originalViewBox.height <= 0
  ) {
    // Nothing typeset: leave the (empty) artwork group untransformed rather
    // than writing a NaN scale from the 0/0 box mapping.
    artwork.removeAttribute("transform");
    return;
  }
  const scaleX = saved.artworkWidth / originalViewBox.width;
  const scaleY = saved.artworkHeight / originalViewBox.height;
  const offsetX = (stageWidth - saved.artworkWidth) / 2;
  const offsetY = (stageHeight - saved.artworkHeight) / 2;
  artwork.setAttribute(
    "transform",
    `translate(${fx(offsetX - originalViewBox.x * scaleX)} ${fx(offsetY - originalViewBox.y * scaleY)}) scale(${fx(scaleX)} ${fx(scaleY)})`,
  );
}

/**
 * Turn the generated root svg into a full-stage annotation surface. The
 * original rendered children are placed in a transformed artwork group, so
 * the generated TikZ coordinate system remains intact while the root viewBox
 * becomes panel-sized. A degenerate 0×0 svg (empty TikZ output for a fresh
 * document) is not an error: it becomes an empty canvas and the surface
 * grows to the whole container.
 */
function createAnnotationViewport(
  svg: SVGSVGElement,
  host: HTMLElement,
  stage: HTMLDivElement,
): SavedViewport {
  const box = svg.viewBox.baseVal;
  const svgRect = svg.getBoundingClientRect();
  const hasArtwork =
    box.width > 0 && box.height > 0 && svgRect.width > 0 && svgRect.height > 0;
  const originalChildren = Array.from(svg.childNodes);
  const artwork = document.createElementNS(SVG_NS, "g");
  artwork.setAttribute("data-tikz-artwork", "");
  for (const child of originalChildren) {
    if (
      child instanceof Element &&
      child.getAttribute("data-annotation-layer") !== null
    ) {
      continue;
    }
    if (
      child instanceof Element &&
      ["defs", "style", "title", "desc", "metadata"].includes(
        child.tagName.toLowerCase(),
      )
    ) {
      continue;
    }
    artwork.appendChild(child);
  }
  svg.appendChild(artwork);
  const saved: SavedViewport = {
    svg,
    stage,
    viewBox: svg.getAttribute("viewBox"),
    width: svg.getAttribute("width"),
    height: svg.getAttribute("height"),
    preserveAspectRatio: svg.getAttribute("preserveAspectRatio"),
    svgStyle: svg.getAttribute("style") ?? "",
    stageStyle: stage.getAttribute("style") ?? "",
    originalChildren,
    artwork,
    artworkWidth: hasArtwork ? svgRect.width / stageZoom(stage) : 0,
    artworkHeight: hasArtwork ? svgRect.height / stageZoom(stage) : 0,
    hasArtwork,
    originalViewBox: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  };
  updateAnnotationViewport(saved, host);
  return saved;
}

/** Restore the generated svg and stage to their original DOM state. */
function restoreAnnotationViewport(saved: SavedViewport): void {
  const { svg } = saved;
  while (svg.firstChild) {
    svg.firstChild.remove();
  }
  for (const child of saved.originalChildren) {
    svg.appendChild(child);
  }
  if (saved.viewBox === null) {
    svg.removeAttribute("viewBox");
  } else {
    svg.setAttribute("viewBox", saved.viewBox);
  }
  if (saved.width === null) {
    svg.removeAttribute("width");
  } else {
    svg.setAttribute("width", saved.width);
  }
  if (saved.height === null) {
    svg.removeAttribute("height");
  } else {
    svg.setAttribute("height", saved.height);
  }
  if (saved.preserveAspectRatio === null) {
    svg.removeAttribute("preserveAspectRatio");
  } else {
    svg.setAttribute("preserveAspectRatio", saved.preserveAspectRatio);
  }
  svg.setAttribute("style", saved.svgStyle);
  saved.stage.setAttribute("style", saved.stageStyle);
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
    // rect underneath instead of dying on existing strokes.
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
  stage,
  onFinish,
  onCancel,
}: AnnotateLayerProps) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<AnnotateTool>("pen");
  const [color, setColor] = useState<string>(ANNOTATE_COLORS[0].value);
  const [ops, setOps] = useState<AnnotateOp[]>([]);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const [layerG, setLayerG] = useState<SVGGElement | null>(null);
  const [, bumpTick] = useReducer((count: number) => count + 1, 0);

  const liveOpRef = useRef<StrokeOp | ShapeOp | null>(null);
  const draftRef = useRef<TextDraft | null>(null);
  const opsRef = useRef<AnnotateOp[]>([]);
  const nextIdRef = useRef(1);
  /** Original svg box attributes, captured while the artwork box is grown. */
  const savedViewportRef = useRef<SavedViewport | null>(null);
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

  // Track the live svg node across recompiles; recreate the annotation group
  // on whichever node currently holds the artwork.
  useEffect(() => {
    const resolve = () => {
      setSvgEl(mount.querySelector<SVGSVGElement>("svg"));
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(mount, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [mount]);

  useEffect(() => {
    if (!svgEl) {
      setLayerG(null);
      return;
    }
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-annotation-layer", "");
    svgEl.appendChild(g);
    setLayerG(g);
    return () => {
      g.remove();
      setLayerG(null);
    };
  }, [svgEl]);

  // Make the root svg the full annotation surface and keep the generated
  // artwork in a transformed child group. Resize changes only this temporary
  // annotation viewport; the generated svg is restored when it is removed.
  useEffect(() => {
    if (!svgEl || !stage) {
      return;
    }
    const saved = createAnnotationViewport(svgEl, mount, stage);
    savedViewportRef.current = saved;
    bumpTick();
    const resizeTarget = mount.firstElementChild;
    const observer = new ResizeObserver(() => {
      if (saved) {
        updateAnnotationViewport(saved, mount);
        bumpTick();
      }
    });
    observer.observe(mount);
    if (resizeTarget instanceof HTMLElement) {
      observer.observe(resizeTarget);
    }
    return () => {
      observer.disconnect();
      if (saved?.svg.isConnected) {
        restoreAnnotationViewport(saved);
      }
      if (savedViewportRef.current === saved) {
        savedViewportRef.current = null;
      }
    };
  }, [svgEl, mount, stage]);

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
        x: pending.ux,
        y: pending.uy,
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

  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (!svgEl) {
      return;
    }
    // Drawing surface: suppress default focus/drag behavior so opening the
    // text editor isn't undone by the browser moving focus right back out.
    event.preventDefault();
    const point = toUserPoint(svgEl, event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const active = toolRef.current;
    if (active === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      liveOpRef.current = {
        id: nextIdRef.current++,
        kind: "stroke",
        color: colorRef.current,
        width: strokeWidthFor(svgEl),
        points: [point],
      };
      bumpTick();
      return;
    }
    if (active === "text") {
      // Claim the open editor before spawning the next one, so the old
      // input's blur can never commit or cancel the new draft.
      commitDraft();
      const hostRect = mount.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect();
      const unitSize = fontSizeFor(svgEl);
      const scale = svgRect.width / svgEl.viewBox.baseVal.width;
      applyDraft({
        ux: point.x,
        uy: point.y,
        x: event.clientX - hostRect.left,
        y: event.clientY - hostRect.top,
        size: unitSize,
        fontPx: Math.max(10, unitSize * scale),
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
      width: strokeWidthFor(svgEl),
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    };
    bumpTick();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const live = liveOpRef.current;
    if (!live || !svgEl) {
      return;
    }
    const point = toUserPoint(svgEl, event.clientX, event.clientY);
    if (!point) {
      return;
    }
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
    if (!live || !svgEl) {
      return;
    }
    liveOpRef.current = null;
    const minUnits = MIN_SHAPE_PX * unitsPerScreenPx(svgEl);
    if (live.kind === "rect" || live.kind === "ellipse") {
      if (
        Math.abs(live.x2 - live.x1) < minUnits ||
        Math.abs(live.y2 - live.y1) < minUnits
      ) {
        bumpTick();
        return;
      }
    } else if (
      live.kind === "arrow" &&
      Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < minUnits
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

  const viewBox = svgEl?.viewBox.baseVal;

  return (
    <>
      {layerG &&
        viewBox &&
        createPortal(
          <>
            {/* Invisible capture surface covering the whole viewBox: it keeps
              hit-testing aligned with the artwork box at any zoom without
              tracking layout rects from HTML land. */}
            <rect
              x={viewBox.x}
              y={viewBox.y}
              width={viewBox.width}
              height={viewBox.height}
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
          </>,
          layerG,
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
            className="absolute z-20 rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 outline-none focus-visible:border-ring"
          />,
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
