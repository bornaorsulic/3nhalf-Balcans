import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the bottom tab bar; build errors still show as an overlay.
  devIndicators: false,
};

export default nextConfig;
