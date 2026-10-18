"use client";

/**
 * View-only helper coordinate grid for the preview.
 *
 * The grid is injected as the first layer inside the user's own
 * `tikzpicture` and therefore shares its coordinate system and scaling: its
 * origin is exactly the user's `(0,0)`, and its marks are labelled in the
 * user's coordinate values. It is applied only at render time — never written
 * back to the editor, versions, or the assistant's tools.
 *
 * The grid is native TikZ (\draw grid, nodes, ticks) with no extra packages
 * or libraries, so it compiles anywhere the user's own document does.
 */

const MARKER = "% tikzard-helper-grid";

/** Half-extent of the helper grid, in the document's own coordinate units. */
const X_MIN = -6;
const X_MAX = 6;
const Y_MIN = -4;
const Y_MAX = 4;

function buildGridTex(): string {
  const lines: string[] = [MARKER, "\\begin{scope}"];
  // Graph paper: one line per coordinate unit, light so it stays behind the
  // drawing but dark enough to read against white paper.
  lines.push(
    `  \\draw[step=1, gray!55, line width=0.2pt] (${X_MIN},${Y_MIN}) grid (${X_MAX},${Y_MAX});`,
  );
  // Axes drawn through the origin (darker, with arrow tips and labels).
  lines.push(
    `  \\draw[->, thick, gray!80!black] (${X_MIN},0) -- (${X_MAX},0) node[right, font=\\small, black, inner sep=2pt] {$x$};`,
  );
  lines.push(
    `  \\draw[->, thick, gray!80!black] (0,${Y_MIN}) -- (0,${Y_MAX}) node[above, font=\\small, black, inner sep=2pt] {$y$};`,
  );
  // Integer tick marks and numeric labels, skipping 0 (marked as origin).
  for (let x = X_MIN + 1; x <= X_MAX - 1; x += 1) {
    if (x === 0) {
      continue;
    }
    lines.push(
      `  \\draw[gray!70, line width=0.3pt] (${x},-0.08) -- (${x},0.08);`,
    );
    lines.push(
      `  \\node[below, font=\\tiny, gray!70!black, inner sep=1pt] at (${x},-0.1) {${x}};`,
    );
  }
  for (let y = Y_MIN + 1; y <= Y_MAX - 1; y += 1) {
    if (y === 0) {
      continue;
    }
    lines.push(
      `  \\draw[gray!70, line width=0.3pt] (-0.08,${y}) -- (0.08,${y});`,
    );
    lines.push(
      `  \\node[left, font=\\tiny, gray!70!black, inner sep=1pt] at (-0.1,${y}) {${y}};`,
    );
  }
  lines.push(
    "  \\fill[gray!80!black] (0,0) circle (1.1pt) node[below left, font=\\tiny, gray!70!black, inner sep=1.5pt] {$O$};",
  );
  lines.push("\\end{scope}");
  return lines.join("\n");
}

const GRID_TEX = buildGridTex();

/**
 * Inject the helper grid into a `tikzpicture` source. Idempotent, and a no-op
 * when the source is not (yet) a tikzpicture.
 */
export function withHelperGrid(source: string): string {
  if (source.includes(MARKER)) {
    return source;
  }
  const match = /\\begin\s*\{\s*tikzpicture\s*\}(\s*\[[^\]]*\])?/.exec(source);
  if (match === null) {
    return source;
  }
  const insertAt = match.index + match[0].length;
  return `${source.slice(0, insertAt)}\n${GRID_TEX}\n${source.slice(insertAt)}`;
}
