/**
 * The set of optional LaTeX packages TikZard's WebAssembly TikZJax runtime
 * can load per-diagram via the `<script type="text/tikz" data-tex-packages>`
 * attribute. Core TikZ/PGF and base LaTeX (amsmath, etc.) are always present
 * and are intentionally NOT listed here — only the opt-in packages that need an
 * explicit declaration.
 *
 * This list is the single source of truth for the UI package selector, the
 * agent's `set_tikz_packages` tool, and the domain-packages skill. It MUST stay
 * in sync with the eight packages TikZJax actually bundles
 * (see node_modules/@rod2ik/tikzjax/README.md "Supported optional packages").
 */

export interface TikzPackage {
  /** TikZJax package id, exactly as used in `data-tex-packages`. */
  id: string;
  /** Short human label (usually the package name). */
  label: string;
  /** One-line description of what the package draws. */
  description: string;
  /** Related bundled skill name, if any. */
  skill?: string;
}

export const SUPPORTED_PACKAGES: TikzPackage[] = [
  {
    id: "circuitikz",
    label: "circuitikz",
    description: "Electrical and circuit networks",
    skill: "tikz-domain-packages",
  },
  {
    id: "chemfig",
    label: "chemfig",
    description: "2D chemical structures",
    skill: "tikz-domain-packages",
  },
  {
    id: "physics",
    label: "physics",
    description: "Math and physics notation",
    skill: "tikz-domain-packages",
  },
  {
    id: "tkz-tab",
    label: "tkz-tab",
    description: "Sign and variation tables",
    skill: "tikz-domain-packages",
  },
  {
    id: "yquant",
    label: "yquant",
    description: "Quantum circuits",
    skill: "tikz-domain-packages",
  },
  {
    id: "tikz-feynhand",
    label: "tikz-feynhand",
    description: "Feynman diagrams",
    skill: "tikz-domain-packages",
  },
  {
    id: "pgf-spectra",
    label: "pgf-spectra",
    description: "Continuous/discrete spectra",
    skill: "tikz-domain-packages",
  },
  {
    id: "kinematikz",
    label: "kinematikz",
    description: "Kinematic mechanisms",
    skill: "tikz-domain-packages",
  },
];

export const SUPPORTED_PACKAGE_IDS = new Set(
  SUPPORTED_PACKAGES.map((pkg) => pkg.id),
);

/** Split a `data-tex-packages` attribute value into trimmed, non-empty ids. */
export function parsePackageAttr(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/**
 * Partition requested ids into those TikZJax supports and those it does not,
 * so the agent tool can reject unknown ids with an actionable message.
 */
export function validatePackageIds(ids: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    if (SUPPORTED_PACKAGE_IDS.has(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }
  return { valid, invalid };
}

/**
 * TikZ/PGF libraries shipped with the vendored runtime, loadable per-diagram
 * via the `<script type="text/tikz" data-tikz-libraries>` attribute (mirrors
 * dist/tex_files/tikzlibrary*.code.tex and pgflibrary*.code.tex).
 */
export const SUPPORTED_LIBRARIES: string[] = [
  "3d",
  "angles",
  "animations",
  "arrows",
  "arrows.meta",
  "automata",
  "babel",
  "backgrounds",
  "bbox",
  "bending",
  "braids",
  "calc",
  "calendar",
  "cd",
  "chains",
  "circuits",
  "circuits.ee",
  "circuits.ee.IEC",
  "circuits.logic",
  "circuits.logic.CDH",
  "circuits.logic.IEC",
  "circuits.logic.US",
  "curvilinear",
  "datavisualization",
  "datavisualization.3d",
  "datavisualization.barcharts",
  "datavisualization.formats.functions",
  "datavisualization.polar",
  "datavisualization.sparklines",
  "decorations",
  "decorations.footprints",
  "decorations.fractals",
  "decorations.markings",
  "decorations.pathmorphing",
  "decorations.pathreplacing",
  "decorations.shapes",
  "decorations.text",
  "er",
  "external",
  "fadings",
  "feynhand",
  "fit",
  "fixedpointarithmetic",
  "folding",
  "fpu",
  "graphs",
  "graphs.standard",
  "hobby",
  "intersections",
  "lindenmayersystems",
  "math",
  "matrix",
  "mindmap",
  "patterns",
  "patterns.meta",
  "perspective",
  "petri",
  "pgfplots.contourlua",
  "pgfplots.surfshading",
  "plothandlers",
  "plotmarks",
  "positioning",
  "quotes",
  "rdf",
  "scopes",
  "shadings",
  "shadows",
  "shapes",
  "shapes.arrows",
  "shapes.callouts",
  "shapes.gates.ee",
  "shapes.gates.ee.IEC",
  "shapes.gates.logic",
  "shapes.gates.logic.IEC",
  "shapes.gates.logic.US",
  "shapes.geometric",
  "shapes.misc",
  "shapes.multipart",
  "shapes.symbols",
  "snakes",
  "spy",
  "svg.path",
  "through",
  "trees",
  "turtle",
  "views",
];

export const SUPPORTED_LIBRARY_IDS = new Set(SUPPORTED_LIBRARIES);

/** Curated typeahead blurbs for the most-used libraries (optional hints). */
export const LIBRARY_HINTS: Record<string, string> = {
  "arrows.meta": "Modern arrow tips",
  positioning: "Relative node placement",
  fit: "Fit nodes around content",
  automata: "State machines",
  quotes: "Quoted edge labels",
  calc: "Coordinate calculations",
  "decorations.pathmorphing": "Coil, snake, zigzag paths",
  "decorations.markings": "Marks along paths",
  "decorations.pathreplacing": "Braces over path segments",
  "decorations.text": "Text along paths",
  "shapes.geometric": "Polygon/ellipse node shapes",
  "shapes.arrows": "Arrow-shaped nodes",
  "shapes.multipart": "Multi-part nodes",
  matrix: "Matrix-of-nodes layout",
  trees: "Tree layouts",
  backgrounds: "Background layers",
  patterns: "Fill patterns",
  shadows: "Drop shadows",
  intersections: "Path intersection points",
  spy: "Magnifier insets",
  hobby: "Smooth curves through points",
  cd: "Commutative diagrams",
  chains: "Chained node sequences",
  petri: "Petri nets",
  er: "Entity-relationship diagrams",
  mindmap: "Mind-map layouts",
  bending: "Arrows bending on curves",
  fpu: "Fixed-point math for big numbers",
};

export function validateLibraryIds(ids: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    if (SUPPORTED_LIBRARY_IDS.has(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }
  return { valid, invalid };
}
