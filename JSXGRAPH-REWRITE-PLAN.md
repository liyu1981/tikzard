# JSXGraph Rewrite — Comprehensive Plan

## Executive Summary

Rewrite TikZard's rendering engine from TikZ/TikZJax (WebAssembly LaTeX compiler) to JSXGraph (pure JavaScript interactive geometry/plotting library). The rewrite touches every layer: renderer, editor, agent tools, skills, system prompt, data model, export pipeline, and UI chrome.

**Core principle**: each phase produces a working app. No big-bang cutover.

---

## Current File Inventory (What Exists)

### Files to DELETE entirely
| File | Lines | Why |
|---|---|---|
| `src/lib/tikzjax.ts` | 42 | WASM boot loader — replaced by npm import |
| `src/lib/compile-logs.ts` | 150 | WASM console capture — JS errors go to console naturally |
| `src/lib/tikz-packages.ts` | 200+ | Package/library metadata + validation — JSXGraph has no packages |
| `src/lib/image-export.ts` | 140 | TikZ-specific SVG font inlining — JSXGraph renders to SVG natively |
| `src/components/compile-logs.tsx` | ~100 | Compile log UI panel — replaced by error console |
| `src/components/tex-tag-input.tsx` | ~150 | Package/library tag selector — removed entirely |
| `src/hooks/use-tikz-renderer.ts` | 120 | WASM render pipeline — replaced by ~30-line JSXGraph hook |

### Files to HEAVILY rewrite
| File | Current scope | New scope |
|---|---|---|
| `src/components/tikz-editor.tsx` | LaTeX syntax highlighting | JavaScript syntax highlighting |
| `src/components/tikz-workbench.tsx` | Ties together LaTeX renderer, packages, libraries | Ties together JSXGraph renderer, no packages/libraries |
| `src/components/workbench-left-panel.tsx` | Passes packages/libraries props | Removes package/library UI |
| `src/components/workbench-preview-panel.tsx` | Reads compile-logs tab | Reads error console tab |
| `src/components/workbench-types.ts` | Status includes "booting", "timeout", "loadError" | Simplified status |
| `src/lib/agent/tools.ts` | 9 tools (280 lines) | 5-6 tools (120 lines) |
| `src/lib/agent/editor-mutations.ts` | Interface with packages/libraries | Interface without packages/libraries |
| `src/hooks/use-agent-workbench-bridge.ts` | Bridge with packages/libraries | Bridge without packages/libraries |
| `src/lib/workbench-state.ts` | Atoms for code, packages, libraries | Atoms for code only |
| `src/lib/documents.ts` | TikzDocument with packages/libraries fields | Document without packages/libraries |
| `src/i18n/locales/en.json` | 200+ keys, many TikZ-specific | ~100 keys, JSXGraph-specific |
| `src/i18n/locales/zh.json` | Mirror of en.json | Mirror of en.json |

### Files to KEEP mostly unchanged
| File | Why |
|---|---|
| `src/lib/agent/agent.ts` | Generic agent builder, no TikZ specifics |
| `src/lib/agent/context.ts` | Context window management, generic |
| `src/lib/agent/models.ts` | Model catalog, generic |
| `src/lib/agent/store.ts` | Session persistence, generic |
| `src/lib/agent/images.ts` | Image handling, generic |
| `src/lib/agent/skills.ts` | Skill framework (parse frontmatter, etc.) — SKILL.md content changes |
| `src/lib/pdf-export.ts` | Canvas-to-PDF, works with any SVG-to-canvas |
| `src/lib/project-export.ts` | JSON export, format changes slightly |
| `src/lib/versions.ts` | Version store, generic |
| `src/lib/theme.ts` | Theme handling, generic |
| `src/components/agent/*.tsx` | Agent chat UI, mostly generic |
| `src/components/ui/*.tsx` | UI primitives, generic |
| `src/hooks/use-workbench-preview.ts` | Preview zoom/export, works with any SVG |
| `src/hooks/use-workbench-versions.ts` | Version management, generic |
| `src/app/layout.tsx` | App shell, generic |
| `src/app/page.tsx` | Root page, generic |

---

## Phase 0: Preparation (Day 1)

### 0.1 Add JSXGraph dependency
```bash
pnpm add jsxgraph
```

