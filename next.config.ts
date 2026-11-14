import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native image libraries must stay out of the server bundle.
  serverExternalPackages: ["sharp", "@resvg/resvg-js", "satori"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
