import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for the Cloud Run Dockerfile. On Vercel it breaks
  // the platform's own build finalization (missing *.nft.json), and Vercel
  // does its own function bundling anyway — so skip it there.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