### 0.2 Create `src/lib/jsxgraph.ts` — thin wrapper
```typescript
import JXG from "jsxgraph";

export { JXG };

export type Board = JXG.Board;
export type Element = JXG.GeometryElement;

/**
 * Create a JSXGraph board in a container div.
 * Returns the board instance.
 */
export function createBoard(
  container: HTMLElement,
  options?: {
    boundingBox?: [number, number, number, number];
    keepAspectRatio?: boolean;
    axis?: boolean;
    grid?: boolean;
  },
): Board {
  return JXG.JSXGraph.initBoard(container, {
    boundingbox: options?.boundingBox ?? [-5, 5, 5, -5],
    keepaspectratio: options?.keepAspectRatio ?? true,
    axis: options?.axis ?? false,
    grid: options?.grid ?? false,
    showCopyright: false,
    showNavigation: false,
  });
}
```

### 0.3 Define the new source format

**Old format**: LaTeX `\begin{tikzpicture}...\end{tikzpicture}`

**New format**: JavaScript function that receives `(board, JXG)`:

```javascript
// Example: parabola on axes
function draw(board) {
  // x axis
  board.create('axis', [[0, 0], [1, 0]], {
    name: 'x',
    withLabel: true,
    label: { position: 'right' }
  });
  // y axis
  board.create('axis', [[0, 0], [0, 1]], {
    name: 'y',
    withLabel: true,
    label: { position: 'top' }
  });
  // parabola
  board.create('functiongraph', [x => 0.25 * x * x, 0, 3], {
    strokeColor: 'blue',
    strokeWidth: 2
  });
}
draw;
```

The editor stores the function body. The renderer calls `new Function('board', source)(board)`.

### 0.4 Define new example code

```typescript
export const EXAMPLE_CODE = `// Parabola y = x²/4
board.create('axis', [[0, 0], [1, 0]], { name: 'x', withLabel: true });
board.create('axis', [[0, 0], [0, 1]], { name: 'y', withLabel: true });
board.create('functiongraph',
  [x => 0.25 * x * x, 0, 3],
  { strokeColor: '#2563eb', strokeWidth: 2 }
);`;
```

---

## Phase 1: Core Renderer Swap (Days 2-4)

### 1.1 Create `src/hooks/use-jsxgraph-renderer.ts`

Replace `use-tikz-renderer.ts`. ~30 lines instead of 120.

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
import { createBoard, type Board } from "@/lib/jsxgraph";

interface Props {
  code: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
}

export function useJsxGraphRenderer({ code, stageRef }: Props) {
  const [status, setStatus] = useState<Status>("ready");
  const boardRef = useRef<Board | null>(null);
  const lastCodeRef = useRef<string>("");

  const renderNow = useCallback(
    (source: string) => {
      const host = stageRef.current;
      if (!host) return;

      // Destroy previous board
      if (boardRef.current) {
        boardRef.current.removeBoard();
        boardRef.current = null;
      }
      host.replaceChildren();

      try {
        const board = createBoard(host);
        boardRef.current = board;

        // Execute user code
        const fn = new Function("board", "JXG", source);
        fn(board, board);

        lastCodeRef.current = source;
        setStatus("done");
      } catch (err) {
        console.error("JSXGraph render error:", err);
        setStatus("error");
      }
    },
    [stageRef],
  );

  // Re-render on code change (debounced)
  useEffect(() => {
    if (code === lastCodeRef.current) return;
    const timer = window.setTimeout(() => renderNow(code), 300);
    return () => clearTimeout(timer);
  }, [code, renderNow]);

  // Initial render
  useEffect(() => {
    renderNow(code);
  }, []);

  return { status, renderNow, boardRef };
}
```

**Key simplifications vs current renderer:**
- No WASM boot sequence (status starts at "ready")
- No MutationObserver (JSXGraph renders synchronously)
- No timeout handling (no 45s WASM compile)
- No console capture (JS errors are standard)
- `board.removeBoard()` for cleanup

### 1.2 Simplify `src/components/workbench-types.ts`

```typescript
export type Status = "ready" | "rendering" | "done" | "error";

export const STATUS_KEY: Record<Status, string> = {
  ready: "workbench.statusReady",
  rendering: "workbench.statusRendering",
  done: "workbench.statusDone",
  error: "workbench.statusError",
};

