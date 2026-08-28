---
name: tikz-function-plots
description: Recipes for drawing function graphs (parabolas, trigonometric curves, exponentials, piecewise) with plain TikZ plot - pgfplots is NOT available. Use when the user asks for function plots, graphs of equations, or coordinate-system figures.
---

# Function Plots with Plain TikZ

This environment has **no pgfplots**. Plot with core `\draw plot` and draw
axes manually. Never emit `\begin{axis}` or `\addplot` — it always fails.

## Packages and libraries

Function plots use plain TikZ — no special packages are needed. However,
TikZ libraries can enhance your plots:

- `arrows.meta` for refined arrow tips on axes
- `decorations.pathmorphing` for wavy/zigzag lines

Set libraries via `set_tikz_libraries`; check current selection with
`get_tikz_libraries`. **Never write `\usetikzlibrary{...}` in the source.**

## Standard skeleton

```latex
\begin{tikzpicture}[scale=1.1]
  % axes with arrow tips and labels
  \draw[->] (-0.5,0) -- (4.5,0) node[right] {$x$};
  \draw[->] (0,-0.5) -- (0,3) node[above] {$y$};
  % origin label
  \node[below left] at (0,0) {$O$};
  % the parabola y = x^2/4 on [0,3]
  \draw[domain=0:3, smooth, thick, blue!70!black]
    plot (\x, {0.25*\x*\x});
\end{tikzpicture}
```

## Syntax rules that prevent compile failures

- Wrap the y-expression in braces: `plot (\x, {sin(\x r)})`. Unbraced
  expressions with operators fail to parse.
- Trig takes radians by default: use `sin(\x r)` for the degree placeholder,
  or `cos(deg(\x))` to convert.
- Powers use `^`: `{0.5*\x^2}`, roots `sqrt(...)`, exp/ln available as
  `exp(...)`, `ln(...)`.
- Always set `[domain=a:b]`; without it the default domain is wrong.
- `smooth` needs enough samples: add `samples=100` for wiggly curves
  (`sin`, damped oscillations); straight-ish curves are fine with fewer.

## Piecewise and clipped functions

Compose segments as separate plots over separate domains:

```latex
% piecewise: ramp then flat
\draw[thick] plot[domain=0:2] (\x,\x) -- (4,2);
```

For asymptotes / poles, split at the singularity and never evaluate exactly
at it: plot `1/\x` on `[0.4:3]` and `[-3:-0.4]` separately.

## Ticks and grids

```latex
% light grid and integer ticks on both axes
\draw[gray!30, very thin] (0,0) grid[step=0.5] (4,3);
\foreach \i in {1,...,4} \node[below] at (\i,0) {$\i$};
\foreach \j in {1,...,2} \node[left]  at (0,\j) {$\j$};
```

Keep grids `very thin` + `gray!30` so curves dominate visually.

## Shaded areas (integrals, distributions)

Close filled regions explicitly back to an axis:

```latex
% area under the curve from 0 to 3
\fill[blue!15] plot[domain=0:3] (\x,{exp(-\x)}) -- (3,0) -- (0,0) -- cycle;
```

## Verify

After every plot change, rely on the automatic compile feedback: if the
preview fails, fix per the compiler output and resend — see the host tools
(`get_render_status`) rather than guessing.
