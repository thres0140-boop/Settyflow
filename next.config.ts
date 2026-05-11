import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the iPhone (and any other LAN device) to hit the dev server.
  // Next.js 16 blocks non-localhost dev origins by default for security.
  allowedDevOrigins: ["192.168.68.61", "*.local"],

  // Ensure the bundled ffmpeg binary ships with the voice-clips API route on Vercel.
  // Without this, Next.js's tracing may strip the platform-specific native binary.
  outputFileTracingIncludes: {
    "/api/voice-clips/route": ["./node_modules/@ffmpeg-installer/**/*"],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "scontent**.cdninstagram.com" },
    ],
  },

  // Mark @ffmpeg-installer as an external server-side dep so Next doesn't bundle it
  // (which would break the runtime path resolution).
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