export const STATUS_DOT: Record<Status, string> = {
  ready: "bg-emerald-500",
  rendering: "animate-pulse bg-amber-500",
  done: "bg-emerald-500",
  error: "bg-red-500",
};
```

**Removed**: "booting", "timeout", "loadError" — these were WASM-specific states.

### 1.3 Update `src/lib/workbench-state.ts`

Remove `packagesAtom`, `librariesAtom`. Update `EXAMPLE_CODE` and `NEW_DOCUMENT_CODE`.

```typescript
export const EXAMPLE_CODE = `// Parabola y = x²/4
board.create('axis', [[0, 0], [1, 0]], { name: 'x', withLabel: true });
board.create('axis', [[0, 0], [0, 1]], { name: 'y', withLabel: true });
board.create('functiongraph',
  [x => 0.25 * x * x, 0, 3],
  { strokeColor: '#2563eb', strokeWidth: 2 }
);`;

export const NEW_DOCUMENT_CODE = `// Start drawing here
board.create('axis', [[0, 0], [1, 0]], { name: 'x', withLabel: true });
board.create('axis', [[0, 0], [0, 1]], { name: 'y', withLabel: true });
`;
```

### 1.4 Update `src/components/tikz-workbench.tsx`

- Replace `useTikzRenderer` → `useJsxGraphRenderer`
- Remove `packages`, `libraries` state and all their plumbing
- Remove `TexTagInput` imports and rendering
- Remove `packageSuggestions`, `librarySuggestions` from left panel props

### 1.5 Update `src/components/workbench-left-panel.tsx`

- Remove `packages`, `libraries` props
- Remove `packageSuggestions`, `librarySuggestions` props
- Remove `TexTagInput` rendering (2 tag inputs disappear)
- Remove `onPackagesChange`, `onLibrariesChange` props

### 1.6 Update `src/hooks/use-agent-workbench-bridge.ts`

- Remove `getPackages`, `setPackages`, `getLibraries`, `setLibraries` from interface and implementation

### 1.7 Update `src/lib/agent/editor-mutations.ts`

- Remove `getPackages`, `setPackages`, `getLibraries`, `setLibraries` from `EditorMutationBridge`

### 1.8 Update `src/lib/documents.ts`

- Remove `packages?: string[]` and `libraries?: string[]` from `TikzDocument`
- Bump `DB_VERSION` to 3 (migration: read old docs, drop packages/libraries fields)

### 1.9 Delete TikZ-specific files

- `src/lib/tikzjax.ts`
- `src/lib/compile-logs.ts`
- `src/lib/tikz-packages.ts`
- `src/lib/image-export.ts` (the TikZ font inlining part; keep generic SVG rasterization)
- `src/components/compile-logs.tsx`
- `src/components/tex-tag-input.tsx`
- `src/hooks/use-tikz-renderer.ts`
- `public/tikzjax/` directory

### 1.10 Update `package.json`

- Remove `@rod2ik/tikzjax` from dependencies
- Remove `postinstall` script (`scripts/copy-tikzjax.sh`)
- Remove `build` script's tikzjax copy step
- Add `jsxgraph` to dependencies
- Remove `highlight.js` LaTeX language (replace with JavaScript)

### 1.11 Run `pnpm lint`

---

## Phase 2: Editor + Syntax (Day 5)

### 2.1 Rewrite `src/components/tikz-editor.tsx` → `src/components/code-editor.tsx`

Replace LaTeX syntax highlighting with JavaScript:

```typescript
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
```

The editor is the same architecture (textarea + highlighted overlay + gutter), just with JS highlighting.

### 2.2 Update `src/components/tikz-workbench.tsx`

- Import `CodeEditor` instead of `TikzEditor`
- Remove LaTeX-specific props from the editor

---

## Phase 3: Export Pipeline (Day 6-7)

### 3.1 Update `src/hooks/use-workbench-preview.ts`

- Remove `pushCompileLog` calls (compile logs no longer exist)
- SVG detection: instead of MutationObserver, read from `boardRef.current.container`

### 3.2 Update `src/lib/image-export.ts`

- Remove `loadFontFaceCss`, `collectFontFamilies`, `FONT_BASE_URL` (TikZ font inlining)
- Keep: `measureSvgNaturalSize`, `renderSvgToCanvas`, `svgToPngBlob`, `annotatedSnapshotBlob`, `downloadBlob`, `toFileSlug`
- The generic SVG-to-canvas pipeline works for any SVG

### 3.3 Update `src/lib/pdf-export.ts`

- No changes needed — it takes a canvas, not SVG source

### 3.4 Update `src/lib/project-export.ts`

- Change `ProjectExportDocument` to remove `packages`/`libraries`
- Add `engine: "jsxgraph"` field to export payload for migration detection
- Bump `exportVersion` to 2

### 3.5 Update `src/hooks/use-document-persistence.ts`

- Remove `packages`, `libraries` from save calls
- Thumbnail capture: read SVG from JSXGraph board container instead of `canvasRef`

---

## Phase 4: Agent Integration (Days 8-10)

### 4.1 Rewrite `src/lib/agent/tools.ts`

**Remove these tools:**
- `get_tikz_packages`
- `set_tikz_packages`
- `get_tikz_libraries`
- `set_tikz_libraries`

**Rename tools:**
- `get_tikz_source` → `get_source`
- `set_tikz_source` → `set_source`
- `get_render_status` → `get_render_status` (simpler — just report board state)

**Add new tool:**
- `verify_invariants` — agent can check geometric relationships programmatically

**Keep tools:**
- `save_tikz_version` → `save_version`
- `load_skill`

**New `tools.ts` outline (~120 lines):**

```typescript
// Tool 1: Read current source
const getSource = tool({
  name: "get_source",
  label: "Read source",
  description: "Read the JSXGraph JavaScript source currently in the editor.",
  parameters: Type.Object({}),
  execute: async () => textBlocks(truncate(ed.getCode(), MAX_SOURCE_CHARS)),
});

