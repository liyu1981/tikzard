---
name: tikz-nodes-diagrams
description: Node-and-arrow diagram recipes (block diagrams, flowcharts, graphs, trees, automata) using positioning, calc, fit, matrix and shape libraries that are verified available. Use for any box-and-arrow, flowchart, state machine, or labeled-node figure.
---

# Nodes and Diagrams

Box-and-arrow figures are built from `node`s placed relative to each other.
All libraries used here are present in this environment (`positioning`,
`calc`, `fit`, `matrix`, `shapes.geometric`, `arrows.meta`, `angles`,
`quotes`, `automata`, ...). Enable them with the **TikZ Libraries** input in
the workbench UI or by calling the `set_tikz_libraries` tool — for example
`set_tikz_libraries(["positioning", "arrows.meta"])`.

**Never write `\usetikzlibrary{...}` or `\usepackage{...}` in the source.**
Libraries and packages are applied through the selection, not through source
lines; the editor content stays a clean, single tikzpicture.

**Always check first**: Call `get_tikz_libraries` before enabling libraries to
see what is already active.

## Relative placement (never hardcode coordinates)

```latex
\begin{tikzpicture}[node distance=8mm,
  block/.style={draw, thick, rounded corners, minimum width=14mm,
    minimum height=7mm, fill=blue!10}]
  % three blocks chained left to right
  \node[block] (a) {Input};
  \node[block, right=of a] (b) {Process};
  \node[block, right=of b] (c) {Output};
  % arrows with labels midway
  \draw[-{Stealth}] (a) -- (b);
  \draw[-{Stealth}] (b) -- node[above] {$f$} (c);
\end{tikzpicture}
```

(Libraries needed: `positioning`, `arrows.meta`.)

- `right=of a`, `above right=4mm and 2mm of b` - positioning beats manual
  x/y arithmetic and survives label-length changes.
- Define styles once in the picture options (`block/.style=...`), reuse
  everywhere; consistent boxes are half the visual quality.

## Connectors that route around things

```latex
% orthogonal elbow from b down and back into a
\draw[-{Stealth}] (b) |- ++(0,-8mm) -| (a);
```

- `|-` / `-|` give clean elbows; add `rounded corners` on the path style for
  soft corners.
- Loop back with `to[out=..,in=..]`: `\draw[-{Stealth}] (b) to[out=-135,in=-45] (a);`

## Fit a box around others

```latex
% dashed container around nodes a and b (library: fit)
\node[draw, dashed, inner sep=2mm, fit=(a)(b)] (box) {};
```

Give the fitted node a name and attach one arrow to it instead of many.

## Flowcharts

Diamonds via `shapes.geometric`: `diamond, aspect=2`. Put text on two lines
with `align=center` and `\\`.

## Automata / state machines

```latex
% state machines (libraries: automata, positioning)
% start state with double circle, accepting marked
\node[state, initial, accepting] (q0) {$q_0$};
\node[state, right=of q0] (q1) {$q_1$};
\draw[-{Stealth}] (q0) edge[loop above] node {$a$} (q0)
                  (q0) edge[bend left] node {$b$} (q1);
```

## Angles and measurement marks

`angles` + `quotes` for arc-angle marks:
`\pic [draw, angle radius=6mm, "$45^\circ$"] {angle = B--A--C};`
(right-angle via `{angle = A--B--C}` variants; keep `angle radius` small).

## Verify

Diagrams fail most often on unknown libraries or styles used before
definition. If compile fails, read the compiler output forwarded by the host
and fix the named line - do not switch to a different diagram style.
