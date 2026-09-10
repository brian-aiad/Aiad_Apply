import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.AIADAPPLY_BUILD_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
