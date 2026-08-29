import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["finch-ace-happily.ngrok-free.app"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.dummyjson.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
};

export default nextConfig;
