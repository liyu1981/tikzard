<p align="center">
  <img src="asset/logo.svg" width="120" alt="TikZard logo" />
</p>

<h1 align="center">TikZard</h1>

<p align="center">
  A local-first, offline-first TikZ workbench. Write LaTeX on the left, see the
  rendered figure on the right — with an AI assistant that can edit, compile,
  and fix the drawing without leaving the browser.
</p>

<p align="center">
  <a href="https://github.com/liyu1981/tikzard">GitHub</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#tech-stack">Tech stack</a>
</p>

---

## Features

### Local-first by default

- **No backend, no account.** Documents, versions, preferences, and AI chat
  sessions live in your browser (IndexedDB + localStorage).
- **Offline-capable.** The TikZJax TeX engine, fonts, and wasm assets are
  vendored into the app — no CDN or network request is needed to compile.
- **Bring your own AI key.** Provider credentials stay in this browser and are
  sent directly to the model provider you choose.

### Live TikZ editing & preview

- Write a complete `tikzpicture` in a LaTeX-highlighted editor with line
  numbers and the current line highlighted.
- TikZJax (WebAssembly) compiles in the browser and renders an SVG preview,
  with compile status, duration, and a full compile-log panel.
- Automatic recompiles while you type, plus a manual **Render** button.
- Zoom, fit-to-view, and a scrollable preview canvas.

### Document library

- Create, rename, duplicate, import, export, and delete documents.
- Autosave with rendered thumbnails in the document picker.
- Restore the last opened document on the next visit.
- Import raw `.tex` / `.txt` sources or TikZard project JSON exports.
- Documents are fully local and never leave the device.

### Version history

- Save manual snapshots of the TikZ source.
- AI edits create their own `agent`-sourced snapshots.
- Browse, compare, and restore any saved version.
- Side-by-side diff view between two versions.
- Configurable per-document version cap (oldest snapshots are pruned).

### AI assistant

