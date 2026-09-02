import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev tunnels (ngrok etc.) — without this, /_next chunks are blocked and UI never hydrates
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.dummyjson.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
};

export default nextConfig;
