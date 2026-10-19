import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * TikZJax ships its TeX core and wasm as `.gz` files and decompresses them
 * itself in the browser. Static servers (Vite included) auto-add
 * `Content-Encoding: gzip` for `*.gz`, which makes the browser transparently
 * inflate them — then TikZJax's own gunzip fails. Serve those raw.
 */
function rawTikzjaxGzip(): Plugin {
  const handler =
    (baseDir: string) =>
    (
      req: { url?: string },
      res: {
        setHeader: (name: string, value: string) => void;
        end: (data: Buffer) => void;
      },
      next: () => void,
    ) => {
      const url = (req.url ?? "").split("?")[0];
      if (!url.startsWith("/tikzjax/") || !url.endsWith(".gz")) {
        next();
        return;
      }
      const filePath = resolve(baseDir, url.replace(/^\//, ""));
      if (!existsSync(filePath)) {
        next();
        return;
      }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Encoding", "identity");
      res.setHeader("Cache-Control", "no-cache");
      res.end(readFileSync(filePath));
    };

  return {
    name: "tikzard-raw-tikzjax-gzip",
    configureServer(server) {
      server.middlewares.use(handler(server.config.publicDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        handler(resolve(server.config.root, server.config.build.outDir)),
      );
    },
  };
}

/**
 * Google Analytics tag, injected into <head> at build/dev time when a
 * measurement id is configured (GA_MEASUREMENT_ID, as before the Next→Vite
 * migration). Unset disables analytics entirely.
 */
function googleAnalytics(gaId: string): Plugin {
  return {
    name: "tikzard-google-analytics",
    transformIndexHtml(html) {
      if (gaId === "") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              async: true,
              src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`,
            },
            injectTo: "head",
          },
          {
            tag: "script",
            children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`,
            injectTo: "head",
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gaId = env.GA_MEASUREMENT_ID ?? env.VITE_GA_MEASUREMENT_ID ?? "";
  const dir = import.meta.dirname;

  // mkcert cert covering localhost/127.0.0.1/::1 and the LAN IP; the app's
  // storage + WASM features need a secure context on non-localhost hosts. Both
  // the dev server and `vite preview` serve over HTTPS. Missing cert files
  // (e.g. a CI build) simply fall back to Vite's default http.
  const keyPath = resolve(dir, "mkcert/localhost+3-key.pem");
  const certPath = resolve(dir, "mkcert/localhost+3.pem");
  const https =
    existsSync(keyPath) && existsSync(certPath)
      ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
      : undefined;

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      rawTikzjaxGzip(),
      googleAnalytics(gaId),
    ],
    resolve: {
      alias: { "@": resolve(dir, "src") },
    },
    server: {
      port: 3111,
      host: "0.0.0.0",
      allowedHosts: true,
      ...(https === undefined ? {} : { https }),
    },
    preview: {
      port: 4000,
      host: true,
      ...(https === undefined ? {} : { https }),
    },
  };
});
