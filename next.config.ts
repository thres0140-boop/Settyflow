import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the iPhone (and any other LAN device) to hit the dev server.
  // Next.js 16 blocks non-localhost dev origins by default for security.
  allowedDevOrigins: ["192.168.68.61", "*.local"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "scontent**.cdninstagram.com" },
    ],
  },
};

export default nextConfig;
