---
name: local-first-webapp
description: "The recorded tech stack, dev-tooling scaffolding, and i18n conventions for a 100% client-side, offline-first browser app, distilled from the mindx project. Use when bootstrapping a new local-first web app — choosing the stack, setting up pnpm/mkcert/Biome dev tooling, or replicating the reusable package.json scripts, AGENTS.md conventions, and i18next en/zh setup."
license: MIT
compatibility: opencode
metadata:
  tags: "local-first,nextjs,typescript,tailwind,opfs,i18n,pnpm,mkcert,biome,offline"
  source: "mindx (github)"
  stack: "Next.js 16 + TypeScript 5 + Tailwind CSS v4"
---

## Purpose
When bootstrapping a new browser-based, 100% client-side app (no backend, no
database, no runtime network dependency), use this taolu to pick the stack and
scaffold the tooling and i18n exactly as the mindx project does.

## 1. Tech stack (recorded decision)
Criteria: runs fully client-side, works offline, small bundle, one tool per job.

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js App Router, client-only SPA usage | Routing/build/tooling with zero server dependency |
| Language | TypeScript 5.x, strict mode | Contracts across storage, bundle format, data model |
| Styling | Tailwind CSS v4 | CSS-in-utility, small output, no runtime JS |
| Components | shadcn/ui on `@base-ui/react` | Unstyled headless primitives, no heavy theme runtime |
| State | `jotai` | Tiny, framework-idiomatic client state |
| Storage | OPFS + IndexedDB | Real file/dir + indexed data, both offline |
| Archive | `fflate` | Tiny sync zip for bundles |
| Build tooling | `pnpm` + Biome 2.x | Fast installs; lint+format+import-sort in one |
| Local dev | mkcert HTTPS + Vite (embedded app) | Secure-context APIs; Vite builds self-contained bundles |
| i18n | `i18next` + `react-i18next` + browser-languagedetector | Standard, small, locale files in `src/i18n/locales/` |

Selection rules:
- Every dependency must work with no network at runtime — no CDN resources, no
  runtime SaaS, no server-rendered features.
- Prefer the smallest equivalent dependency (mermaid dropped from constrained
  bundle; katex is heavy and flagged).
- Keep serializers/renderers framework-free so any output surface reuses them.
- HTTPS is a hard local requirement for secure-context APIs (OPFS, SW).

## 2. Package manager — pnpm
Single package manager, enforced via `packageManager` in package.json + lock
file. Use `pnpm add` / `pnpm add -D`; never mix npm/yarn/bun.

## 3. mkcert — HTTPS for local dev
OPFS / File System Access / Service Workers / navigator.storage need a secure
context. `mkcert -install` once, then generate a LAN cert with SANs:
`mkcert -key-file mkcert/<host>+2-key.pem -cert-file mkcert/<host>+2.pem <host> localhost 127.0.0.1 ::1`
Commit the cert; keep the CA out of the repo.

## 4. package.json scripts
`dev` uses `next dev --webpack -p 4000 --experimental-https --experimental-https-key/-cert`. Add `dev:serve`/`dev:stop` background-daemon scripts (pid + log files, kill old daemon, rotate logs). When `next build` depends on a generated artifact, chain it: `"build": "pnpm build:viewer && next build"`. `lint`/`format` are Biome only.

## 5. AGENTS.md conventions
- Commands table; **always run `pnpm lint` after changes**.
- Conventional-commit titles + detailed body; fix commits include cause + fix.
- Never commit unless asked; "generate git msg" prints, never commits.
- Path alias `@/*` → `./src/*`; no deep relative imports.
- `"use client"` on every component/hook touching browser APIs.
- Tailwind v4 syntax (`@import "tailwindcss"`, `@theme inline`) — not v3.
- Biome handles lint + format; spaces, width 2; import organization on.
- Never commit secrets or cert private keys beyond the dev cert.

## 6. i18n
- `src/i18n/index.ts`: init i18next with `LanguageDetector` (order
  localStorage → navigator, caches localStorage), `fallbackLng: "en"`,
  `escapeValue: false`, resources loaded from bundled JSON.
- All user-facing strings go through `t("namespace.key")` keys; add every key
  to BOTH `src/i18n/locales/en.json` and `zh.json`.
- Wrap the app in the i18n provider in the root layout.
