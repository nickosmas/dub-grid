import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/settings/:section", destination: "/settings" },
      { source: "/staff/:section", destination: "/staff" },
    ];
  },
};

export default nextConfig;