// Tool 2: Write source
const setSource = tool({
  name: "set_source",
  label: "Write source",
  description: "Replace the entire JSXGraph source. The preview re-renders immediately.",
  parameters: Type.Object({
    source: Type.String({ description: "Complete JSXGraph JavaScript source..." }),
  }),
  execute: async (_id, args) => { ed.setCode(args.source); ... },
});

// Tool 3: Render status (trivial)
const getRenderStatus = tool({
  name: "get_render_status",
  label: "Render status",
  description: "Report whether the board rendered successfully or has an error.",
  parameters: Type.Object({}),
  execute: async () => {
    const { status } = ed.getRenderStatus();
    return textBlocks(`status: ${status}`);
  },
});

// Tool 4: Verify invariants (NEW — agent self-test)
const verifyInvariants = tool({
  name: "verify_invariants",
  label: "Verify invariants",
  description: "Execute JavaScript on the live board to check geometric relationships. Returns the result.",
  parameters: Type.Object({
    code: Type.String({
      description: "JavaScript expression that evaluates to true/false, e.g. `Math.abs(angle - 90) < 0.001`",
    }),
  }),
  execute: async (_id, args) => {
    const board = ed.getBoard();
    const result = new Function("board", "JXG", `return (${args.code})`)(board, JXG);
    return textBlocks(`result: ${result}`);
  },
});

// Tool 5: Save version
const saveVersion = tool({
  name: "save_version",
  label: "Save version",
  description: "Checkpoint the current source as a version snapshot.",
  parameters: Type.Object({ note: Type.Optional(Type.String({})) }),
  execute: async (_id, args) => { ... },
});

// Tool 6: Load skill
const loadSkill = tool({
  name: "load_skill",
  label: "Load skill",
  description: "Load specialized drawing guide instructions.",
  parameters: Type.Object({ name: Type.String({}) }),
  execute: async (_id, args) => { ... },
});
```

### 4.2 Update `src/lib/agent/editor-mutations.ts`

```typescript
export interface EditorMutationBridge {
  getCode: () => string;
  setCode: (code: string) => void;
  getRenderStatus: () => RenderStatusSnapshot;
  getBoard: () => JXG.Board | null;  // NEW: for verify_invariants
  saveVersion: (note?: string) => Promise<number>;
  waitForRender: (timeoutMs?: number) => Promise<RenderStatusSnapshot>;
}
```

### 4.3 Rewrite system prompt

**Old** (~600 tokens): TikZ-specific rules, package whitelist, compilation caveats.

**New** (~300 tokens):

```
You are the AI assistant inside TikZard, a local-first JSXGraph workbench — an expert at creating interactive mathematical constructions and plots with JSXGraph.

