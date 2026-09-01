import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal standalone server bundle for the Cloud Run Dockerfile.
  output: "standalone",
};

export default nextConfig;
