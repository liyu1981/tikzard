<!-- taolu-enforce:local-first-webapp -->
- Follow the taolu local-first-webapp (v1) in .opencode/skills/local-first-webapp/SKILL.md

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server at https://localhost:3111 (mkcert HTTPS, webpack) |
| `pnpm dev:serve` | Start dev server as background daemon (log `.dev/dev.log`) |
| `pnpm dev:stop` | Stop the background dev daemon and rotate logs |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build on port 4000 |
| `pnpm lint` | Biome check (lint + format + organize imports) |
| `pnpm format` | Biome format --write |

**Always run `pnpm lint` after changes.**

## Conventions

- 100% client-side, offline-first: no runtime network dependency, no CDN resources, no server-rendered features.
- Package manager is pnpm (pinned via `packageManager`). Never mix npm/yarn/bun.
- Path alias `@/*` → `./src/*`; no deep relative imports.
- `"use client"` on every component/hook touching browser APIs.
- Tailwind v4 syntax (`@import "tailwindcss"`, `@theme inline`) — not v3.
- Biome handles lint + format; spaces, width 2, double quotes, semicolons, import organization on.
- All user-facing strings go through `t("key")`; every key must exist in BOTH `src/i18n/locales/en.json` and `src/i18n/locales/zh.json`.
- Conventional-commit titles + detailed body; fix commits include cause + fix. Never commit unless asked; "generate git msg" prints a message, never commits.
- Never commit secrets. The mkcert dev cert (`mkcert/localhost+3*.pem`) is the only private key allowed in the repo; keep the mkcert CA out. It covers `localhost`, `127.0.0.1`, `::1`, and the LAN IP; regenerate with mkcert when the LAN IP changes, and keep `allowedDevOrigins` in next.config.ts in sync (`192.168.0.*` covers the whole subnet; HMR WebSocket is blocked otherwise).
- `@rod2ik/tikzjax` runtime assets are vendored into gitignored `public/tikzjax` by both the `postinstall` script and the `build` command (install-time lifecycle hooks are skipped on cached CI installs, so the build must regenerate them itself); never reference a CDN for them.

<!-- taolu-enforce:apple-design -->
- Follow the taolu apple-design (v1) in .opencode/skills/apple-design/SKILL.md

<!-- taolu-enforce:glass-webui-design -->
- Follow the taolu glass-webui-design (v1) in .opencode/skills/glass-webui-design/SKILL.md

<!-- taolu-enforce:git-workflow -->
- Follow the taolu git-workflow (v1) in .opencode/skills/git-workflow/SKILL.md
