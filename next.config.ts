import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // required for Docker / Cloud Run — mirrors ai-tool-hub
};

export default nextConfig;
