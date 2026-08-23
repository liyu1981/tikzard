import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*"],
  webpack: (config) => {
    // pi-ai loads its Node-only OAuth flows through a computed import() on
    // purpose so bundlers don't follow them into node:http/node:crypto code.
    // Leave that expression native instead of emitting a critical-dependency
    // warning — this browser-only app signs in with API keys and never
    // triggers those imports at runtime.
    config.module.rules.push({
      test: /[\\/]pi-ai[\\/]dist[\\/]auth[\\/]oauth[\\/]load\.js$/,
      parser: { javascript: { importDynamic: false } },
    });
    return config;
  },
};

export default nextConfig;