- Chat panel powered by [ReAgent](https://www.npmjs.com/package/@liyu1981/reagent)
  and `pi-agent`.
- Use cloud providers (OpenAI, Anthropic, Google, etc.) or any
  OpenAI-compatible local endpoint such as Ollama.
- Workbench tools let the assistant read the current source, replace it,
  snapshot versions, and enable TeX packages or TikZ libraries.
- Bundled drawing skills for core style, function plots, node diagrams, and
  domain packages (circuits, chemistry, quantum circuits, Feynman diagrams,
  spectra, kinematics, sign tables).
- Vision support: attach images or annotated previews and ask the assistant to
  update the drawing from them.
- Per-document chat sessions and logs — switching documents switches the
  assistant's conversation history.
- Deleting a document also reaps its agent sessions and stored credentials
  from local storage.
- Tools are exposed through WebMCP when available, with a host-tool fallback.

### Annotate & inspect

- Sketch directly on the preview with pen, text, rectangle, ellipse, and arrow
  tools.
- Send the annotated snapshot straight to the AI composer as an image prompt.
- Toggle a helper coordinate grid that aligns with the drawing's own TikZ
  coordinate system — useful for reasoning about positions before changing the
  source.
- Annotation marks overlay the preview and are not baked into the saved source.

### Export

- Copy the rendered figure to the clipboard as PNG.
- Export PNG at 3× scale.
- Export a single-page PDF.
- Export a full project JSON containing the document and its version history.

### TeX packages & TikZ libraries

Enable opt-in LaTeX packages per document without writing `\usepackage`:

| Package | Draws |
| --- | --- |
| `circuitikz` | Electrical and circuit networks |
| `chemfig` | 2D chemical structures |
| `physics` | Math and physics notation |
| `tkz-tab` | Sign and variation tables |
| `yquant` | Quantum circuits |
| `tikz-feynhand` | Feynman diagrams |
| `pgf-spectra` | Continuous/discrete spectra |
| `kinematikz` | Kinematic mechanisms |

Dozens of standard TikZ/PGF libraries (`arrows.meta`, `positioning`, `calc`,
`fit`, `automata`, `decorations.*`, `shapes.*`, `matrix`, `trees`, `patterns`,
`shadows`, and more) can be enabled the same way. Selections are stored with
the document and passed to TikZJax at render time.

### Interface

- Light, dark, and follow-system themes.
- English and Simplified Chinese UI.
- Liquid-glass panels, ambient background, reduced-motion/reduced-transparency
  fallbacks.
- Responsive two-pane layout that stacks on smaller screens.

---

## Quick start

### Prerequisites

- Node.js 20+ (developed on Node 24)
- [pnpm](https://pnpm.io/) 11+ (the repo pins `pnpm@11.24.0`)

### Install and run

```bash
pnpm install
pnpm dev
```

The dev server runs at **https://localhost:3111**. HTTPS comes from the
committed `mkcert/localhost+3*.pem` certificate; if the certs are absent, Vite
falls back to HTTP.

> `pnpm install` also vendors the TikZJax runtime into `public/tikzjax` so the
> app never references a CDN.

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the Vite dev server at https://localhost:3111 |
| `pnpm dev:serve` | Start the dev server as a background daemon (`.dev/dev.log`) |
| `pnpm dev:stop` | Stop the background dev daemon |
| `pnpm build` | Type-check and build the production bundle into `dist/` |
| `pnpm start` | Serve the production build at https://localhost:4000 when the mkcert certs are present (HTTP otherwise) |
| `pnpm lint` | Run Biome (lint + format + import organization) |
| `pnpm format` | Format the codebase with Biome |

### Using the workbench

1. Click **Start a new drawing** to open a blank document.
2. Write a `tikzpicture` in the **TikZ Source** pane; the preview recompiles
   automatically.
3. Add optional TeX packages or TikZ libraries from the source pane.
4. Save versions from the toolbar and review them in **Version history**.
5. Annotate the preview, then hand the snapshot to the **AI Assistant**.
6. Export the result as PNG, PDF, or a TikZard project.

---

## How it works

TikZard is a static single-page app. There is no application server:

```text
┌──────────────────────────── Browser ────────────────────────────┐
│  React UI ── TikZ source ── TikZJax (WebAssembly) ── SVG preview │
│      │                                                          │
│      ├── IndexedDB: documents, thumbnails, versions              │
│      ├── localStorage: theme, language, prefs, agent config      │
│      └── ReAgent: chat sessions + IndexedDB logs per document    │
└──────────────────────────────────────────────────────────────────┘
                 │
                 └── optional: direct HTTPS calls to your AI provider
```

- TikZJax's `.gz` assets are served raw (the Vite config strips the automatic
  `Content-Encoding: gzip`) because TikZJax decompresses them itself.
- The helper grid is HTML/CSS, calibrated from invisible TikZ paths injected
  only at render time — it never changes the saved source.
- Agent tools mutate the live editor through a workbench bridge, so edits are
  visible immediately and flow through the same compile pipeline.

---

## Tech stack

- **React 19** + **TypeScript**
- **Vite 8** + **TanStack Router** (file-based routing)
- **Tailwind CSS v4** with a custom liquid-glass design system
- **TikZJax** via [`@rod2ik/tikzjax`](https://www.npmjs.com/package/@rod2ik/tikzjax)
- **ReAgent** + **`pi-agent`** for the AI assistant
- **IndexedDB** for documents/versions and agent logs
- **Biome** for linting and formatting
- Deployed as a static site (Vercel config in `vercel.json`)

---

## Project layout

```text
src/
  components/          Workbench UI, preview, annotations, dialogs
  components/agent/    ReAgent chat panel, markdown, image lightbox
  hooks/               Renderer, persistence, preview, agent bridge
  lib/                 Documents, versions, exports, packages, storage
  lib/agent/           Agent bootstrap, tools, bundled skills
  routes/              TanStack Router routes
  i18n/                English and Simplified Chinese locales
scripts/               Dev daemon and TikZJax vendoring helpers
public/tikzjax/        Vendored runtime (generated, gitignored)
```

---

## Notes & limitations

- The editor content must be exactly one `tikzpicture` environment. A
  preamble, `\documentclass`, `\usepackage`, or `\usetikzlibrary` is not
  supported; use the package/library selectors instead.
- Compilation follows TikZJax's supported LaTeX/PGF subset. Heavy packages such
  as `pgfplots` are not available.
- The AI assistant requires a configured provider and API key (or a local
  OpenAI-compatible endpoint). It is optional; the editor and preview work
  without it.
