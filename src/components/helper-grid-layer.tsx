"use client";

import type { HelperGridMapping } from "@/lib/helper-grid";

const GRID_LINE = "rgba(0, 0, 0, 0.28)";
const AXIS_LINE = "rgba(0, 0, 0, 0.72)";
const TICK_LINE = "rgba(0, 0, 0, 0.5)";
const LABEL_COLOR = "rgba(0, 0, 0, 0.58)";
const LABEL_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** Minimum screen gap between numeric labels; ticks still show every integer. */
const MIN_LABEL_GAP = 44;
/** Guard against a zoomed-out canvas producing thousands of tick nodes. */
const MAX_TICKS = 300;
const PATTERN_ID = "tikzard-helper-grid";

function axisTicks(origin: number, cell: number, extent: number) {
  const a = (0 - origin) / cell;
  const b = (extent - origin) / cell;
  const min = Math.floor(Math.min(a, b));
  const max = Math.ceil(Math.max(a, b));
  const ticks: { n: number; pos: number }[] = [];
  for (let n = min; n <= max && ticks.length < MAX_TICKS; n += 1) {
    ticks.push({ n, pos: origin + n * cell });
  }
  return ticks;
}

/**
 * The helper grid drawn as one SVG layer behind the rendered drawing:
 * graph-paper lines filling the canvas, axes through the drawing's origin, and
 * integer ticks/labels. Rendered as a single element so it paints atomically,
 * and sized to the container so it always fills it.
 */
export function HelperGridLayer({ mapping }: { mapping: HelperGridMapping }) {
  const { originX, originY, cellX, cellY, width, height } = mapping;
  const absX = Math.abs(cellX);
  const absY = Math.abs(cellY);
  const stepX = Math.max(1, Math.ceil(MIN_LABEL_GAP / absX));
  const stepY = Math.max(1, Math.ceil(MIN_LABEL_GAP / absY));
  const xTicks = axisTicks(originX, cellX, width);
  const yTicks = axisTicks(originY, cellY, height);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      width="100%"
      height="100%"
    >
      <defs>
        <pattern
          id={PATTERN_ID}
          x={originX}
          y={originY}
          width={absX}
          height={absY}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M 0 0 L ${absX} 0 M 0 0 L 0 ${absY}`}
            fill="none"
            stroke={GRID_LINE}
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        fill={`url(#${PATTERN_ID})`}
      />
      <line
        x1={0}
        y1={originY}
        x2={width}
        y2={originY}
        stroke={AXIS_LINE}
        strokeWidth={1}
      />
      <line
        x1={originX}
        y1={0}
        x2={originX}
        y2={height}
        stroke={AXIS_LINE}
        strokeWidth={1}
      />
      {xTicks.map(({ n, pos }) =>
        n === 0 ? null : (
          <g key={`x${n}`}>
            <line
              x1={pos}
              y1={originY - 3}
              x2={pos}
              y2={originY + 3}
              stroke={TICK_LINE}
              strokeWidth={1}
            />
            {n % stepX === 0 && (
              <text
                x={pos}
                y={originY + 6}
                textAnchor="middle"
                dominantBaseline="hanging"
                fontFamily={LABEL_FONT}
                fontSize={10}
                fill={LABEL_COLOR}
              >
                {n}
              </text>
            )}
          </g>
        ),
      )}
      {yTicks.map(({ n, pos }) =>
        n === 0 ? null : (
          <g key={`y${n}`}>
            <line
              x1={originX - 3}
              y1={pos}
              x2={originX + 3}
              y2={pos}
              stroke={TICK_LINE}
              strokeWidth={1}
            />
            {n % stepY === 0 && (
              <text
                x={originX - 6}
                y={pos}
                textAnchor="end"
                dominantBaseline="middle"
                fontFamily={LABEL_FONT}
                fontSize={10}
                fill={LABEL_COLOR}
              >
                {n}
              </text>
            )}
          </g>
        ),
      )}
      <circle cx={originX} cy={originY} r={2} fill={AXIS_LINE} />
    </svg>
  );
}