The user edits JSXGraph JavaScript in the editor; the rendered drawing appears on the right. Tools: get_source (read current source), set_source (replace editor source), get_render_status (board status), verify_invariants (test geometric relationships on the live board), save_version (save a snapshot), load_skill (load specialized guides).

Rules:
- The editor contains a standalone JavaScript snippet executed as `new Function('board', source)(board)`. The `board` variable is a live JSXGraph board. You also have access to `JXG` for the full JSXGraph namespace.
- Always send the complete updated source, never a fragment.
- Use geometric dependencies (midpoint, perpendicular, glider, intersection, functiongraph) — NOT fixed coordinates. Relationships must survive dragging.
- Before completing a construction, mentally verify: if each draggable point is moved, do all stated properties still hold?
- Call verify_invariants to test relationships programmatically when constructing geometry.
- Call save_version BEFORE changing an existing drawing (not when fixing bugs).
- Answer in {{language}}.
```

### 4.4 Create new SKILL.md files

**Delete:**
- `src/lib/agent/skills/tikz-core-style/SKILL.md`
- `src/lib/agent/skills/tikz-domain-packages/SKILL.md`
- `src/lib/agent/skills/tikz-function-plots/SKILL.md`
- `src/lib/agent/skills/tikz-nodes-diagrams/SKILL.md`

**Create:**
- `src/lib/agent/skills/jsxgraph-constraints/SKILL.md` — constraint-based design patterns
- `src/lib/agent/skills/jsxgraph-plots/SKILL.md` — function plots, data visualization
- `src/lib/agent/skills/jsxgraph-geometry/SKILL.md` — geometric constructions

### 4.5 Update `src/lib/agent/skills.ts`

Change imports from TikZ skills to JSXGraph skills:

```typescript
import jsxgraphConstraints from "./skills/jsxgraph-constraints/SKILL.md";
import jsxgraphPlots from "./skills/jsxgraph-plots/SKILL.md";
import jsxgraphGeometry from "./skills/jsxgraph-geometry/SKILL.md";
```

### 4.6 Update `src/components/agent/agent-chat.tsx`

- Remove `COMPILE_FAILURE_PATTERN` import and auto-fix loop (no compile failures in JSXGraph)
- Remove `compileLogsAtom` dependency
- `buildSystemPrompt`: update source embedding from `latex` code block to `javascript`
- Remove `sendAutoFix` entirely — JSXGraph errors are shown in the console, not via compile log interception

### 4.7 Update `src/hooks/use-agent-workbench-bridge.ts`

- Add `getBoard` to the bridge interface
- Remove `getPackages`, `setPackages`, `getLibraries`, `setLibraries`
- Simplify `waitForRender` — JSXGraph renders synchronously, so just wait for `status === "done"` or `status === "error"`

---

## Phase 5: i18n + UI Cleanup (Day 11)

### 5.1 Update `src/i18n/locales/en.json`

**Remove keys:**
- `workbench.packages`, `workbench.packagesPlaceholder`, `workbench.packagesRemove`
- `workbench.libraries`, `workbench.librariesPlaceholder`, `workbench.librariesRemove`, `workbench.libraryGeneric`
- `workbench.compileLogs`, `workbench.logStart`, `workbench.compileTime`
- `workbench.statusBooting`, `workbench.statusTimeout`, `workbench.statusLoadError`
- `agent.autoFixMessage`, `agent.autoFixLimitReached`, `agent.contextOverflowRetry`
- All `workbench.log*` keys
- All `settings.about*` keys mentioning TikZJax

**Rename keys:**
- `workbench.editorLabel`: "TikZ Source" → "JSXGraph Source"
- `workbench.render`: keep as "Render" (or rename to "Run")
- `workbench.statusError`: add (new status)

**Update values:**
- `settings.aboutBlurb`: "TikZard is a local-first TikZ workbench" → "TikZard is a local-first JSXGraph workbench"
- `agent.systemPrompt`: replace entirely with new JSXGraph prompt
- Welcome page strings: update TikZ references

### 5.2 Update `src/i18n/locales/zh.json`

Mirror all en.json changes.

### 5.3 Update `src/components/workbench-preview-panel.tsx`

- Remove "compile logs" tab from right panel
- Remove `CompileLogs` import and rendering
- Status display: simplify to "ready" / "done" / "error"

### 5.4 Update `src/components/welcome-page.tsx`

- Update welcome text to mention JSXGraph instead of TikZ
- Feature descriptions: "interactive geometry" instead of "TikZ rendering"

---

## Phase 6: Document Migration (Day 12)

### 6.1 Migration utility

Create `src/lib/migration.ts` to handle existing TikZ documents:

```typescript
/**
 * Detect and migrate legacy TikZ documents.
 * - Read old DB (version 2) with packages/libraries fields
 * - For TikZ documents: store as-is with engine="tikz" marker
 * - New documents get engine="jsxgraph"
 * - Provide a "migrate to JSXGraph" action in the document menu
 */
