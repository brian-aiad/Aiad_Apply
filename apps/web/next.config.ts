import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.AIADAPPLY_BUILD_DIR || ".next",
  // The local launchers intentionally use the explicit loopback address so
  // Windows and macOS behave the same. Next 16 otherwise blocks the dev HMR
  // socket and leaves client controls unhydrated until a later navigation.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
