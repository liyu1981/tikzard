/**
 * View-only helper coordinate grid.
 *
 * The grid is NOT drawn in TikZ (a fixed coordinate range could never fill an
 * arbitrary canvas). Instead it is an HTML/CSS layer behind the rendered svg,
 * sized to the canvas, with its cell size and origin anchored to the drawing's
 * own coordinate system.
 *
 * To recover that coordinate system from the compiled svg, two invisible
 * calibration paths are injected into the picture. They use `overlay`, so they
 * never affect the drawing's bounding box, and their screen transform yields
 * the origin and the size of one coordinate unit. The grid layer can then draw
 * integer-aligned lines that fill any canvas, at any zoom, without recompiling.
 */

const MARKER = "% tikzard-grid-calibration";

const CALIBRATION = [
  MARKER,
  "  \\draw[overlay, opacity=0] (0,0) -- (1,0);",
  "  \\draw[overlay, opacity=0] (0,0) -- (0,1);",
].join("\n");

/**
 * Inject the two calibration paths as the first commands of the user's
 * `tikzpicture`. Idempotent, and a no-op when the source is not a tikzpicture.
 */
export function withGridCalibration(source: string): string {
  if (source.includes(MARKER)) {
    return source;
  }
  const match = /\\begin\s*\{\s*tikzpicture\s*\}(\s*\[[^\]]*\])?/.exec(source);
  if (match === null) {
    return source;
  }
  const at = match.index + match[0].length;
  return `${source.slice(0, at)}\n${CALIBRATION}\n${source.slice(at)}`;
}

/** Origin and unit size of the drawing's coordinate system, in canvas px. */
export interface HelperGridMapping {
  originX: number;
  originY: number;
  /** Screen offset of one X coordinate unit (signed). */
  cellX: number;
  /** Screen offset of one Y coordinate unit (signed; negative = upward). */
  cellY: number;
  /** Size of the layer, matching the canvas's scrollable content. */
  width: number;
  height: number;
}

const PATH_RE = /M\s*(-?[\d.]+)\s+(-?[\d.]+)\s+L\s*(-?[\d.]+)\s+(-?[\d.]+)/;

function parseSegment(path: SVGPathElement): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null {
  const match = PATH_RE.exec(path.getAttribute("d") ?? "");
  return match === null
    ? null
    : { x0: +match[1], y0: +match[2], x1: +match[3], y1: +match[4] };
}

/**
 * Read the coordinate mapping from the calibration paths in the rendered svg,
 * expressed relative to the canvas's own scrollable content box.
 */
export function readHelperGridMapping(
  canvas: HTMLElement | null,
): HelperGridMapping | null {
  if (canvas === null) {
    return null;
  }
  const svg = canvas.querySelector("svg");
  if (svg === null) {
    return null;
  }
  const paths = svg.querySelectorAll("path");
  if (paths.length < 2) {
    return null;
  }
  const first = parseSegment(paths[0] as SVGPathElement);
  const second = parseSegment(paths[1] as SVGPathElement);
  const m0 = (paths[0] as SVGPathElement).getScreenCTM();
  const m1 = (paths[1] as SVGPathElement).getScreenCTM();
  if (first === null || second === null || m0 === null || m1 === null) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  // Screen px -> the visible canvas box (the grid layer sits fixed behind it).
  const toViewport = (m: DOMMatrix, x: number, y: number) => ({
    x: m.a * x + m.c * y + m.e - rect.left,
    y: m.b * x + m.d * y + m.f - rect.top,
  });
  const origin = toViewport(m0, first.x0, first.y0);
  const unitX = toViewport(m0, first.x1, first.y1);
  const unitY = toViewport(m1, second.x1, second.y1);
  const cellX = unitX.x - origin.x;
  const cellY = unitY.y - origin.y;
  if (
    !Number.isFinite(cellX) ||
    !Number.isFinite(cellY) ||
    Math.abs(cellX) < 0.01 ||
    Math.abs(cellY) < 0.01
  ) {
    return null;
  }
  return {
    originX: origin.x,
    originY: origin.y,
    cellX,
    cellY,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  };
}
