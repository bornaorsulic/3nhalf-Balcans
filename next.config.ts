import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits dist/standalone/server.js: a plain Node server, for hosting outside Cloudflare.
  output: "standalone",
};

export default nextConfig;
