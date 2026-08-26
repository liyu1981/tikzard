---
name: tikz-core-style
description: Visual style and quality guide for TikZ figures in TikZard - line widths, colors, arrows, labels, spacing, and commenting conventions. Use before writing or restyling any drawing to produce clean, publication-quality output.
---

# TikZ Core Style Guide

Produce clean, precise, consistent figures. Every rule below is checked against
how TikZard renders: one `tikzpicture`, compiled by WebAssembly TikZJax.

## Structure and comments

- Emit exactly one `tikzpicture`. No `\documentclass`, no wrappers.
- One short comment above every drawing command saying what it draws. Keep or
  improve comments already present in user code.

```latex
\begin{tikzpicture}
  % draw the axes with arrow tips
  \draw[->] (-0.5,0) -- (4.5,0);
  \draw[->] (0,-0.5) -- (0,3);
  % shade the region under the curve
  \fill[blue!15] plot[domain=0:3] (\x,{0.25*\x*\x}) -- (3,0) -- cycle;
\end{tikzpicture}
```

## Line widths

Pick from a small, consistent set; do not mix more than two weights per figure:

- `\draw[thick]` for primary geometry (curves, main shapes).
- Default thin lines for secondary structure (grid, construction lines).
- `[line width=1.2pt]` only when emphasis is deliberate.

## Color

- Use `xcolor` mixing instead of inventing values: `blue!70!black`,
  `red!60!orange`, `gray!40`.
- Fills are pale (`…!15` to `…!25`), strokes are dark (`…!70!black`). This
  keeps printed/grayscale output legible.
- Reuse one accent color per semantic role across the whole figure.

## Arrows and tips

- Enable the `arrows.meta` library (via the TikZ Libraries input or the
  `set_tikz_libraries` tool — never `\usetikzlibrary` in the source) and use
  `-{Stealth}` / `{Stealth[length=2.5mm]}` rather than the old `->` default
  when a refined look matters.
- Put arrow specs on the path, not per-segment: `\draw[-{Stealth}] a -- b;`.

## Labels and text

- Attach labels with `node[above]`, `node[right]`, … at path ends; nudge with
  explicit coordinates only when anchors fight you.
- Math in labels always in `$...$`: `node[right] {$f(x)$}`.
- Keep label distance visually even: `[label distance=1pt]`, or place nodes at
  `pos=0.5` along paths for mid-edge labels.

## Spacing and layout

- Give the picture breathing room: start axes ~0.5 units before the first
  interesting coordinate so arrowheads and labels are not clipped.
- Align repeated elements on a grid; use `\foreach` over copy-pasted rows:

```latex
% draw three evenly spaced sample points
\foreach \x in {1,2,3} \fill (\x,1) circle (1.5pt);
```

## Scaling pitfalls

- Prefer changing coordinates/domain over `scale=`; text does not scale with
  `scale=` unless you also pass `transform shape` (which distorts stroke
  widths). When resizing is required: `[scale=1.5, transform shape]` and then
  re-check label positions.