```

### 6.2 Document schema v3

```typescript
export interface TikzDocument {
  id: string;
  title: string;
  code: string;
  updatedAt: number;
  engine: "jsxgraph";  // NEW field
  thumbnail?: Blob;
}
```

### 6.3 DB version bump

- `DB_VERSION` from 2 → 3
- `onupgradeneeded`: drop `packages`/`libraries` fields, add `engine` field

---

## Phase 7: Testing + Polish (Days 13-14)

### 7.1 Manual test matrix

| Scenario | Expected |
|---|---|
| Create new document | Default axes render |
| Edit code in editor | Preview updates live |
| AI assistant: "draw a triangle" | Agent calls set_source, triangle appears |
| AI assistant: "make it right-angled" | Agent uses verify_invariants, constrains correctly |
| Export PNG | Clean rasterization, no font issues |
| Export PDF | Single-page PDF |
| Annotate + send to agent | Annotated image appears in chat |
| Open saved document | Code loads, board renders |
| Version history | Save/restore works |
| Dark mode | Board renders with correct contrast |
| Mobile responsive | Layout adapts |

### 7.2 Regression checks

- [ ] No `@rod2ik/tikzjax` import anywhere
- [ ] No `\begin{tikzpicture}` in any source file
- [ ] No `packages` or `libraries` in document schema
- [ ] No compile-logs module usage
- [ ] No console capture code
- [ ] `pnpm lint` passes clean

### 7.3 Performance baseline

| Metric | TikZ (old) | JSXGraph (target) |
|---|---|---|
| Initial load | ~2s (WASM) | <200ms |
| First render | 1-3s | <50ms |
| Re-render after edit | 1-3s | <50ms |
| Bundle size (gzipped) | ~5MB (WASM) | ~150KB (JS) |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| JSXGraph can't do domain-specific diagrams (Feynman, circuits) | High | Document limitation; users who need these stay on TikZ (offer dual-mode?) |
| AI hallucinates nonexistent JSXGraph API | Medium | verify_invariants tool catches errors; system prompt includes "check API docs" |
| Users with TikZ expertise face learning curve | Medium | Provide example gallery; consider TikZ→JSXGraph translator as future feature |
| IndexedDB migration breaks existing documents | High | Test migration on real data; keep backup of old DB version |
| JSXGraph rendering differs from TikZ output | Medium | Accept as different-but-valid; update expectations in docs |

---

## Dependency Changes Summary

```diff
dependencies:
+  jsxgraph: ^1.13.2
-  "@rod2ik/tikzjax": ^1.6.0
-  highlight.js (keep, but swap latex language for javascript)

scripts:
-  "postinstall": "bash scripts/copy-tikzjax.sh"
-  "build": "bash scripts/copy-tikzjax.sh && next build --webpack"
+  "build": "next build --webpack"
```

---

## Execution Order (Critical Path)

```
Day 1:   Phase 0 (prep + dependency)
Day 2-4: Phase 1 (renderer swap — core change)
Day 5:   Phase 2 (editor syntax)
Day 6-7: Phase 3 (export pipeline)
Day 8-10: Phase 4 (agent integration — largest redesign)
Day 11:  Phase 5 (i18n + UI cleanup)
Day 12:  Phase 6 (document migration)
Day 13-14: Phase 7 (testing + polish)
```

**Gating**: Phase 2 depends on Phase 1. Phase 3 depends on Phase 1. Phase 4 depends on Phase 1. Phase 5 depends on Phases 1-4. Phase 6 depends on Phase 1. Phase 7 depends on all.
