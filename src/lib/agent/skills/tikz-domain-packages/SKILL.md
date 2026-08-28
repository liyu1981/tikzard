---
name: tikz-domain-packages
description: Minimal working examples for the 8 non-core packages available in TikZard (circuitikz, chemfig, physics, tkz-tab, yquant, tikz-feynhand, pgf-spectra, kinematikz). Use when the drawing involves circuits, chemistry, physics notation, sign tables, quantum circuits, Feynman diagrams, spectra, or mechanisms.
---

# The 8 Domain Packages

TikZard's WebAssembly engine bundles exactly eight extra packages. Enable them
with the **package selector** in the workbench UI (the package button next to
version history) or by calling the `set_tikz_packages` tool — for example
`set_tikz_packages(["circuitikz"])`.

**Never write `\usepackage{...}` in the source.** Packages are applied to the
diagram through the selection, not through preamble lines; `\usepackage` in the
editor always fails. The editor content stays a clean, single tikzpicture.

Supported ids (exactly these eight exist):

| id | draws |
| --- | --- |
| `circuitikz` | electrical networks |
| `chemfig` | 2D chemical structures |
| `physics` | math/physics notation |
| `tkz-tab` | sign and variation tables |
| `yquant` | quantum circuits |
| `tikz-feynhand` | Feynman diagrams |
| `pgf-spectra` | continuous/discrete spectra |
| `kinematikz` | kinematic mechanisms |

Anything not on this list cannot be loaded — reimplement it with core TikZ.

## circuitikz - electrical networks

```latex
\begin{tikzpicture}
  % battery in series with a resistor and an LED
  \draw (0,0) to[battery1] (0,2)
        to[R=$R_1$] (3,2)
        to[led]     (3,0) -- (0,0);
\end{tikzpicture}
```

Common bipoles: `R`, `C`, `L`, `D`, `led`, `V`, `battery1`, `ammeter`,
`voltmeter`; transistors `npn`/`pnp` via nodes. Label with `to[R=$x$]` or
`node[right]{...}`.

## chemfig - 2D chemical structures

```latex
\begin{tikzpicture}
  % water molecule: O bonded to two H at 104 degree angle
  \chemfig{H-O-H}
\end{tikzpicture}
```

Bonds: `-` single, `=` double, `~` triple, ring syntax `\chemfig{*6(------)}`
for benzene.

## physics - math/physics notation

```latex
\begin{tikzpicture}
  % label showing the gradient and a bra-ket
  \node at (0,0) {$\grad \vec{f}, \quad \bra{\psi}\ket{\phi}$};
\end{tikzpicture}
```

Macros: `\dv`, `\pdv`, `\abs`, `\norm`, `\bra`, `\ket`, `\braket`,
`\matrixquantity`. Mostly used inside node text.

## tkz-tab - sign and variation tables

```latex
\begin{tikzpicture}
  % variation table of x^2: negative then positive, min at 0
  \tkzTabInit[lgt=2, espcl=3]{$x$ / 1, $f(x)$ / 2}{$0$, $3$}
  \tkzTabLine{,-,t,+,}
\end{tikzpicture}
```

## yquant - quantum circuits

```latex
\begin{tikzpicture}
  % two qubit registers with a CNOT
  \qubit{$q_0$} q0;
  \qubit{$q_1$} q1;
  cnot q0 | q1;
\end{tikzpicture}
```

## tikz-feynhand - Feynman diagrams

```latex
\begin{tikzpicture}
  % electron-positron annihilation into a photon
  \begin{feynhand}
    \vertex (a) at (0,0); \vertex (b) at (2,0);
    \vertex (c) at (1,1);
    \propag[fer] (a) to (c);
    \propag[antfer] (b) to (c);
  \end{feynhand}
\end{tikzpicture}
```

## pgf-spectra - continuous/discrete spectra

```latex
\begin{tikzpicture}
  % visible spectrum strip 380-780 nm
  \draw[spectra, wavelength=380:780] (0,0) rectangle (6,0.5);
\end{tikzpicture}
```

## kinematikz - kinematic mechanisms

```latex
\begin{tikzpicture}
  % four-bar linkage
  \fourbar{x}{y}{2}{1}{3}{45}
\end{tikzpicture}
```

## Ground rules for all packages

- Select packages with the package selector or `set_tikz_packages`; never add
  `\usepackage` lines to the source.
- **Always check first**: Call `get_tikz_packages` before enabling packages to
  avoid duplicates or conflicts.
- If a needed package is missing, enable it with `set_tikz_packages` before
  sending the source with `set_tikz_source`.
- If compile fails after enabling a package, read the forwarded compiler output
  first - wrong macro names are the usual cause, not the package.
- Prefer core TikZ when a need is simple; reach for these packages only when
  the domain genuinely demands them.
- Libraries (like `arrows.meta`, `positioning`) are separate from packages and
  set via `set_tikz_libraries`.
