import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*"],
  webpack: (config) => {
    // pi-ai loads its Node-only modules through a computed import() on purpose
    // so bundlers don't follow them into node:http/node:crypto/node:fs code:
    //   - env-api-keys.js eagerly probes node:fs/os/path at module load
    //   - auth/context.js resolves ADC paths via node:fs/promises + node:os
    //   - auth/oauth/load.js pulls in Node-only OAuth flow code
    // Leave those expressions native instead of letting webpack rewrite them
    // into an empty async context that rejects with MODULE_NOT_FOUND during
    // the server render. This browser-only app signs in with API keys and
    // never triggers those imports at runtime.
    config.module.rules.push({
      test: /[\\/]pi-ai[\\/]dist[\\/](?:env-api-keys\.js|auth[\\/]context\.js|auth[\\/]oauth[\\/]load\.js)$/,
      parser: { import: false },
    });
    // Bundled agent skills are authored as SKILL.md files and imported as
    // raw strings at build time (offline-first: no runtime fetch).
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
