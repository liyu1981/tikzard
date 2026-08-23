"use client";

import { atom } from "jotai";

export const EXAMPLE_CODE = String.raw`\begin{tikzpicture}
  % draw x axis with arrow tip, labeled $x$
  \draw[->, thick] (-0.5,0) -- (4.5,0) node[right] {$x$};
  % draw y axis with arrow tip, labeled $y$
  \draw[->, thick] (0,-0.5) -- (0,3) node[above] {$y$};
  % draw the parabola y = x^2 / 4 for x in [0, 3]
  \draw[domain=0:3, smooth, thick, blue!70!black]
    plot ({\x}, {0.25*\x*\x});
\end{tikzpicture}`;

export type LeftTab = "instruction" | "assistant";

/**
 * Shared workbench state (jotai). The TikZ source lives here so the editor,
 * the preview, and the AI assistant's mutation bridge always observe the same
 * value regardless of which left-panel tab is mounted.
 */
export const codeAtom = atom(EXAMPLE_CODE);

export const leftTabAtom = atom<LeftTab>("assistant");
