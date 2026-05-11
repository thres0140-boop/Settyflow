import type { CapacitorConfig } from "@capacitor/cli";

// In dev, point Capacitor at your Next.js dev server (or Vercel deploy):
// e.g. server: { url: "https://settyflow.vercel.app", cleartext: false }
// For local dev with your phone on the same Wi-Fi:
// server: { url: "http://<your-laptop-LAN-ip>:3000", cleartext: true }
const config: CapacitorConfig = {
  appId: "co.settyflow.app",
  appName: "Settyflow",
  webDir: "public",
  server: {
    // Replace with your deployed URL once you have one
    url: process.env.CAP_SERVER_URL ?? "https://settyflow.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0a0a0a",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
